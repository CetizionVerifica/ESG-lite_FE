import { useState, useEffect, useCallback, useMemo } from "react";
import Dropdown, { DropdownOption } from "../../components/Dropdown";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import {
  getEmissionsBySite,
  approveEmission,
  rejectEmission,
  bulkApproveEmissions,
  bulkRejectEmissions,
  bulkDeleteEmissions,
  getEmissionBatches,
  approveEmissionsByBatch,
  rejectEmissionsByBatch,
  managerUpdateEmission,
  EmissionData,
  EmissionStatus,
  type EmissionUploadBatch,
} from "../../services/emissionService";
import {
  getUserColumnConfigsBySiteAndCategory,
  ColumnOptionsMap,
  DependentOptionsMap,
  ColumnDependencies,
} from "../../services/columnConfigService";


import EmissionsTable from "./EmissionsTable";

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
  const availableSites = sites.length > 0 ? sites : singleSite ? [singleSite] : [];

  const [selectedSite, setSelectedSite] = useState<number | null>(
    availableSites.length > 0 ? availableSites[0].site_id : null
  );
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<EmissionStatus | null>(null);
  const [emissions, setEmissions] = useState<EmissionData[]>([]);
  const [loading, setLoading] = useState(false);
  const [emissionBatches, setEmissionBatches] = useState<EmissionUploadBatch[]>([]);
  const [showBatches, setShowBatches] = useState(false);
  const [approvingBatchId, setApprovingBatchId] = useState<string | null>(null);
  const [rejectingBatchId, setRejectingBatchId] = useState<string | null>(null);

  const [columnOptionsMap, setColumnOptionsMap] = useState<Record<number, ColumnOptionsMap>>({});
  const [dependentOptionsMap, setDependentOptionsMap] = useState<Record<number, DependentOptionsMap>>({});
  const [columnDependenciesMap, setColumnDependenciesMap] = useState<Record<number, ColumnDependencies>>({});
  const [columnsMap, setColumnsMap] = useState<Record<number, { pk_id: number; column_name: string }[]>>({});

  // Get the currently selected site object
  const currentSite = availableSites.find((s) => s.site_id === selectedSite);

  // Categories from the selected site
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

  const dateOptions = generateDateOptions();

  // Reset category when site changes
  useEffect(() => {
    setSelectedCategory(null);
  }, [selectedSite]);

  useEffect(() => {
    const fetchColumnConfigs = async () => {
      if (!siteId || categories.length === 0) return;

      const newColumnOptions: Record<number, ColumnOptionsMap> = {};
      const newDependentOptions: Record<number, DependentOptionsMap> = {};
      const newColumnDependencies: Record<number, ColumnDependencies> = {};
      const newColumnsMap: Record<number, { pk_id: number; column_name: string }[]> = {};

      for (const category of categories) {
        try {
          const configs = await getUserColumnConfigsBySiteAndCategory(siteId, category.category_id);
          if (configs && configs.length > 0) {
            const config = configs[0];
            if (config.column_options) {
              newColumnOptions[category.category_id] = config.column_options;
            }
            if (config.dependent_options) {
              newDependentOptions[category.category_id] = config.dependent_options;
            }
            if (config.column_dependencies) {
              newColumnDependencies[category.category_id] = config.column_dependencies;
            }
            if (config.columns && Array.isArray(config.columns)) {
              newColumnsMap[category.category_id] = config.columns.map(
                (col: { pk_id: number; column_name: string }) => ({
                  pk_id: col.pk_id,
                  column_name: col.column_name,
                })
              );
            }
          }
        } catch (error) {
          console.error(`Error fetching column config for category ${category.category_id}:`, error);
        }
      }

      setColumnOptionsMap(newColumnOptions);
      setDependentOptionsMap(newDependentOptions);
      setColumnDependenciesMap(newColumnDependencies);
      setColumnsMap(newColumnsMap);
    };

    fetchColumnConfigs();
  }, [siteId, categories]);

  
  
