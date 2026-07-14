import { useState, useEffect, useCallback, useMemo } from "react";
import Dropdown, { DropdownOption } from "../../components/Dropdown";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import {
  getEmissionsPaginated,
  approveEmission,
  rejectEmission,
  bulkApproveEmissions,
  bulkRejectEmissions,
  bulkDeleteEmissions,
  getEmissionBatches,
  approveEmissionsByBatch,
  rejectEmissionsByBatch,
  managerUpdateEmission,
  exportMonthlyEmissions,
  EmissionData,
  EmissionStatus,
  type EmissionUploadBatch,
} from "../../services/emissionService";
import {
  getUserColumnConfigsBySiteAndCategory,
  ColumnOptionsMap,
  DependentOptionsMap,
  ColumnDependencies,
  EmissionCategoryMapping,
} from "../../services/columnConfigService";

import EmissionsTable from "./EmissionsTable";
import Modal from "../../components/Modal";

interface Category {
  category_id: number;
  category_name: string;
  scope: string;
}

interface Site {
  site_id: number;
  name: string;
  categories: Category[];
}

const STATUS_OPTIONS: DropdownOption[] = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

function generateDateOptions(): DropdownOption[] {
  const options: DropdownOption[] = [];
  const startYear = 2018;
  const endYear = 2030;

  // Generate from most recent to oldest (December 2026 to January 2021)
  for (let year = endYear; year >= startYear; year--) {
    for (let month = 11; month >= 0; month--) {
      const date = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0).getDate();
      const value = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const label = date.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
      options.push({ id: value, label });
    }
  }

  return options;
}

