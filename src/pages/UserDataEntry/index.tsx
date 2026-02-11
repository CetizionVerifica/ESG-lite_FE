import { useState, useEffect, useCallback, useMemo } from "react";
import Dropdown, { DropdownOption } from "../../components/Dropdown";
import { Table, Column } from "../../components/Table";
import Modal from "../../components/Modal";
import { useAuth } from "../../context/AuthContext";
import { getUserColumnConfigsBySiteAndCategory } from "../../services/columnConfigService";
import {
  getEmissionsBySiteAndCategory,
  createEmission,
  updateEmission,
  deleteEmission,
  EmissionData,
} from "../../services/emissionService";
import { getUserEmissionFactorsBySiteAndCategory } from "../../services/emissionFactorService";
import {
  getUserUnitsBySiteAndCategory,
  UnitData,
} from "../../services/unitService";
import { canConvert, unitsMatchExact } from "../../utils/unitConversions";
import { useEmissionCalculation } from "./useEmissionCalculation";
import { UnitSelector, EmissionPreview, ValidationError, DocumentUploadModal } from "./components";
import {
  Category,
  ColumnEntity,
  ColumnConfig,
  ColumnDependencies,
  DependentOptionsMap,
  EmissionCategoryMapping,
  ColumnOptionsMap,
  DropdownOptionValue,
  EmissionFactor,
  EmissionRow,
  EmissionStatus,
  ModalRow,
} from "./types";

interface Site {
  site_id: number;
  name: string;
  categories?: Category[];
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const UserDataEntryPage = () => {
  const { user } = useAuth();

  // ---------------------------------------------------------------------------
  // Derived Data - Available Sites
  // ---------------------------------------------------------------------------
  // Get available sites from user (supports both single site and multiple sites)
  const availableSites: Site[] = useMemo(() => {
    const sites = user?.sites || [];
    const singleSite = user?.site || null;
    return sites.length > 0 ? sites : singleSite ? [singleSite] : [];
  }, [user?.sites, user?.site]);

  const hasMultipleSites = availableSites.length > 1;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const [selectedSite, setSelectedSite] = useState<number | null>(
    availableSites.length > 0 ? availableSites[0].site_id : null
  );
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dynamicColumns, setDynamicColumns] = useState<ColumnEntity[]>([]);
  const [emissions, setEmissions] = useState<EmissionRow[]>([]);
  const [emissionFactors, setEmissionFactors] = useState<EmissionFactor[]>([]);
  const [units, setUnits] = useState<UnitData[]>([]);
  const [loading, setLoading] = useState(false);

