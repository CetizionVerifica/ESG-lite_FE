import { useState, useEffect, useCallback } from "react";
import {
  getColumnConfigs,
  getColumnConfigsBySite,
  getColumnConfigsBySiteAndCategory,
  deleteColumnConfig,
  updateColumnConfig,
  previewAutoGenerateColumnConfig,
  ColumnOptionsMap,
  ColumnDependencies,
  DependentOptionsMap,
  EmissionCategoryMapping,
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
  column_dependencies?: ColumnDependencies;
  dependent_options?: DependentOptionsMap;
  emission_category_mapping?: EmissionCategoryMapping;
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

  // Auto-fill state
  const [autoFillingConfigId, setAutoFillingConfigId] = useState<number | null>(null);

  // Auto-fill preview modal state
  const [autoFillModalOpen, setAutoFillModalOpen] = useState(false);
  const [autoFillConfig, setAutoFillConfig] = useState<ColumnConfigEntity | null>(null);
  const [autoFillProposal, setAutoFillProposal] = useState<{
    column_options: ColumnOptionsMap;
    column_dependencies: ColumnDependencies;
    dependent_options: DependentOptionsMap;
    emission_category_mapping: EmissionCategoryMapping;
    pattern: string;
  } | null>(null);
  const [autoFillSections, setAutoFillSections] = useState({
    column_options: true,
    column_dependencies: true,
    dependent_options: true,
    emission_category_mapping: true,
  });
  const [applyingAutoFill, setApplyingAutoFill] = useState(false);

  // Modal state for dependent dropdown configuration
  const [dependencyModalOpen, setDependencyModalOpen] = useState(false);
  const [editingDependencies, setEditingDependencies] = useState<ColumnDependencies>({});
  const [editingDependentOptions, setEditingDependentOptions] = useState<DependentOptionsMap>({});
  const [editingEmissionMapping, setEditingEmissionMapping] = useState<EmissionCategoryMapping>({});
  const [newMappingKey, setNewMappingKey] = useState("");
  const [newMappingValue, setNewMappingValue] = useState("");

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

  // Auto-fill: open preview modal with proposal data
  const handleAutoFillPreview = async (config: ColumnConfigEntity) => {
    if (!config.site?.site_id || !config.category?.category_id) return;
    if (config.columns.length === 0) {
      alert("Add columns to this config first before auto-filling.");
      return;
    }

    setAutoFillingConfigId(config.pk_id);
    try {
      const proposal = await previewAutoGenerateColumnConfig(
        config.site.site_id,
        config.category.category_id
      );

      if (!proposal.configs || proposal.configs.length === 0) {
        alert("No emission factors found for this site + category.");
        return;
      }

      const group = proposal.configs[0];

      // Match proposed columns to existing config columns by type + position.
      // The generator creates: [select1, select2, ..., number] in order.
      // The existing config may have the same structure with different names.
      const proposedSelect = group.columns.filter(c => c.column_type === "select");
      const existingSelect = config.columns.filter(c => c.column_type === "select");

      // Build proposedName → { configName, pkId } mapping by matching position
      const nameMap: Record<string, { configName: string; pkId: number }> = {};
      for (let i = 0; i < proposedSelect.length && i < existingSelect.length; i++) {
        nameMap[proposedSelect[i].column_name] = {
          configName: existingSelect[i].column_name,
          pkId: existingSelect[i].pk_id,
        };
      }
      // Also map number columns
      const proposedNumber = group.columns.filter(c => c.column_type === "number");
      const existingNumber = config.columns.filter(c => c.column_type === "number");
      for (let i = 0; i < proposedNumber.length && i < existingNumber.length; i++) {
        nameMap[proposedNumber[i].column_name] = {
          configName: existingNumber[i].column_name,
          pkId: existingNumber[i].pk_id,
        };
      }

      // Helper: remap a proposed column name to the config's column name
      const remap = (name: string) => nameMap[name]?.configName || name;

      // Remap column_options keys from proposed names to pk_ids
      const remappedOptions: ColumnOptionsMap = {};
      for (const [colName, opts] of Object.entries(group.column_options)) {
        const mapped = nameMap[colName];
        if (mapped) {
          remappedOptions[mapped.pkId.toString()] = opts;
        }
      }

      // Remap column_dependencies keys (child → parent) using config column names
      const remappedDeps: ColumnDependencies = {};
      for (const [child, parent] of Object.entries(group.column_dependencies)) {
        remappedDeps[remap(child)] = remap(parent);
      }

      // Remap dependent_options keys using config column names
      const remappedDepOpts: DependentOptionsMap = {};
      for (const [childCol, parentOpts] of Object.entries(group.dependent_options)) {
        remappedDepOpts[remap(childCol)] = parentOpts;
      }

      setAutoFillConfig(config);
      setAutoFillProposal({
        column_options: remappedOptions,
        column_dependencies: remappedDeps,
        dependent_options: remappedDepOpts,
        emission_category_mapping: group.emission_category_mapping,
        pattern: group.pattern,
      });
      // Pre-check all sections
      setAutoFillSections({
        column_options: true,
        column_dependencies: true,
        dependent_options: true,
        emission_category_mapping: true,
      });
      setAutoFillModalOpen(true);
    } catch (err: any) {
      console.error("Auto-fill error:", err);
      alert(
        err?.response?.data?.message || err?.message || "Failed to auto-fill config"
      );
    } finally {
      setAutoFillingConfigId(null);
    }
  };

  // Auto-fill: apply only selected sections
  const handleApplyAutoFill = async () => {
    if (!autoFillConfig || !autoFillProposal) return;

    setApplyingAutoFill(true);
    try {
      const updatePayload: any = {};
      if (autoFillSections.column_options) {
        updatePayload.column_options = autoFillProposal.column_options;
      }
      if (autoFillSections.column_dependencies) {
        updatePayload.column_dependencies = autoFillProposal.column_dependencies;
      }
      if (autoFillSections.dependent_options) {
        updatePayload.dependent_options = autoFillProposal.dependent_options;
      }
      if (autoFillSections.emission_category_mapping) {
        updatePayload.emission_category_mapping = autoFillProposal.emission_category_mapping;
      }

      if (Object.keys(updatePayload).length === 0) {
        alert("Select at least one section to apply.");
        setApplyingAutoFill(false);
        return;
      }

      await updateColumnConfig(autoFillConfig.pk_id, updatePayload);

      // Update local state — only merge selected sections
      setColumnConfigs((prev) =>
        prev.map((item) =>
          item.pk_id === autoFillConfig.pk_id
            ? { ...item, ...updatePayload }
            : item
        )
      );

      setAutoFillModalOpen(false);
      setAutoFillConfig(null);
      setAutoFillProposal(null);
    } catch (err: any) {
      console.error("Auto-fill apply error:", err);
      alert(
        err?.response?.data?.message || err?.message || "Failed to apply auto-fill"
      );
    } finally {
      setApplyingAutoFill(false);
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
      key: "pk_id" as keyof ColumnConfigEntity,
      label: "Auto-fill",
      editable: false,
      render: (_value, row) => {
        const isLoading = autoFillingConfigId === row.pk_id;
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleAutoFillPreview(row);
            }}
            disabled={isLoading || row.columns.length === 0}
            className={`text-xs px-2 py-1 rounded transition-colors ${
              isLoading
                ? "bg-purple-100 text-purple-500 cursor-wait"
                : isDark
                  ? "bg-purple-900 text-purple-300 hover:bg-purple-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  : "bg-purple-100 text-purple-700 hover:bg-purple-200 disabled:opacity-40 disabled:cursor-not-allowed"
            }`}
            title={row.columns.length === 0 ? "Add columns first" : "Auto-fill options, dependencies & mappings from emission factors"}
          >
            {isLoading ? "Loading..." : "Auto-fill"}
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

      {/* Auto-fill Preview Modal */}
      <Modal
        isOpen={autoFillModalOpen}
        onClose={() => {
          setAutoFillModalOpen(false);
          setAutoFillConfig(null);
          setAutoFillProposal(null);
        }}
        title={`Auto-fill Preview — ${autoFillConfig?.site?.name || ""} / ${autoFillConfig?.category?.category_name || ""}`}
        isDark={isDark}
      >
        {autoFillProposal && autoFillConfig && (
          <div className="space-y-4">
            <p className={`text-sm ${isDark ? "text-slate-400" : "text-gray-500"}`}>
              Pattern detected: <span className="font-semibold">{autoFillProposal.pattern}</span>.
              Select which sections to apply:
            </p>

            {/* Section: Column Options */}
            {(() => {
              const currentCount = Object.values(autoFillConfig.column_options || {}).reduce((sum, opts) => sum + opts.length, 0);
              const proposedCount = Object.values(autoFillProposal.column_options).reduce((sum, opts) => sum + opts.length, 0);
              return (
                <div className={`p-3 rounded-md border ${autoFillSections.column_options ? (isDark ? "border-blue-500 bg-slate-700" : "border-blue-400 bg-blue-50") : (isDark ? "border-slate-600 bg-slate-800" : "border-gray-200 bg-gray-50")}`}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoFillSections.column_options}
                      onChange={(e) => setAutoFillSections(s => ({ ...s, column_options: e.target.checked }))}
                      className="w-4 h-4"
                    />
                    <span className={`font-medium text-sm ${isDark ? "text-slate-200" : "text-gray-700"}`}>
                      Column Options
                    </span>
                    <span className={`text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                      (current: {currentCount} options → proposed: {proposedCount} options)
                    </span>
                  </label>
                  {autoFillSections.column_options && (
                    <div className={`mt-2 ml-6 text-xs space-y-1 ${isDark ? "text-slate-300" : "text-gray-600"}`}>
                      {Object.entries(autoFillProposal.column_options).map(([colId, opts]) => {
                        const col = autoFillConfig.columns.find(c => c.pk_id.toString() === colId);
                        return (
                          <div key={colId}>
                            <span className="font-medium">{col?.column_name || colId}:</span>{" "}
                            {opts.map(o => o.label).join(", ")}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Section: Column Dependencies */}
            {(() => {
              const currentCount = Object.keys(autoFillConfig.column_dependencies || {}).length;
              const proposedCount = Object.keys(autoFillProposal.column_dependencies).length;
              return (
                <div className={`p-3 rounded-md border ${autoFillSections.column_dependencies ? (isDark ? "border-blue-500 bg-slate-700" : "border-blue-400 bg-blue-50") : (isDark ? "border-slate-600 bg-slate-800" : "border-gray-200 bg-gray-50")}`}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoFillSections.column_dependencies}
                      onChange={(e) => setAutoFillSections(s => ({ ...s, column_dependencies: e.target.checked }))}
                      className="w-4 h-4"
                    />
                    <span className={`font-medium text-sm ${isDark ? "text-slate-200" : "text-gray-700"}`}>
                      Column Dependencies
                    </span>
                    <span className={`text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                      (current: {currentCount} → proposed: {proposedCount})
                    </span>
                  </label>
                  {autoFillSections.column_dependencies && proposedCount > 0 && (
                    <div className={`mt-2 ml-6 text-xs space-y-1 ${isDark ? "text-slate-300" : "text-gray-600"}`}>
                      {Object.entries(autoFillProposal.column_dependencies).map(([child, parent]) => (
                        <div key={child}>
                          <span className="font-medium">{child}</span> depends on <span className="font-medium">{parent}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Section: Dependent Options */}
            {(() => {
              const currentCount = Object.values(autoFillConfig.dependent_options || {}).reduce(
                (sum, parentOpts) => sum + Object.values(parentOpts).reduce((s, opts) => s + opts.length, 0), 0
              );
              const proposedCount = Object.values(autoFillProposal.dependent_options).reduce(
                (sum, parentOpts) => sum + Object.values(parentOpts).reduce((s, opts) => s + opts.length, 0), 0
              );
              return (
                <div className={`p-3 rounded-md border ${autoFillSections.dependent_options ? (isDark ? "border-blue-500 bg-slate-700" : "border-blue-400 bg-blue-50") : (isDark ? "border-slate-600 bg-slate-800" : "border-gray-200 bg-gray-50")}`}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoFillSections.dependent_options}
                      onChange={(e) => setAutoFillSections(s => ({ ...s, dependent_options: e.target.checked }))}
                      className="w-4 h-4"
                    />
                    <span className={`font-medium text-sm ${isDark ? "text-slate-200" : "text-gray-700"}`}>
                      Dependent Options
                    </span>
                    <span className={`text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                      (current: {currentCount} options → proposed: {proposedCount} options)
                    </span>
                  </label>
                  {autoFillSections.dependent_options && Object.keys(autoFillProposal.dependent_options).length > 0 && (
                    <div className={`mt-2 ml-6 text-xs max-h-32 overflow-y-auto space-y-1 ${isDark ? "text-slate-300" : "text-gray-600"}`}>
                      {Object.entries(autoFillProposal.dependent_options).map(([childCol, parentOpts]) => (
                        <div key={childCol}>
                          <span className="font-medium">{childCol}:</span>{" "}
                          {Object.entries(parentOpts).map(([parentVal, opts]) => (
                            <span key={parentVal}>
                              {parentVal} → [{opts.map(o => o.label).join(", ")}]{" "}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Section: Emission Category Mapping */}
            {(() => {
              const currentCount = Object.keys(autoFillConfig.emission_category_mapping || {}).length;
              const proposedCount = Object.keys(autoFillProposal.emission_category_mapping).length;
              return (
                <div className={`p-3 rounded-md border ${autoFillSections.emission_category_mapping ? (isDark ? "border-blue-500 bg-slate-700" : "border-blue-400 bg-blue-50") : (isDark ? "border-slate-600 bg-slate-800" : "border-gray-200 bg-gray-50")}`}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoFillSections.emission_category_mapping}
                      onChange={(e) => setAutoFillSections(s => ({ ...s, emission_category_mapping: e.target.checked }))}
                      className="w-4 h-4"
                    />
                    <span className={`font-medium text-sm ${isDark ? "text-slate-200" : "text-gray-700"}`}>
                      Emission Category Mapping
                    </span>
                    <span className={`text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                      (current: {currentCount} → proposed: {proposedCount} mappings)
                    </span>
                  </label>
                  {autoFillSections.emission_category_mapping && proposedCount > 0 && (
                    <div className={`mt-2 ml-6 max-h-40 overflow-y-auto ${isDark ? "border-slate-600" : "border-gray-300"}`}>
                      <table className="w-full text-xs">
                        <thead className={`sticky top-0 ${isDark ? "bg-slate-600" : "bg-gray-100"}`}>
                          <tr>
                            <th className={`px-2 py-1 text-left font-medium ${isDark ? "text-slate-300" : "text-gray-600"}`}>Key</th>
                            <th className={`px-2 py-1 text-left font-medium ${isDark ? "text-slate-300" : "text-gray-600"}`}>Emission Category</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(autoFillProposal.emission_category_mapping).slice(0, 20).map(([key, val]) => (
                            <tr key={key} className={isDark ? "border-t border-slate-600" : "border-t border-gray-200"}>
                              <td className={`px-2 py-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>{key}</td>
                              <td className={`px-2 py-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>{val}</td>
                            </tr>
                          ))}
                          {Object.keys(autoFillProposal.emission_category_mapping).length > 20 && (
                            <tr>
                              <td colSpan={2} className={`px-2 py-1 italic ${isDark ? "text-slate-400" : "text-gray-400"}`}>
                                ...and {Object.keys(autoFillProposal.emission_category_mapping).length - 20} more
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Actions */}
            <div className={`flex justify-end gap-3 pt-4 border-t ${isDark ? "border-slate-600" : "border-gray-200"}`}>
              <button
                onClick={() => {
                  setAutoFillModalOpen(false);
                  setAutoFillConfig(null);
                  setAutoFillProposal(null);
                }}
                className={buttonSecondaryClass}
              >
                Cancel
              </button>
              <button
                onClick={handleApplyAutoFill}
                disabled={applyingAutoFill || !Object.values(autoFillSections).some(Boolean)}
                className={buttonPrimaryClass}
              >
                {applyingAutoFill ? "Applying..." : "Apply Selected"}
              </button>
            </div>
          </div>
        )}
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
    </>
  );
};

export default ColumnConfigList;