const ManagerPage = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();

  // For managers with multiple sites
  const sites: Site[] = user?.sites || [];
  // Fallback to single site for backward compatibility
  const singleSite: Site | null = user?.site || null;

  // Use sites array if available, otherwise use single site
  const availableSites = useMemo(
    () => (sites.length > 0 ? sites : singleSite ? [singleSite] : []),
    [sites, singleSite],
  );

  const [selectedSites, setSelectedSites] = useState<number[]>(
    availableSites.length > 0 ? [availableSites[0].site_id] : [],
  );
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<EmissionStatus | null>(
    null,
  );
  const [exporting, setExporting] = useState(false);
  const [emissions, setEmissions] = useState<EmissionData[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const PAGE_LIMIT = 50;
  const [emissionBatches, setEmissionBatches] = useState<EmissionUploadBatch[]>(
    [],
  );
  const [showBatches, setShowBatches] = useState(true);
  const [approvingBatchId, setApprovingBatchId] = useState<string | null>(null);
  const [rejectingBatchId, setRejectingBatchId] = useState<string | null>(null);

  // Batch approve modal state
  const [batchApproveModalOpen, setBatchApproveModalOpen] = useState(false);
  const [batchApproveId, setBatchApproveId] = useState<string | null>(null);

  // Batch reject modal state
  const [batchRejectModalOpen, setBatchRejectModalOpen] = useState(false);
  const [batchRejectId, setBatchRejectId] = useState<string | null>(null);
  const [batchRejectComment, setBatchRejectComment] = useState("");

  const [columnOptionsMap, setColumnOptionsMap] = useState<
    Record<number, ColumnOptionsMap>
  >({});
  const [dependentOptionsMap, setDependentOptionsMap] = useState<
    Record<number, DependentOptionsMap>
  >({});
  const [columnDependenciesMap, setColumnDependenciesMap] = useState<
    Record<number, ColumnDependencies>
  >({});
  const [columnsMap, setColumnsMap] = useState<
    Record<
      number,
      { pk_id: number; column_name: string; column_type?: string }[]
    >
  >({});
  const [emissionCategoryMappingMap, setEmissionCategoryMappingMap] = useState<
    Record<number, EmissionCategoryMapping>
  >({});

  // Categories from all selected sites (union, deduplicated)
  const categories: Category[] = useMemo(() => {
    const map = new Map<number, Category>();
    selectedSites.forEach((sid) => {
      availableSites
        .find((s) => s.site_id === sid)
        ?.categories?.forEach((cat) => {
          if (!map.has(cat.category_id)) map.set(cat.category_id, cat);
        });
    });
    return Array.from(map.values());
  }, [selectedSites, availableSites]);

  // Names of the selected sites (for the info banner)
  const selectedSiteNames = availableSites
    .filter((s) => selectedSites.includes(s.site_id))
    .map((s) => s.name);

  const siteOptions: DropdownOption[] = availableSites.map((site) => ({
    id: site.site_id,
    label: site.name,
  }));

  const categoryOptions: DropdownOption[] = categories.map((category) => ({
    id: category.category_id,
    label: category.category_name,
  }));

  const dateOptions = generateDateOptions();

  // Reset category if it is no longer available for the selected sites
  useEffect(() => {
    if (
      selectedCategory &&
      !categories.some((c) => c.category_id === selectedCategory)
    ) {
      setSelectedCategory(null);
    }
  }, [selectedSites, categories, selectedCategory]);

  // Load column configs for every selected site and union them per category,
  // so a category configured differently across sites shows all its columns.
  useEffect(() => {
    const fetchColumnConfigs = async () => {
      if (selectedSites.length === 0 || categories.length === 0) return;

      const newColumnOptions: Record<number, ColumnOptionsMap> = {};
      const newDependentOptions: Record<number, DependentOptionsMap> = {};
      const newColumnDependencies: Record<number, ColumnDependencies> = {};
      const newColumnsMap: Record<
        number,
        { pk_id: number; column_name: string; column_type?: string }[]
      > = {};
      const newEcmMap: Record<number, EmissionCategoryMapping> = {};

      for (const category of categories) {
        const catId = category.category_id;
        for (const sid of selectedSites) {
          try {
            const configs = await getUserColumnConfigsBySiteAndCategory(
              sid,
              catId,
            );
            if (!configs || configs.length === 0) continue;
            const config = configs[0];

            // Union columns across sites, deduped by column name
            if (config.columns && Array.isArray(config.columns)) {
              const existing = newColumnsMap[catId] || [];
              const seen = new Set(
                existing.map((c) => c.column_name.toLowerCase()),
              );
              const merged = [...existing];
              for (const col of config.columns as {
                pk_id: number;
                column_name: string;
                column_type?: string;
              }[]) {
                if (!seen.has(col.column_name.toLowerCase())) {
                  seen.add(col.column_name.toLowerCase());
                  merged.push({
                    pk_id: col.pk_id,
                    column_name: col.column_name,
                    column_type: col.column_type,
                  });
                }
              }
              newColumnsMap[catId] = merged;
            }
            if (config.column_options) {
              newColumnOptions[catId] = {
                ...(newColumnOptions[catId] || {}),
                ...config.column_options,
              };
            }
            if (config.dependent_options) {
              newDependentOptions[catId] = {
                ...(newDependentOptions[catId] || {}),
                ...config.dependent_options,
              };
            }
            if (config.column_dependencies) {
              newColumnDependencies[catId] = {
                ...(newColumnDependencies[catId] || {}),
                ...config.column_dependencies,
              };
            }
            if (config.emission_category_mapping && !newEcmMap[catId]) {
              newEcmMap[catId] = config.emission_category_mapping;
            }
          } catch (error) {
            console.error(
              `Error fetching column config for site ${sid}, category ${catId}:`,
              error,
            );
          }
        }
      }

      setColumnOptionsMap(newColumnOptions);
      setDependentOptionsMap(newDependentOptions);
      setColumnDependenciesMap(newColumnDependencies);
      setColumnsMap(newColumnsMap);
      setEmissionCategoryMappingMap(newEcmMap);
    };

    fetchColumnConfigs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSites, categories]);

  const getColumnId = useCallback(
    (columnName: string, categoryId: number): string | null => {
      const columns = columnsMap[categoryId];
      if (!columns) return null;
      const col = columns.find(
        (c) => c.column_name.toLowerCase() === columnName.toLowerCase(),
      );
      return col ? col.pk_id.toString() : null;
    },
    [columnsMap],
  );

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
        const parentValue = activityData[parentColumnName] as string;
        if (parentValue) {
          let parentLabel = parentValue;
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

  // Fetch paginated emissions for the selected sites with filters
  const fetchEmissions = useCallback(
    async (page?: number) => {
      if (selectedSites.length === 0) return;

      const pageToFetch = page ?? currentPage;

      // Parse year and month from selectedDate (format: "YYYY-MM-DD")
      let year: number | null = null;
      let month: number | null = null;
      if (selectedDate) {
        const parts = selectedDate.split("-");
        year = parseInt(parts[0]);
        month = parseInt(parts[1]);
      }

      try {
        setLoading(true);
        const result = await getEmissionsPaginated({
          siteIds: selectedSites,
          categoryId: selectedCategory,
          year,
          month,
          status: selectedStatus,
          page: pageToFetch,
          limit: PAGE_LIMIT,
        });
        setEmissions(result.data);
        setTotalCount(result.total);
        setTotalPages(Math.max(1, Math.ceil(result.total / PAGE_LIMIT)));
        // Fetch upload batches for the selected sites
        getEmissionBatches(selectedSites, selectedCategory)
          .then(setEmissionBatches)
          .catch(() => setEmissionBatches([]));
      } catch (error) {
        console.error("Error fetching emissions:", error);
        setEmissions([]);
        setTotalCount(0);
        setTotalPages(1);
      } finally {
        setLoading(false);
      }
    },
    [selectedSites, selectedCategory, selectedDate, selectedStatus, currentPage],
  );

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedSites, selectedCategory, selectedDate, selectedStatus]);

  useEffect(() => {
    fetchEmissions();
  }, [fetchEmissions]);

  // Handle approve emission
  const handleApprove = useCallback(async (id: number, comment?: string) => {
    const response = await approveEmission(id, comment);
    // Update the emission with the full response data including reviewed_by
    setEmissions((prev) =>
      prev.map((e) => (e.pk_id === id ? response.emission : e)),
    );
  }, []);

  // Handle reject emission
  const handleReject = useCallback(async (id: number, comment: string) => {
    const response = await rejectEmission(id, comment);
    // Update the emission with the full response data including reviewed_by
    setEmissions((prev) =>
      prev.map((e) => (e.pk_id === id ? response.emission : e)),
    );
  }, []);

  // Handle bulk approve emissions
  const handleBulkApprove = useCallback(
    async (ids: number[]) => {
      await bulkApproveEmissions(ids);
      // Refresh emissions after bulk approval
      await fetchEmissions();
    },
    [fetchEmissions],
  );

  // Handle bulk reject emissions
  const handleBulkReject = useCallback(
    async (ids: number[], comment: string) => {
      await bulkRejectEmissions(ids, comment);
      await fetchEmissions();
    },
    [fetchEmissions],
  );

  // Handle bulk delete emissions
  const handleBulkDelete = useCallback(
    async (ids: number[]) => {
      await bulkDeleteEmissions(ids);
      await fetchEmissions();
    },
    [fetchEmissions],
  );

  // Handle batch approve - open confirmation modal
  const handleBatchApprove = useCallback((batchId: string) => {
    setBatchApproveId(batchId);
    setBatchApproveModalOpen(true);
  }, []);

  const confirmBatchApprove = useCallback(async () => {
    if (!batchApproveId) return;
    setBatchApproveModalOpen(false);
    setApprovingBatchId(batchApproveId);
    try {
      await approveEmissionsByBatch(batchApproveId);
      await fetchEmissions();
    } catch (error) {
      console.error("Error approving batch:", error);
    } finally {
      setApprovingBatchId(null);
      setBatchApproveId(null);
    }
  }, [batchApproveId, fetchEmissions]);

  // Handle batch reject - open reject modal with reason input
  const handleBatchReject = useCallback((batchId: string) => {
    setBatchRejectId(batchId);
    setBatchRejectComment("");
    setBatchRejectModalOpen(true);
  }, []);

  const confirmBatchReject = useCallback(async () => {
    if (!batchRejectId || !batchRejectComment.trim()) return;
    setBatchRejectModalOpen(false);
    setRejectingBatchId(batchRejectId);
    try {
      await rejectEmissionsByBatch(batchRejectId, batchRejectComment.trim());
      await fetchEmissions();
    } catch (error) {
      console.error("Error rejecting batch:", error);
    } finally {
      setRejectingBatchId(null);
      setBatchRejectId(null);
      setBatchRejectComment("");
    }
  }, [batchRejectId, batchRejectComment, fetchEmissions]);

  // Handle manager edit emission
  const handleManagerEdit = useCallback(
    async (
      id: number,
      data: {
        activity_data?: Record<string, any>;
        date_of_reporting?: string;
        activity_data_unit?: string;
        reason?: string;
      },
    ) => {
      const response = await managerUpdateEmission(id, data);
      setEmissions((prev) =>
        prev.map((e) => (e.pk_id === id ? response.emission : e)),
      );
    },
    [],
  );

  // Theme classes
  const containerClass = isDark
    ? "p-6 bg-slate-900 min-h-screen text-slate-100"
    : "p-6 bg-gray-50 min-h-screen text-gray-900";

  const labelClass = isDark
    ? "block text-sm font-medium mb-1 text-slate-300"
    : "block text-sm font-medium mb-1 text-gray-700";

  const infoTextClass = isDark
    ? "text-sm font-medium text-slate-300"
    : "text-sm font-medium text-gray-700";

  const countTextClass = isDark
    ? "text-sm text-slate-400 ml-4"
    : "text-sm text-gray-500 ml-4";

  return (
    <div className={containerClass}>
      <h1 className="text-2xl font-bold mb-6">Manage data</h1>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
        {/* Site Selection - only show if manager has multiple sites */}
        <div>
          <label className={labelClass}>Site</label>
          <Dropdown
            options={siteOptions}
            placeholder="Select Sites"
            multiple={true}
            multipleValue={selectedSites}
            onMultipleChange={(options) =>
              setSelectedSites(options.map((o) => o.id as number))
            }
            searchable={true}
            clearable={true}
          />
        </div>
        <div>
          <label className={labelClass}>Category</label>
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
          <label className={labelClass}>Date</label>
          <Dropdown
            options={dateOptions}
            placeholder="All Dates"
            value={selectedDate}
            onChange={(option) => setSelectedDate(option?.id as string)}
            searchable={true}
            clearable={true}
          />
        </div>
        <div>
          <label className={labelClass}>Status</label>
          <Dropdown
            options={STATUS_OPTIONS}
            placeholder="All Statuses"
            value={selectedStatus}
            onChange={(option) =>
              setSelectedStatus(option?.id as EmissionStatus)
            }
            clearable={true}
          />
        </div>
        <div className="flex items-end gap-2">
          <button
            onClick={() => fetchEmissions()}
            className={
              isDark
                ? "px-4 py-2 bg-slate-700 text-slate-200 rounded hover:bg-slate-600"
                : "px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            }
          >
            Refresh
          </button>
          <button
            onClick={async () => {
              if (selectedSites.length === 0 || !selectedDate) return;
              const [y, m] = selectedDate.split("-");
              setExporting(true);
              try {
                await exportMonthlyEmissions({
                  siteIds: selectedSites,
                  year: parseInt(y),
                  month: parseInt(m),
                  categoryId: selectedCategory || undefined,
                  status: selectedStatus || undefined,
                });
              } catch (err: any) {
                const msg =
                  err?.response?.status === 404
                    ? "No emissions found for the selected filters"
                    : "Failed to export data. Please try again.";
                alert(msg);
              } finally {
                setExporting(false);
              }
            }}
            disabled={selectedSites.length === 0 || !selectedDate || exporting}
            title={
              !selectedDate
                ? "Select a date first"
                : "Download filtered emissions as Excel"
            }
            className={`px-4 py-2 rounded disabled:opacity-40 ${isDark ? "bg-emerald-700 text-white hover:bg-emerald-600" : "bg-emerald-600 text-white hover:bg-emerald-700"}`}
          >
            {exporting ? "Exporting..." : "Download Excel"}
          </button>
        </div>
      </div>

      {/* Current Site Info */}
      {selectedSiteNames.length > 0 && (
        <div className="mb-4">
          <span className={infoTextClass}>
            Viewing: {selectedSiteNames.join(", ")}
          </span>
          <span className={countTextClass}>
            {totalCount} emission{totalCount !== 1 ? "s" : ""} found
            {emissions.filter((e) => e.status === "pending").length > 0 && (
              <span
                className={
                  isDark ? "ml-2 text-yellow-400" : "ml-2 text-yellow-600"
                }
              >
                ({emissions.filter((e) => e.status === "pending").length}{" "}
                pending on this page)
              </span>
            )}
          </span>
        </div>
      )}

      {/* Upload Batches Panel */}
      {emissionBatches.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setShowBatches(!showBatches)}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              isDark
                ? "text-orange-400 bg-orange-900/20 border border-orange-700/30 hover:bg-orange-900/40"
                : "text-orange-700 bg-orange-50 border border-orange-200 hover:bg-orange-100"
            }`}
          >
            <svg
              className={`w-4 h-4 transition-transform ${showBatches ? "rotate-90" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            Upload Batches ({emissionBatches.length})
          </button>

          {showBatches && (
            <div
              className={`mt-2 border rounded-lg overflow-hidden ${isDark ? "border-slate-600" : "border-orange-200"}`}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className={
                      isDark
                        ? "bg-slate-800 text-slate-300"
                        : "bg-orange-50 text-orange-800"
                    }
                  >
                    <th className="px-4 py-2 text-left font-medium">
                      Category
                    </th>
                    <th className="px-4 py-2 text-left font-medium">Rows</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2 text-left font-medium">
                      Uploaded By
                    </th>
                    <th className="px-4 py-2 text-left font-medium">
                      Uploaded
                    </th>
                    <th className="px-4 py-2 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {emissionBatches.map((batch) => (
                    <tr
                      key={batch.upload_batch_id}
                      className={`border-t ${isDark ? "border-slate-700 hover:bg-slate-800" : "border-orange-100 hover:bg-orange-50/50"}`}
                    >
                      <td
                        className={`px-4 py-2 ${isDark ? "text-slate-300" : "text-gray-700"}`}
                      >
                        {batch.category_name}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${isDark ? "bg-orange-900/30 text-orange-400" : "bg-orange-100 text-orange-800"}`}
                        >
                          {batch.count}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-1.5 flex-wrap">
                          {batch.pending_count > 0 && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                              {batch.pending_count} pending
                            </span>
                          )}
                          {batch.approved_count > 0 && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                              {batch.approved_count} approved
                            </span>
                          )}
                          {batch.rejected_count > 0 && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                              {batch.rejected_count} rejected
                            </span>
                          )}
                        </div>
                      </td>
                      <td
                        className={`px-4 py-2 ${isDark ? "text-slate-300" : "text-gray-700"}`}
                      >
                        {batch.uploaded_by || "-"}
                      </td>
                      <td
                        className={`px-4 py-2 ${isDark ? "text-slate-400" : "text-gray-500"}`}
                      >
                        {new Date(batch.uploaded_at).toLocaleDateString(
                          undefined,
                          {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex gap-2 justify-end">
                          {batch.pending_count > 0 && (
                            <button
                              onClick={() =>
                                handleBatchApprove(batch.upload_batch_id)
                              }
                              disabled={
                                approvingBatchId === batch.upload_batch_id
                              }
                              className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:bg-gray-400 transition-colors"
                            >
                              {approvingBatchId === batch.upload_batch_id
                                ? "Approving..."
                                : "Approve"}
                            </button>
                          )}
                          {(batch.pending_count > 0 ||
                            batch.approved_count > 0) && (
                            <button
                              onClick={() =>
                                handleBatchReject(batch.upload_batch_id)
                              }
                              disabled={
                                rejectingBatchId === batch.upload_batch_id
                              }
                              className="px-3 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 disabled:bg-gray-400 transition-colors"
                            >
                              {rejectingBatchId === batch.upload_batch_id
                                ? "Rejecting..."
                                : "Reject"}
                            </button>
                          )}
                          {batch.rejected_count === batch.count && (
                            <span
                              className={`text-xs italic ${isDark ? "text-slate-500" : "text-gray-400"}`}
                            >
                              All rejected
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Emissions Table */}
      <EmissionsTable
        emissions={emissions}
        loading={loading}
        onApprove={handleApprove}
        onReject={handleReject}
        onBulkApprove={handleBulkApprove}
        onBulkReject={handleBulkReject}
        onBulkDelete={handleBulkDelete}
        onManagerEdit={handleManagerEdit}
        siteId={selectedSites.length === 1 ? selectedSites[0] : null}
        isDark={isDark}
        formatActivityData={formatActivityData}
        columnOptionsMap={columnOptionsMap}
        dependentOptionsMap={dependentOptionsMap}
        columnDependenciesMap={columnDependenciesMap}
        columnsMap={columnsMap}
        emissionCategoryMappingMap={emissionCategoryMappingMap}
        selectedCategoryName={
          categories.find((c) => c.category_id === selectedCategory)
            ?.category_name
        }
      />

      {/* Batch Approve Confirmation Modal */}
      <Modal
        isOpen={batchApproveModalOpen}
        onClose={() => {
          setBatchApproveModalOpen(false);
          setBatchApproveId(null);
        }}
        title="Approve Batch"
        isDark={isDark}
        className="max-w-md!"
      >
        {(() => {
          const batch = emissionBatches.find(
            (b) => b.upload_batch_id === batchApproveId,
          );
          return (
            <div>
              <p
                className={
                  isDark ? "text-slate-300 mb-4" : "text-gray-700 mb-4"
                }
              >
                Are you sure you want to approve all{" "}
                <strong>{batch?.pending_count ?? "?"}</strong> pending
                emission(s) from this batch?
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setBatchApproveModalOpen(false);
                    setBatchApproveId(null);
                  }}
                  className={
                    isDark
                      ? "px-4 py-2 bg-slate-600 text-slate-200 rounded hover:bg-slate-500"
                      : "px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                  }
                >
                  Cancel
                </button>
                <button
                  onClick={confirmBatchApprove}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Approve All
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Batch Reject Modal with Reason Input */}
      <Modal
        isOpen={batchRejectModalOpen}
        onClose={() => {
          setBatchRejectModalOpen(false);
          setBatchRejectId(null);
          setBatchRejectComment("");
        }}
        title="Reject Batch"
        isDark={isDark}
        className="max-w-md!"
      >
        {(() => {
          const batch = emissionBatches.find(
            (b) => b.upload_batch_id === batchRejectId,
          );
          const rejectableCount =
            (batch?.pending_count ?? 0) + (batch?.approved_count ?? 0);
          return (
            <div>
              <p
                className={
                  isDark ? "text-slate-300 mb-3" : "text-gray-700 mb-3"
                }
              >
                Reject all <strong>{rejectableCount}</strong> pending/approved
                emission(s) from this batch?
              </p>
              <div className="mb-4">
                <label
                  className={
                    isDark
                      ? "block text-sm font-medium mb-1 text-slate-300"
                      : "block text-sm font-medium mb-1 text-gray-700"
                  }
                >
                  Rejection Reason (Required)
                </label>
                <textarea
                  value={batchRejectComment}
                  onChange={(e) => setBatchRejectComment(e.target.value)}
                  className={
                    isDark
                      ? "w-full border border-slate-600 bg-slate-700 text-slate-200 px-3 py-2 rounded focus:outline-none focus:ring focus:ring-red-500/30"
                      : "w-full border border-gray-300 px-3 py-2 rounded focus:outline-none focus:ring focus:ring-red-300"
                  }
                  rows={3}
                  placeholder="Enter reason for rejection..."
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    setBatchRejectModalOpen(false);
                    setBatchRejectId(null);
                    setBatchRejectComment("");
                  }}
                  className={
                    isDark
                      ? "px-4 py-2 bg-slate-600 text-slate-200 rounded hover:bg-slate-500"
                      : "px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                  }
                >
                  Cancel
                </button>
                <button
                  onClick={confirmBatchReject}
                  disabled={!batchRejectComment.trim()}
                  className={`px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 ${!batchRejectComment.trim() ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  Reject All
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div
          className={`flex items-center justify-between px-4 py-3 border-t mt-2 rounded-b-lg ${isDark ? "border-slate-600 bg-slate-800" : "border-gray-200 bg-white"}`}
        >
          <p
            className={`text-sm ${isDark ? "text-slate-400" : "text-gray-600"}`}
          >
            Showing{" "}
            <span className="font-medium">
              {(currentPage - 1) * PAGE_LIMIT + 1}
            </span>{" "}
            to{" "}
            <span className="font-medium">
              {Math.min(currentPage * PAGE_LIMIT, totalCount)}
            </span>{" "}
            of <span className="font-medium">{totalCount}</span> entries
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setCurrentPage(1);
              }}
              disabled={currentPage === 1}
              className={`px-2 py-1 text-sm rounded border disabled:opacity-40 disabled:cursor-not-allowed ${isDark ? "border-slate-600 hover:bg-slate-700 text-slate-300" : "border-gray-300 hover:bg-gray-50 text-gray-700"}`}
            >
              &laquo;
            </button>
            <button
              onClick={() => {
                setCurrentPage((p) => p - 1);
              }}
              disabled={currentPage === 1}
              className={`px-2 py-1 text-sm rounded border disabled:opacity-40 disabled:cursor-not-allowed ${isDark ? "border-slate-600 hover:bg-slate-700 text-slate-300" : "border-gray-300 hover:bg-gray-50 text-gray-700"}`}
            >
              &lsaquo;
            </button>
            <span
              className={`px-3 py-1 text-sm ${isDark ? "text-slate-300" : "text-gray-700"}`}
            >
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => {
                setCurrentPage((p) => p + 1);
              }}
              disabled={currentPage === totalPages}
              className={`px-2 py-1 text-sm rounded border disabled:opacity-40 disabled:cursor-not-allowed ${isDark ? "border-slate-600 hover:bg-slate-700 text-slate-300" : "border-gray-300 hover:bg-gray-50 text-gray-700"}`}
            >
              &rsaquo;
            </button>
            <button
              onClick={() => {
                setCurrentPage(totalPages);
              }}
              disabled={currentPage === totalPages}
              className={`px-2 py-1 text-sm rounded border disabled:opacity-40 disabled:cursor-not-allowed ${isDark ? "border-slate-600 hover:bg-slate-700 text-slate-300" : "border-gray-300 hover:bg-gray-50 text-gray-700"}`}
            >
              &raquo;
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManagerPage;
