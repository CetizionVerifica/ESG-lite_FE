import { useState, useEffect, useCallback, useMemo } from "react";
import Dropdown, { DropdownOption } from "../components/Dropdown";
import AuditTrailTimeline, {
  AuditTrailModal,
} from "../components/AuditTrailTimeline";
import Modal from "../components/Modal";
import { useAuth } from "../context/AuthContext";
import {
  getEmissionsPaginated,
  updateEmission,
  EmissionData,
  EmissionStatus,
  EmissionsSummary,
} from "../services/emissionService";
import { getUserEmissionFactorsBySiteAndCategory } from "../services/emissionFactorService";
import {
  getUserUnitsBySiteAndCategory,
  UnitData,
} from "../services/unitService";
import DocumentViewerModal from "../components/DocumentViewerModal";
import {
  getDocumentsByEmission,
  EmissionDocument,
} from "../services/documentService";
import {
  getUserColumnConfigsBySiteAndCategory,
  ColumnOptionsMap,
  DependentOptionsMap,
  ColumnDependencies,
  EmissionCategoryMapping,
} from "../services/columnConfigService";

interface Category {
  category_id: number;
  category_name: string;
  scope: string;
}

interface Site {
  site_id: number;
  name: string;
  categories?: Category[];
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const StatusBadge = ({ status }: { status: EmissionStatus }) => {
  const statusStyles: Record<EmissionStatus, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
  };

  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusStyles[status] || "bg-gray-100 text-gray-800"}`}
    >
      {status}
    </span>
  );
};

function generateYearOptions(): DropdownOption[] {
  const options: DropdownOption[] = [];
  const startYear = 2018;
  const endYear = 2030;

  for (let year = endYear; year >= startYear; year--) {
    options.push({ id: year, label: String(year) });
  }

  return options;
}

function generateMonthOptions(): DropdownOption[] {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  return months.map((month, index) => ({
    id: index + 1,
    label: month,
  }));
}

const UserEmissionsPage = () => {
  const { user } = useAuth();

  // Get available sites from user (supports both single site and multiple sites)
  const availableSites: Site[] = useMemo(() => {
    const sites = user?.sites || [];
    const singleSite = user?.site || null;
    return sites.length > 0 ? sites : singleSite ? [singleSite] : [];
  }, [user?.sites, user?.site]);

  const hasMultipleSites = availableSites.length > 1;

  const [selectedSite, setSelectedSite] = useState<number | null>(
    availableSites.length > 0 ? availableSites[0].site_id : null,
  );
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<EmissionStatus | null>(
    null,
  );
  const [emissions, setEmissions] = useState<EmissionData[]>([]);
  const [totalEmissions, setTotalEmissions] = useState(0);
  const [summary, setSummary] = useState<EmissionsSummary>({
    total_emission: 0,
    pending_count: 0,
    approved_count: 0,
    rejected_count: 0,
  });
  const [loading, setLoading] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 20;

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
  const [emissionCategoryOptions, setEmissionCategoryOptions] = useState<
    string[]
  >([]);
  const [editUnits, setEditUnits] = useState<UnitData[]>([]);
  const [editUnit, setEditUnit] = useState<string>("");

  // Column config state for ID-to-label conversion
  const [columnOptionsMap, setColumnOptionsMap] = useState<
    Record<number, ColumnOptionsMap>
  >({});
  const [dependentOptionsMap, setDependentOptionsMap] = useState<
    Record<number, DependentOptionsMap>
  >({});
  const [columnDependenciesMap, setColumnDependenciesMap] = useState<
    Record<number, ColumnDependencies>
  >({});
  // Store columns per category to map column names to IDs
  const [columnsMap, setColumnsMap] = useState<
    Record<
      number,
      { pk_id: number; column_name: string; column_type?: string }[]
    >
  >({});
  const [emissionCategoryMappingMap, setEmissionCategoryMappingMap] = useState<
    Record<number, EmissionCategoryMapping>
  >({});

  // Get current site and its categories
  const currentSite = availableSites.find((s) => s.site_id === selectedSite);
  const categories: Category[] = currentSite?.categories || [];
  const siteId = selectedSite;

  const siteOptions: DropdownOption[] = availableSites.map((site) => ({
    id: site.site_id,
    label: site.name,
  }));

  const categoryOptions: DropdownOption[] = categories.map((category) => ({
    id: category.category_id,
    label: category.category_name,
  }));

  const yearOptions = generateYearOptions();
  const monthOptions = generateMonthOptions();

  // Set initial site when availableSites becomes available
  useEffect(() => {
    if (availableSites.length > 0 && selectedSite === null) {
      setSelectedSite(availableSites[0].site_id);
    }
  }, [availableSites, selectedSite]);

  // Reset category when site changes
  useEffect(() => {
    setSelectedCategory(null);
  }, [selectedSite]);

  // Fetch column configs for all categories when site changes
  useEffect(() => {
    const fetchColumnConfigs = async () => {
      if (!siteId || categories.length === 0) return;

      const newColumnOptions: Record<number, ColumnOptionsMap> = {};
      const newDependentOptions: Record<number, DependentOptionsMap> = {};
      const newColumnDependencies: Record<number, ColumnDependencies> = {};
      const newColumnsMap: Record<
        number,
        { pk_id: number; column_name: string }[]
      > = {};
      const newEcmMap: Record<number, EmissionCategoryMapping> = {};

      for (const category of categories) {
        try {
          const configs = await getUserColumnConfigsBySiteAndCategory(
            siteId,
            category.category_id,
          );
          if (configs && configs.length > 0) {
            const config = configs[0];
            if (config.column_options) {
              newColumnOptions[category.category_id] = config.column_options;
            }
            if (config.dependent_options) {
              newDependentOptions[category.category_id] =
                config.dependent_options;
            }
            if (config.column_dependencies) {
              newColumnDependencies[category.category_id] =
                config.column_dependencies;
            }
            // Store columns for name-to-ID mapping
            if (config.columns && Array.isArray(config.columns)) {
              newColumnsMap[category.category_id] = config.columns.map(
                (col: {
                  pk_id: number;
                  column_name: string;
                  column_type?: string;
                }) => ({
                  pk_id: col.pk_id,
                  column_name: col.column_name,
                  column_type: col.column_type,
                }),
              );
            }
            if (config.emission_category_mapping) {
              newEcmMap[category.category_id] =
                config.emission_category_mapping;
            }
          }
        } catch (error) {
          console.error(
            `Error fetching column config for category ${category.category_id}:`,
            error,
          );
        }
      }

      setColumnOptionsMap(newColumnOptions);
      setDependentOptionsMap(newDependentOptions);
      setColumnDependenciesMap(newColumnDependencies);
      setColumnsMap(newColumnsMap);
      setEmissionCategoryMappingMap(newEcmMap);
    };

    fetchColumnConfigs();
  }, [siteId, categories]);

  // Helper to get column ID from column name
  const getColumnId = useCallback(
    (columnName: string, categoryId: number): string | null => {
      const columns = columnsMap[categoryId];
      if (!columns) return null;
      // Case-insensitive column name lookup
      const col = columns.find(
        (c) => c.column_name.toLowerCase() === columnName.toLowerCase(),
      );
      return col ? col.pk_id.toString() : null;
    },
    [columnsMap],
  );

  // Helper function to get label for a dropdown value
  const getOptionLabel = useCallback(
    (
      columnName: string,
      value: string,
      categoryId: number,
      activityData: Record<string, unknown>,
    ): string => {
      if (!value) return "";

      const columnOptions = columnOptionsMap[categoryId];
      const dependentOptions = dependentOptionsMap[categoryId];
      const columnDependencies = columnDependenciesMap[categoryId];

      // Check if this is a dependent column
      //  const parentColumnName = columnDependencies?.[columnName];

      const findDepKey = (obj: ColumnDependencies, key: string) => {
        if (!obj) return undefined;
        if (obj[key] !== undefined) return key;
        const lower = key.toLowerCase();
        const toSnake = key.replace(/([A-Z])/g, "_$1").toLowerCase();
        const toCamel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        return Object.keys(obj).find(
          (k) => k.toLowerCase() === lower || k === toSnake || k === toCamel,
        );
      };
      const depKey = findDepKey(columnDependencies, columnName);
      const parentColumnName = depKey ? columnDependencies[depKey] : undefined;

      if (parentColumnName && dependentOptions?.[columnName]) {
        // Get parent value and find its label first
        const parentValue = activityData[parentColumnName] as string;
        if (parentValue) {
          // Find parent label for case-insensitive lookup
          let parentLabel = parentValue;
          // Get parent column ID for options lookup
          const parentColumnId = getColumnId(parentColumnName, categoryId);
          if (parentColumnId) {
            const parentOptions = columnOptions?.[parentColumnId];
            if (parentOptions) {
              const parentOption = parentOptions.find(
                (opt) =>
                  String(opt.id) === String(parentValue) ||
                  opt.label.toLowerCase() === String(parentValue).toLowerCase(),
              );
              if (parentOption) {
                parentLabel = parentOption.label;
              }
            }
          }

          // Look up dependent options using parent label (case-insensitive)
          const depOptionsForParent = dependentOptions[columnName];
          const matchingKey = Object.keys(depOptionsForParent || {}).find(
            (key) => key.toLowerCase() === parentLabel.toLowerCase(),
          );

          if (matchingKey) {
            const options = depOptionsForParent[matchingKey];
            const option = options?.find(
              (opt) =>
                String(opt.id) === String(value) ||
                opt.label.toLowerCase() === String(value).toLowerCase(),
            );
            if (option) {
              return option.label;
            }
          }
        }
      }

      // Check in regular column options using column ID
      const columnId = getColumnId(columnName, categoryId);
      if (columnId) {
        const options = columnOptions?.[columnId];
        if (options) {
          const option = options.find(
            (opt) =>
              String(opt.id) === String(value) ||
              opt.label.toLowerCase() === String(value).toLowerCase(),
          );
          if (option) {
            return option.label;
          }
        }
      }

      // Fallback: search through ALL parent values in dependentOptions for this category
      const depOptionsForCategory = dependentOptionsMap[categoryId];
      if (depOptionsForCategory) {
        const columnNameLower = columnName.toLowerCase();
        let depOptionsForColumn:
          | { id: string | number; label: string }[]
          | undefined;

        // Find the dependent options for this column (case-insensitive)
        for (const [key, val] of Object.entries(depOptionsForCategory)) {
          if (key.toLowerCase() === columnNameLower) {
            depOptionsForColumn = Object.values(val).flat();
            break;
          }
        }

        if (depOptionsForColumn) {
          const option = depOptionsForColumn.find(
            (opt) =>
              String(opt.id) === value ||
              opt.label.toLowerCase() === value.toLowerCase(),
          );
          if (option) return option.label;
        }
      }

      // Return original value if no label found
      return value;
    },
    [columnOptionsMap, dependentOptionsMap, columnDependenciesMap, getColumnId],
  );

  // Format activity data with labels instead of IDs
  const formatActivityData = useCallback(
    (
      activityData: Record<string, unknown>,
      categoryId: number,
    ): { key: string; displayValue: string }[] => {
      if (!activityData) return [];

      const skipKeys = new Set([
        "category_name",
        "category_scope",
        "fera_linked_id",
        "date_of_reporting",
        "activity_data_unit",
        "_extra_data",
        "_isFeraRow",
        "_ecmKey",
        "extra_data",
      ]);

      return Object.entries(activityData)
        .filter(([key]) => !skipKeys.has(key))
        .map(([key, value]) => {
          if (value !== null && typeof value === "object") {
            return { key, displayValue: JSON.stringify(value) };
          }
          const stringValue = String(value);
          const displayValue = getOptionLabel(
            key,
            stringValue,
            categoryId,
            activityData,
          );
          return { key, displayValue };
        });
    },
    [getOptionLabel],
  );

  // Auto-resolve emission_category from select column values (same logic as Data Entry)
  const autoResolveEmissionCategory = (
    activityData: Record<string, any>,
    categoryId: number,
  ): { key: string; category: string } | null => {
    const ecm = emissionCategoryMappingMap?.[categoryId] || {};
    if (Object.keys(ecm).length === 0) return null;

    const deps = columnDependenciesMap?.[categoryId] || {};
    const columns = columnsMap?.[categoryId] || [];
    const colOptions = columnOptionsMap?.[categoryId] || {};
    const depOptions = dependentOptionsMap?.[categoryId] || {};

    // Find root columns
    const allChildCols = new Set(Object.keys(deps));
    const allParentCols = new Set(Object.values(deps));
    const rootCols = [...allParentCols].filter((c) => !allChildCols.has(c));

    const getLabel = (
      colName: string,
      value: string,
      parentLabel?: string,
    ): string => {
      const col = columns.find(
        (c) => c.column_name.toLowerCase() === colName.toLowerCase(),
      );
      if (!col) return value;

      // Try dependent options first
      if (parentLabel && depOptions[colName]) {
        const opts = depOptions[colName][parentLabel] || [];
        const match = opts.find((o) => String(o.id) === String(value));
        if (match) return match.label;
      }

      // Try column options
      const opts = colOptions[col.pk_id.toString()] || [];
      const match = opts.find(
        (o) =>
          String(o.id) === String(value) ||
          o.label.toLowerCase() === String(value).toLowerCase(),
      );
      if (match) return match.label;

      return value;
    };

    if (rootCols.length === 0) {
      // No dependencies — try flat mapping
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

    // Walk dependency chain collecting labels
    const keyParts: string[] = [];
    const walkChain = (colName: string): boolean => {
      const val = activityData[colName];
      if (!val) return false;
      const parentLabel =
        keyParts.length > 0 ? keyParts[keyParts.length - 1] : undefined;
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

    // Case-insensitive fallback
    const mappingKeyLower = mappingKey.toLowerCase();
    for (const [k, v] of Object.entries(ecm)) {
      if (k.toLowerCase() === mappingKeyLower) return { key: k, category: v };
    }

    // Progressive sub-key fallback
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
  const isEditDependentColumn = (
    columnName: string,
    categoryId: number,
  ): boolean => {
    const depChain = columnDependenciesMap?.[categoryId];
    if (!depChain) return false;
    return Object.keys(depChain).some(
      (k) => k.toLowerCase() === columnName.toLowerCase(),
    );
  };

  // Get parent column name for a dependent column
  const getEditParentColumnName = (
    columnName: string,
    categoryId: number,
  ): string | undefined => {
    const depChain = columnDependenciesMap?.[categoryId];
    if (!depChain) return undefined;
    const match = Object.keys(depChain).find(
      (k) => k.toLowerCase() === columnName.toLowerCase(),
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
      // Case-insensitive lookup for child deps
      const keyLower = key.toLowerCase();
      let childDeps = depOptions[key];
      if (!childDeps) {
        for (const [k, v] of Object.entries(depOptions)) {
          if (k.toLowerCase() === keyLower) {
            childDeps = v;
            break;
          }
        }
      }
      if (!childDeps) return null;

      const parentValue = editForm.activity_data[parentColName];
      if (!parentValue) return null; // Parent not selected yet

      // Convert parent stored value to label
      let parentLabel = String(parentValue);

      // Check if parent is also dependent (3-level chain)
      const grandparentColName = getEditParentColumnName(
        parentColName,
        categoryId,
      );
      if (
        grandparentColName &&
        isEditDependentColumn(parentColName, categoryId)
      ) {
        const parentDepOptions = depOptions[parentColName];
        if (parentDepOptions) {
          for (const [, options] of Object.entries(parentDepOptions)) {
            const match = options.find(
              (opt) => String(opt.id) === String(parentValue),
            );
            if (match) {
              parentLabel = match.label;
              break;
            }
          }
        }
      }

      // Fallback: try column options for parent label
      if (parentLabel === String(parentValue)) {
        const parentCol = columns.find(
          (c) => c.column_name.toLowerCase() === parentColName.toLowerCase(),
        );
        if (parentCol) {
          const parentOpts = columnOptions[parentCol.pk_id.toString()];
          const parentOpt = parentOpts?.find(
            (o) =>
              String(o.id) === String(parentValue) ||
              o.label.toLowerCase() === String(parentValue).toLowerCase(),
          );
          if (parentOpt) parentLabel = parentOpt.label;
        }
      }

      // Try composite key (grandparent|parent) for 3-level deps
      if (
        grandparentColName &&
        isEditDependentColumn(parentColName, categoryId)
      ) {
        const gpCol = columns.find(
          (c) =>
            c.column_name.toLowerCase() === grandparentColName.toLowerCase(),
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
          if (k.toLowerCase() === lower) {
            result = v;
            break;
          }
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
        const colOptions = columnOptionsMap?.[categoryId] || {};
        const depOptions = dependentOptionsMap?.[categoryId] || {};

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

        for (
          let i = 0;
          i < labels.length && i < orderedSelectCols.length;
          i++
        ) {
          const colName = orderedSelectCols[i];
          const label = labels[i];
          if (activityData[colName] && activityData[colName] !== "") continue;

          const col = columns.find(
            (c) => c.column_name.toLowerCase() === colName.toLowerCase(),
          );
          if (!col) continue;

          let matchedId: string | number | null = null;

          if (allChildCols.has(colName) && i > 0) {
            const parentColName = deps[colName];
            const parentVal = activityData[parentColName];
            if (parentVal && depOptions[colName]) {
              const parentCol = columns.find(
                (c) =>
                  c.column_name.toLowerCase() === parentColName.toLowerCase(),
              );
              let parentLabel = String(parentVal);
              if (parentCol) {
                const pOpts = colOptions[parentCol.pk_id.toString()] || [];
                const pMatch = pOpts.find(
                  (o) => String(o.id) === String(parentVal),
                );
                if (pMatch) parentLabel = pMatch.label;
              }
              const opts = depOptions[colName][parentLabel] || [];
              const match = opts.find(
                (o) => o.label.toLowerCase() === label.toLowerCase(),
              );
              if (match) matchedId = match.id;
            }
          }

          if (matchedId === null) {
            const opts = colOptions[col.pk_id.toString()] || [];
            const match = opts.find(
              (o) => o.label.toLowerCase() === label.toLowerCase(),
            );
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

    // Fetch emission category options and units for the dropdowns
    if (siteId && categoryId) {
      try {
        const reportDate = new Date(emission.date_of_reporting);
        const targetYear = reportDate.getFullYear() - 1;
        const [factors, units] = await Promise.all([
          getUserEmissionFactorsBySiteAndCategory(
            siteId,
            categoryId,
            targetYear,
          ),
          getUserUnitsBySiteAndCategory(siteId, categoryId),
        ]);
        const categoryNames = [
          ...new Set(
            factors.map((f: any) => f.emission_category_name).filter(Boolean),
          ),
        ] as string[];
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
    if (!editingEmission) return;
    setEditLoading(true);
    try {
      const cleanData = { ...editForm.activity_data };
      const metaKeys = [
        "category_name",
        "category_scope",
        "fera_linked_id",
        "date_of_reporting",
        "activity_data_unit",
        "_extra_data",
        "_isFeraRow",
        "_ecmKey",
        "extra_data",
      ];
      for (const k of metaKeys) delete cleanData[k];

      await updateEmission(editingEmission.pk_id, {
        activity_data: cleanData,
        date_of_reporting: editForm.date_of_reporting,
        activity_data_unit: editUnit || undefined,
        reason: editForm.reason || undefined,
      });
      setEditModalOpen(false);
      setEditingEmission(null);
      fetchPage(currentPage);
    } catch (error) {
      console.error("Error updating emission:", error);
      alert("Failed to update emission. Please try again.");
    } finally {
      setEditLoading(false);
    }
  };

  // Fetch emissions with server-side filtering and pagination
  const fetchPage = useCallback(
    async (page: number) => {
      if (!siteId) return;

      try {
        setLoading(true);
        const result = await getEmissionsPaginated({
          siteId,
          categoryId: selectedCategory,
          year: selectedYear,
          month: selectedMonth,
          status: selectedStatus,
          page,
          limit: rowsPerPage,
        });
        setEmissions(result.data);
        setTotalEmissions(result.total);
        setSummary(result.summary);
      } catch (error) {
        console.error("Error fetching emissions:", error);
        setEmissions([]);
        setTotalEmissions(0);
        setSummary({
          total_emission: 0,
          pending_count: 0,
          approved_count: 0,
          rejected_count: 0,
        });
      } finally {
        setLoading(false);
      }
    },
    [siteId, selectedCategory, selectedYear, selectedMonth, selectedStatus],
  );

  // When filters change, reset to page 1 and fetch
  useEffect(() => {
    setCurrentPage(1);
    fetchPage(1);
  }, [fetchPage]);

  // When page changes (user clicks pagination), fetch that page
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchPage(page);
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
        alert("No documents found for this emission.");
      }
    } catch (error) {
      console.error("Error fetching documents:", error);
      alert("Failed to load documents.");
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

  const totalPages = Math.ceil(totalEmissions / rowsPerPage);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">
        My Emissions - {currentSite?.name || "No Site"}
      </h1>

      {/* Filters */}
      <div
        className={`grid grid-cols-1 gap-4 mb-6 ${hasMultipleSites ? "md:grid-cols-5" : "md:grid-cols-4"}`}
      >
        {/* Site Selector - only show when user has multiple sites */}
        {hasMultipleSites && (
          <div>
            <label className="block text-sm font-medium mb-1">Site</label>
            <Dropdown
              options={siteOptions}
              placeholder="Select Site"
              value={selectedSite}
              onChange={(option) => setSelectedSite(option?.id as number)}
              searchable={true}
            />
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-1">Category</label>
          <Dropdown
            options={categoryOptions}
            placeholder="All Categories"
            value={selectedCategory}
            onChange={(option) => setSelectedCategory(option?.id as number)}
            searchable={true}
            clearable={true}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Year</label>
          <Dropdown
            options={yearOptions}
            placeholder="All Years"
            value={selectedYear}
            onChange={(option) => setSelectedYear(option?.id as number)}
            searchable={true}
            clearable={true}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Month</label>
          <Dropdown
            options={monthOptions}
            placeholder="All Months"
            value={selectedMonth}
            onChange={(option) => setSelectedMonth(option?.id as number)}
            searchable={true}
            clearable={true}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Status</label>
          <Dropdown
            options={[
              { id: "pending", label: "Pending" },
              { id: "approved", label: "Approved" },
              { id: "rejected", label: "Rejected" },
            ]}
            placeholder="All Statuses"
            value={selectedStatus}
            onChange={(option) =>
              setSelectedStatus(option?.id as EmissionStatus)
            }
            clearable={true}
          />
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-sm text-gray-500">Total Records</div>
          <div className="text-2xl font-bold">{totalEmissions}</div>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-sm text-gray-500">Total Emission</div>
          <div className="text-2xl font-bold">
            {summary.total_emission.toFixed(2)} tCO2e
          </div>
        </div>
        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <div className="text-sm text-yellow-700">Pending</div>
          <div className="text-2xl font-bold text-yellow-800">
            {summary.pending_count}
          </div>
        </div>
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <div className="text-sm text-green-700">Approved</div>
          <div className="text-2xl font-bold text-green-800">
            {summary.approved_count}
          </div>
        </div>
        <div className="bg-red-50 p-4 rounded-lg border border-red-200">
          <div className="text-sm text-red-700">Rejected</div>
          <div className="text-2xl font-bold text-red-800">
            {summary.rejected_count}
          </div>
        </div>
      </div>

      {/* Emissions Table */}
      {loading ? (
        <div className="text-center py-8">Loading emissions...</div>
      ) : emissions.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No emissions found for the selected filters.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">
                  Category
                </th>
                <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">
                  Activity Data
                </th>
                <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">
                  Activity Unit
                </th>
                <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">
                  Total Emission (tCO2e)
                </th>
                <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">
                  Date of Reporting
                </th>
                <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">
                  Status
                </th>
                <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">
                  Submitted At
                </th>
                <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">
                  Documents
                </th>
                <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">
                  History
                </th>
                <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Build parent→FERA map, skip standalone FERA rows
                const isFera = (e: EmissionData) =>
                  e.category?.category_name?.toLowerCase() === "fera";

                // If user explicitly filtered by FERA category, show FERA rows directly
                const selectedCatIsFera =
                  categories
                    .find((c) => c.category_id === selectedCategory)
                    ?.category_name?.toLowerCase() === "fera";

                if (selectedCatIsFera) {
                  return emissions.map((emission) => ({
                    emission,
                    feraEntry: undefined,
                  }));
                }

                const regular = emissions.filter((e) => !isFera(e));
                const fera = emissions.filter((e) => isFera(e));
                const feraMap = new Map<number, EmissionData>();
                for (const em of regular) {
                  const linked = fera.find(
                    (f) =>
                      f.pk_id === em.fera_linked_id ||
                      f.fera_linked_id === em.pk_id,
                  );
                  if (linked) feraMap.set(em.pk_id, linked);
                }
                return regular.map((emission) => {
                  const feraEntry = feraMap.get(emission.pk_id);
                  return { emission, feraEntry };
                });
              })().map(({ emission, feraEntry }) => (
                <tr key={emission.pk_id} className="hover:bg-gray-50">
                  <td className="border border-gray-300 px-4 py-3">
                    {emission.category?.category_name || "-"}
                    {emission.parent_category_name && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        ({emission.parent_category_name})
                      </div>
                    )}
                  </td>
                  <td className="border border-gray-300 px-4 py-3">
                    <div className="max-w-xs">
                      {formatActivityData(
                        emission.activity_data || {},
                        emission.category?.category_id || 0,
                      ).map(({ key, displayValue }) => (
                        <div key={key} className="text-sm">
                          <span className="font-medium">{key}:</span>{" "}
                          {displayValue}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="border border-gray-300 px-4 py-3">
                    {emission.activity_data_unit || "-"}
                  </td>
                  <td className="border border-gray-300 px-4 py-3">
                    <div>{Number(emission.total_emission).toFixed(2)}</div>
                    {feraEntry && (
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span className="text-[10px] font-bold px-1 py-0.5 rounded bg-purple-100 text-purple-700">
                          FERA
                        </span>
                        <span className="text-sm text-purple-600 font-medium">
                          {Number(feraEntry.total_emission).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="border border-gray-300 px-4 py-3">
                    {formatDate(emission.date_of_reporting)}
                  </td>
                  <td className="border border-gray-300 px-4 py-3">
                    <StatusBadge status={emission.status} />
                    {emission.status === "rejected" &&
                      emission.review_comment && (
                        <div className="text-xs text-red-600 mt-1">
                          Reason: {emission.review_comment}
                        </div>
                      )}
                  </td>
                  <td className="border border-gray-300 px-4 py-3">
                    {formatDate(emission.created_at)}
                  </td>
                  <td className="border border-gray-300 px-4 py-3">
                    <button
                      onClick={() => handleViewDocuments(emission.pk_id)}
                      disabled={loadingDocs}
                      className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50 transition-colors"
                    >
                      View Docs
                    </button>
                  </td>
                  <td className="border border-gray-300 px-4 py-3">
                    <button
                      onClick={() => {
                        setAuditEntityId(emission.pk_id);
                        setAuditModalOpen(true);
                      }}
                      className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                      title="View edit history"
                    >
                      History
                    </button>
                  </td>
                  <td className="border border-gray-300 px-4 py-3">
                    {(emission.status === "pending" ||
                      emission.status === "rejected") && (
                      <button
                        onClick={() => handleEditClick(emission)}
                        className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                        title="Edit emission"
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-white mt-2">
              <p className="text-sm text-gray-600">
                Showing{" "}
                <span className="font-medium">
                  {(currentPage - 1) * rowsPerPage + 1}
                </span>{" "}
                to{" "}
                <span className="font-medium">
                  {Math.min(currentPage * rowsPerPage, totalEmissions)}
                </span>{" "}
                of <span className="font-medium">{totalEmissions}</span> entries
              </p>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => handlePageChange(1)}
                  disabled={currentPage === 1}
                  className="px-2 py-1 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  «
                </button>

                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-2 py-1 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ‹
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(
                    (page) =>
                      page === 1 ||
                      page === totalPages ||
                      Math.abs(page - currentPage) <= 2,
                  )
                  .reduce<(number | "...")[]>((acc, page, idx, arr) => {
                    if (idx > 0 && page - (arr[idx - 1] as number) > 1)
                      acc.push("...");
                    acc.push(page);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    item === "..." ? (
                      <span
                        key={`ellipsis-${idx}`}
                        className="px-2 text-gray-400"
                      >
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        onClick={() => handlePageChange(item as number)}
                        className={`px-3 py-1 text-sm rounded border transition-colors ${
                          currentPage === item
                            ? "bg-blue-600 text-white border-blue-600"
                            : "border-gray-300 hover:bg-gray-50 text-gray-700"
                        }`}
                      >
                        {item}
                      </button>
                    ),
                  )}

                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-2 py-1 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ›
                </button>

                <button
                  onClick={() => handlePageChange(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-2 py-1 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  »
                </button>
              </div>
            </div>
          )}
        </div>
      )}

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
        />
      )}

      {/* Edit Emission Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setEditingEmission(null);
        }}
        title="Edit Entry"
        className="max-w-4xl! max-h-[85vh]!"
      >
        <div className="space-y-4">
          <div className="border rounded-lg shadow-sm border-gray-200 bg-white">
            {/* Card Header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50 rounded-t-lg">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-gray-600">
                  {editingEmission?.category?.category_name || "Entry"}
                </span>
                {editingEmission?.status === "rejected" && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded-full">
                    Rejected
                  </span>
                )}
              </div>
            </div>

            <div className="p-4 space-y-4">
              {/* Rejection reason */}
              {editingEmission?.status === "rejected" &&
                editingEmission?.review_comment && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                    <span className="font-medium">Rejection Reason:</span>{" "}
                    {editingEmission.review_comment}
                  </div>
                )}

              {/* Section 1: Emission Category */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                  Emission Category
                </label>
                {(() => {
                  const catId = editingEmission?.category?.category_id || 0;
                  const hasMapping =
                    Object.keys(emissionCategoryMappingMap?.[catId] || {})
                      .length > 0;
                  if (hasMapping) {
                    // Auto-resolved from select columns — read-only
                    return editForm.activity_data.emission_category ? (
                      <div className="px-3 py-2.5 rounded-md text-sm font-medium bg-green-50 text-green-800 border border-green-300">
                        {editForm.activity_data.emission_category}
                      </div>
                    ) : (
                      <div className="px-3 py-2.5 rounded-md text-sm italic bg-gray-50 text-gray-400 border border-gray-200">
                        Select dropdown values to auto-determine
                      </div>
                    );
                  }
                  // No mapping — manual dropdown from emission factors
                  if (emissionCategoryOptions.length > 0) {
                    return (
                      <select
                        value={String(
                          editForm.activity_data.emission_category || "",
                        )}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            activity_data: {
                              ...editForm.activity_data,
                              emission_category: e.target.value,
                            },
                          })
                        }
                        className="w-full border border-gray-300 px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      >
                        <option value="">-- Select Emission Category --</option>
                        {emissionCategoryOptions.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    );
                  }
                  return editForm.activity_data.emission_category ? (
                    <div className="px-3 py-2.5 rounded-md text-sm font-medium bg-green-50 text-green-800 border border-green-300">
                      {editForm.activity_data.emission_category}
                    </div>
                  ) : (
                    <div className="px-3 py-2.5 rounded-md text-sm italic bg-gray-50 text-gray-400 border border-gray-200">
                      No emission category
                    </div>
                  );
                })()}
              </div>

              {/* Section 2: Activity Data */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                  Activity Data
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {(() => {
                    const categoryId =
                      editingEmission?.category?.category_id || 0;
                    const configColumns = columnsMap?.[categoryId] || [];
                    const configKeys = configColumns.map((c) => c.column_name);
                    const skipKeys = new Set([
                      "emission_category",
                      "category_name",
                      "category_scope",
                      "fera_linked_id",
                      "date_of_reporting",
                      "activity_data_unit",
                      "_extra_data",
                      "_isFeraRow",
                      "_ecmKey",
                      "extra_data",
                    ]);
                    const activityKeys = Object.keys(
                      editForm.activity_data,
                    ).filter((k) => !skipKeys.has(k));
                    const orderedKeys = [
                      ...configKeys.filter((k) => !skipKeys.has(k)),
                      ...activityKeys.filter(
                        (k) =>
                          !configKeys.some(
                            (ck) => ck.toLowerCase() === k.toLowerCase(),
                          ),
                      ),
                    ];

                    return orderedKeys.map((key) => {
                      const value = editForm.activity_data[key] ?? "";
                      const options = getEditFieldOptions(key, categoryId);
                      const isDependent = isEditDependentColumn(
                        key,
                        categoryId,
                      );
                      const parentColName = getEditParentColumnName(
                        key,
                        categoryId,
                      );
                      const parentValue = parentColName
                        ? editForm.activity_data[parentColName]
                        : undefined;
                      const isDisabledDependent = isDependent && !parentValue;
                      const col = configColumns.find(
                        (c) =>
                          c.column_name.toLowerCase() === key.toLowerCase(),
                      );
                      const isNumeric =
                        col?.column_type === "number" ||
                        (!isNaN(Number(value)) &&
                          value !== "" &&
                          value !== null &&
                          !options);
                      const formattedLabel = key
                        .replace(/_/g, " ")
                        .replace(/\b\w/g, (c) => c.toUpperCase());

                      const handleFieldChange = (newValue: string) => {
                        const updated = {
                          ...editForm.activity_data,
                          [key]: newValue,
                        };
                        const depChain = columnDependenciesMap?.[categoryId];
                        if (depChain) {
                          for (const [child, parent] of Object.entries(
                            depChain,
                          )) {
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
                        if (
                          ecm &&
                          Object.keys(ecm).length > 0 &&
                          col?.column_type === "select"
                        ) {
                          const autoResult = autoResolveEmissionCategory(
                            updated,
                            categoryId,
                          );
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
                          <label className="block text-xs text-gray-500 mb-1">
                            {formattedLabel}
                          </label>
                          {options && options.length > 0 ? (
                            <select
                              value={String(value)}
                              onChange={(e) =>
                                handleFieldChange(e.target.value)
                              }
                              disabled={isDisabledDependent}
                              className={`w-full border border-gray-300 px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                                isDisabledDependent
                                  ? "bg-gray-100 cursor-not-allowed"
                                  : ""
                              }`}
                            >
                              <option value="">
                                {isDisabledDependent
                                  ? `Select ${parentColName?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} first`
                                  : `Select ${formattedLabel}`}
                              </option>
                              {options.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          ) : isDisabledDependent ? (
                            <select
                              disabled
                              className="w-full border border-gray-300 px-3 py-2 rounded-md text-sm bg-gray-100 cursor-not-allowed"
                            >
                              <option>
                                Select{" "}
                                {parentColName
                                  ?.replace(/_/g, " ")
                                  .replace(/\b\w/g, (c) =>
                                    c.toUpperCase(),
                                  )}{" "}
                                first
                              </option>
                            </select>
                          ) : (
                            <input
                              type={isNumeric ? "number" : "text"}
                              step={isNumeric ? "any" : undefined}
                              value={String(value)}
                              onChange={(e) =>
                                handleFieldChange(e.target.value)
                              }
                              className="w-full border border-gray-300 px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                              placeholder={formattedLabel}
                            />
                          )}
                        </div>
                      );
                    });
                  })()}

                  {/* Unit */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Unit
                    </label>
                    {editUnits.length > 0 ? (
                      <select
                        value={editUnit}
                        onChange={(e) => setEditUnit(e.target.value)}
                        className="w-full border border-gray-300 px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                      >
                        <option value="">Select Unit</option>
                        {editUnits.map((unit) => (
                          <option key={unit.unit_id} value={unit.unit_name}>
                            {unit.unit_name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={editUnit}
                        readOnly
                        className="w-full border border-gray-200 bg-gray-50 px-3 py-2 rounded-md text-sm text-gray-600"
                      />
                    )}
                  </div>
                </div>
              </div>

              {/* Section 3: Date & Reason */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                  Details
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Date of Reporting
                    </label>
                    <input
                      type="date"
                      value={editForm.date_of_reporting}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          date_of_reporting: e.target.value,
                        })
                      }
                      className="w-full border border-gray-300 px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">
                      Reason for Edit (Optional)
                    </label>
                    <textarea
                      value={editForm.reason}
                      onChange={(e) =>
                        setEditForm({ ...editForm, reason: e.target.value })
                      }
                      placeholder="Why is this data being modified?"
                      rows={2}
                      className="w-full border border-gray-300 px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
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
            />
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={() => {
              setEditModalOpen(false);
              setEditingEmission(null);
            }}
            className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
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

      {/* Document Viewer Modal */}
      <DocumentViewerModal
        isOpen={viewerOpen}
        onClose={handleCloseViewer}
        document={selectedDocument}
        documents={viewerDocuments}
        onNavigate={handleNavigateDocument}
      />
    </div>
  );
};

export default UserEmissionsPage;
