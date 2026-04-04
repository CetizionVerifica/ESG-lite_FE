import { useState } from "react";
import Dropdown, { DropdownOption } from "./Dropdown";

export interface Column<T> {
  key: keyof T;
  label: string;
  editable?: boolean;
  render?: (value: any, row: T) => React.ReactNode;
  type?: "text" | "number" | "email" | "date" | "dropdown" | "multiselect";
  options?: DropdownOption[];
  getOptions?: (row: T, editValues: Partial<T>) => DropdownOption[];
  onEditChange?: (value: any, editValues: Partial<T>, setEditValues: (updater: (prev: Partial<T>) => Partial<T>) => void) => void;
}

export interface TableProps<T> {
  data: T[];
  columns: Column<T>[];
  onEdit?: (row: T, updates: Partial<T>) => Promise<void> | void;
  onDelete?: (row: T) => Promise<void> | void;
  onAdd?: (row: T) => Promise<void> | void;
  keyField: keyof T;
  showActions?: boolean;
  loading?: boolean;
  actionsLabel?: string;
  renderActions?: (
    row: T,
    defaultActions: {
      editButton: React.ReactNode;
      deleteButton: React.ReactNode;
    },
  ) => React.ReactNode;
  isDark?: boolean;
  rowClassName?: (row: T) => string;
  selectedIds?: Set<any>;
  onSelectionChange?: (ids: Set<any>) => void;
  isRowSelectable?: (row: T) => boolean;
  editMode?: "inline" | "modal";
}

