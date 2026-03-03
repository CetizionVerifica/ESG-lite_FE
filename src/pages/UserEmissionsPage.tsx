import { useState, useEffect, useCallback, useMemo } from "react";
import Dropdown, { DropdownOption } from "../components/Dropdown";
import { useAuth } from "../context/AuthContext";
import { getEmissionsBySite, EmissionData, EmissionStatus } from "../services/emissionService";
import DocumentViewerModal from "../components/DocumentViewerModal";
import { getDocumentsByEmission, EmissionDocument } from "../services/documentService";
import {
  getUserColumnConfigsBySiteAndCategory,
  ColumnOptionsMap,
  DependentOptionsMap,
  ColumnDependencies,
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
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
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
    availableSites.length > 0 ? availableSites[0].site_id : null
  );
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [emissions, setEmissions] = useState<EmissionData[]>([]);
  const [loading, setLoading] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 5;

  // Document viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerDocuments, setViewerDocuments] = useState<EmissionDocument[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<EmissionDocument | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(false);

  // Column config state for ID-to-label conversion
  const [columnOptionsMap, setColumnOptionsMap] = useState<Record<number, ColumnOptionsMap>>({});
  const [dependentOptionsMap, setDependentOptionsMap] = useState<Record<number, DependentOptionsMap>>({});
  const [columnDependenciesMap, setColumnDependenciesMap] = useState<Record<number, ColumnDependencies>>({});
  // Store columns per category to map column names to IDs
  const [columnsMap, setColumnsMap] = useState<Record<number, { pk_id: number; column_name: string }[]>>({});

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

  useEffect(() => {
  setCurrentPage(1);
}, [selectedCategory, selectedYear, selectedMonth, selectedSite]);

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
            // Store columns for name-to-ID mapping
            if (config.columns && Array.isArray(config.columns)) {
              newColumnsMap[category.category_id] = config.columns.map((col: { pk_id: number; column_name: string }) => ({
                pk_id: col.pk_id,
                column_name: col.column_name,
              }));
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

  // Helper to get column ID from column name
  const getColumnId = useCallback(
    (columnName: string, categoryId: number): string | null => {
      const columns = columnsMap[categoryId];
      if (!columns) return null;
      // Case-insensitive column name lookup
      const col = columns.find(
        (c) => c.column_name.toLowerCase() === columnName.toLowerCase()
      );
      return col ? col.pk_id.toString() : null;
    },
    [columnsMap]
  );

  // Helper function to get label for a dropdown value
  const getOptionLabel = useCallback(
    (columnName: string, value: string, categoryId: number, activityData: Record<string, unknown>): string => {
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
  const toSnake = key.replace(/([A-Z])/g, '_$1').toLowerCase();
  const toCamel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  return Object.keys(obj).find(k =>
    k.toLowerCase() === lower || k === toSnake || k === toCamel
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
                (opt) => String(opt.id) === String(parentValue) ||
                         opt.label.toLowerCase() === String(parentValue).toLowerCase()
              );
              if (parentOption) {
                parentLabel = parentOption.label;
              }
            }
          }

          // Look up dependent options using parent label (case-insensitive)
          const depOptionsForParent = dependentOptions[columnName];
          const matchingKey = Object.keys(depOptionsForParent || {}).find(
            (key) => key.toLowerCase() === parentLabel.toLowerCase()
          );

          if (matchingKey) {
            const options = depOptionsForParent[matchingKey];
            const option = options?.find(
              (opt) => String(opt.id) === String(value) ||
                       opt.label.toLowerCase() === String(value).toLowerCase()
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
            (opt) => String(opt.id) === String(value) ||
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

  // Format activity data with labels instead of IDs
  const formatActivityData = useCallback(
    (activityData: Record<string, unknown>, categoryId: number): { key: string; displayValue: string }[] => {
      if (!activityData) return [];

      return Object.entries(activityData).map(([key, value]) => {
        const stringValue = String(value);
        const displayValue = getOptionLabel(key, stringValue, categoryId, activityData);
        return { key, displayValue };
      });
    },
    [getOptionLabel]
  );

  // Fetch all emissions for the user's site
  const fetchEmissions = useCallback(async () => {
    if (!siteId) return;

    try {
      setLoading(true);
      const data = await getEmissionsBySite(siteId);
      setEmissions(data);
    } catch (error) {
      console.error("Error fetching emissions:", error);
      setEmissions([]);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchEmissions();
  }, [fetchEmissions]);

  

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

  // Filter emissions based on selected category, year, and month
  const filteredEmissions = useMemo(() => {
    let result = emissions;

    if (selectedCategory) {
      result = result.filter(
        (emission) => emission.category?.category_id === selectedCategory
      );
    }

    if (selectedYear) {
      result = result.filter((emission) => {
        const emissionYear = parseInt(emission.date_of_reporting.substring(0, 4));
        return emissionYear === selectedYear;
      });
    }

    if (selectedMonth) {
      result = result.filter((emission) => {
        const emissionMonth = parseInt(emission.date_of_reporting.substring(5, 7));
        return emissionMonth === selectedMonth;
      });
    }

    return result;
  }, [emissions, selectedCategory, selectedYear, selectedMonth]);

  // Calculate totals
  const totalEmission = useMemo(() => {
    return filteredEmissions.reduce((sum, e) => sum + Number(e.total_emission), 0);
  }, [filteredEmissions]);

  // Calculate total activity data (sum of numeric activity values)
  const totalActivityData = useMemo(() => {
    return filteredEmissions.reduce((sum, e) => {
      if (!e.activity_data) return sum;

      // Look for common activity value fields
      const commonFields = ['activity_value', 'quantity', 'value', 'amount', 'consumption'];
      for (const field of commonFields) {
        if (e.activity_data[field] !== undefined && e.activity_data[field] !== '') {
          const numValue = parseFloat(e.activity_data[field]);
          if (!isNaN(numValue)) {
            return sum + numValue;
          }
        }
      }

      // Fallback: find any numeric value in activity_data
      for (const [key, value] of Object.entries(e.activity_data)) {
        if (key === 'emission_category') continue;
        const numValue = parseFloat(String(value));
        if (!isNaN(numValue) && numValue > 0) {
          return sum + numValue;
        }
      }

      return sum;
    }, 0);
  }, [filteredEmissions]);

  // Get the most common activity unit from filtered emissions
  const activityUnit = useMemo(() => {
    const units = filteredEmissions
      .map((e) => e.activity_data_unit)
      .filter((u): u is string => !!u && u.trim() !== '');

    if (units.length === 0) return '';

    // Count occurrences of each unit
    const unitCounts = units.reduce((acc, unit) => {
      acc[unit] = (acc[unit] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Return the most common unit
    return Object.entries(unitCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  }, [filteredEmissions]);

  const statusCounts = useMemo(() => {
    return {
      pending: filteredEmissions.filter((e) => e.status === "pending").length,
      approved: filteredEmissions.filter((e) => e.status === "approved").length,
      rejected: filteredEmissions.filter((e) => e.status === "rejected").length,
    };
  }, [filteredEmissions]);

  const totalPages = Math.ceil(filteredEmissions.length / rowsPerPage);
const paginatedEmissions = filteredEmissions.slice(
  (currentPage - 1) * rowsPerPage,
  currentPage * rowsPerPage
);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">
        My Emissions - {currentSite?.name || "No Site"}
      </h1>

      {/* Filters */}
      <div className={`grid grid-cols-1 gap-4 mb-6 ${hasMultipleSites ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
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
      </div>

      {/* Summary Stats */}
      <div className={`grid grid-cols-2 gap-4 mb-6 ${selectedCategory ? 'md:grid-cols-6' : 'md:grid-cols-5'}`}>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-sm text-gray-500">Total Records</div>
          <div className="text-2xl font-bold">{filteredEmissions.length}</div>
        </div>
        {selectedCategory && (
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="text-sm text-blue-700">Total Activity Data</div>
            <div className="text-2xl font-bold text-blue-800">
              {totalActivityData.toFixed(2)} {activityUnit}
            </div>
          </div>
        )}
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="text-sm text-gray-500">Total Emission</div>
          <div className="text-2xl font-bold">{totalEmission.toFixed(2)} tCO2e</div>
        </div>
        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <div className="text-sm text-yellow-700">Pending</div>
          <div className="text-2xl font-bold text-yellow-800">{statusCounts.pending}</div>
        </div>
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <div className="text-sm text-green-700">Approved</div>
          <div className="text-2xl font-bold text-green-800">{statusCounts.approved}</div>
        </div>
        <div className="bg-red-50 p-4 rounded-lg border border-red-200">
          <div className="text-sm text-red-700">Rejected</div>
          <div className="text-2xl font-bold text-red-800">{statusCounts.rejected}</div>
        </div>
      </div>

      {/* Emissions Table */}
      {loading ? (
        <div className="text-center py-8">Loading emissions...</div>
      ) : filteredEmissions.length === 0 ? (
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
              </tr>
            </thead>
            <tbody>
              {paginatedEmissions.map((emission) => (
                <tr key={emission.pk_id} className="hover:bg-gray-50">
                  <td className="border border-gray-300 px-4 py-3">
                    {emission.category?.category_name || "-"}
                  </td>
                  <td className="border border-gray-300 px-4 py-3">
                    <div className="max-w-xs">
                      {formatActivityData(
                        emission.activity_data || {},
                        emission.category?.category_id || 0
                      ).map(({ key, displayValue }) => (
                        <div key={key} className="text-sm">
                          <span className="font-medium">{key}:</span> {displayValue}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="border border-gray-300 px-4 py-3">
                    {emission.activity_data_unit || "-"}
                  </td>
                  <td className="border border-gray-300 px-4 py-3">
                    {Number(emission.total_emission).toFixed(2)}
                  </td>
                  <td className="border border-gray-300 px-4 py-3">
                    {formatDate(emission.date_of_reporting)}
                  </td>
                  <td className="border border-gray-300 px-4 py-3">
                    <StatusBadge status={emission.status} />
                    {emission.status === "rejected" && emission.review_comment && (
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
                {Math.min(currentPage * rowsPerPage, filteredEmissions.length)}
              </span>{" "}
              of{" "}
              <span className="font-medium">{filteredEmissions.length}</span> entries
            </p>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1}
                className="px-2 py-1 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >«</button>

              <button
                onClick={() => setCurrentPage((p) => p - 1)}
                disabled={currentPage === 1}
                className="px-2 py-1 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >‹</button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(
                  (page) =>
                    page === 1 ||
                    page === totalPages ||
                    Math.abs(page - currentPage) <= 2
                )
                .reduce<(number | "...")[]>((acc, page, idx, arr) => {
                  if (idx > 0 && page - (arr[idx - 1] as number) > 1)
                    acc.push("...");
                  acc.push(page);
                  return acc;
                }, [])
                .map((item, idx) =>
                  item === "..." ? (
                    <span key={`ellipsis-${idx}`} className="px-2 text-gray-400">…</span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setCurrentPage(item as number)}
                      className={`px-3 py-1 text-sm rounded border transition-colors ${
                        currentPage === item
                          ? "bg-blue-600 text-white border-blue-600"
                          : "border-gray-300 hover:bg-gray-50 text-gray-700"
                      }`}
                    >{item}</button>
                  )
                )}

              <button
                onClick={() => setCurrentPage((p) => p + 1)}
                disabled={currentPage === totalPages}
                className="px-2 py-1 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >›</button>

              <button
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages}
                className="px-2 py-1 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >»</button>
            </div>
          </div>
        )}
        </div>
      )}

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
