import { useState, useEffect, useCallback } from "react";
import {
  getColumns,
  deleteColumn,
  updateColumn,
  DropdownOptionValue,
} from "../services/columnService";
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

interface ColumnListProps {
  refreshTrigger?: number;
}

const COLUMN_TYPE_OPTIONS: DropdownOption[] = [
  { id: "text", label: "Text" },
  { id: "number", label: "Number" },
  { id: "date", label: "Date" },
  { id: "boolean", label: "Boolean" },
  { id: "select", label: "Select" },
];

const ColumnList = ({ refreshTrigger }: ColumnListProps) => {
  const { isDark } = useTheme();
  const [columns, setColumns] = useState<ColumnEntity[]>([]);
  const [loading, setLoading] = useState(false);

  // Modal state for dropdown options
  const [optionsModalOpen, setOptionsModalOpen] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState<ColumnEntity | null>(null);
  const [editingOptions, setEditingOptions] = useState<DropdownOptionValue[]>([]);
  const [newOptionId, setNewOptionId] = useState("");
  const [newOptionLabel, setNewOptionLabel] = useState("");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getColumns();
      setColumns(data);
    } catch (error) {
      console.error("Error loading columns:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, refreshTrigger]);

  const handleEdit = async (
    row: ColumnEntity,
    updates: Partial<ColumnEntity>
  ) => {
    try {
      // If changing from "select" to another type, clear dropdown_options
      if (updates.column_type && updates.column_type !== "select") {
        updates.dropdown_options = null;
      }
      await updateColumn(row.pk_id, updates);
      setColumns((prev) =>
        prev.map((item) =>
          item.pk_id === row.pk_id ? { ...item, ...updates } : item
        )
      );
    } catch (error) {
      console.error("Error updating column:", error);
      throw error;
    }
  };

  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDelete = async (row: ColumnEntity) => {
    setDeleteError(null);
    try {
      await deleteColumn(row.pk_id);
      setColumns((prev) => prev.filter((item) => item.pk_id !== row.pk_id));
    } catch (error: any) {
      console.error("Error deleting column:", error);
      // The backend refuses to delete a column that a column config still
      // uses. Say so on screen, naming the configs, instead of failing silently.
      const data = error?.response?.data;
      const configs: { config_name: string }[] = data?.associatedConfigs ?? [];
      const names = configs.map((c) => c.config_name).join(", ");
      setDeleteError(
        names
          ? `"${row.column_name}" cannot be deleted: it is used by ${configs.length} column config${configs.length === 1 ? "" : "s"} (${names}). Remove it from those configs first (Column Config → Edit → Columns).`
          : data?.message || `Could not delete "${row.column_name}".`,
      );
      throw error;
    }
  };

  // Open modal to manage dropdown options
  const openOptionsModal = (column: ColumnEntity) => {
    setSelectedColumn(column);
    setEditingOptions(column.dropdown_options || []);
    setNewOptionId("");
    setNewOptionLabel("");
    setOptionsModalOpen(true);
  };

  // Add new option
  const handleAddOption = () => {
    if (!newOptionId.trim() || !newOptionLabel.trim()) return;

    // Check for duplicate id
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
    if (!selectedColumn) return;

    try {
      await updateColumn(selectedColumn.pk_id, { dropdown_options: editingOptions });
      setColumns((prev) =>
        prev.map((item) =>
          item.pk_id === selectedColumn.pk_id
            ? { ...item, dropdown_options: editingOptions }
            : item
        )
      );
      setOptionsModalOpen(false);
      setSelectedColumn(null);
    } catch (error) {
      console.error("Error saving dropdown options:", error);
    }
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

  const tableColumns: Column<ColumnEntity>[] = [
    {
      key: "pk_id",
      label: "ID",
      editable: false,
    },
    {
      key: "column_name",
      label: "Column Name",
      editable: true,
      type: "text",
    },
    {
      key: "column_type",
      label: "Column Type",
      editable: true,
      type: "dropdown",
      options: COLUMN_TYPE_OPTIONS,
    },
    {
      key: "dropdown_options",
      label: "Options",
      editable: false,
      render: (value: DropdownOptionValue[] | null | undefined, row: ColumnEntity) => {
        if (row.column_type !== "select") {
          return <span className={isDark ? "text-slate-500" : "text-gray-400"}>N/A</span>;
        }
        const count = value?.length || 0;
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              openOptionsModal(row);
            }}
            className={`${isDark ? "text-blue-400 hover:text-blue-300" : "text-blue-600 hover:text-blue-800"} underline`}
          >
            {count} option{count !== 1 ? "s" : ""} (Edit)
          </button>
        );
      },
    },
  ];

  return (
    <>
      {deleteError && (
        <div className={`mb-3 flex items-start justify-between gap-3 rounded-md border px-4 py-3 text-sm ${isDark ? "bg-red-900/30 border-red-800/50 text-red-300" : "bg-red-50 border-red-200 text-red-700"}`}>
          <span>{deleteError}</span>
          <button onClick={() => setDeleteError(null)} className="shrink-0 font-bold cursor-pointer" title="Dismiss">&times;</button>
        </div>
      )}
      <Table<ColumnEntity>
        data={columns}
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
          setSelectedColumn(null);
        }}
        title={`Dropdown Options for "${selectedColumn?.column_name || ""}"`}
        isDark={isDark}
      >
        <div className="space-y-4">
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

export default ColumnList;