  // Dependent dropdown configuration state
  const [columnOptions, setColumnOptions] = useState<ColumnOptionsMap>({});
  const [columnDependencies, setColumnDependencies] = useState<ColumnDependencies>({});
  const [dependentOptions, setDependentOptions] = useState<DependentOptionsMap>({});
  const [emissionCategoryMapping, setEmissionCategoryMapping] = useState<EmissionCategoryMapping>({});

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalRows, setModalRows] = useState<ModalRow[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [nextRowId, setNextRowId] = useState(1);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Document modal state
  const [documentModalOpen, setDocumentModalOpen] = useState(false);
  const [selectedEmissionForDocs, setSelectedEmissionForDocs] = useState<EmissionRow | null>(null);

  // ---------------------------------------------------------------------------
  // Derived Data
  // ---------------------------------------------------------------------------
  // Calculate target year for emission factors (reporting year - 1)
  const targetYear = selectedDate
    ? parseInt(selectedDate.substring(0, 4)) - 1
    : undefined;

  // Compute select column names (columns that are dropdowns, not numeric activity data)
  const selectColumnNames = useMemo(() => {
    const names = new Set<string>();
    // Add columns with configured options
    dynamicColumns.forEach(col => {
      if (columnOptions[col.pk_id.toString()]?.length > 0) {
        names.add(col.column_name);
      }
    });
    // Add parent columns (from columnDependencies values)
    Object.values(columnDependencies).forEach(parentName => names.add(parentName));
    // Add child columns (from columnDependencies keys)
    Object.keys(columnDependencies).forEach(childName => names.add(childName));
    return Array.from(names);
  }, [dynamicColumns, columnOptions, columnDependencies]);

  // ---------------------------------------------------------------------------
  // Hooks
  // ---------------------------------------------------------------------------
  const { getExpectedUnit, calculateEmission } =
    useEmissionCalculation(emissionFactors, targetYear, dynamicColumns, selectColumnNames);

  // ---------------------------------------------------------------------------
  // Derived Data (continued)
  // ---------------------------------------------------------------------------
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

  const dateOptions = generateDateOptions();

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

  const filteredColumns = dynamicColumns.filter(
    (col) => col.column_name.toLowerCase() !== "emission_category",
  );

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------
  const fetchData = useCallback(async () => {
    if (!selectedCategory || !selectedDate || !siteId) {
      setDynamicColumns([]);
      setEmissions([]);
      setEmissionFactors([]);
      setUnits([]);
      return;
    }

    try {
      setLoading(true);

      // Calculate target year for emission factors (reporting year - 1)
      const factorYear = parseInt(selectedDate.substring(0, 4)) - 1;

      const [configs, emissionsData, factors, unitsData] = await Promise.all([
        getUserColumnConfigsBySiteAndCategory(siteId, selectedCategory),
        getEmissionsBySiteAndCategory(siteId, selectedCategory, selectedDate),
        getUserEmissionFactorsBySiteAndCategory(siteId, selectedCategory, factorYear),
        getUserUnitsBySiteAndCategory(siteId, selectedCategory),
      ]);

      const config = configs[0] as ColumnConfig | undefined;
      setDynamicColumns(config?.columns || []);
      setColumnOptions(config?.column_options || {});
      setColumnDependencies(config?.column_dependencies || {});
      setDependentOptions(config?.dependent_options || {});
      setEmissionCategoryMapping(config?.emission_category_mapping || {});
      setEmissions(flattenEmissions(emissionsData));
      setEmissionFactors(factors);
      setUnits(unitsData);
    } catch (error) {
      console.error("Error fetching data:", error);
      resetDataState();
    } finally {
      setLoading(false);
    }
  }, [selectedCategory, selectedDate, siteId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------------------------------------------------------------------------
  // Dependent Dropdown Helpers
  // ---------------------------------------------------------------------------

  // Check if a column is a parent column (has dependents)
  const isParentColumn = (columnName: string): boolean => {
    return Object.values(columnDependencies).includes(columnName);
  };

  // Check if a column is a dependent column
  const isDependentColumn = (columnName: string): boolean => {
    return columnName in columnDependencies;
  };

  // Get the parent column name for a dependent column
  const getParentColumnName = (columnName: string): string | null => {
    return columnDependencies[columnName] || null;
  };

  // Get dropdown options for a column
  const getColumnDropdownOptions = (
    columnName: string,
    columnId: number,
    parentValue?: string
  ): DropdownOptionValue[] => {
    // If it's a dependent column and we have a parent value, use dependent_options
    if (isDependentColumn(columnName) && parentValue) {
      // The parentValue is the stored ID, but dependent_options is keyed by label
      // We need to convert the parent ID to its label first
      const parentColName = getParentColumnName(columnName);
      let parentLabel = parentValue;

      if (parentColName) {
        const parentColEntity = dynamicColumns.find(col => col.column_name === parentColName);
        if (parentColEntity) {
          const parentOptions = columnOptions[parentColEntity.pk_id.toString()];
          if (parentOptions) {
            const parentOption = parentOptions.find(opt => String(opt.id) === parentValue);
            if (parentOption) {
              parentLabel = parentOption.label;
            }
          }
        }
      }

      // First try exact match
      let depOptions = dependentOptions[columnName]?.[parentLabel];

      // If no exact match, try case-insensitive lookup
      if (!depOptions || depOptions.length === 0) {
        const childDeps = dependentOptions[columnName];
        if (childDeps) {
          const parentLabelLower = parentLabel.toLowerCase();
          for (const [key, options] of Object.entries(childDeps)) {
            if (key.toLowerCase() === parentLabelLower) {
              depOptions = options;
              break;
            }
          }
        }
      }

      if (depOptions && depOptions.length > 0) {
        return depOptions;
      }
    }

    // If it's a parent column, use column_options (by column id)
    if (isParentColumn(columnName)) {
      const options = columnOptions[columnId.toString()];
      if (options && options.length > 0) {
        return options;
      }
    }

    // Fallback to column_options by column id for any select column
    const options = columnOptions[columnId.toString()];
    if (options && options.length > 0) {
      return options;
    }

    return [];
  };

  // Helper to get the label for a stored option ID
  const getOptionLabel = (columnName: string, columnId: number, storedValue: string, parentValue?: string): string => {
    // For dependent columns, check dependentOptions first
    if (isDependentColumn(columnName) && parentValue) {
      // First try exact match
      let depOptions = dependentOptions[columnName]?.[parentValue];

      // If no exact match, try case-insensitive lookup
      if (!depOptions) {
        const childDeps = dependentOptions[columnName];
        if (childDeps) {
          const parentValueLower = parentValue.toLowerCase();
          for (const [key, options] of Object.entries(childDeps)) {
            if (key.toLowerCase() === parentValueLower) {
              depOptions = options;
              break;
            }
          }
        }
      }

      if (depOptions) {
        const option = depOptions.find(opt => String(opt.id) === storedValue);
        if (option) return option.label;
      }
    }

    // Check column_options
    const options = columnOptions[columnId.toString()];
    if (options) {
      const option = options.find(opt => String(opt.id) === storedValue);
      if (option) return option.label;
    }

    // Fallback to stored value if no label found
    return storedValue;
  };

  // Determine emission category from mapping based on row values
  const getAutoEmissionCategory = (row: ModalRow): string | null => {
    if (Object.keys(emissionCategoryMapping).length === 0) {
      return null;
    }

    // Find "terminal" child columns - columns that are children but NOT parents of anything else
    // These are the columns that directly determine the emission category
    const allChildCols = Object.keys(columnDependencies);
    const allParentCols = new Set(Object.values(columnDependencies));
    const terminalChildCols = allChildCols.filter(child => !allParentCols.has(child));

    // If no terminal children, fall back to all child columns
    const childColsToUse = terminalChildCols.length > 0 ? terminalChildCols : allChildCols;

    // Build the mapping key from terminal parent-child pairs only
    const keyParts: string[] = [];

    for (const childCol of childColsToUse.sort()) {
      const parentCol = columnDependencies[childCol];
      if (!parentCol) continue;

      const parentValue = row[parentCol];
      if (!parentValue) return null;

      const childValue = row[childCol];
      if (!childValue) return null;

      // Get labels for both parent and child
      const parentColEntity = dynamicColumns.find(col => col.column_name === parentCol);
      const parentLabel = parentColEntity
        ? getOptionLabel(parentCol, parentColEntity.pk_id, String(parentValue))
        : String(parentValue);

      const childColEntity = dynamicColumns.find(col => col.column_name === childCol);
      const childLabel = childColEntity
        ? getOptionLabel(childCol, childColEntity.pk_id, String(childValue), parentLabel)
        : String(childValue);

      keyParts.push(parentLabel);
      keyParts.push(childLabel);
    }

    const mappingKey = keyParts.join("|");

    // First try exact match
    if (emissionCategoryMapping[mappingKey]) {
      return emissionCategoryMapping[mappingKey];
    }

    // If no exact match, try case-insensitive lookup
    const mappingKeyLower = mappingKey.toLowerCase();
    for (const [key, value] of Object.entries(emissionCategoryMapping)) {
      if (key.toLowerCase() === mappingKeyLower) {
        return value;
      }
    }

    return null;
  };

  // Check if a column should show as a select dropdown
  const isSelectColumn = (column: ColumnEntity): boolean => {
    const hasColumnOptions = columnOptions[column.pk_id.toString()]?.length > 0;
    const isParent = isParentColumn(column.column_name);
    const isDependent = isDependentColumn(column.column_name);
    return column.column_type === "select" || hasColumnOptions || isParent || isDependent;
  };

  // ---------------------------------------------------------------------------
  // Modal Handlers
  // ---------------------------------------------------------------------------
  const openModal = () => {
    const initialRow = createModalRow(1, dynamicColumns);
    setModalRows([initialRow]);
    setNextRowId(2);
    setSaveError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSaveError(null);
  };

  const handleAddModalRow = () => {
    const newRow = createModalRow(nextRowId, dynamicColumns);
    setModalRows((prev) => [...prev, newRow]);
    setNextRowId((prev) => prev + 1);
  };

  const handleRemoveModalRow = (rowId: number) => {
    setModalRows((prev) => prev.filter((row) => row.id !== rowId));
  };

  const handleModalRowChange = (
    rowId: number,
    columnName: string,
    value: string,
  ) => {
    setModalRows((prev) =>
      prev.map((row) => {
        if (row.id !== rowId) return row;

        const updatedRow = { ...row, [columnName]: value };

        // If this is a parent column, clear dependent column values
        if (isParentColumn(columnName)) {
          // Find all columns that depend on this parent
          Object.keys(columnDependencies).forEach((childCol) => {
            if (columnDependencies[childCol] === columnName) {
              updatedRow[childCol] = "";
            }
          });
        }

        // Check if we should auto-set the emission_category
        const autoCategory = getAutoEmissionCategory(updatedRow);
        if (autoCategory) {
          updatedRow.emission_category = autoCategory;
        } else if (isParentColumn(columnName) || isDependentColumn(columnName)) {
          // Clear emission_category when a mapped column changes but no valid mapping exists yet
          // This ensures the old value doesn't persist when user changes dropdown selections
          updatedRow.emission_category = "";
        }

        return updatedRow;
      }),
    );
  };

  // ---------------------------------------------------------------------------
  // Save Handlers
  // ---------------------------------------------------------------------------
  const validateRows = (): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    modalRows.forEach((row, index) => {
      if (!row.emission_category) {
        errors.push(`Row ${index + 1}: Please select an emission category`);
        return;
      }

      if (!row.activity_data_unit) {
        errors.push(`Row ${index + 1}: Please select an activity unit`);
        return;
      }

      const expectedUnit = getExpectedUnit(row.emission_category);
      if (
        expectedUnit &&
        !unitsMatchExact(expectedUnit, row.activity_data_unit)
      ) {
        if (!canConvert(row.activity_data_unit, expectedUnit)) {
          errors.push(
            `Row ${index + 1}: Unit mismatch - Expected "${expectedUnit}" but got "${row.activity_data_unit}". No conversion available.`,
          );
          return;
        }
      }

      // Validate that emission can be calculated
      const emissionResult = calculateEmission(row);
      if (emissionResult.value === null) {
        errors.push(`Row ${index + 1}: ${emissionResult.status}`);
      }
    });

    return { valid: errors.length === 0, errors };
  };

  const handleSaveAll = async () => {
    if (!selectedCategory || !selectedDate || !siteId || modalRows.length === 0)
      return;

    setSaveError(null);

    const validation = validateRows();
    if (!validation.valid) {
      setSaveError(validation.errors.join("\n"));
      return;
    }

    try {
      setIsAdding(true);

      // selectedDate is now in YYYY-MM-DD format (last day of month)
      const dateOfReporting = selectedDate;

      const newEmissions: EmissionRow[] = [];

      for (const row of modalRows) {
        const { id, activity_data_unit, ...activityData } = row;

        const result = await createEmission({
          site_id: siteId,
          category_id: selectedCategory,
          activity_data: activityData,
          total_emission: 0,
          unit: "kg CO2e",
          date_of_reporting: dateOfReporting,
          activity_data_unit: activity_data_unit || undefined,
        });

        newEmissions.push(flattenEmission(result.emission));
      }

      setEmissions((prev) => [...newEmissions, ...prev]);
      closeModal();
      setModalRows([]);
    } catch (error: any) {
      console.error("Error creating emissions:", error);
      setSaveError(
        error?.response?.data?.message ||
          error?.message ||
          "Failed to save emissions. Please try again.",
      );
    } finally {
      setIsAdding(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Table Handlers
  // ---------------------------------------------------------------------------
  const handleEdit = async (
    row: EmissionRow,
    updates: Partial<EmissionRow>,
  ) => {
    try {
      // Exclude non-activity fields from activity data
      const {
        total_emission: _te,
        unit: _u,
        pk_id: _pk,
        status: _s,
        reviewed_by: _rb,
        review_comment: _rc,
        ...existingActivityData
      } = row;
      const {
        total_emission: _te2,
        unit: _u2,
        pk_id: _pk2,
        status: _s2,
        reviewed_by: _rb2,
        review_comment: _rc2,
        ...updateActivityData
      } = updates as EmissionRow;

      const mergedActivityData = {
        ...existingActivityData,
        ...updateActivityData,
      };

      const result = await updateEmission(row.pk_id, {
        activity_data: mergedActivityData,
      });

      setEmissions((prev) =>
        prev.map((item) =>
          item.pk_id === row.pk_id ? flattenEmission(result.emission) : item,
        ),
      );
    } catch (error) {
      console.error("Error updating emission:", error);
      throw error;
    }
  };

  const handleDelete = async (row: EmissionRow) => {
    try {
      await deleteEmission(row.pk_id);
      setEmissions((prev) => prev.filter((item) => item.pk_id !== row.pk_id));
    } catch (error) {
      console.error("Error deleting emission:", error);
      throw error;
    }
  };

  const handleOpenDocuments = (row: EmissionRow) => {
    setSelectedEmissionForDocs(row);
    setDocumentModalOpen(true);
  };

  const handleCloseDocuments = () => {
    setDocumentModalOpen(false);
    setSelectedEmissionForDocs(null);
  };

  // ---------------------------------------------------------------------------
  // Table Columns
  // ---------------------------------------------------------------------------
  const tableColumns: Column<EmissionRow>[] = [
    {
      key: "emission_category" as keyof EmissionRow,
      label: "Emission Category",
      editable: false,
      type: "text" as const,
    },
    ...filteredColumns.map((col) => {
      const isDropdown = isSelectColumn(col);
      return {
        key: col.column_name as keyof EmissionRow,
        label: col.column_name,
        editable: true,
        type: (col.column_type === "number" ? "number" : "text") as
          | "number"
          | "text",
        // For dropdown columns, render the label instead of the stored ID
        ...(isDropdown && {
          render: (value: string, row: EmissionRow) => {
            if (!value) return "";
            // For dependent columns, we need the parent value to look up the correct label
            const parentColName = getParentColumnName(col.column_name);
            const parentValue = parentColName ? row[parentColName] as string : undefined;
            // Convert parent ID to label if needed
            let parentLabel = parentValue;
            if (parentValue && parentColName) {
              const parentColEntity = dynamicColumns.find(c => c.column_name === parentColName);
              if (parentColEntity) {
                parentLabel = getOptionLabel(parentColName, parentColEntity.pk_id, parentValue);
              }
            }
            return getOptionLabel(col.column_name, col.pk_id, String(value), parentLabel);
          },
        }),
      };
    }),
    {
      key: "activity_data_unit" as keyof EmissionRow,
      label: "Activity Unit",
      editable: false,
      type: "text" as const,
    },
    {
      key: "total_emission",
      label: "Total Emission (tCO2e)",
      editable: false,
      type: "number" as const,
    },
    {
      key: "unit",
      label: "Unit",
      editable: false,
      type: "text" as const,
    },
    {
      key: "status",
      label: "Status",
      editable: false,
      type: "text" as const,
      render: (value: EmissionStatus) => {
        const statusStyles: Record<EmissionStatus, string> = {
          pending: "bg-yellow-100 text-yellow-800",
          approved: "bg-green-100 text-green-800",
          rejected: "bg-red-100 text-red-800",
        };
        return (
          <span
            className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusStyles[value] || "bg-gray-100 text-gray-800"}`}
          >
            {value}
          </span>
        );
      },
    },
  ];

  // ---------------------------------------------------------------------------
  // Helper Functions
  // ---------------------------------------------------------------------------
  const resetDataState = () => {
    setDynamicColumns([]);
    setColumnOptions({});
    setColumnDependencies({});
    setDependentOptions({});
    setEmissionCategoryMapping({});
    setEmissions([]);
    setEmissionFactors([]);
    setUnits([]);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">
        Data Entry for {currentSite?.name || "No Site"}
      </h1>

      {/* Filters */}
      <div className={`grid grid-cols-1 gap-4 mb-6 ${hasMultipleSites ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
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
            placeholder="Select Category"
            value={selectedCategory}
            onChange={(option) => setSelectedCategory(option?.id as number)}
            searchable={true}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Date</label>
          <Dropdown
            options={dateOptions}
            placeholder="Select Date"
            value={selectedDate}
            onChange={(option) => setSelectedDate(option?.id as string)}
            searchable={true}
          />
        </div>
      </div>

      {/* Add Entry Button */}
      {selectedCategory && selectedDate && dynamicColumns.length > 0 && (
        <div className="mb-6">
          <button
            onClick={openModal}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Add New Entries
          </button>
        </div>
      )}

      {/* Entry Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={closeModal}
        title="Add New Entries"
        className="max-w-6xl! max-h-[85vh]!"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold">
                  Emission Category
                </th>
                {filteredColumns.map((col) => (
                  <th
                    key={col.pk_id}
                    className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold"
                  >
                    {col.column_name}
                  </th>
                ))}
                <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold">
                  Activity Unit
                </th>
                <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold">
                  Total Emission (tCO2e)
                </th>
                <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold w-20">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {modalRows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  {/* Emission Category Select */}
                  <td className="border border-gray-300 px-2 py-2">
                    {Object.keys(emissionCategoryMapping).length > 0 ? (
                      // Auto-mapped mode: show read-only field with auto-determined value
                      <div className="relative">
                        <input
                          type="text"
                          value={row.emission_category || ""}
                          readOnly
                          className={`w-full border px-2 py-1 rounded ${
                            row.emission_category
                              ? "border-green-400 bg-green-50 text-green-800"
                              : "border-gray-300 bg-gray-100 text-gray-500"
                          }`}
                          placeholder="Auto-determined from selections"
                        />
                        {row.emission_category && (
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-green-600">
                            Auto
                          </span>
                        )}
                      </div>
                    ) : (
                      // Manual mode: show dropdown for selection
                      <select
                        value={row.emission_category || ""}
                        onChange={(e) =>
                          handleModalRowChange(
                            row.id,
                            "emission_category",
                            e.target.value,
                          )
                        }
                        className="w-full border border-gray-300 px-2 py-1 rounded focus:outline-none focus:ring focus:ring-blue-300"
                      >
                        <option value="">Select Category</option>
                        {emissionFactors.map((factor) => (
                          <option
                            key={factor.emission_factor_id}
                            value={factor.emission_category_name}
                          >
                            {factor.emission_category_name}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>

                  {/* Dynamic Columns */}
                  {filteredColumns.map((col) => {
                    const parentColName = getParentColumnName(col.column_name);
                    const parentValue = parentColName ? row[parentColName] : undefined;
                    const options = getColumnDropdownOptions(col.column_name, col.pk_id, parentValue);
                    const showAsSelect = isSelectColumn(col) && options.length > 0;
                    const isDisabledDependent = isDependentColumn(col.column_name) && !parentValue;

                    return (
                      <td
                        key={col.pk_id}
                        className="border border-gray-300 px-2 py-2"
                      >
                        {showAsSelect ? (
                          <select
                            value={row[col.column_name] || ""}
                            onChange={(e) =>
                              handleModalRowChange(
                                row.id,
                                col.column_name,
                                e.target.value,
                              )
                            }
                            disabled={isDisabledDependent}
                            className={`w-full border border-gray-300 px-2 py-1 rounded focus:outline-none focus:ring focus:ring-blue-300 ${
                              isDisabledDependent ? "bg-gray-100 cursor-not-allowed" : ""
                            }`}
                          >
                            <option value="">
                              {isDisabledDependent
                                ? `Select ${parentColName} first`
                                : `Select ${col.column_name}`}
                            </option>
                            {options.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={col.column_type === "number" ? "number" : "text"}
                            value={row[col.column_name] || ""}
                            onChange={(e) =>
                              handleModalRowChange(
                                row.id,
                                col.column_name,
                                e.target.value,
                              )
                            }
                            className="w-full border border-gray-300 px-2 py-1 rounded focus:outline-none focus:ring focus:ring-blue-300"
                            placeholder={col.column_name}
                          />
                        )}
                      </td>
                    );
                  })}

                  {/* Unit Selector */}
                  <td className="border border-gray-300 px-2 py-2">
                    <UnitSelector
                      currentUnit={row.activity_data_unit}
                      expectedUnit={getExpectedUnit(
                        row.emission_category || "",
                      )}
                      units={units}
                      onChange={(value) =>
                        handleModalRowChange(
                          row.id,
                          "activity_data_unit",
                          value,
                        )
                      }
                    />
                  </td>

                  {/* Emission Preview */}
                  <td className="border border-gray-300 px-2 py-2">
                    <EmissionPreview result={calculateEmission(row)} />
                  </td>

                  {/* Actions */}
                  <td className="border border-gray-300 px-2 py-2">
                    <button
                      onClick={() => handleRemoveModalRow(row.id)}
                      disabled={modalRows.length === 1}
                      className="px-2 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:bg-gray-400"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Error Display */}
        {saveError && (
          <ValidationError
            error={saveError}
            onDismiss={() => setSaveError(null)}
          />
        )}

        {/* Modal Actions */}
        <div className="flex justify-between mt-4">
          <button
            onClick={handleAddModalRow}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            + Add Row
          </button>

          <div className="flex gap-2">
            <button
              onClick={closeModal}
              className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveAll}
              disabled={isAdding || modalRows.length === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
            >
              {isAdding ? "Saving..." : `Save All (${modalRows.length})`}
            </button>
          </div>
        </div>
      </Modal>

      {/* Emissions Table */}
      {selectedCategory && selectedDate && (
        <div>
          {loading ? (
            <div className="text-center py-4">Loading data...</div>
          ) : dynamicColumns.length > 0 ? (
            <Table<EmissionRow>
              data={emissions}
              columns={tableColumns}
              keyField="pk_id"
              onEdit={handleEdit}
              onDelete={handleDelete}
              loading={loading}
              showActions={true}
              renderActions={(row, { editButton, deleteButton }) => {
                const docsButton = (
                  <button
                    onClick={() => handleOpenDocuments(row)}
                    className="px-3 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
                    title="Manage Documents"
                  >
                    Docs
                  </button>
                );

                if (row.status === "approved") {
                  return (
                    <div className="flex flex-col gap-1">
                      <span className="text-sm text-green-700">
                        Approved by {row.reviewed_by?.name || "Manager"}
                      </span>
                      <div className="flex gap-2">{docsButton}</div>
                    </div>
                  );
                }
                if (row.status === "rejected") {
                  return (
                    <div className="flex flex-col gap-1">
                      <span className="text-sm text-red-700">
                        Rejected
                        {row.review_comment ? `: ${row.review_comment}` : ""}
                      </span>
                      <div className="flex gap-2">
                        {editButton}
                        {docsButton}
                      </div>
                    </div>
                  );
                }
                // Pending status - show default actions
                return (
                  <div className="flex gap-2">
                    {editButton}
                    {deleteButton}
                    {docsButton}
                  </div>
                );
              }}
            />
          ) : (
            <div className="text-center py-4 text-gray-500">
              No columns configured for this category.
            </div>
          )}
        </div>
      )}

      {/* Document Upload Modal */}
      {selectedEmissionForDocs && (
        <DocumentUploadModal
          isOpen={documentModalOpen}
          onClose={handleCloseDocuments}
          emissionId={selectedEmissionForDocs.pk_id}
          emissionCategory={selectedEmissionForDocs.emission_category}
        />
      )}
    </div>
  );
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

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

function createModalRow(id: number, columns: ColumnEntity[]): ModalRow {
  const row: ModalRow = { id };
  columns.forEach((col) => {
    row[col.column_name] = "";
  });
  return row;
}

function flattenEmission(emission: EmissionData): EmissionRow {
  return {
    // Spread activity_data first so explicit fields take precedence
    ...emission.activity_data,
    pk_id: emission.pk_id,
    total_emission: emission.total_emission,
    unit: emission.unit,
    activity_data_unit: emission.activity_data_unit,
    status: emission.status,
    reviewed_by: emission.reviewed_by,
    review_comment: emission.review_comment,
  };
}

function flattenEmissions(emissions: EmissionData[]): EmissionRow[] {
  return emissions.map(flattenEmission);
}

export default UserDataEntryPage;
