import { useState, useEffect, useMemo } from "react";
import { EmissionData, EmissionStatus } from "../../services/emissionService";
import {
  getDocumentsByEmission,
  EmissionDocument,
} from "../../services/documentService";
import {
  ColumnOptionsMap,
  DependentOptionsMap,
  ColumnDependencies,
  EmissionCategoryMapping,
} from "../../services/columnConfigService";
import { getUserEmissionFactorsBySiteAndCategory } from "../../services/emissionFactorService";
import { getUserUnitsBySiteAndCategory, UnitData } from "../../services/unitService";
import DocumentViewerModal from "../../components/DocumentViewerModal";
import Modal from "../../components/Modal";
import AuditTrailTimeline, {
  AuditTrailModal,
} from "../../components/AuditTrailTimeline";

interface EmissionsTableProps {
  emissions: EmissionData[];
  loading: boolean;
  onApprove?: (id: number, comment?: string) => Promise<void>;
  onReject?: (id: number, comment: string) => Promise<void>;
  onBulkApprove?: (ids: number[]) => Promise<void>;
  onBulkReject?: (ids: number[], comment: string) => Promise<void>;
  onBulkDelete?: (ids: number[]) => Promise<void>;
  onManagerEdit?: (
    id: number,
    data: { activity_data?: Record<string, any>; date_of_reporting?: string; activity_data_unit?: string; reason?: string },
  ) => Promise<void>;
  siteId?: number | null;
  isDark?: boolean;
  formatActivityData?: (
    activityData: Record<string, unknown>,
    categoryId: number,
  ) => { key: string; displayValue: string }[];
  columnOptionsMap?: Record<number, ColumnOptionsMap>;
  dependentOptionsMap?: Record<number, DependentOptionsMap>;
  columnDependenciesMap?: Record<number, ColumnDependencies>;
  columnsMap?: Record<number, { pk_id: number; column_name: string; column_type?: string }[]>;
  emissionCategoryMappingMap?: Record<number, EmissionCategoryMapping>;
  selectedCategoryName?: string;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const StatusBadge = ({
  status,
  isDark = false,
}: {
  status: EmissionStatus;
  isDark?: boolean;
}) => {
  const statusStyles: Record<EmissionStatus, { light: string; dark: string }> =
    {
      pending: {
        light: "bg-yellow-100 text-yellow-800",
        dark: "bg-yellow-900/30 text-yellow-400",
      },
      approved: {
        light: "bg-green-100 text-green-800",
        dark: "bg-green-900/30 text-green-400",
      },
      rejected: {
        light: "bg-red-100 text-red-800",
        dark: "bg-red-900/30 text-red-400",
      },
    };

  const style = statusStyles[status] || {
    light: "bg-gray-100 text-gray-800",
    dark: "bg-slate-700 text-slate-300",
  };

  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${isDark ? style.dark : style.light}`}
    >
      {status}
    </span>
  );
};

const EmissionsTable = ({
  emissions,
  loading,
  onApprove,
  onReject,
  onBulkApprove,
  onBulkReject,
  onBulkDelete,
  onManagerEdit,
  siteId,
  isDark = false,
  formatActivityData,
  columnOptionsMap,
  dependentOptionsMap,
  columnDependenciesMap,
  columnsMap,
  emissionCategoryMappingMap,
  selectedCategoryName,
}: EmissionsTableProps) => {
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [selectedPendingIds, setSelectedPendingIds] = useState<Set<number>>(
    new Set(),
  );
  const [selectedApprovedIds, setSelectedApprovedIds] = useState<Set<number>>(
    new Set(),
  );
  const [bulkLoading, setBulkLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Clear stale selections when emissions data changes
  useEffect(() => {
    setSelectedPendingIds(new Set());
    setSelectedApprovedIds(new Set());
  }, [emissions]);

  // Reject modal state
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [bulkRejectMode, setBulkRejectMode] = useState(false);
  const [bulkRejectLoading, setBulkRejectLoading] = useState(false);

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingEmission, setEditingEmission] = useState<EmissionData | null>(
    null,
  );
  const [editForm, setEditForm] = useState<{
    activity_data: Record<string, any>;
    date_of_reporting: string;
    reason: string;
  }>({ activity_data: {}, date_of_reporting: "", reason: "" });
  const [editLoading, setEditLoading] = useState(false);
  const [emissionCategoryOptions, setEmissionCategoryOptions] = useState<string[]>([]);
  const [editUnits, setEditUnits] = useState<UnitData[]>([]);
  const [editUnit, setEditUnit] = useState<string>("");
  // Delete confirmation modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  // Audit trail modal state
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [auditEntityId, setAuditEntityId] = useState<number | null>(null);

  // Document viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerDocuments, setViewerDocuments] = useState<EmissionDocument[]>(
    [],
  );
  const [selectedDocument, setSelectedDocument] =
    useState<EmissionDocument | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(false);

  // Notification state (replaces alert())
  const [notification, setNotification] = useState<{
    message: string;
    type: "info" | "error";
  } | null>(null);

  // Build parent→FERA map for inline display
  const isFeraRow = (e: EmissionData) =>
    e.category?.category_name?.toLowerCase() === "fera";

  const feraMap = useMemo(() => {
    const fera = emissions.filter((e) => isFeraRow(e));
    const map = new Map<number, EmissionData>();
    for (const em of emissions) {
      if (isFeraRow(em)) continue;
      const linked = fera.find(
        (f) => f.pk_id === em.fera_linked_id || f.fera_linked_id === em.pk_id
      );
      if (linked) map.set(em.pk_id, linked);
    }
    return map;
  }, [emissions]);

  // If user filtered by FERA category, show FERA rows directly; otherwise merge inline
  const filteringByFera = selectedCategoryName?.toLowerCase() === "fera";
  const displayEmissions = useMemo(
    () => filteringByFera ? emissions : emissions.filter((e) => !isFeraRow(e)),
    [emissions, filteringByFera]
  );

  // Get pending and approved emissions (exclude FERA from selectable lists)
  const pendingEmissions = emissions.filter((e) => e.status === "pending" && !isFeraRow(e));
  const approvedEmissions = emissions.filter((e) => e.status === "approved" && !isFeraRow(e));
  const pendingIds = pendingEmissions.map((e) => e.pk_id);
  const approvedIds = approvedEmissions.map((e) => e.pk_id);

  // Check selection states for pending
  const allPendingSelected =
    pendingIds.length > 0 &&
    pendingIds.every((id) => selectedPendingIds.has(id));
  const somePendingSelected = pendingIds.some((id) =>
    selectedPendingIds.has(id),
  );

  // Check selection states for approved
  const allApprovedSelected =
    approvedIds.length > 0 &&
    approvedIds.every((id) => selectedApprovedIds.has(id));
  const someApprovedSelected = approvedIds.some((id) =>
    selectedApprovedIds.has(id),
  );

  // Toggle single pending row selection
  const togglePendingRowSelection = (id: number) => {
    setSelectedPendingIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Toggle single approved row selection
  const toggleApprovedRowSelection = (id: number) => {
    setSelectedApprovedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Toggle all pending rows selection
  const toggleSelectAllPending = () => {
    if (allPendingSelected) {
      setSelectedPendingIds(new Set());
    } else {
      setSelectedPendingIds(new Set(pendingIds));
    }
  };

  // Toggle all approved rows selection
  const toggleSelectAllApproved = () => {
    if (allApprovedSelected) {
      setSelectedApprovedIds(new Set());
    } else {
      setSelectedApprovedIds(new Set(approvedIds));
    }
  };

  // Handle bulk approve
  const handleBulkApprove = async () => {
    if (!onBulkApprove || selectedPendingIds.size === 0) return;
    setBulkLoading(true);
    try {
      await onBulkApprove(Array.from(selectedPendingIds));
      setSelectedPendingIds(new Set());
    } finally {
      setBulkLoading(false);
    }
  };

  // Handle bulk delete - open confirmation modal
  const handleBulkDelete = () => {
    if (!onBulkDelete || selectedApprovedIds.size === 0) return;
    setDeleteModalOpen(true);
  };

  const confirmBulkDelete = async () => {
    if (!onBulkDelete) return;
    setDeleteModalOpen(false);
    setDeleteLoading(true);
    try {
      await onBulkDelete(Array.from(selectedApprovedIds));
      setSelectedApprovedIds(new Set());
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleApprove = async (id: number) => {
    if (!onApprove) return;
    setActionLoadingId(id);
    try {
      await onApprove(id);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Single reject - open modal
  const handleRejectClick = (id: number) => {
    setRejectingId(id);
    setRejectComment("");
    setBulkRejectMode(false);
    setRejectModalOpen(true);
  };

  // Bulk reject - open modal
  const handleBulkRejectClick = () => {
    setBulkRejectMode(true);
    setRejectComment("");
    setRejectModalOpen(true);
  };

  // Confirm reject (handles both single and bulk)
  const handleRejectConfirm = async () => {
    if (!rejectComment.trim()) return;

    if (bulkRejectMode) {
      if (!onBulkReject || selectedPendingIds.size === 0) return;
      setBulkRejectLoading(true);
      try {
        await onBulkReject(
          Array.from(selectedPendingIds),
          rejectComment.trim(),
        );
        setSelectedPendingIds(new Set());
      } finally {
        setBulkRejectLoading(false);
      }
    } else if (rejectingId) {
      if (!onReject) return;
      setActionLoadingId(rejectingId);
      try {
        await onReject(rejectingId, rejectComment.trim());
      } finally {
        setActionLoadingId(null);
      }
    }

    setRejectModalOpen(false);
    setRejectComment("");
    setRejectingId(null);
    setBulkRejectMode(false);
  };

  const handleRejectCancel = () => {
    setRejectModalOpen(false);
    setRejectComment("");
    setRejectingId(null);
    setBulkRejectMode(false);
  };

  // Auto-resolve emission_category from select column values
  const autoResolveEmissionCategory = (
    activityData: Record<string, any>,
    categoryId: number,
  ): { key: string; category: string } | null => {
    const ecm = emissionCategoryMappingMap?.[categoryId] || {};
    if (Object.keys(ecm).length === 0) return null;

    const deps = columnDependenciesMap?.[categoryId] || {};
    const columns = columnsMap?.[categoryId] || [];
    const colOptions = columnOptionsMap?.[categoryId] || {};
    const depOpts = dependentOptionsMap?.[categoryId] || {};

    const allChildCols = new Set(Object.keys(deps));
    const allParentCols = new Set(Object.values(deps));
    const rootCols = [...allParentCols].filter((c) => !allChildCols.has(c));

    const getLabel = (colName: string, value: string, parentLabel?: string): string => {
      const col = columns.find((c) => c.column_name.toLowerCase() === colName.toLowerCase());
      if (!col) return value;
      if (parentLabel && depOpts[colName]) {
        const opts = depOpts[colName][parentLabel] || [];
        const match = opts.find((o) => String(o.id) === String(value));
        if (match) return match.label;
      }
      const opts = colOptions[col.pk_id.toString()] || [];
      const match = opts.find((o) => String(o.id) === String(value) || o.label.toLowerCase() === String(value).toLowerCase());
      if (match) return match.label;
      return value;
    };

    if (rootCols.length === 0) {
      const selectCols = columns.filter((c) => c.column_type === "select");
      for (const col of selectCols) {
        const val = activityData[col.column_name];
        if (!val) continue;
        const label = getLabel(col.column_name, String(val));
        if (ecm[label]) return { key: label, category: ecm[label] };
        const labelLower = label.toLowerCase();
        for (const [k, v] of Object.entries(ecm)) {
          if (k.toLowerCase() === labelLower) return { key: k, category: v };
        }
      }
      return null;
    }

    const keyParts: string[] = [];
    const walkChain = (colName: string): boolean => {
      const val = activityData[colName];
      if (!val) return false;
      const parentLabel = keyParts.length > 0 ? keyParts[keyParts.length - 1] : undefined;
      const label = getLabel(colName, String(val), parentLabel);
      keyParts.push(label);
      for (const [child, parent] of Object.entries(deps)) {
        if (parent === colName) {
          if (!walkChain(child)) return false;
        }
      }
      return true;
    };

    for (const root of rootCols) {
      if (!walkChain(root)) return null;
    }

    const mappingKey = keyParts.join("|");
    if (ecm[mappingKey]) return { key: mappingKey, category: ecm[mappingKey] };
    const mappingKeyLower = mappingKey.toLowerCase();
    for (const [k, v] of Object.entries(ecm)) {
      if (k.toLowerCase() === mappingKeyLower) return { key: k, category: v };
    }
    for (let i = keyParts.length - 1; i >= 0; i--) {
      const subKey = keyParts.slice(0, i + 1).join("|");
      if (ecm[subKey]) return { key: subKey, category: ecm[subKey] };
      const subKeyLower = subKey.toLowerCase();
      for (const [k, v] of Object.entries(ecm)) {
        if (k.toLowerCase() === subKeyLower) return { key: k, category: v };
      }
    }
    return null;
  };

  // Check if a column is a dependent column (has a parent)
  const isEditDependentColumn = (columnName: string, categoryId: number): boolean => {
    const depChain = columnDependenciesMap?.[categoryId];
    if (!depChain) return false;
    return Object.keys(depChain).some(
      (k) => k.toLowerCase() === columnName.toLowerCase()
    );
  };

  // Get parent column name for a dependent column
  const getEditParentColumnName = (columnName: string, categoryId: number): string | undefined => {
    const depChain = columnDependenciesMap?.[categoryId];
    if (!depChain) return undefined;
    const match = Object.keys(depChain).find(
      (k) => k.toLowerCase() === columnName.toLowerCase()
    );
    return match ? depChain[match] : undefined;
  };

  // Get dropdown options for a field in the edit modal — full dependency-aware version
  const getEditFieldOptions = (
    key: string,
    categoryId: number,
  ): { id: string | number; label: string }[] | null => {
    if (!columnOptionsMap || !columnsMap) return null;

    const columns = columnsMap[categoryId];
    const columnOptions = columnOptionsMap[categoryId];
    const depOptions = dependentOptionsMap?.[categoryId];

    if (!columns || !columnOptions) return null;

    const parentColName = getEditParentColumnName(key, categoryId);

    // Dependent column logic
    if (parentColName && depOptions) {
      const keyLower = key.toLowerCase();
      let childDeps = depOptions[key];
      if (!childDeps) {
        for (const [k, v] of Object.entries(depOptions)) {
          if (k.toLowerCase() === keyLower) { childDeps = v; break; }
        }
      }
      if (!childDeps) return null;

      const parentValue = editForm.activity_data[parentColName];
      if (!parentValue) return null;

      let parentLabel = String(parentValue);

      // Check if parent is also dependent (3-level chain)
      const grandparentColName = getEditParentColumnName(parentColName, categoryId);
      if (grandparentColName && isEditDependentColumn(parentColName, categoryId)) {
        const parentDepOptions = depOptions[parentColName];
        if (parentDepOptions) {
          for (const [, options] of Object.entries(parentDepOptions)) {
            const match = options.find((opt) => String(opt.id) === String(parentValue));
            if (match) { parentLabel = match.label; break; }
          }
        }
      }

      // Fallback: try column options for parent label
      if (parentLabel === String(parentValue)) {
        const parentCol = columns.find(
          (c) => c.column_name.toLowerCase() === parentColName.toLowerCase()
        );
        if (parentCol) {
          const parentOpts = columnOptions[parentCol.pk_id.toString()];
          const parentOpt = parentOpts?.find(
            (o) => String(o.id) === String(parentValue) ||
                   o.label.toLowerCase() === String(parentValue).toLowerCase()
          );
          if (parentOpt) parentLabel = parentOpt.label;
        }
      }

      // Try composite key (grandparent|parent) for 3-level deps
      if (grandparentColName && isEditDependentColumn(parentColName, categoryId)) {
        const gpCol = columns.find(
          (c) => c.column_name.toLowerCase() === grandparentColName.toLowerCase()
        );
        if (gpCol) {
          const gpOptions = columnOptions[gpCol.pk_id.toString()];
          if (gpOptions) {
            for (const gpOpt of gpOptions) {
              const compositeKey = `${gpOpt.label}|${parentLabel}`;
              const matched = childDeps[compositeKey];
              if (matched && matched.length > 0) return matched;
            }
          }
        }
      }

      // Try exact match, case-insensitive, and raw value
      let result = childDeps[parentLabel];
      if (!result) {
        const lower = parentLabel.toLowerCase();
        for (const [k, v] of Object.entries(childDeps)) {
          if (k.toLowerCase() === lower) { result = v; break; }
        }
      }
      if (!result) result = childDeps[String(parentValue)];
      if (result && result.length > 0) return result;

      return null;
    }

    // Non-dependent: use column options by pk_id
    const col = columns.find(
      (c) => c.column_name.toLowerCase() === key.toLowerCase(),
    );
    if (col) {
      const opts = columnOptions[col.pk_id.toString()];
      if (opts && opts.length > 0) return opts;
    }

    return null;
  };

  // Edit handlers
  const handleEditClick = async (emission: EmissionData) => {
    const categoryId = emission.category?.category_id || 0;
    const activityData = { ...emission.activity_data };

    // Reverse-map emission_category to pre-fill select columns
    const ecm = emissionCategoryMappingMap?.[categoryId] || {};
    const storedCategory = activityData.emission_category || "";
    if (storedCategory && Object.keys(ecm).length > 0) {
      let matchedKey: string | null = null;
      const storedLower = storedCategory.toLowerCase();
      for (const [key, value] of Object.entries(ecm)) {
        if (value === storedCategory || value.toLowerCase() === storedLower) {
          matchedKey = key;
          break;
        }
      }

      if (matchedKey) {
        const labels = matchedKey.split("|");
        const deps = columnDependenciesMap?.[categoryId] || {};
        const columns = columnsMap?.[categoryId] || [];
        const columnOptions = columnOptionsMap?.[categoryId] || {};
        const depOptions = dependentOptionsMap?.[categoryId] || {};

        // Build ordered select column chain: root → ... → leaf
        const allChildCols = new Set(Object.keys(deps));
        const allParentCols = new Set(Object.values(deps));
        const rootCols = [...allParentCols].filter((c) => !allChildCols.has(c));

        const orderedSelectCols: string[] = [];
        const walkChain = (colName: string) => {
          orderedSelectCols.push(colName);
          for (const [child, parent] of Object.entries(deps)) {
            if (parent === colName) walkChain(child);
          }
        };
        if (rootCols.length > 0) {
          rootCols.forEach((root) => walkChain(root));
        } else {
          columns
            .filter((c) => c.column_type === "select")
            .forEach((c) => orderedSelectCols.push(c.column_name));
        }

        for (let i = 0; i < labels.length && i < orderedSelectCols.length; i++) {
          const colName = orderedSelectCols[i];
          const label = labels[i];

          // Only fill if empty
          if (activityData[colName] && activityData[colName] !== "") continue;

          const col = columns.find((c) => c.column_name.toLowerCase() === colName.toLowerCase());
          if (!col) continue;

          let matchedId: string | number | null = null;

          // For dependent columns, look up in dependentOptions using parent's label
          if (allChildCols.has(colName) && i > 0) {
            const parentColName = deps[colName];
            const parentVal = activityData[parentColName];
            if (parentVal && depOptions[colName]) {
              // Convert parent ID to label
              const parentCol = columns.find((c) => c.column_name.toLowerCase() === parentColName.toLowerCase());
              let parentLabel = String(parentVal);
              if (parentCol) {
                const pOpts = columnOptions[parentCol.pk_id.toString()] || [];
                const pMatch = pOpts.find((o) => String(o.id) === String(parentVal));
                if (pMatch) parentLabel = pMatch.label;
              }
              const opts = depOptions[colName][parentLabel] || [];
              const match = opts.find((o) => o.label.toLowerCase() === label.toLowerCase());
              if (match) matchedId = match.id;
            }
          }

          if (matchedId === null) {
            const opts = columnOptions[col.pk_id.toString()] || [];
            const match = opts.find((o) => o.label.toLowerCase() === label.toLowerCase());
            if (match) matchedId = match.id;
          }

          if (matchedId !== null) {
            activityData[colName] = String(matchedId);
          }
        }
      }
    }

    setEditingEmission(emission);
    setEditForm({
      activity_data: activityData,
      date_of_reporting: emission.date_of_reporting.split("T")[0],
      reason: "",
    });
    setEditUnit(emission.activity_data_unit || "");
    setEditModalOpen(true);

    // Fetch emission category options and units for dropdowns
    if (siteId && categoryId) {
      try {
        const reportDate = new Date(emission.date_of_reporting);
        const targetYear = reportDate.getFullYear() - 1;
        const [factors, units] = await Promise.all([
          getUserEmissionFactorsBySiteAndCategory(
            siteId, categoryId, targetYear
          ),
          getUserUnitsBySiteAndCategory(siteId, categoryId),
        ]);
        const categoryNames = [...new Set(
          factors.map((f: any) => f.emission_category_name).filter(Boolean)
        )] as string[];
        setEmissionCategoryOptions(categoryNames);
        setEditUnits(units);
      } catch (error) {
        console.error("Error fetching edit options:", error);
        setEmissionCategoryOptions([]);
        setEditUnits([]);
      }
    }
  };

  const handleEditSave = async () => {
    if (!onManagerEdit || !editingEmission) return;
    setEditLoading(true);
    try {
      // Strip internal/metadata keys before saving
      const cleanData = { ...editForm.activity_data };
      const metaKeys = [
        "category_name", "category_scope", "fera_linked_id",
        "date_of_reporting", "activity_data_unit", "_extra_data",
        "_isFeraRow", "_ecmKey", "extra_data",
      ];
      for (const k of metaKeys) delete cleanData[k];

      await onManagerEdit(editingEmission.pk_id, {
        activity_data: cleanData,
        date_of_reporting: editForm.date_of_reporting,
        activity_data_unit: editUnit || undefined,
        reason: editForm.reason || undefined,
      });
      setEditModalOpen(false);
      setEditingEmission(null);
    } finally {
      setEditLoading(false);
    }
  };

  // Document viewer handlers
  const handleViewDocuments = async (emissionId: number) => {
    try {
      setLoadingDocs(true);
      const docs = await getDocumentsByEmission(emissionId);
      if (docs.length > 0) {
        setViewerDocuments(docs);
        setSelectedDocument(docs[0]);
        setViewerOpen(true);
      } else {
        setNotification({
          message: "No documents found for this emission.",
          type: "info",
        });
        setTimeout(() => setNotification(null), 4000);
      }
    } catch (error) {
      console.error("Error fetching documents:", error);
      setNotification({ message: "Failed to load documents.", type: "error" });
      setTimeout(() => setNotification(null), 4000);
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleCloseViewer = () => {
    setViewerOpen(false);
    setViewerDocuments([]);
    setSelectedDocument(null);
  };

  const handleNavigateDocument = (doc: EmissionDocument) => {
    setSelectedDocument(doc);
  };

  const resolveActivityData = (
    emission: EmissionData,
  ): { key: string; displayValue: string }[] => {
    const activityData = emission.activity_data || {};
    const categoryId = emission.category?.category_id || 0;

    if (formatActivityData) {
      return formatActivityData(activityData, categoryId);
    }

    // Fallback: display raw values
    return Object.entries(activityData).map(([key, value]) => ({
      key,
      displayValue: String(value),
    }));
  };

  // Theme classes
  const loadingClass = isDark
    ? "text-center py-8 text-slate-300"
    : "text-center py-8 text-gray-700";
  const emptyClass = isDark
    ? "text-center py-8 text-slate-400"
    : "text-center py-8 text-gray-500";

  const bulkApproveBgClass = isDark
    ? "mb-4 p-3 bg-green-900/20 border border-green-700/30 rounded-lg flex items-center justify-between"
    : "mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between";

  const bulkDeleteBgClass = isDark
    ? "mb-4 p-3 bg-red-900/20 border border-red-700/30 rounded-lg flex items-center justify-between"
    : "mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between";

  const tableClass = isDark
    ? "w-full border-collapse border border-slate-600"
    : "w-full border-collapse border border-gray-300";

  const thClass = isDark
    ? "border border-slate-600 px-4 py-3 text-left font-semibold text-slate-200 bg-slate-800"
    : "border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700 bg-gray-100";

  const tdClass = isDark
    ? "border border-slate-600 px-4 py-3 text-slate-300"
    : "border border-gray-300 px-4 py-3 text-gray-900";

  const getRowClass = (
    isPendingSelected: boolean,
    isApprovedSelected: boolean,
  ) => {
    if (isPendingSelected) {
      return isDark ? "bg-green-900/20" : "bg-green-50";
    }
    if (isApprovedSelected) {
      return isDark ? "bg-red-900/20" : "bg-red-50";
    }
    return isDark ? "hover:bg-slate-800" : "hover:bg-gray-50";
  };

  const modalInputClass = isDark
    ? "w-full border border-slate-600 bg-slate-700 text-slate-200 px-3 py-2 rounded focus:outline-none focus:ring focus:ring-blue-500/30"
    : "w-full border border-gray-300 px-3 py-2 rounded focus:outline-none focus:ring focus:ring-blue-300";

  const viewDocsClass = isDark
    ? "px-3 py-1 text-sm bg-blue-600/30 text-blue-300 rounded hover:bg-blue-600/50 disabled:opacity-50 transition-colors"
    : "px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50 transition-colors";

  const rejectReasonClass = isDark
    ? "text-xs text-red-400 mt-1"
    : "text-xs text-red-600 mt-1";

  const reviewTextClass = isDark
    ? "text-xs text-slate-400 mt-1"
    : "text-xs text-gray-500 mt-1";

  const labelClass = isDark
    ? "block text-sm font-medium mb-1 text-slate-300"
    : "block text-sm font-medium mb-1 text-gray-700";

  const cancelBtnClass = isDark
    ? "px-4 py-2 bg-slate-600 text-slate-200 rounded hover:bg-slate-500"
    : "px-4 py-2 bg-gray-300 rounded hover:bg-gray-400";

  if (loading) {
    return <div className={loadingClass}>Loading emissions...</div>;
  }

  if (emissions.length === 0) {
    return (
      <div className={emptyClass}>
        No emissions found for the selected filters.
      </div>
    );
  }

  const showActions = onApprove || onReject || onManagerEdit;
  const showBulkApprove = onBulkApprove && pendingEmissions.length > 0;
  const showBulkDelete = onBulkDelete && approvedEmissions.length > 0;
  const showCheckboxColumn = showBulkApprove || showBulkDelete;

  return (
    <div>
      {/* Bulk Actions Bar for Pending (Approve + Reject) */}
      {showBulkApprove && (
        <div className={bulkApproveBgClass}>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allPendingSelected}
                ref={(el) => {
                  if (el)
                    el.indeterminate =
                      somePendingSelected && !allPendingSelected;
                }}
                onChange={toggleSelectAllPending}
                className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span
                className={`text-sm font-medium ${isDark ? "text-green-400" : "text-green-700"}`}
              >
                Select All Pending
              </span>
            </label>
            <span
              className={`text-sm ${isDark ? "text-slate-400" : "text-gray-600"}`}
            >
              {selectedPendingIds.size > 0 ? (
                <>
                  {selectedPendingIds.size} of {pendingEmissions.length} pending
                  row{selectedPendingIds.size !== 1 ? "s" : ""} selected
                </>
              ) : (
                <>
                  {pendingEmissions.length} pending emission
                  {pendingEmissions.length !== 1 ? "s" : ""}
                </>
              )}
            </span>
          </div>
          <div className="flex gap-2">
            {selectedPendingIds.size > 0 && (
              <>
                <button
                  onClick={() => setSelectedPendingIds(new Set())}
                  className={`px-3 py-1.5 text-sm ${isDark ? "text-slate-400 hover:text-slate-200" : "text-gray-600 hover:text-gray-800"}`}
                >
                  Clear
                </button>
                <button
                  onClick={handleBulkApprove}
                  disabled={bulkLoading}
                  className="px-4 py-1.5 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:bg-gray-400"
                >
                  {bulkLoading
                    ? "Approving..."
                    : `Approve Selected (${selectedPendingIds.size})`}
                </button>
                {onBulkReject && (
                  <button
                    onClick={handleBulkRejectClick}
                    disabled={bulkRejectLoading}
                    className="px-4 py-1.5 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700 disabled:bg-gray-400"
                  >
                    {bulkRejectLoading
                      ? "Rejecting..."
                      : `Reject Selected (${selectedPendingIds.size})`}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Bulk Actions Bar for Approved (Delete) */}
      {showBulkDelete && (
        <div className={bulkDeleteBgClass}>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allApprovedSelected}
                ref={(el) => {
                  if (el)
                    el.indeterminate =
                      someApprovedSelected && !allApprovedSelected;
                }}
                onChange={toggleSelectAllApproved}
                className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
              />
              <span
                className={`text-sm font-medium ${isDark ? "text-red-400" : "text-red-700"}`}
              >
                Select All Approved
              </span>
            </label>
            <span
              className={`text-sm ${isDark ? "text-slate-400" : "text-gray-600"}`}
            >
              {selectedApprovedIds.size > 0 ? (
                <>
                  {selectedApprovedIds.size} of {approvedEmissions.length}{" "}
                  approved row{selectedApprovedIds.size !== 1 ? "s" : ""}{" "}
                  selected
                </>
              ) : (
                <>
                  {approvedEmissions.length} approved emission
                  {approvedEmissions.length !== 1 ? "s" : ""}
                </>
              )}
            </span>
          </div>
          <div className="flex gap-2">
            {selectedApprovedIds.size > 0 && (
              <>
                <button
                  onClick={() => setSelectedApprovedIds(new Set())}
                  className={`px-3 py-1.5 text-sm ${isDark ? "text-slate-400 hover:text-slate-200" : "text-gray-600 hover:text-gray-800"}`}
                >
                  Clear
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={deleteLoading}
                  className="px-4 py-1.5 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700 disabled:bg-gray-400"
                >
                  {deleteLoading
                    ? "Deleting..."
                    : `Delete Selected (${selectedApprovedIds.size})`}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className={tableClass}>
          <thead>
            <tr>
              {/* Checkbox column for bulk selection */}
              {showCheckboxColumn && (
                <th className={`${thClass} text-center w-12`}>
                  <span
                    className={`text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}
                  >
                    Select
                  </span>
                </th>
              )}
              <th className={thClass}>Category</th>
              <th className={thClass}>Activity Data</th>
              <th className={thClass}>Activity Unit</th>
              <th className={thClass}>Total Emission (tCO2e)</th>
              <th className={thClass}>Date of Reporting</th>
              <th className={thClass}>Status</th>
              <th className={thClass}>Submitted By</th>
              <th className={thClass}>Submitted At</th>
              <th className={thClass}>Documents</th>
              {showActions && <th className={thClass}>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {displayEmissions.map((emission) => {
              const isLoading = actionLoadingId === emission.pk_id;
              const isPending = emission.status === "pending";
              const isApproved = emission.status === "approved";
              const feraEntry = feraMap.get(emission.pk_id);

              const isPendingSelected = selectedPendingIds.has(emission.pk_id);
              const isApprovedSelected = selectedApprovedIds.has(
                emission.pk_id,
              );
              const activityRows = resolveActivityData(emission);

              return (
                <tr
                  key={emission.pk_id}
                  className={getRowClass(isPendingSelected, isApprovedSelected)}
                >
                  {/* Checkbox for selection */}
                  {showCheckboxColumn && (
                    <td className={`${tdClass} text-center`}>
                      {isPending && showBulkApprove ? (
                        <input
                          type="checkbox"
                          checked={isPendingSelected}
                          onChange={() =>
                            togglePendingRowSelection(emission.pk_id)
                          }
                          className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                          title="Select for approval"
                        />
                      ) : isApproved && showBulkDelete ? (
                        <input
                          type="checkbox"
                          checked={isApprovedSelected}
                          onChange={() =>
                            toggleApprovedRowSelection(emission.pk_id)
                          }
                          className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                          title="Select for deletion"
                        />
                      ) : (
                        <span
                          className={
                            isDark ? "text-slate-600" : "text-gray-300"
                          }
                        >
                          -
                        </span>
                      )}
                    </td>
                  )}
                  <td className={tdClass}>
                    {emission.category?.category_name || "-"}
                    {emission.parent_category_name && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        ({emission.parent_category_name})
                      </div>
                    )}
                  </td>
                  <td className={tdClass}>
                    <div className="max-w-xs">
                      {activityRows.map(({ key, displayValue }) => (
                        <div key={key} className="text-sm">
                          <span className="font-medium">{key}:</span>{" "}
                          {displayValue}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className={tdClass}>
                    {emission.activity_data_unit || "-"}
                  </td>
                  <td className={tdClass}>
                    <div>{Number(emission.total_emission).toFixed(2)}</div>
                    {feraEntry && (
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${isDark ? "bg-purple-500/20 text-purple-400" : "bg-purple-100 text-purple-700"}`}>FERA</span>
                        <span className={`text-sm font-medium ${isDark ? "text-purple-400" : "text-purple-600"}`}>{Number(feraEntry.total_emission).toFixed(2)}</span>
                      </div>
                    )}
                  </td>
                  <td className={tdClass}>
                    {formatDate(emission.date_of_reporting)}
                  </td>
                  <td className={tdClass}>
                    <StatusBadge status={emission.status} isDark={isDark} />
                    {emission.status === "rejected" &&
                      emission.review_comment && (
                        <div className={rejectReasonClass}>
                          {emission.review_comment}
                        </div>
                      )}
                    {emission.status !== "pending" && emission.reviewed_by && (
                      <div className={reviewTextClass}>
                        by {emission.reviewed_by.name}
                      </div>
                    )}
                  </td>
                  <td className={tdClass}>
                    {emission.created_by?.name || "-"}
                  </td>
                  <td className={tdClass}>{formatDate(emission.created_at)}</td>
                  <td className={tdClass}>
                    <button
                      onClick={() => handleViewDocuments(emission.pk_id)}
                      disabled={loadingDocs}
                      className={viewDocsClass}
                    >
                      View Docs
                    </button>
                  </td>
                  {showActions && (
                    <td className={tdClass}>
                      <div className="flex gap-1">
                        {isPending && (
                          <>
                            {onApprove && (
                              <button
                                onClick={() => handleApprove(emission.pk_id)}
                                disabled={isLoading}
                                className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:bg-gray-400"
                              >
                                {isLoading ? "..." : "Approve"}
                              </button>
                            )}
                            {onReject && (
                              <button
                                onClick={() =>
                                  handleRejectClick(emission.pk_id)
                                }
                                disabled={isLoading}
                                className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700 disabled:bg-gray-400"
                              >
                                Reject
                              </button>
                            )}
                          </>
                        )}
                        {onManagerEdit && (
                          <button
                            onClick={() => handleEditClick(emission)}
                            className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                          >
                            Edit
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setAuditEntityId(emission.pk_id);
                            setAuditModalOpen(true);
                          }}
                          className={`px-2 py-1 text-xs rounded ${isDark ? "bg-slate-600 text-slate-300 hover:bg-slate-500" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
                          title="View edit history"
                        >
                          History
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Reject Modal */}
      <Modal
        isOpen={rejectModalOpen}
        onClose={handleRejectCancel}
        title={
          bulkRejectMode
            ? `Reject ${selectedPendingIds.size} Emission${selectedPendingIds.size !== 1 ? "s" : ""}`
            : "Reject Emission"
        }
        isDark={isDark}
      >
        <div className="mb-4">
          <label className={labelClass}>Rejection Reason (Required)</label>
          <textarea
            value={rejectComment}
            onChange={(e) => setRejectComment(e.target.value)}
            className={modalInputClass}
            rows={3}
            placeholder="Enter reason for rejection..."
          />
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={handleRejectCancel} className={cancelBtnClass}>
            Cancel
          </button>
          <button
            onClick={handleRejectConfirm}
            disabled={!rejectComment.trim() || bulkRejectLoading}
            className={`px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 ${!rejectComment.trim() || bulkRejectLoading ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {bulkRejectLoading ? "Rejecting..." : "Reject"}
          </button>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setEditingEmission(null);
        }}
        title="Edit Entry"
        isDark={isDark}
        className="max-w-4xl! max-h-[85vh]!"
      >
        <div className="space-y-4">
          <div className={`border rounded-lg shadow-sm ${isDark ? "border-slate-600 bg-slate-800" : "border-gray-200 bg-white"}`}>
            {/* Card Header */}
            <div className={`flex items-center justify-between px-4 py-2.5 border-b rounded-t-lg ${isDark ? "border-slate-700 bg-slate-700" : "border-gray-100 bg-gray-50"}`}>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-semibold ${isDark ? "text-slate-300" : "text-gray-600"}`}>
                  {editingEmission?.category?.category_name || "Entry"}
                </span>
                {editingEmission?.status === "approved" && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">Approved - changes logged</span>
                )}
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Section 1: Emission Category */}
              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wide mb-1.5 ${isDark ? "text-slate-400" : "text-gray-600"}`}>Emission Category</label>
                {(() => {
                  const catId = editingEmission?.category?.category_id || 0;
                  const hasMapping = Object.keys(emissionCategoryMappingMap?.[catId] || {}).length > 0;
                  if (hasMapping) {
                    return editForm.activity_data.emission_category ? (
                      <div className={`px-3 py-2.5 rounded-md text-sm font-medium ${isDark ? "bg-green-900/30 text-green-400 border border-green-700" : "bg-green-50 text-green-800 border border-green-300"}`}>
                        {editForm.activity_data.emission_category}
                      </div>
                    ) : (
                      <div className={`px-3 py-2.5 rounded-md text-sm italic ${isDark ? "bg-slate-700 text-slate-400 border border-slate-600" : "bg-gray-50 text-gray-400 border border-gray-200"}`}>
                        Select dropdown values to auto-determine
                      </div>
                    );
                  }
                  if (emissionCategoryOptions.length > 0) {
                    return (
                      <select
                        value={String(editForm.activity_data.emission_category || "")}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            activity_data: {
                              ...editForm.activity_data,
                              emission_category: e.target.value,
                            },
                          })
                        }
                        className={modalInputClass}
                      >
                        <option value="">-- Select Emission Category --</option>
                        {emissionCategoryOptions.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    );
                  }
                  return editForm.activity_data.emission_category ? (
                    <div className={`px-3 py-2.5 rounded-md text-sm font-medium ${isDark ? "bg-green-900/30 text-green-400 border border-green-700" : "bg-green-50 text-green-800 border border-green-300"}`}>
                      {editForm.activity_data.emission_category}
                    </div>
                  ) : (
                    <div className={`px-3 py-2.5 rounded-md text-sm italic ${isDark ? "bg-slate-700 text-slate-400 border border-slate-600" : "bg-gray-50 text-gray-400 border border-gray-200"}`}>
                      No emission category
                    </div>
                  );
                })()}
              </div>

              {/* Section 2: Activity Data */}
              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wide mb-1.5 ${isDark ? "text-slate-400" : "text-gray-600"}`}>Activity Data</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {(() => {
                    const categoryId = editingEmission?.category?.category_id || 0;
                    const configColumns = columnsMap?.[categoryId] || [];
                    const configKeys = configColumns.map((c) => c.column_name);
                    // Skip internal/metadata keys that shouldn't be editable
                    const skipKeys = new Set([
                      "emission_category", "category_name", "category_scope",
                      "fera_linked_id", "date_of_reporting", "activity_data_unit",
                      "_extra_data", "_isFeraRow", "_ecmKey", "extra_data",
                    ]);
                    const activityKeys = Object.keys(editForm.activity_data).filter(
                      (k) => !skipKeys.has(k)
                    );
                    const orderedKeys = [
                      ...configKeys.filter((k) => !skipKeys.has(k)),
                      ...activityKeys.filter(
                        (k) => !configKeys.some((ck) => ck.toLowerCase() === k.toLowerCase())
                      ),
                    ];

                    return orderedKeys.map((key) => {
                      const value = editForm.activity_data[key] ?? "";
                      const options = getEditFieldOptions(key, categoryId);
                      const isDependent = isEditDependentColumn(key, categoryId);
                      const parentColName = getEditParentColumnName(key, categoryId);
                      const parentValue = parentColName ? editForm.activity_data[parentColName] : undefined;
                      const isDisabledDependent = isDependent && !parentValue;
                      const col = configColumns.find(
                        (c) => c.column_name.toLowerCase() === key.toLowerCase()
                      );
                      const isNumeric = col?.column_type === "number" ||
                        (!isNaN(Number(value)) && value !== "" && value !== null && !options);
                      const formattedLabel = key
                        .replace(/_/g, " ")
                        .replace(/\b\w/g, (c) => c.toUpperCase());

                      const handleFieldChange = (newValue: string) => {
                        const updated = { ...editForm.activity_data, [key]: newValue };
                        const depChain = columnDependenciesMap?.[categoryId];
                        if (depChain) {
                          for (const [child, parent] of Object.entries(depChain)) {
                            if (parent.toLowerCase() === key.toLowerCase()) {
                              updated[child] = "";
                              for (const [gc, gp] of Object.entries(depChain)) {
                                if (gp.toLowerCase() === child.toLowerCase()) {
                                  updated[gc] = "";
                                }
                              }
                            }
                          }
                        }
                        // Auto-resolve emission_category from select values (only if mapping exists)
                        const ecm = emissionCategoryMappingMap?.[categoryId];
                        if (ecm && Object.keys(ecm).length > 0 && col?.column_type === "select") {
                          const autoResult = autoResolveEmissionCategory(updated, categoryId);
                          if (autoResult) {
                            updated.emission_category = autoResult.category;
                          } else {
                            updated.emission_category = "";
                          }
                        }
                        setEditForm({ ...editForm, activity_data: updated });
                      };

                      return (
                        <div key={key}>
                          <label className={`block text-xs mb-1 ${isDark ? "text-slate-400" : "text-gray-500"}`}>{formattedLabel}</label>
                          {options && options.length > 0 ? (
                            <select
                              value={String(value)}
                              onChange={(e) => handleFieldChange(e.target.value)}
                              disabled={isDisabledDependent}
                              className={`${modalInputClass} ${isDisabledDependent ? "opacity-50 cursor-not-allowed" : ""}`}
                            >
                              <option value="">
                                {isDisabledDependent
                                  ? `Select ${parentColName?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} first`
                                  : `Select ${formattedLabel}`}
                              </option>
                              {options.map((opt) => (
                                <option key={opt.id} value={opt.id}>{opt.label}</option>
                              ))}
                            </select>
                          ) : isDisabledDependent ? (
                            <select disabled className={`${modalInputClass} opacity-50 cursor-not-allowed`}>
                              <option>Select {parentColName?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} first</option>
                            </select>
                          ) : (
                            <input
                              type={isNumeric ? "number" : "text"}
                              step={isNumeric ? "any" : undefined}
                              value={String(value)}
                              onChange={(e) => handleFieldChange(e.target.value)}
                              className={modalInputClass}
                              placeholder={formattedLabel}
                            />
                          )}
                        </div>
                      );
                    });
                  })()}

                  {/* Unit */}
                  <div>
                    <label className={`block text-xs mb-1 ${isDark ? "text-slate-400" : "text-gray-500"}`}>Unit</label>
                    {editUnits.length > 0 ? (
                      <select
                        value={editUnit}
                        onChange={(e) => setEditUnit(e.target.value)}
                        className={modalInputClass}
                      >
                        <option value="">Select Unit</option>
                        {editUnits.map((unit) => (
                          <option key={unit.unit_id} value={unit.unit_name}>{unit.unit_name}</option>
                        ))}
                      </select>
                    ) : (
                      <input type="text" value={editUnit} readOnly className={modalInputClass} />
                    )}
                  </div>
                </div>
              </div>

              {/* Section 3: Date & Reason */}
              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wide mb-1.5 ${isDark ? "text-slate-400" : "text-gray-600"}`}>Details</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={`block text-xs mb-1 ${isDark ? "text-slate-400" : "text-gray-500"}`}>Date of Reporting</label>
                    <input
                      type="date"
                      value={editForm.date_of_reporting}
                      onChange={(e) =>
                        setEditForm({ ...editForm, date_of_reporting: e.target.value })
                      }
                      className={modalInputClass}
                    />
                  </div>
                  <div>
                    <label className={`block text-xs mb-1 ${isDark ? "text-slate-400" : "text-gray-500"}`}>Reason for Edit</label>
                    <textarea
                      value={editForm.reason}
                      onChange={(e) =>
                        setEditForm({ ...editForm, reason: e.target.value })
                      }
                      placeholder="Why is this data being modified?"
                      rows={2}
                      className={modalInputClass}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Audit Trail */}
          {editingEmission && (
            <AuditTrailTimeline
              entityType="emission"
              entityId={editingEmission.pk_id}
              isDark={isDark}
            />
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={() => {
              setEditModalOpen(false);
              setEditingEmission(null);
            }}
            className={cancelBtnClass}
          >
            Cancel
          </button>
          <button
            onClick={handleEditSave}
            disabled={editLoading}
            className={`px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 ${editLoading ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {editLoading ? "Saving..." : "Save"}
          </button>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Delete Emissions"
        isDark={isDark}
        className="max-w-md!"
      >
        <div>
          <p className={isDark ? "text-slate-300 mb-4" : "text-gray-700 mb-4"}>
            Are you sure you want to delete{" "}
            <strong>{selectedApprovedIds.size}</strong> approved emission
            {selectedApprovedIds.size !== 1 ? "s" : ""}? This action cannot be
            undone.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setDeleteModalOpen(false)}
              className={cancelBtnClass}
            >
              Cancel
            </button>
            <button
              onClick={confirmBulkDelete}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </div>
      </Modal>

      {/* Audit Trail Modal */}
      {auditEntityId && (
        <AuditTrailModal
          isOpen={auditModalOpen}
          onClose={() => {
            setAuditModalOpen(false);
            setAuditEntityId(null);
          }}
          entityType="emission"
          entityId={auditEntityId}
          isDark={isDark}
        />
      )}

      {/* Document Viewer Modal */}
      <DocumentViewerModal
        isOpen={viewerOpen}
        onClose={handleCloseViewer}
        document={selectedDocument}
        documents={viewerDocuments}
        onNavigate={handleNavigateDocument}
      />

      {/* Notification Toast */}
      {notification && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-opacity ${
            notification.type === "error"
              ? isDark
                ? "bg-red-900/90 text-red-200 border border-red-700"
                : "bg-red-100 text-red-800 border border-red-300"
              : isDark
                ? "bg-slate-700 text-slate-200 border border-slate-600"
                : "bg-gray-100 text-gray-800 border border-gray-300"
          }`}
        >
          {notification.message}
          <button
            onClick={() => setNotification(null)}
            className={`ml-3 ${isDark ? "text-slate-400 hover:text-slate-200" : "text-gray-500 hover:text-gray-700"}`}
          >
            &times;
          </button>
        </div>
      )}
    </div>
  );
};

export default EmissionsTable;
