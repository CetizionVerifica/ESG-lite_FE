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
import { UnitSelector, EmissionPreview, ValidationError } from "./components";
import {
  Category,
  ColumnEntity,
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

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalRows, setModalRows] = useState<ModalRow[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [nextRowId, setNextRowId] = useState(1);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Derived Data
  // ---------------------------------------------------------------------------
  // Calculate target year for emission factors (reporting year - 1)
  const targetYear = selectedDate
    ? parseInt(selectedDate.substring(0, 4)) - 1
    : undefined;

  // ---------------------------------------------------------------------------
  // Hooks
  // ---------------------------------------------------------------------------
  const { getExpectedUnit, calculateEmission } =
    useEmissionCalculation(emissionFactors, targetYear);

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

      setDynamicColumns(configs[0]?.columns || []);
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
      prev.map((row) =>
        row.id === rowId ? { ...row, [columnName]: value } : row,
      ),
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
    ...filteredColumns.map((col) => ({
      key: col.column_name as keyof EmissionRow,
      label: col.column_name,
      editable: true,
      type: (col.column_type === "number" ? "number" : "text") as
        | "number"
        | "text",
    })),
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
                  </td>

                  {/* Dynamic Columns */}
                  {filteredColumns.map((col) => (
                    <td
                      key={col.pk_id}
                      className="border border-gray-300 px-2 py-2"
                    >
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
                    </td>
                  ))}

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
                if (row.status === "approved") {
                  return (
                    <span className="text-sm text-green-700">
                      Approved by {row.reviewed_by?.name || "Manager"}
                    </span>
                  );
                }
                if (row.status === "rejected") {
                  return (
                    <div className="flex flex-col gap-1">
                      <span className="text-sm text-red-700">
                        Rejected
                        {row.review_comment ? `: ${row.review_comment}` : ""}
                      </span>
                      <div className="flex gap-2">{editButton}</div>
                    </div>
                  );
                }
                // Pending status - show default actions
                return (
                  <div className="flex gap-2">
                    {editButton}
                    {deleteButton}
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
