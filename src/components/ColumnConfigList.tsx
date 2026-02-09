import { useState, useEffect, useCallback } from "react";
import {
  getColumnConfigs,
  getColumnConfigsBySite,
  getColumnConfigsBySiteAndCategory,
  deleteColumnConfig,
  updateColumnConfig,
  updateColumnOptions,
  ColumnOptionsMap,
} from "../services/columnConfigService";
import { getColumns, DropdownOptionValue } from "../services/columnService";
import { Table, Column } from "./Table";
import { DropdownOption } from "./Dropdown";
import Modal from "./Modal";
import { useTheme } from "../context/ThemeContext";

interface ColumnEntity {
  pk_id: number;
  column_name: string;
  column_type: string;
  dropdown_options?: DropdownOptionValue[] | null;
}

interface Site {
  site_id: number;
  name: string;
}

interface Category {
  category_id: number;
  category_name: string;
}

interface ColumnConfigEntity {
  pk_id: number;
  config_name: string;
  site: Site;
  category: Category;
  columns: ColumnEntity[];
  column_options?: ColumnOptionsMap;
}

interface ColumnConfigListProps {
  refreshTrigger?: number;
  siteId?: number | null;
  categoryId?: number | null;
}

const ColumnConfigList = ({
  refreshTrigger,
  siteId,
  categoryId,
}: ColumnConfigListProps) => {
  const { isDark } = useTheme();
  const [columnConfigs, setColumnConfigs] = useState<ColumnConfigEntity[]>([]);
  const [allColumns, setAllColumns] = useState<ColumnEntity[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal state for column options
  const [optionsModalOpen, setOptionsModalOpen] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<ColumnConfigEntity | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<ColumnEntity | null>(null);
  const [editingOptions, setEditingOptions] = useState<DropdownOptionValue[]>([]);
  const [newOptionId, setNewOptionId] = useState("");
  const [newOptionLabel, setNewOptionLabel] = useState("");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      let data;
      if (siteId && categoryId) {
        data = await getColumnConfigsBySiteAndCategory(siteId, categoryId);
      } else if (siteId) {
        data = await getColumnConfigsBySite(siteId);
      } else {
        data = await getColumnConfigs();
      }
      setColumnConfigs(data);

      // Load all available columns for the dropdown
      const columnsData = await getColumns();
      setAllColumns(columnsData);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  }, [siteId, categoryId]);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTrigger]);

  const handleEdit = async (
    row: ColumnConfigEntity,
    updates: Partial<ColumnConfigEntity>
  ) => {
    try {
      const updatePayload: any = {
        config_name: updates.config_name,
      };

      // If columns were updated, they come as an array of IDs from the multiselect
      if (updates.columns !== undefined) {
        // When editing multiselect, the value is already an array of IDs
        const columnIds = Array.isArray(updates.columns)
          ? (updates.columns as any)
          : [];
        updatePayload.column_ids = columnIds;
      }

      await updateColumnConfig(row.pk_id, updatePayload);

      // Fetch the updated config to get the full column objects
      const columnsData = await getColumns();
      setAllColumns(columnsData);

      // Build the proper updates with full column objects instead of just IDs
      const properUpdates: Partial<ColumnConfigEntity> = {
        config_name: updates.config_name,
      };

      if (updates.columns !== undefined) {
        const columnIds = Array.isArray(updates.columns)
          ? (updates.columns as unknown as number[])
          : [];
        // Map IDs back to full column objects
        properUpdates.columns = columnIds
          .map((id) => columnsData.find((col: ColumnEntity) => col.pk_id === id))
          .filter((col): col is ColumnEntity => col !== undefined);
      }

      setColumnConfigs((prev) =>
        prev.map((item) =>
          item.pk_id === row.pk_id ? { ...item, ...properUpdates } : item
        )
      );
    } catch (error) {
      console.error("Error updating column config:", error);
      throw error;
    }
  };

  const handleDelete = async (row: ColumnConfigEntity) => {
    try {
      await deleteColumnConfig(row.pk_id);
      setColumnConfigs((prev) =>
        prev.filter((item) => item.pk_id !== row.pk_id)
      );
    } catch (error) {
      console.error("Error deleting column config:", error);
      throw error;
    }
  };

  // Open modal to manage dropdown options for a specific column in a config
  const openOptionsModal = (config: ColumnConfigEntity, column: ColumnEntity) => {
    setSelectedConfig(config);
    setSelectedColumn(column);
    // Get current options from config or fall back to column default
    const configOptions = config.column_options?.[column.pk_id.toString()] || [];
    setEditingOptions(configOptions.length > 0 ? configOptions : (column.dropdown_options || []));
    setNewOptionId("");
    setNewOptionLabel("");
    setOptionsModalOpen(true);
  };

  // Add new option
  const handleAddOption = () => {
    if (!newOptionId.trim() || !newOptionLabel.trim()) return;

    if (editingOptions.some((opt) => String(opt.id) === newOptionId.trim())) {
      alert("Option ID already exists");
      return;
    }

    setEditingOptions([
      ...editingOptions,
      { id: newOptionId.trim(), label: newOptionLabel.trim() },
    ]);
    setNewOptionId("");
    setNewOptionLabel("");
  };

  // Remove option
  const handleRemoveOption = (index: number) => {
    setEditingOptions(editingOptions.filter((_, i) => i !== index));
  };

  // Save options
  const handleSaveOptions = async () => {
    if (!selectedConfig || !selectedColumn) return;

    try {
      await updateColumnOptions(selectedConfig.pk_id, selectedColumn.pk_id, editingOptions);

      // Update local state
      setColumnConfigs((prev) =>
        prev.map((item) => {
          if (item.pk_id === selectedConfig.pk_id) {
            const updatedOptions = { ...(item.column_options || {}) };
            updatedOptions[selectedColumn.pk_id.toString()] = editingOptions;
            return { ...item, column_options: updatedOptions };
          }
          return item;
        })
      );

      setOptionsModalOpen(false);
      setSelectedConfig(null);
      setSelectedColumn(null);
    } catch (error) {
      console.error("Error saving dropdown options:", error);
    }
  };

  // Get select-type columns from a config
  const getSelectColumns = (config: ColumnConfigEntity) => {
    return config.columns.filter((col) => col.column_type === "select");
  };

  // Theme classes
  const inputClass = isDark
    ? "w-full px-3 py-2 border border-slate-600 rounded-md bg-slate-700 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
    : "w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500";

  const buttonPrimaryClass = isDark
    ? "px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
    : "px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50";

  const buttonSecondaryClass = isDark
    ? "px-4 py-2 border border-slate-600 text-slate-300 rounded-md hover:bg-slate-700"
    : "px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-100";

  const buttonDangerClass = isDark
    ? "px-2 py-1 text-red-400 hover:text-red-300"
    : "px-2 py-1 text-red-500 hover:text-red-700";

  const columnOptions: DropdownOption[] = allColumns.map((column) => ({
    id: column.pk_id,
    label: column.column_name,
  }));

  const tableColumns: Column<ColumnConfigEntity>[] = [
    {
      key: "pk_id",
      label: "ID",
      editable: false,
    },
    {
      key: "config_name",
      label: "Config Name",
      editable: true,
      type: "text",
    },
    {
      key: "site",
      label: "Site",
      editable: false,
      render: (_value, row) => row.site?.name || "N/A",
    },
    {
      key: "category",
      label: "Category",
      editable: false,
      render: (_value, row) => row.category?.category_name || "N/A",
    },
    {
      key: "columns",
      label: "Columns",
      editable: true,
      type: "multiselect",
      options: columnOptions,
      render: (_value, row) => {
        if (!row.columns || row.columns.length === 0) return "N/A";
        return row.columns.map((col) => col.column_name).join(", ");
      },
    },
    {
      key: "column_options",
      label: "Dropdown Options",
      editable: false,
      render: (_value, row) => {
        const selectColumns = getSelectColumns(row);
        if (selectColumns.length === 0) {
          return <span className={isDark ? "text-slate-500" : "text-gray-400"}>No select columns</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {selectColumns.map((col) => {
              const optionsCount = row.column_options?.[col.pk_id.toString()]?.length || 0;
              return (
                <button
                  key={col.pk_id}
                  onClick={(e) => {
                    e.stopPropagation();
                    openOptionsModal(row, col);
                  }}
                  className={`text-xs px-2 py-1 rounded ${
                    isDark
                      ? "bg-slate-700 text-blue-400 hover:bg-slate-600"
                      : "bg-gray-100 text-blue-600 hover:bg-gray-200"
                  }`}
                  title={`Edit options for ${col.column_name}`}
                >
                  {col.column_name}: {optionsCount}
                </button>
              );
            })}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <Table<ColumnConfigEntity>
        data={columnConfigs}
        columns={tableColumns}
        keyField="pk_id"
        onEdit={handleEdit}
        onDelete={handleDelete}
        loading={loading}
        showActions={true}
      />

      {/* Dropdown Options Modal */}
      <Modal
        isOpen={optionsModalOpen}
        onClose={() => {
          setOptionsModalOpen(false);
          setSelectedConfig(null);
          setSelectedColumn(null);
        }}
        title={`Dropdown Options for "${selectedColumn?.column_name || ""}" (${selectedConfig?.site?.name || ""})`}
        isDark={isDark}
      >
        <div className="space-y-4">
          <p className={`text-sm ${isDark ? "text-slate-400" : "text-gray-500"}`}>
            These options are specific to this site&apos;s configuration. Changes here won&apos;t affect other sites.
          </p>

          {/* Current Options List */}
          <div>
            <h3 className={`font-medium mb-2 ${isDark ? "text-slate-200" : "text-gray-700"}`}>
              Current Options ({editingOptions.length})
            </h3>
            {editingOptions.length === 0 ? (
              <p className={isDark ? "text-slate-400 text-sm" : "text-gray-500 text-sm"}>
                No options defined. Add options below.
              </p>
            ) : (
              <div className={`border rounded-md max-h-60 overflow-y-auto ${isDark ? "border-slate-600" : "border-gray-300"}`}>
                <table className="w-full">
                  <thead className={isDark ? "bg-slate-700" : "bg-gray-100"}>
                    <tr>
                      <th className={`px-4 py-2 text-left text-sm font-medium ${isDark ? "text-slate-300" : "text-gray-600"}`}>
                        ID
                      </th>
                      <th className={`px-4 py-2 text-left text-sm font-medium ${isDark ? "text-slate-300" : "text-gray-600"}`}>
                        Label
                      </th>
                      <th className="px-4 py-2 w-16"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {editingOptions.map((option, index) => (
                      <tr
                        key={index}
                        className={isDark ? "border-t border-slate-600" : "border-t border-gray-200"}
                      >
                        <td className={`px-4 py-2 text-sm ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                          {option.id}
                        </td>
                        <td className={`px-4 py-2 text-sm ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                          {option.label}
                        </td>
                        <td className="px-4 py-2">
                          <button
                            onClick={() => handleRemoveOption(index)}
                            className={buttonDangerClass}
                            title="Remove option"
                          >
                            &times;
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Add New Option */}
          <div className={`p-4 rounded-md ${isDark ? "bg-slate-700" : "bg-gray-50"}`}>
            <h3 className={`font-medium mb-3 ${isDark ? "text-slate-200" : "text-gray-700"}`}>
              Add New Option
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={`block text-sm mb-1 ${isDark ? "text-slate-400" : "text-gray-600"}`}>
                  ID (Value)
                </label>
                <input
                  type="text"
                  value={newOptionId}
                  onChange={(e) => setNewOptionId(e.target.value)}
                  placeholder="e.g., option_1"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={`block text-sm mb-1 ${isDark ? "text-slate-400" : "text-gray-600"}`}>
                  Label (Display Text)
                </label>
                <input
                  type="text"
                  value={newOptionLabel}
                  onChange={(e) => setNewOptionLabel(e.target.value)}
                  placeholder="e.g., Option 1"
                  className={inputClass}
                />
              </div>
            </div>
            <button
              onClick={handleAddOption}
              disabled={!newOptionId.trim() || !newOptionLabel.trim()}
              className={`mt-3 ${buttonPrimaryClass}`}
            >
              Add Option
            </button>
          </div>

          {/* Actions */}
          <div className={`flex justify-end gap-3 pt-4 border-t ${isDark ? "border-slate-600" : "border-gray-200"}`}>
            <button
              onClick={() => {
                setOptionsModalOpen(false);
                setSelectedConfig(null);
                setSelectedColumn(null);
              }}
              className={buttonSecondaryClass}
            >
              Cancel
            </button>
            <button
              onClick={handleSaveOptions}
              className={buttonPrimaryClass}
            >
              Save Options
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default ColumnConfigList;
