import { useState, useEffect, useCallback } from "react";
import {
  getColumnConfigs,
  getColumnConfigsBySite,
  getColumnConfigsBySiteAndCategory,
  deleteColumnConfig,
  updateColumnConfig,
  ColumnOptionsMap,
  ColumnDependencies,
  DependentOptionsMap,
  EmissionCategoryMapping,
  ExtraFieldDefinition,
} from "../services/columnConfigService";
import { getColumns, DropdownOptionValue } from "../services/columnService";
import { Table, Column } from "./Table";
import { DropdownOption } from "./Dropdown";
import Modal from "./Modal";
import EditColumnConfigModal from "./EditColumnConfigModal";
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
  column_dependencies?: ColumnDependencies;
  dependent_options?: DependentOptionsMap;
  emission_category_mapping?: EmissionCategoryMapping;
  extra_fields?: ExtraFieldDefinition[];
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



  // Modal state for dependent dropdown configuration
  const [dependencyModalOpen, setDependencyModalOpen] = useState(false);
  const [editingDependencies, setEditingDependencies] = useState<ColumnDependencies>({});
  const [editingDependentOptions, setEditingDependentOptions] = useState<DependentOptionsMap>({});
  const [editingEmissionMapping, setEditingEmissionMapping] = useState<EmissionCategoryMapping>({});
  const [newMappingKey, setNewMappingKey] = useState("");
  const [newMappingValue, setNewMappingValue] = useState("");

  // Extra fields modal state
  const [extraFieldsModalOpen, setExtraFieldsModalOpen] = useState(false);
  const [extraFieldsConfig, setExtraFieldsConfig] = useState<ColumnConfigEntity | null>(null);
  const [editingExtraFields, setEditingExtraFields] = useState<ExtraFieldDefinition[]>([]);
  const [savingExtraFields, setSavingExtraFields] = useState(false);

  // Unified edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editModalConfig, setEditModalConfig] = useState<ColumnConfigEntity | null>(null);

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
      // Build the updated column_options object
      const updatedColumnOptions = { ...(selectedConfig.column_options || {}) };
      updatedColumnOptions[selectedColumn.pk_id.toString()] = editingOptions;

      // Use updateColumnConfig to save the entire column_options object
      await updateColumnConfig(selectedConfig.pk_id, {
        column_options: updatedColumnOptions,
      });

      // Update local state
      setColumnConfigs((prev) =>
        prev.map((item) => {
          if (item.pk_id === selectedConfig.pk_id) {
            return { ...item, column_options: updatedColumnOptions };
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

  // Get all columns for flexible configuration (allow adding dropdown options to any column)
  // This enables admins to configure dropdowns for any column in a site-specific config
  const getAllConfigurableColumns = (config: ColumnConfigEntity) => {
    return config.columns;
  };

  // Open dependency configuration modal
  const openDependencyModal = (config: ColumnConfigEntity) => {
    setSelectedConfig(config);
    setEditingDependencies(config.column_dependencies || {});
    setEditingDependentOptions(config.dependent_options || {});
    setEditingEmissionMapping(config.emission_category_mapping || {});
    setNewMappingKey("");
    setNewMappingValue("");
    setDependencyModalOpen(true);
  };

  // Save dependency configuration
  const handleSaveDependencies = async () => {
    if (!selectedConfig) return;

    try {
      await updateColumnConfig(selectedConfig.pk_id, {
        column_dependencies: editingDependencies,
        dependent_options: editingDependentOptions,
        emission_category_mapping: editingEmissionMapping,
      });

      // Update local state
      setColumnConfigs((prev) =>
        prev.map((item) => {
          if (item.pk_id === selectedConfig.pk_id) {
            return {
              ...item,
              column_dependencies: editingDependencies,
              dependent_options: editingDependentOptions,
              emission_category_mapping: editingEmissionMapping,
            };
          }
          return item;
        })
      );

      setDependencyModalOpen(false);
      setSelectedConfig(null);
    } catch (error) {
      console.error("Error saving dependency configuration:", error);
    }
  };

  // Add a column dependency
  const handleAddDependency = (childCol: string, parentCol: string) => {
    if (!childCol || !parentCol || childCol === parentCol) return;
    setEditingDependencies((prev) => ({ ...prev, [childCol]: parentCol }));
  };

  // Remove a column dependency
  const handleRemoveDependency = (childCol: string) => {
    setEditingDependencies((prev) => {
      const updated = { ...prev };
      delete updated[childCol];
      return updated;
    });
    // Also remove dependent options for this child
    setEditingDependentOptions((prev) => {
      const updated = { ...prev };
      delete updated[childCol];
      return updated;
    });
  };

  // Add dependent options for a child column based on parent value
  const handleAddDependentOption = (
    childCol: string,
    parentValue: string,
    optionId: string,
    optionLabel: string
  ) => {
    if (!childCol || !parentValue || !optionId || !optionLabel) return;
    setEditingDependentOptions((prev) => {
      const updated = { ...prev };
      if (!updated[childCol]) updated[childCol] = {};
      if (!updated[childCol][parentValue]) updated[childCol][parentValue] = [];
      // Check for duplicate
      if (updated[childCol][parentValue].some((o) => String(o.id) === optionId)) return prev;
      updated[childCol][parentValue] = [
        ...updated[childCol][parentValue],
        { id: optionId, label: optionLabel },
      ];
      return updated;
    });
  };

  // Remove a dependent option
  const handleRemoveDependentOption = (childCol: string, parentValue: string, optionIndex: number) => {
    setEditingDependentOptions((prev) => {
      const updated = { ...prev };
      if (updated[childCol]?.[parentValue]) {
        updated[childCol][parentValue] = updated[childCol][parentValue].filter((_, i) => i !== optionIndex);
        if (updated[childCol][parentValue].length === 0) {
          delete updated[childCol][parentValue];
        }
        if (Object.keys(updated[childCol]).length === 0) {
          delete updated[childCol];
        }
      }
      return updated;
    });
  };

  // Add emission category mapping
  const handleAddMapping = () => {
    if (!newMappingKey.trim() || !newMappingValue.trim()) return;
    setEditingEmissionMapping((prev) => ({
      ...prev,
      [newMappingKey.trim()]: newMappingValue.trim(),
    }));
    setNewMappingKey("");
    setNewMappingValue("");
  };

  // Remove emission category mapping
  const handleRemoveMapping = (key: string) => {
    setEditingEmissionMapping((prev) => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
  };

  // Generate all possible mapping combinations from dependent options
  const generateMappingsFromDependencies = () => {
    const newMappings: EmissionCategoryMapping = { ...editingEmissionMapping };

    // For each dependent column's options, create mapping entries
    Object.entries(editingDependentOptions).forEach(([_childCol, parentOptions]) => {
      // parentOptions is { parentValue: [options] }
      Object.entries(parentOptions).forEach(([parentValue, childOptions]) => {
        childOptions.forEach((childOption) => {
          const key = `${parentValue}|${childOption.label}`;
          // Only add if not already exists
          if (!newMappings[key]) {
            // Auto-generate emission category name as "Parent - Child"
            newMappings[key] = `${parentValue} - ${childOption.label}`;
          }
        });
      });
    });

    setEditingEmissionMapping(newMappings);
  };

  // Update a specific mapping value
  const handleUpdateMappingValue = (key: string, value: string) => {
    setEditingEmissionMapping((prev) => ({
      ...prev,
      [key]: value,
    }));
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

  // Extra fields handlers
  const openExtraFieldsModal = (config: ColumnConfigEntity) => {
    setExtraFieldsConfig(config);
    setEditingExtraFields(JSON.parse(JSON.stringify(config.extra_fields || [])));
    setExtraFieldsModalOpen(true);
  };

  const handleSaveExtraFields = async () => {
    if (!extraFieldsConfig) return;
    setSavingExtraFields(true);
    try {
      await updateColumnConfig(extraFieldsConfig.pk_id, {
        extra_fields: editingExtraFields,
      });
      setColumnConfigs((prev) =>
        prev.map((c) =>
          c.pk_id === extraFieldsConfig.pk_id
            ? { ...c, extra_fields: editingExtraFields }
            : c
        )
      );
      setExtraFieldsModalOpen(false);
    } catch (error) {
      console.error("Error saving extra fields:", error);
    } finally {
      setSavingExtraFields(false);
    }
  };

  const addExtraField = () => {
    setEditingExtraFields((prev) => [
      ...prev,
      { key: "", label: "", type: "text", required: false },
    ]);
  };

  const updateExtraField = (index: number, updates: Partial<ExtraFieldDefinition>) => {
    setEditingExtraFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...updates } : f))
    );
  };

  const removeExtraField = (index: number) => {
    setEditingExtraFields((prev) => prev.filter((_, i) => i !== index));
  };

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
        const configurableColumns = getAllConfigurableColumns(row);
        if (configurableColumns.length === 0) {
          return <span className={isDark ? "text-slate-500" : "text-gray-400"}>No columns</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {configurableColumns.map((col: ColumnEntity) => {
              const optionsCount = row.column_options?.[col.pk_id.toString()]?.length || 0;
              const hasOptions = optionsCount > 0;
              return (
                <button
                  key={col.pk_id}
                  onClick={(e) => {
                    e.stopPropagation();
                    openOptionsModal(row, col);
                  }}
                  className={`text-xs px-2 py-1 rounded ${
                    hasOptions
                      ? isDark
                        ? "bg-green-800 text-green-200 hover:bg-green-700"
                        : "bg-green-100 text-green-700 hover:bg-green-200"
                      : isDark
                        ? "bg-slate-700 text-slate-400 hover:bg-slate-600"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                  title={hasOptions ? `Edit ${optionsCount} options for ${col.column_name}` : `Add options for ${col.column_name}`}
                >
                  {col.column_name}: {optionsCount}
                </button>
              );
            })}
          </div>
        );
      },
    },
    {
      key: "emission_category_mapping",
      label: "Dependencies",
      editable: false,
      render: (_value, row) => {
        const depCount = Object.keys(row.column_dependencies || {}).length;
        const mappingCount = Object.keys(row.emission_category_mapping || {}).length;
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              openDependencyModal(row);
            }}
            className={`text-xs px-2 py-1 rounded ${
              depCount > 0 || mappingCount > 0
                ? isDark
                  ? "bg-green-800 text-green-200 hover:bg-green-700"
                  : "bg-green-100 text-green-700 hover:bg-green-200"
                : isDark
                  ? "bg-slate-700 text-slate-400 hover:bg-slate-600"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
            title="Configure dependent dropdowns and emission mappings"
          >
            {depCount > 0 || mappingCount > 0
              ? `${depCount} deps, ${mappingCount} mappings`
              : "Configure"}
          </button>
        );
      },
    },
    {
      key: "extra_fields" as keyof ColumnConfigEntity,
      label: "Extra Fields",
      editable: false,
      render: (_value, row) => {
        const count = row.extra_fields?.length || 0;
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              openExtraFieldsModal(row);
            }}
            className={`text-xs px-2 py-1 rounded ${
              count > 0
                ? isDark
                  ? "bg-blue-800 text-blue-200 hover:bg-blue-700"
                  : "bg-blue-100 text-blue-700 hover:bg-blue-200"
                : isDark
                  ? "bg-slate-700 text-slate-400 hover:bg-slate-600"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
            title="Manage supplementary fields for this category"
          >
            {count > 0 ? `${count} fields` : "Configure"}
          </button>
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
        onDelete={handleDelete}
        loading={loading}
        showActions={true}
        renderActions={(row, defaultActions) => (
          <div className="flex gap-2">
            <button
              onClick={() => {
                setEditModalConfig(row);
                setEditModalOpen(true);
              }}
              className={`px-3 py-1 rounded text-sm cursor-pointer ${isDark ? "bg-blue-600 text-white hover:bg-blue-500" : "bg-blue-600 text-white hover:bg-blue-700"}`}
            >
              Edit
            </button>
            {defaultActions.deleteButton}
          </div>
        )}
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

      {/* Dependency Configuration Modal */}
      <Modal
        isOpen={dependencyModalOpen}
        onClose={() => {
          setDependencyModalOpen(false);
          setSelectedConfig(null);
        }}
        title={`Dependent Dropdowns & Mappings (${selectedConfig?.site?.name || ""} - ${selectedConfig?.category?.category_name || ""})`}
        isDark={isDark}
      >
        <div className="space-y-6 max-h-[70vh] overflow-y-auto">
          <p className={`text-sm ${isDark ? "text-slate-400" : "text-gray-500"}`}>
            Configure dependent dropdowns where one column&apos;s options depend on another column&apos;s selection,
            and map combinations to emission categories.
          </p>

          {/* Section 1: Column Dependencies */}
          <div className={`p-4 rounded-md ${isDark ? "bg-slate-700" : "bg-gray-50"}`}>
            <h3 className={`font-medium mb-3 ${isDark ? "text-slate-200" : "text-gray-700"}`}>
              1. Column Dependencies
            </h3>
            <p className={`text-xs mb-3 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
              Define which column depends on which (e.g., &quot;Disposal Method&quot; depends on &quot;Material&quot;)
            </p>

            {/* Current Dependencies */}
            {Object.keys(editingDependencies).length > 0 && (
              <div className="mb-3 space-y-2">
                {Object.entries(editingDependencies).map(([child, parent]) => (
                  <div key={child} className={`flex items-center justify-between p-2 rounded ${isDark ? "bg-slate-600" : "bg-white border"}`}>
                    <span className={`text-sm ${isDark ? "text-slate-200" : "text-gray-700"}`}>
                      <strong>{child}</strong> depends on <strong>{parent}</strong>
                    </span>
                    <button
                      onClick={() => handleRemoveDependency(child)}
                      className={buttonDangerClass}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add Dependency */}
            <div className="grid grid-cols-2 gap-2">
              <select
                id="dep-child"
                className={inputClass}
                defaultValue=""
              >
                <option value="">Child Column...</option>
                {selectedConfig?.columns.map((col) => (
                  <option key={col.pk_id} value={col.column_name}>{col.column_name}</option>
                ))}
              </select>
              <select
                id="dep-parent"
                className={inputClass}
                defaultValue=""
              >
                <option value="">Parent Column...</option>
                {selectedConfig?.columns.map((col) => (
                  <option key={col.pk_id} value={col.column_name}>{col.column_name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => {
                const childEl = document.getElementById("dep-child") as HTMLSelectElement;
                const parentEl = document.getElementById("dep-parent") as HTMLSelectElement;
                if (childEl && parentEl) {
                  handleAddDependency(childEl.value, parentEl.value);
                  childEl.value = "";
                  parentEl.value = "";
                }
              }}
              className={`mt-2 ${buttonPrimaryClass}`}
            >
              Add Dependency
            </button>
          </div>

          {/* Section 2: Dependent Options */}
          <div className={`p-4 rounded-md ${isDark ? "bg-slate-700" : "bg-gray-50"}`}>
            <h3 className={`font-medium mb-3 ${isDark ? "text-slate-200" : "text-gray-700"}`}>
              2. Dependent Options
            </h3>
            <p className={`text-xs mb-3 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
              Define options for child columns based on parent selection (e.g., when Material=&quot;Paper&quot;, show these Disposal Methods)
            </p>

            {/* Current Dependent Options */}
            {Object.keys(editingDependentOptions).length > 0 && (
              <div className="mb-3 space-y-3">
                {Object.entries(editingDependentOptions).map(([childCol, parentOptions]) => (
                  <div key={childCol} className={`p-2 rounded ${isDark ? "bg-slate-600" : "bg-white border"}`}>
                    <div className={`font-medium text-sm mb-2 ${isDark ? "text-slate-200" : "text-gray-700"}`}>
                      {childCol} options:
                    </div>
                    {Object.entries(parentOptions).map(([parentVal, options]) => (
                      <div key={parentVal} className="ml-2 mb-2">
                        <span className={`text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                          When parent = &quot;{parentVal}&quot;:
                        </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {options.map((opt, idx) => (
                            <span
                              key={idx}
                              className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${isDark ? "bg-slate-500" : "bg-gray-200"}`}
                            >
                              {opt.label}
                              <button
                                onClick={() => handleRemoveDependentOption(childCol, parentVal, idx)}
                                className="text-red-500 hover:text-red-700"
                              >
                                &times;
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Add Dependent Option */}
            {Object.keys(editingDependencies).length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                <select id="depopt-child" className={inputClass} defaultValue="">
                  <option value="">Child Col</option>
                  {Object.keys(editingDependencies).map((child) => (
                    <option key={child} value={child}>{child}</option>
                  ))}
                </select>
                <input
                  id="depopt-parent-val"
                  type="text"
                  placeholder="Parent Value"
                  className={inputClass}
                />
                <input
                  id="depopt-id"
                  type="text"
                  placeholder="Option ID"
                  className={inputClass}
                />
                <input
                  id="depopt-label"
                  type="text"
                  placeholder="Option Label"
                  className={inputClass}
                />
              </div>
            )}
            {Object.keys(editingDependencies).length > 0 && (
              <button
                onClick={() => {
                  const childEl = document.getElementById("depopt-child") as HTMLSelectElement;
                  const parentValEl = document.getElementById("depopt-parent-val") as HTMLInputElement;
                  const idEl = document.getElementById("depopt-id") as HTMLInputElement;
                  const labelEl = document.getElementById("depopt-label") as HTMLInputElement;
                  if (childEl && parentValEl && idEl && labelEl) {
                    handleAddDependentOption(childEl.value, parentValEl.value, idEl.value, labelEl.value);
                    idEl.value = "";
                    labelEl.value = "";
                  }
                }}
                className={`mt-2 ${buttonPrimaryClass}`}
              >
                Add Option
              </button>
            )}
            {Object.keys(editingDependencies).length === 0 && (
              <p className={`text-sm ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                Add column dependencies first.
              </p>
            )}
          </div>

          {/* Section 3: Emission Category Mapping */}
          <div className={`p-4 rounded-md ${isDark ? "bg-slate-700" : "bg-gray-50"}`}>
            <h3 className={`font-medium mb-3 ${isDark ? "text-slate-200" : "text-gray-700"}`}>
              3. Emission Category Mapping
            </h3>
            <p className={`text-xs mb-3 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
              Map column value combinations to emission category names. Click &quot;Generate from Dependencies&quot; to auto-create all combinations.
            </p>

            {/* Generate Button */}
            <button
              onClick={generateMappingsFromDependencies}
              disabled={Object.keys(editingDependentOptions).length === 0}
              className={`mb-3 ${isDark ? "px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50" : "px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50"}`}
            >
              Generate from Dependencies
            </button>
            {Object.keys(editingDependentOptions).length === 0 && (
              <p className={`text-xs mb-3 ${isDark ? "text-yellow-400" : "text-yellow-600"}`}>
                Configure dependent options in Section 2 first to enable auto-generation.
              </p>
            )}

            {/* Current Mappings - Editable */}
            {Object.keys(editingEmissionMapping).length > 0 && (
              <div className={`mb-3 border rounded-md max-h-60 overflow-y-auto ${isDark ? "border-slate-600" : "border-gray-300"}`}>
                <table className="w-full">
                  <thead className={`sticky top-0 ${isDark ? "bg-slate-600" : "bg-gray-100"}`}>
                    <tr>
                      <th className={`px-3 py-2 text-left text-xs font-medium ${isDark ? "text-slate-300" : "text-gray-600"}`}>
                        Value Combination (Parent|Child)
                      </th>
                      <th className={`px-3 py-2 text-left text-xs font-medium ${isDark ? "text-slate-300" : "text-gray-600"}`}>
                        Emission Category Name
                      </th>
                      <th className="px-3 py-2 w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(editingEmissionMapping).map(([key, value]) => (
                      <tr key={key} className={isDark ? "border-t border-slate-600" : "border-t border-gray-200"}>
                        <td className={`px-3 py-2 text-xs font-medium ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                          {key}
                        </td>
                        <td className="px-3 py-1">
                          <input
                            type="text"
                            value={value}
                            onChange={(e) => handleUpdateMappingValue(key, e.target.value)}
                            placeholder="Enter emission category name"
                            className={`w-full px-2 py-1 text-xs border rounded ${isDark ? "border-slate-500 bg-slate-600 text-slate-100" : "border-gray-300 bg-white text-gray-900"}`}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => handleRemoveMapping(key)}
                            className={buttonDangerClass}
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

            {/* Manual Add Mapping */}
            <details className={`mt-3 ${isDark ? "text-slate-300" : "text-gray-600"}`}>
              <summary className="cursor-pointer text-xs hover:underline">Add mapping manually</summary>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <input
                  type="text"
                  value={newMappingKey}
                  onChange={(e) => setNewMappingKey(e.target.value)}
                  placeholder="e.g., Paper|Recycled"
                  className={inputClass}
                />
                <input
                  type="text"
                  value={newMappingValue}
                  onChange={(e) => setNewMappingValue(e.target.value)}
                  placeholder="e.g., Paper - Recycled"
                  className={inputClass}
                />
              </div>
              <button
                onClick={handleAddMapping}
                disabled={!newMappingKey.trim() || !newMappingValue.trim()}
                className={`mt-2 ${buttonPrimaryClass}`}
              >
                Add Mapping
              </button>
            </details>
          </div>

          {/* Actions */}
          <div className={`flex justify-end gap-3 pt-4 border-t ${isDark ? "border-slate-600" : "border-gray-200"}`}>
            <button
              onClick={() => {
                setDependencyModalOpen(false);
                setSelectedConfig(null);
              }}
              className={buttonSecondaryClass}
            >
              Cancel
            </button>
            <button
              onClick={handleSaveDependencies}
              className={buttonPrimaryClass}
            >
              Save Configuration
            </button>
          </div>
        </div>
      </Modal>

      {/* Extra Fields Modal */}
      <Modal
        isOpen={extraFieldsModalOpen}
        onClose={() => setExtraFieldsModalOpen(false)}
        title={`Extra Fields — ${extraFieldsConfig?.category?.category_name || ""} (${extraFieldsConfig?.site?.name || ""})`}
        isDark={isDark}
        className="max-w-3xl!"
      >
        <div className="space-y-4">
          <p className={`text-sm ${isDark ? "text-slate-400" : "text-gray-500"}`}>
            Supplementary fields stored in <code>extra_data</code>. These don&apos;t affect emission calculations.
          </p>

          {editingExtraFields.length === 0 ? (
            <p className={`text-sm italic ${isDark ? "text-slate-500" : "text-gray-400"}`}>
              No extra fields configured. Click &quot;Add Field&quot; below.
            </p>
          ) : (
            <div className={`border rounded-md overflow-hidden ${isDark ? "border-slate-600" : "border-gray-300"}`}>
              <table className="w-full text-sm">
                <thead className={isDark ? "bg-slate-700" : "bg-gray-100"}>
                  <tr>
                    <th className={`px-3 py-2 text-left font-medium ${isDark ? "text-slate-300" : "text-gray-600"}`}>Key</th>
                    <th className={`px-3 py-2 text-left font-medium ${isDark ? "text-slate-300" : "text-gray-600"}`}>Label</th>
                    <th className={`px-3 py-2 text-left font-medium ${isDark ? "text-slate-300" : "text-gray-600"}`}>Type</th>
                    <th className={`px-3 py-2 text-left font-medium ${isDark ? "text-slate-300" : "text-gray-600"}`}>Required</th>
                    <th className={`px-3 py-2 text-left font-medium ${isDark ? "text-slate-300" : "text-gray-600"}`}>Options / Show For</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {editingExtraFields.map((field, idx) => (
                    <tr key={idx} className={`border-t ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={field.key}
                          onChange={(e) => updateExtraField(idx, { key: e.target.value })}
                          placeholder="field_key"
                          className={`w-full px-2 py-1 rounded text-sm border ${isDark ? "bg-slate-800 border-slate-600 text-slate-200" : "border-gray-300"}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={field.label}
                          onChange={(e) => updateExtraField(idx, { label: e.target.value })}
                          placeholder="Display Label"
                          className={`w-full px-2 py-1 rounded text-sm border ${isDark ? "bg-slate-800 border-slate-600 text-slate-200" : "border-gray-300"}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={field.type}
                          onChange={(e) => updateExtraField(idx, { type: e.target.value as ExtraFieldDefinition["type"] })}
                          className={`w-full px-2 py-1 rounded text-sm border ${isDark ? "bg-slate-800 border-slate-600 text-slate-200" : "border-gray-300"}`}
                        >
                          <option value="text">Text</option>
                          <option value="number">Number</option>
                          <option value="date">Date</option>
                          <option value="select">Select</option>
                          <option value="textarea">Textarea</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => updateExtraField(idx, { required: e.target.checked })}
                          className="w-4 h-4"
                        />
                      </td>
                      <td className="px-3 py-2">
                        {field.type === "select" && (
                          <input
                            type="text"
                            value={(field.options || []).join(", ")}
                            onChange={(e) =>
                              updateExtraField(idx, {
                                options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                              })
                            }
                            placeholder="opt1, opt2, opt3"
                            className={`w-full px-2 py-1 rounded text-sm border ${isDark ? "bg-slate-800 border-slate-600 text-slate-200" : "border-gray-300"}`}
                          />
                        )}
                        {field.type !== "select" && (
                          <input
                            type="text"
                            value={(field.show_for || []).join(", ")}
                            onChange={(e) =>
                              updateExtraField(idx, {
                                show_for: e.target.value ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
                              })
                            }
                            placeholder="show_for (optional)"
                            className={`w-full px-2 py-1 rounded text-sm border ${isDark ? "bg-slate-800 border-slate-600 text-slate-200 placeholder-slate-500" : "border-gray-300 placeholder-gray-400"}`}
                          />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => removeExtraField(idx)}
                          className={buttonDangerClass}
                          title="Remove field"
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

          <div className="flex justify-between items-center pt-2">
            <button onClick={addExtraField} className={`text-sm ${isDark ? "text-blue-400 hover:text-blue-300" : "text-blue-600 hover:text-blue-700"}`}>
              + Add Field
            </button>
            <div className="flex gap-2">
              <button onClick={() => setExtraFieldsModalOpen(false)} className={buttonSecondaryClass}>
                Cancel
              </button>
              <button
                onClick={handleSaveExtraFields}
                disabled={savingExtraFields}
                className={buttonPrimaryClass}
              >
                {savingExtraFields ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Unified Edit Column Config Modal */}
      {editModalConfig && (
        <EditColumnConfigModal
          isOpen={editModalOpen}
          onClose={() => {
            setEditModalOpen(false);
            setEditModalConfig(null);
          }}
          config={editModalConfig}
          allColumns={allColumns}
          isDark={isDark}
          onSave={(updatedConfig) => {
            setColumnConfigs((prev) =>
              prev.map((c) =>
                c.pk_id === updatedConfig.pk_id ? updatedConfig : c
              )
            );
            setEditModalOpen(false);
            setEditModalConfig(null);
          }}
        />
      )}
    </>
  );
};

export default ColumnConfigList;