const getColumnId = useCallback(
    (columnName: string, categoryId: number): string | null => {
      const columns = columnsMap[categoryId];
      if (!columns) return null;
      const col = columns.find(
        (c) => c.column_name.toLowerCase() === columnName.toLowerCase()
      );
      return col ? col.pk_id.toString() : null;
    },
    [columnsMap]
  );

  const getOptionLabel = useCallback(
    (
      columnName: string,
      value: string,
      categoryId: number,
      activityData: Record<string, unknown>
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
  const toSnake = key.replace(/([A-Z])/g, '_$1').toLowerCase();
  const toCamel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  return Object.keys(obj).find(k =>
    k.toLowerCase() === lower || k === toSnake || k === toCamel
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
                  opt.label.toLowerCase() === String(parentValue).toLowerCase()
              );
              if (parentOption) {
                parentLabel = parentOption.label;
              }
            }
          }

          const depOptionsForParent = dependentOptions[columnName];
          const matchingKey = Object.keys(depOptionsForParent || {}).find(
            (key) => key.toLowerCase() === parentLabel.toLowerCase()
          );

          if (matchingKey) {
            const options = depOptionsForParent[matchingKey];
            const option = options?.find(
              (opt) =>
                String(opt.id) === String(value) ||
                opt.label.toLowerCase() === String(value).toLowerCase()
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
              opt.label.toLowerCase() === String(value).toLowerCase()
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
        let depOptionsForColumn: { id: string | number; label: string }[] | undefined;

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
              opt.label.toLowerCase() === value.toLowerCase()
          );
          if (option) return option.label;
        }
      }

      // Return original value if no label found
      return value;
    },
    [columnOptionsMap, dependentOptionsMap, columnDependenciesMap, getColumnId]
  );

  const formatActivityData = useCallback(
    (
      activityData: Record<string, unknown>,
      categoryId: number
    ): { key: string; displayValue: string }[] => {
      if (!activityData) return [];

      return Object.entries(activityData).map(([key, value]) => {
        const stringValue = String(value);
        const displayValue = getOptionLabel(key, stringValue, categoryId, activityData);
        return { key, displayValue };
      });
    },
    [getOptionLabel]
  );


  // Fetch all emissions for the selected site
  const fetchEmissions = useCallback(async () => {
    if (!selectedSite) return;

    try {
      setLoading(true);
      const data = await getEmissionsBySite(selectedSite);
      setEmissions(data);
      // Fetch upload batches for this site
      getEmissionBatches(selectedSite).then(setEmissionBatches).catch(() => setEmissionBatches([]));
    } catch (error) {
      console.error("Error fetching emissions:", error);
      setEmissions([]);
    } finally {
      setLoading(false);
    }
  }, [selectedSite]);

  useEffect(() => {
    fetchEmissions();
  }, [fetchEmissions]);

  // Handle approve emission
  const handleApprove = useCallback(async (id: number, comment?: string) => {
    const response = await approveEmission(id, comment);
    // Update the emission with the full response data including reviewed_by
    setEmissions((prev) =>
      prev.map((e) =>
        e.pk_id === id ? response.emission : e
      )
    );
  }, []);

  // Handle reject emission
  const handleReject = useCallback(async (id: number, comment: string) => {
    const response = await rejectEmission(id, comment);
    // Update the emission with the full response data including reviewed_by
    setEmissions((prev) =>
      prev.map((e) =>
        e.pk_id === id ? response.emission : e
      )
    );
  }, []);

  // Handle bulk approve emissions
  const handleBulkApprove = useCallback(async (ids: number[]) => {
    await bulkApproveEmissions(ids);
    // Refresh emissions after bulk approval
    await fetchEmissions();
  }, [fetchEmissions]);

  // Handle bulk reject emissions
  const handleBulkReject = useCallback(async (ids: number[], comment: string) => {
    await bulkRejectEmissions(ids, comment);
    await fetchEmissions();
  }, [fetchEmissions]);

  // Handle bulk delete emissions
  const handleBulkDelete = useCallback(async (ids: number[]) => {
    await bulkDeleteEmissions(ids);
    await fetchEmissions();
  }, [fetchEmissions]);

  // Handle batch approve - approve all pending emissions in a batch
  const handleBatchApprove = useCallback(async (batchId: string) => {
    const batch = emissionBatches.find((b) => b.upload_batch_id === batchId);
    if (!confirm(`Approve all pending emissions from this batch (${batch?.count ?? "?"} rows)?`)) return;
    setApprovingBatchId(batchId);
    try {
      await approveEmissionsByBatch(batchId);
      await fetchEmissions();
    } catch (error) {
      console.error("Error approving batch:", error);
    } finally {
      setApprovingBatchId(null);
    }
  }, [fetchEmissions, emissionBatches]);

  // Handle batch reject - reject all pending emissions in a batch
  const handleBatchReject = useCallback(async (batchId: string) => {
    const batch = emissionBatches.find((b) => b.upload_batch_id === batchId);
    const rejectableCount = (batch?.pending_count ?? 0) + (batch?.approved_count ?? 0);
    if (!confirm(`Reject all ${rejectableCount} pending/approved emission(s) from this batch?`)) return;
    setRejectingBatchId(batchId);
    try {
      await rejectEmissionsByBatch(batchId);
      await fetchEmissions();
    } catch (error) {
      console.error("Error rejecting batch:", error);
    } finally {
      setRejectingBatchId(null);
    }
  }, [fetchEmissions, emissionBatches]);

  // Handle manager edit emission
  const handleManagerEdit = useCallback(async (
    id: number,
    data: { activity_data?: Record<string, any>; date_of_reporting?: string }
  ) => {
    const response = await managerUpdateEmission(id, data);
    setEmissions((prev) =>
      prev.map((e) => e.pk_id === id ? response.emission : e)
    );
  }, []);

  // Filter emissions based on selected category, date, and status
  const filteredEmissions = useMemo(() => {
    let result = emissions;

    if (selectedCategory) {
      result = result.filter(
        (emission) => emission.category?.category_id === selectedCategory
      );
    }

    if (selectedDate) {
      result = result.filter((emission) => {
        // Compare year-month portion only (selectedDate is now YYYY-MM-DD format)
        const emissionYearMonth = emission.date_of_reporting.substring(0, 7);
        const selectedYearMonth = selectedDate.substring(0, 7);
        return emissionYearMonth === selectedYearMonth;
      });
    }

    if (selectedStatus) {
      result = result.filter((emission) => emission.status === selectedStatus);
    }

    return result;
  }, [emissions, selectedCategory, selectedDate, selectedStatus]);

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
            placeholder="Select Site"
            value={selectedSite}
            onChange={(option) => setSelectedSite(option?.id as number)}
            searchable={true}
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
            onChange={(option) => setSelectedStatus(option?.id as EmissionStatus)}
            clearable={true}
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={fetchEmissions}
            className={isDark ? "px-4 py-2 bg-slate-700 text-slate-200 rounded hover:bg-slate-600" : "px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Current Site Info */}
      {currentSite && (
        <div className="mb-4">
          <span className={infoTextClass}>
            Viewing: {currentSite.name}
          </span>
          <span className={countTextClass}>
            {filteredEmissions.length} emission{filteredEmissions.length !== 1 ? "s" : ""} found
            {filteredEmissions.filter((e) => e.status === "pending").length > 0 && (
              <span className={isDark ? "ml-2 text-yellow-400" : "ml-2 text-yellow-600"}>
                ({filteredEmissions.filter((e) => e.status === "pending").length} pending)
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
            <svg className={`w-4 h-4 transition-transform ${showBatches ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Upload Batches ({emissionBatches.length})
          </button>

          {showBatches && (
            <div className={`mt-2 border rounded-lg overflow-hidden ${isDark ? "border-slate-600" : "border-orange-200"}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={isDark ? "bg-slate-800 text-slate-300" : "bg-orange-50 text-orange-800"}>
                    <th className="px-4 py-2 text-left font-medium">Category</th>
                    <th className="px-4 py-2 text-left font-medium">Rows</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                    <th className="px-4 py-2 text-left font-medium">Uploaded By</th>
                    <th className="px-4 py-2 text-left font-medium">Uploaded</th>
                    <th className="px-4 py-2 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {emissionBatches.map((batch) => (
                    <tr key={batch.upload_batch_id} className={`border-t ${isDark ? "border-slate-700 hover:bg-slate-800" : "border-orange-100 hover:bg-orange-50/50"}`}>
                      <td className={`px-4 py-2 ${isDark ? "text-slate-300" : "text-gray-700"}`}>{batch.category_name}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${isDark ? "bg-orange-900/30 text-orange-400" : "bg-orange-100 text-orange-800"}`}>
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
                      <td className={`px-4 py-2 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                        {batch.uploaded_by || "-"}
                      </td>
                      <td className={`px-4 py-2 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                        {new Date(batch.uploaded_at).toLocaleDateString(undefined, {
                          year: "numeric", month: "short", day: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex gap-2 justify-end">
                          {batch.pending_count > 0 && (
                            <button
                              onClick={() => handleBatchApprove(batch.upload_batch_id)}
                              disabled={approvingBatchId === batch.upload_batch_id}
                              className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:bg-gray-400 transition-colors"
                            >
                              {approvingBatchId === batch.upload_batch_id ? "Approving..." : "Approve"}
                            </button>
                          )}
                          {(batch.pending_count > 0 || batch.approved_count > 0) && (
                            <button
                              onClick={() => handleBatchReject(batch.upload_batch_id)}
                              disabled={rejectingBatchId === batch.upload_batch_id}
                              className="px-3 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 disabled:bg-gray-400 transition-colors"
                            >
                              {rejectingBatchId === batch.upload_batch_id ? "Rejecting..." : "Reject"}
                            </button>
                          )}
                          {batch.rejected_count === batch.count && (
                            <span className={`text-xs italic ${isDark ? "text-slate-500" : "text-gray-400"}`}>All rejected</span>
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
        emissions={filteredEmissions}
        loading={loading}
        onApprove={handleApprove}
        onReject={handleReject}
        onBulkApprove={handleBulkApprove}
        onBulkReject={handleBulkReject}
        onBulkDelete={handleBulkDelete}
        onManagerEdit={handleManagerEdit}
        isDark={isDark}
        formatActivityData={formatActivityData}
      />
    </div>
  );
};

export default ManagerPage;