export function Table<T extends Record<string, any>>({
  data,
  columns,
  onEdit,
  onDelete,
  keyField,
  showActions = true,
  loading = false,
  actionsLabel = "Actions",
  renderActions,
  isDark = false,
  rowClassName,
  selectedIds,
  onSelectionChange,
  isRowSelectable,
  editMode = "inline",
}: TableProps<T>) {
  const [editingId, setEditingId] = useState<any>(null);
  const [editValues, setEditValues] = useState<Partial<T>>({});
  const [savingId, setSavingId] = useState<any>(null);
  const [deletingId, setDeletingId] = useState<any>(null);

  // Theme classes
  const loadingClass = isDark
    ? "text-center py-8 text-slate-300"
    : "text-center py-8";
  const emptyClass = isDark
    ? "text-center py-8 text-slate-400"
    : "text-center py-8 text-gray-500";
  const tableClass = isDark
    ? "w-full border-collapse border border-slate-600"
    : "w-full border-collapse border border-gray-300";
  const headerRowClass = isDark ? "bg-slate-700" : "bg-gray-100";
  const headerCellClass = isDark
    ? "border border-slate-600 px-4 py-3 text-left font-semibold text-slate-200"
    : "border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700";
  const cellClass = isDark
    ? "border border-slate-600 px-4 py-3 text-slate-200"
    : "border border-gray-300 px-4 py-3";
  const inputClass = isDark
    ? "w-full border border-slate-500 bg-slate-600 text-slate-200 px-2 py-1 rounded focus:outline-none focus:ring focus:ring-blue-500/30"
    : "w-full border border-gray-400 px-2 py-1 rounded focus:outline-none focus:ring focus:ring-blue-300";
  const getRowClass = (isEditing: boolean) =>
    isDark
      ? `${isEditing ? "bg-blue-900/30" : "hover:bg-slate-700"} transition-colors`
      : `${isEditing ? "bg-blue-50" : "hover:bg-gray-50"} transition-colors`;

  const showSelection = !!selectedIds && !!onSelectionChange;
  const selectableRows = showSelection
    ? data.filter((row) => !isRowSelectable || isRowSelectable(row))
    : [];
  const allSelectableSelected =
    showSelection && selectableRows.length > 0 && selectableRows.every((row) => selectedIds!.has(row[keyField]));

  const toggleRow = (id: any) => {
    if (!onSelectionChange || !selectedIds) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  const toggleAll = () => {
    if (!onSelectionChange || !selectedIds) return;
    if (allSelectableSelected) {
      // Only deselect current page's rows, preserve other-page selections
      const next = new Set(selectedIds);
      selectableRows.forEach((row) => next.delete(row[keyField]));
      onSelectionChange(next);
    } else {
      const next = new Set(selectedIds);
      selectableRows.forEach((row) => next.add(row[keyField]));
      onSelectionChange(next);
    }
  };

  const handleEditStart = (row: T) => {
    setEditingId(row[keyField]);
    const initialValues: Partial<T> = {};
    columns.forEach((col) => {
      if (col.editable) {
        if (col.type === "multiselect" && Array.isArray(row[col.key])) {
          // Transform array of objects to array of IDs for multiselect
          initialValues[col.key] = row[col.key].map(
            (item: any) => item.category_id ?? item.site_id ?? item.id ?? item,
          ) as T[keyof T];
        } else {
          initialValues[col.key] = row[col.key];
        }
      }
    });
    setEditValues(initialValues);
  };

  const handleEditChange = (key: keyof T, value: any) => {
    setEditValues((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSave = async (row: T) => {
    if (!onEdit) return;

    setSavingId(row[keyField]);
    try {
      await onEdit(row, editValues);
      setEditingId(null);
      setEditValues({});
    } catch (error) {
      console.error("Error saving:", error);
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (row: T) => {
    if (!onDelete) return;

    setDeletingId(row[keyField]);
    try {
      await onDelete(row);
    } catch (error) {
      console.error("Error deleting:", error);
    } finally {
      setDeletingId(null);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditValues({});
  };

  if (loading) {
    return <div className={loadingClass}>Loading...</div>;
  }

  if (data.length === 0) {
    return <div className={emptyClass}>No data available</div>;
  }

  return (
    <div
      className={`mt-6 ${editingId !== null ? "overflow-visible" : "overflow-x-auto"}`}
    >
      <table className={tableClass}>
        <thead>
          <tr className={headerRowClass}>
            {showSelection && (
              <th className={`${headerCellClass} w-10 text-center`}>
                <input
                  type="checkbox"
                  checked={allSelectableSelected}
                  onChange={toggleAll}
                  className="w-4 h-4 cursor-pointer"
                />
              </th>
            )}
            {columns.map((col) => (
              <th key={String(col.key)} className={headerCellClass}>
                {col.label}
              </th>
            ))}
            {showActions && <th className={headerCellClass}>{actionsLabel}</th>}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const isEditing = editingId === row[keyField];
            return (
              <tr
                key={String(row[keyField])}
                className={`${getRowClass(isEditing)} ${rowClassName ? rowClassName(row) : ""}`}
              >
                {showSelection && (() => {
                  const selectable = !isRowSelectable || isRowSelectable(row);
                  return (
                    <td className={`${cellClass} text-center`}>
                      {selectable ? (
                        <input
                          type="checkbox"
                          checked={selectedIds!.has(row[keyField])}
                          onChange={() => toggleRow(row[keyField])}
                          className="w-4 h-4 cursor-pointer"
                        />
                      ) : null}
                    </td>
                  );
                })()}
                {columns.map((col) => {
                  const dynamicOptions = isEditing && col.getOptions ? col.getOptions(row, editValues) : col.options;
                  return (
                  <td key={String(col.key)} className={cellClass}>
                    {isEditing && col.editable ? (
                      col.type === "dropdown" && (dynamicOptions || col.getOptions) ? (
                        <Dropdown
                          options={dynamicOptions || []}
                          placeholder={dynamicOptions && dynamicOptions.length === 0 ? "Select parent first" : "Select..."}
                          value={editValues[col.key] ?? null}
                          onChange={(option) => {
                            if (col.onEditChange) {
                              col.onEditChange(option.id, editValues, setEditValues);
                            } else {
                              handleEditChange(col.key, option.id);
                            }
                          }}
                          searchable={true}
                          disabled={col.getOptions && (!dynamicOptions || dynamicOptions.length === 0)}
                        />
                      ) : col.type === "multiselect" && dynamicOptions ? (
                        <Dropdown
                          options={dynamicOptions}
                          placeholder="Select..."
                          multiple={true}
                          multipleValue={
                            Array.isArray(editValues[col.key])
                              ? (editValues[col.key] as (string | number)[])
                              : []
                          }
                          onMultipleChange={(options) =>
                            handleEditChange(
                              col.key,
                              options.map((o) => o.id),
                            )
                          }
                          searchable={true}
                        />
                      ) : (
                        <input
                          type={col.type || "text"}
                          value={editValues[col.key] ?? ""}
                          onChange={(e) =>
                            handleEditChange(col.key, e.target.value)
                          }
                          className={inputClass}
                        />
                      )
                    ) : col.render ? (
                      col.render(row[col.key], row)
                    ) : (
                      row[col.key]
                    )}
                  </td>
                  );
                })}
                {showActions && (
                  <td className={cellClass}>
                    {isEditing ? (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSave(row)}
                          disabled={savingId === row[keyField]}
                          className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:bg-gray-400"
                        >
                          {savingId === row[keyField] ? "Saving..." : "Save"}
                        </button>
                        <button
                          onClick={handleCancel}
                          className="px-3 py-1 bg-gray-400 text-white rounded text-sm hover:bg-gray-500"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : renderActions ? (
                      renderActions(row, {
                        editButton: onEdit ? (
                          <button
                            onClick={() => editMode === "modal" ? onEdit(row, {}) : handleEditStart(row)}
                            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                          >
                            Edit
                          </button>
                        ) : null,
                        deleteButton: onDelete ? (
                          <button
                            onClick={() => handleDelete(row)}
                            disabled={deletingId === row[keyField]}
                            className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:bg-gray-400"
                          >
                            {deletingId === row[keyField]
                              ? "Deleting..."
                              : "Delete"}
                          </button>
                        ) : null,
                      })
                    ) : (
                      <div className="flex gap-2">
                        {onEdit && (
                          <button
                            onClick={() => editMode === "modal" ? onEdit(row, {}) : handleEditStart(row)}
                            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                          >
                            Edit
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={() => handleDelete(row)}
                            disabled={deletingId === row[keyField]}
                            className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:bg-gray-400"
                          >
                            {deletingId === row[keyField]
                              ? "Deleting..."
                              : "Delete"}
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
