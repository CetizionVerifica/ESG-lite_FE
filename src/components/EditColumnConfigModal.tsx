import { useState, useEffect, useCallback, useRef } from "react";
import Modal from "./Modal";
import {
  updateColumnConfig,
  ColumnOptionsMap,
  ColumnDependencies,
  DependentOptionsMap,
  EmissionCategoryMapping,
  ExtraFieldDefinition,
} from "../services/columnConfigService";
import { DropdownOptionValue } from "../services/columnService";

// ─── Types ────────────────────────────────────────────────────────────────────

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

type EditTab = "columns" | "options" | "dependencies" | "mappings" | "extra_fields";

interface EditColumnConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ColumnConfigEntity;
  allColumns: ColumnEntity[];
  onSave: (updatedConfig: ColumnConfigEntity) => void;
  isDark?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

const EditColumnConfigModal = ({
  isOpen,
  onClose,
  config,
  allColumns,
  onSave,
  isDark = false,
}: EditColumnConfigModalProps) => {
  const [configName, setConfigName] = useState("");
  const [editColumns, setEditColumns] = useState<ColumnEntity[]>([]);
  const [editColumnOptions, setEditColumnOptions] = useState<ColumnOptionsMap>({});
  const [editDependencies, setEditDependencies] = useState<ColumnDependencies>({});
  const [editDependentOptions, setEditDependentOptions] = useState<DependentOptionsMap>({});
  const [editMappings, setEditMappings] = useState<EmissionCategoryMapping>({});
  const [editExtraFields, setEditExtraFields] = useState<ExtraFieldDefinition[]>([]);
  const [activeTab, setActiveTab] = useState<EditTab>("columns");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track column renames: pk_id → { oldName, newName }
  const columnRenamesRef = useRef<Map<number, { oldName: string; newName: string }>>(new Map());

  // New option inputs for Options tab
  const [newOptCol, setNewOptCol] = useState<string>("");
  const [newOptId, setNewOptId] = useState("");
  const [newOptLabel, setNewOptLabel] = useState("");

  // New dependency inputs
  const [newDepChild, setNewDepChild] = useState("");
  const [newDepParent, setNewDepParent] = useState("");

  // New dependent option inputs
  const [newDepOptChild, setNewDepOptChild] = useState("");
  const [newDepOptParent, setNewDepOptParent] = useState("");
  const [newDepOptId, setNewDepOptId] = useState("");
  const [newDepOptLabel, setNewDepOptLabel] = useState("");

  // New mapping inputs
  const [newMappingKey, setNewMappingKey] = useState("");
  const [newMappingValue, setNewMappingValue] = useState("");

  // ─── Initialize from config ───────────────────────────────────────────────

  const initFromConfig = useCallback(() => {
    setConfigName(config.config_name);
    setEditColumns(JSON.parse(JSON.stringify(config.columns || [])));
    columnRenamesRef.current = new Map();

    // Convert column_options keys: pk_id string → column_name if needed
    const rawOpts = config.column_options || {};
    const converted: ColumnOptionsMap = {};
    for (const [key, val] of Object.entries(rawOpts)) {
      // Check if key is a numeric pk_id
      const col = config.columns.find((c) => c.pk_id.toString() === key);
      converted[col ? col.column_name : key] = JSON.parse(JSON.stringify(val));
    }
    setEditColumnOptions(converted);

    setEditDependencies(JSON.parse(JSON.stringify(config.column_dependencies || {})));
    setEditDependentOptions(JSON.parse(JSON.stringify(config.dependent_options || {})));
    setEditMappings(JSON.parse(JSON.stringify(config.emission_category_mapping || {})));
    setEditExtraFields(JSON.parse(JSON.stringify(config.extra_fields || [])));
    setActiveTab("columns");
    setError(null);
  }, [config]);

  useEffect(() => {
    if (isOpen) initFromConfig();
  }, [isOpen, initFromConfig]);

  // ─── Column handlers ──────────────────────────────────────────────────────

  const selectColumns = editColumns.filter((c) => c.column_type === "select");

  const handleColumnNameChange = (colIdx: number, newName: string) => {
    const col = editColumns[colIdx];
    const oldName = col.column_name;
    if (oldName === newName) return;

    // Track rename: use original name from config as the old name
    const existing = columnRenamesRef.current.get(col.pk_id);
    const originalName = existing ? existing.oldName : oldName;
    if (originalName === newName) {
      // Reverted to original name, remove from renames
      columnRenamesRef.current.delete(col.pk_id);
    } else {
      columnRenamesRef.current.set(col.pk_id, { oldName: originalName, newName });
    }

    // Update columns
    setEditColumns((prev) =>
      prev.map((c, i) => (i === colIdx ? { ...c, column_name: newName } : c))
    );

    // Cascade rename to column_options
    setEditColumnOptions((prev) => {
      const updated: ColumnOptionsMap = {};
      for (const [k, v] of Object.entries(prev)) {
        updated[k === oldName ? newName : k] = v;
      }
      return updated;
    });

    // Cascade rename to dependencies (both keys and values)
    setEditDependencies((prev) => {
      const updated: ColumnDependencies = {};
      for (const [child, parent] of Object.entries(prev)) {
        const newChild = child === oldName ? newName : child;
        const newParent = parent === oldName ? newName : parent;
        updated[newChild] = newParent;
      }
      return updated;
    });

    // Cascade rename to dependent_options keys
    setEditDependentOptions((prev) => {
      const updated: DependentOptionsMap = {};
      for (const [k, v] of Object.entries(prev)) {
        updated[k === oldName ? newName : k] = v;
      }
      return updated;
    });
  };

  const handleSwapDimensions = (idxA: number, idxB: number) => {
    const selCols = editColumns.filter((c) => c.column_type === "select");
    if (idxA < 0 || idxB < 0 || idxA >= selCols.length || idxB >= selCols.length) return;

    setEditColumns((prev) => {
      const updated = [...prev];
      const globalA = prev.indexOf(selCols[idxA]);
      const globalB = prev.indexOf(selCols[idxB]);
      [updated[globalA], updated[globalB]] = [updated[globalB], updated[globalA]];
      return updated;
    });
  };

  const handleRemoveColumn = (colIdx: number) => {
    const colName = editColumns[colIdx].column_name;
    setEditColumns((prev) => prev.filter((_, i) => i !== colIdx));

    // Clean up options
    setEditColumnOptions((prev) => {
      const updated = { ...prev };
      delete updated[colName];
      return updated;
    });

    // Clean up dependencies
    setEditDependencies((prev) => {
      const updated: ColumnDependencies = {};
      for (const [child, parent] of Object.entries(prev)) {
        if (child !== colName && parent !== colName) {
          updated[child] = parent;
        }
      }
      return updated;
    });

    // Clean up dependent options
    setEditDependentOptions((prev) => {
      const updated = { ...prev };
      delete updated[colName];
      return updated;
    });
  };

  const handleAddExistingColumn = (colId: number) => {
    const col = allColumns.find((c) => c.pk_id === colId);
    if (!col || editColumns.some((c) => c.pk_id === colId)) return;
    setEditColumns((prev) => [...prev, JSON.parse(JSON.stringify(col))]);
  };

  // ─── Options handlers ─────────────────────────────────────────────────────

  const handleRemoveOption = (colName: string, optIndex: number) => {
    setEditColumnOptions((prev) => {
      const updated = { ...prev };
      if (updated[colName]) {
        updated[colName] = updated[colName].filter((_, i) => i !== optIndex);
      }
      return updated;
    });
  };

  const handleAddOption = (colName: string, id: string, label: string) => {
    if (!id.trim() || !label.trim()) return;
    setEditColumnOptions((prev) => {
      const updated = { ...prev };
      if (!updated[colName]) updated[colName] = [];
      if (updated[colName].some((o) => String(o.id) === id.trim())) return prev;
      updated[colName] = [...updated[colName], { id: id.trim(), label: label.trim() }];
      return updated;
    });
  };

  // ─── Dependency handlers ──────────────────────────────────────────────────

  const handleAddDependency = (childCol: string, parentCol: string) => {
    if (!childCol || !parentCol || childCol === parentCol) return;
    setEditDependencies((prev) => ({ ...prev, [childCol]: parentCol }));
  };

  const handleRemoveDependency = (childCol: string) => {
    setEditDependencies((prev) => {
      const updated = { ...prev };
      delete updated[childCol];
      return updated;
    });
    setEditDependentOptions((prev) => {
      const updated = { ...prev };
      delete updated[childCol];
      return updated;
    });
  };

  const handleAddDependentOption = (
    childCol: string,
    parentValue: string,
    optionId: string,
    optionLabel: string
  ) => {
    if (!childCol || !parentValue || !optionId || !optionLabel) return;
    setEditDependentOptions((prev) => {
      const updated = { ...prev };
      if (!updated[childCol]) updated[childCol] = {};
      if (!updated[childCol][parentValue]) updated[childCol][parentValue] = [];
      if (updated[childCol][parentValue].some((o) => String(o.id) === optionId)) return prev;
      updated[childCol][parentValue] = [
        ...updated[childCol][parentValue],
        { id: optionId, label: optionLabel },
      ];
      return updated;
    });
  };

  const handleRemoveDependentOption = (childCol: string, parentValue: string, optionIndex: number) => {
    setEditDependentOptions((prev) => {
      const updated = { ...prev };
      if (updated[childCol]?.[parentValue]) {
        updated[childCol][parentValue] = updated[childCol][parentValue].filter((_, i) => i !== optionIndex);
        if (updated[childCol][parentValue].length === 0) delete updated[childCol][parentValue];
        if (Object.keys(updated[childCol]).length === 0) delete updated[childCol];
      }
      return updated;
    });
  };

  // ─── Mapping handlers ─────────────────────────────────────────────────────

  const handleAddMapping = () => {
    if (!newMappingKey.trim() || !newMappingValue.trim()) return;
    setEditMappings((prev) => ({ ...prev, [newMappingKey.trim()]: newMappingValue.trim() }));
    setNewMappingKey("");
    setNewMappingValue("");
  };

  const handleRemoveMapping = (key: string) => {
    setEditMappings((prev) => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
  };

  const handleUpdateMappingValue = (key: string, value: string) => {
    setEditMappings((prev) => ({ ...prev, [key]: value }));
  };

  const generateMappingsFromDependencies = () => {
    const newMappings: EmissionCategoryMapping = { ...editMappings };
    Object.entries(editDependentOptions).forEach(([_childCol, parentOptions]) => {
      Object.entries(parentOptions).forEach(([parentValue, childOptions]) => {
        childOptions.forEach((childOption) => {
          const key = `${parentValue}|${childOption.label}`;
          if (!newMappings[key]) {
            newMappings[key] = `${parentValue} - ${childOption.label}`;
          }
        });
      });
    });
    setEditMappings(newMappings);
  };

  // ─── Extra fields handlers ────────────────────────────────────────────────

  const addExtraField = () => {
    setEditExtraFields((prev) => [
      ...prev,
      { key: "", label: "", type: "text", required: false },
    ]);
  };

  const updateExtraField = (index: number, updates: Partial<ExtraFieldDefinition>) => {
    setEditExtraFields((prev) =>
      prev.map((f, i) => (i === index ? { ...f, ...updates } : f))
    );
  };

  const removeExtraField = (index: number) => {
    setEditExtraFields((prev) => prev.filter((_, i) => i !== index));
  };

  // ─── Save ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!configName.trim()) {
      setError("Config name is required.");
      return;
    }
    setSaving(true);
    setError(null);

    try {
      // Build rename map from tracked renames
      const renames = columnRenamesRef.current;
      const renameMap: Record<string, string> = {};
      for (const [, { oldName, newName }] of renames.entries()) {
        renameMap[oldName] = newName;
      }

      // Convert column_options keys back to pk_id strings for backend
      const optionsForSave: ColumnOptionsMap = {};
      for (const [colName, opts] of Object.entries(editColumnOptions)) {
        const col = editColumns.find((c) => c.column_name === colName);
        optionsForSave[col ? col.pk_id.toString() : colName] = opts;
      }

      const response = await updateColumnConfig(config.pk_id, {
        config_name: configName.trim(),
        column_ids: editColumns.map((c) => c.pk_id),
        column_options: optionsForSave,
        column_dependencies: editDependencies,
        dependent_options: editDependentOptions,
        emission_category_mapping: editMappings,
        extra_fields: editExtraFields,
        rename_map: Object.keys(renameMap).length > 0 ? renameMap : undefined,
      });

      // Use backend response if available (has correct pk_ids after shared column renames)
      const saved = response?.columnConfig;
      onSave(saved ? {
        ...saved,
        // Ensure JSONB fields from response are used (backend is source of truth)
        column_options: saved.column_options ?? optionsForSave,
        column_dependencies: saved.column_dependencies ?? editDependencies,
        dependent_options: saved.dependent_options ?? editDependentOptions,
        emission_category_mapping: saved.emission_category_mapping ?? editMappings,
        extra_fields: saved.extra_fields ?? editExtraFields,
      } : {
        ...config,
        config_name: configName.trim(),
        columns: editColumns,
        column_options: optionsForSave,
        column_dependencies: editDependencies,
        dependent_options: editDependentOptions,
        emission_category_mapping: editMappings,
        extra_fields: editExtraFields,
      });
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  // ─── Tab definitions ──────────────────────────────────────────────────────

  const depCount = Object.keys(editDependencies).length;
  const mappingCount = Object.keys(editMappings).length;
  const optionCount = Object.values(editColumnOptions).reduce((s, o) => s + o.length, 0);

  const tabs: { key: EditTab; label: string; count?: number }[] = [
    { key: "columns", label: "Columns", count: editColumns.length },
    { key: "options", label: "Options", count: optionCount },
    { key: "dependencies", label: "Dependencies", count: depCount },
    { key: "mappings", label: "Mappings", count: mappingCount },
    { key: "extra_fields", label: "Extra Fields", count: editExtraFields.length },
  ];

  // ─── Theme classes ────────────────────────────────────────────────────────

  const inputClass = isDark
    ? "w-full border border-slate-600 rounded-lg px-3 py-2 text-sm bg-slate-700 text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
    : "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent";

  const smallInputClass = isDark
    ? "px-2 py-1 rounded text-sm border bg-slate-800 border-slate-600 text-slate-200"
    : "px-2 py-1 rounded text-sm border border-gray-300";

  const cardClass = isDark
    ? "border border-slate-600 rounded-lg p-3 space-y-2"
    : "border border-gray-200 rounded-lg p-3 space-y-2";

  const labelClass = isDark ? "text-slate-400" : "text-gray-500";
  const textClass = isDark ? "text-slate-200" : "text-gray-900";
  const mutedClass = isDark ? "text-slate-500" : "text-gray-400";

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Column Config"
      isDark={isDark}
      className="!max-w-3xl"
    >
      <div className="space-y-4">
        {error && (
          <div className={`rounded-lg p-3 text-sm ${isDark ? "bg-red-900/30 border border-red-800/50 text-red-400" : "bg-red-50 border border-red-200 text-red-700"}`}>
            {error}
          </div>
        )}

        {/* Header: site/category + config name */}
        <div className="flex items-center gap-2 text-sm">
          <span className={labelClass}>{config.site?.name} / {config.category?.category_name}</span>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${isDark ? "bg-slate-700 text-slate-400" : "bg-gray-100 text-gray-600"}`}>
            ID: {config.pk_id}
          </span>
        </div>

        <div>
          <label className={`block text-xs font-medium mb-1 ${labelClass}`}>Config Name</label>
          <input
            type="text"
            value={configName}
            onChange={(e) => setConfigName(e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Tab navigation */}
        <div className={`flex gap-1 border-b ${isDark ? "border-slate-600" : "border-gray-200"}`}>
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === tab.key
                  ? isDark
                    ? "border-purple-400 text-purple-400"
                    : "border-purple-600 text-purple-700"
                  : isDark
                    ? "border-transparent text-slate-500 hover:text-slate-300"
                    : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span className={`ml-1 text-xs ${mutedClass}`}>({tab.count})</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className={`min-h-[240px] max-h-[400px] overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-thumb]:rounded-full ${isDark ? "[&::-webkit-scrollbar-track]:bg-slate-800 [&::-webkit-scrollbar-thumb]:bg-slate-600" : "[&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:hover:bg-gray-400"}`}>

          {/* ── Columns Tab ────────────────────────────────────────────── */}
          {activeTab === "columns" && (
            <div className="space-y-3 py-1">
              <p className={`text-xs mb-2 ${mutedClass}`}>
                Edit column names, reorder dimensions, and add or remove columns.
              </p>

              {/* Select (dimension) columns */}
              {selectColumns.map((col, dimIdx) => {
                const globalIdx = editColumns.indexOf(col);
                const opts = editColumnOptions[col.column_name] || [];
                const sampleValues = opts.slice(0, 6).map((o) => o.label);
                const moreCount = opts.length - sampleValues.length;

                return (
                  <div key={globalIdx} className={cardClass}>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ${isDark ? "bg-indigo-900/40 text-indigo-400" : "bg-indigo-100 text-indigo-700"}`}>
                        Dim {dimIdx + 1}
                      </span>
                      <input
                        type="text"
                        value={col.column_name}
                        onChange={(e) => handleColumnNameChange(globalIdx, e.target.value)}
                        className={`flex-1 ${smallInputClass}`}
                      />

                      {/* Swap buttons */}
                      <div className="flex flex-col shrink-0">
                        <button
                          onClick={() => handleSwapDimensions(dimIdx, dimIdx - 1)}
                          disabled={dimIdx === 0}
                          className={`${isDark ? "text-slate-500 hover:text-slate-300" : "text-gray-400 hover:text-gray-700"} disabled:opacity-20 disabled:cursor-not-allowed text-xs leading-none px-1 cursor-pointer`}
                          title="Move up"
                        >&#9650;</button>
                        <button
                          onClick={() => handleSwapDimensions(dimIdx, dimIdx + 1)}
                          disabled={dimIdx === selectColumns.length - 1}
                          className={`${isDark ? "text-slate-500 hover:text-slate-300" : "text-gray-400 hover:text-gray-700"} disabled:opacity-20 disabled:cursor-not-allowed text-xs leading-none px-1 cursor-pointer`}
                          title="Move down"
                        >&#9660;</button>
                      </div>

                      {/* Remove */}
                      <button
                        onClick={() => handleRemoveColumn(globalIdx)}
                        className={`text-xs shrink-0 px-1.5 py-0.5 rounded transition-colors cursor-pointer ${isDark ? "text-red-400 hover:text-red-300 hover:bg-red-900/30" : "text-red-400 hover:text-red-600 hover:bg-red-50"}`}
                        title="Remove this column"
                      >&times;</button>
                    </div>

                    {/* Sample values */}
                    {sampleValues.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {sampleValues.map((v, i) => (
                          <span key={i} className={`text-xs px-1.5 py-0.5 rounded ${isDark ? "bg-slate-700 text-slate-400" : "bg-gray-100 text-gray-500"}`}>
                            {v}
                          </span>
                        ))}
                        {moreCount > 0 && (
                          <span className={`text-xs ${mutedClass}`}>+{moreCount} more</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Number columns */}
              {editColumns
                .filter((c) => c.column_type === "number")
                .map((col) => {
                  const globalIdx = editColumns.indexOf(col);
                  return (
                    <div key={globalIdx} className={cardClass}>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ${isDark ? "bg-green-900/40 text-green-400" : "bg-green-100 text-green-700"}`}>
                          number
                        </span>
                        <input
                          type="text"
                          value={col.column_name}
                          onChange={(e) => handleColumnNameChange(globalIdx, e.target.value)}
                          className={`flex-1 ${smallInputClass}`}
                        />
                        <button
                          onClick={() => handleRemoveColumn(globalIdx)}
                          className={`text-xs shrink-0 px-1.5 py-0.5 rounded transition-colors cursor-pointer ${isDark ? "text-red-400 hover:text-red-300 hover:bg-red-900/30" : "text-red-400 hover:text-red-600 hover:bg-red-50"}`}
                          title="Remove this column"
                        >&times;</button>
                      </div>
                    </div>
                  );
                })}

              {/* Add existing column */}
              {(() => {
                const availableCols = allColumns.filter(
                  (c) => !editColumns.some((ec) => ec.pk_id === c.pk_id)
                );
                if (availableCols.length === 0) return null;
                return (
                  <div className={`flex items-center gap-2 pt-2 border-t ${isDark ? "border-slate-700" : "border-gray-100"}`}>
                    <select
                      className={`flex-1 ${smallInputClass}`}
                      defaultValue=""
                      onChange={(e) => {
                        const id = parseInt(e.target.value);
                        if (id) handleAddExistingColumn(id);
                        e.target.value = "";
                      }}
                    >
                      <option value="">+ Add existing column...</option>
                      {availableCols.map((c) => (
                        <option key={c.pk_id} value={c.pk_id}>{c.column_name} ({c.column_type})</option>
                      ))}
                    </select>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── Options Tab ────────────────────────────────────────────── */}
          {activeTab === "options" && (
            <div className="space-y-4 py-1">
              <p className={`text-xs mb-2 ${mutedClass}`}>
                Manage dropdown options for each select column.
              </p>

              {selectColumns.length === 0 ? (
                <p className={`text-sm italic ${mutedClass}`}>No select columns to configure.</p>
              ) : (
                selectColumns.map((col) => {
                  const opts = editColumnOptions[col.column_name] || [];
                  const isAddingToThis = newOptCol === col.column_name;

                  return (
                    <div key={col.column_name} className={cardClass}>
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${textClass}`}>
                          {col.column_name}
                          <span className={`ml-1.5 text-xs ${mutedClass}`}>({opts.length})</span>
                        </span>
                        <button
                          onClick={() => setNewOptCol(isAddingToThis ? "" : col.column_name)}
                          className={`text-xs px-2 py-0.5 rounded cursor-pointer ${isDark ? "text-purple-400 hover:bg-purple-900/30" : "text-purple-600 hover:bg-purple-50"}`}
                        >
                          {isAddingToThis ? "Cancel" : "+ Add"}
                        </button>
                      </div>

                      {/* Option tags */}
                      <div className="flex flex-wrap gap-1.5">
                        {opts.map((opt, i) => (
                          <span
                            key={i}
                            className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${isDark ? "bg-slate-700 text-slate-300" : "bg-gray-100 text-gray-700"}`}
                          >
                            {opt.label}
                            <button
                              onClick={() => handleRemoveOption(col.column_name, i)}
                              className={`ml-0.5 leading-none cursor-pointer ${isDark ? "text-slate-500 hover:text-red-400" : "text-gray-400 hover:text-red-500"}`}
                            >&times;</button>
                          </span>
                        ))}
                        {opts.length === 0 && (
                          <span className={`text-xs italic ${mutedClass}`}>No options</span>
                        )}
                      </div>

                      {/* Inline add */}
                      {isAddingToThis && (
                        <div className="flex items-center gap-2 pt-1">
                          <input
                            type="text"
                            placeholder="ID"
                            value={newOptId}
                            onChange={(e) => setNewOptId(e.target.value)}
                            className={`w-24 ${smallInputClass}`}
                          />
                          <input
                            type="text"
                            placeholder="Label"
                            value={newOptLabel}
                            onChange={(e) => setNewOptLabel(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleAddOption(col.column_name, newOptId, newOptLabel);
                                setNewOptId("");
                                setNewOptLabel("");
                              }
                            }}
                            className={`flex-1 ${smallInputClass}`}
                          />
                          <button
                            onClick={() => {
                              handleAddOption(col.column_name, newOptId, newOptLabel);
                              setNewOptId("");
                              setNewOptLabel("");
                            }}
                            disabled={!newOptId.trim() || !newOptLabel.trim()}
                            className={`text-xs px-2 py-1 rounded font-medium disabled:opacity-40 cursor-pointer ${isDark ? "bg-purple-700 text-white hover:bg-purple-600" : "bg-purple-600 text-white hover:bg-purple-700"}`}
                          >Add</button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── Dependencies Tab ───────────────────────────────────────── */}
          {activeTab === "dependencies" && (
            <div className="space-y-4 py-1">
              {/* Section 1: Column Dependencies */}
              <div>
                <h4 className={`text-sm font-medium mb-2 ${textClass}`}>
                  <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs mr-1.5 ${isDark ? "bg-blue-900/40 text-blue-400" : "bg-blue-100 text-blue-700"}`}>1</span>
                  Column Dependencies
                </h4>
                <p className={`text-xs mb-3 ${mutedClass}`}>
                  Define which column&apos;s options depend on another column&apos;s selection.
                </p>

                {Object.keys(editDependencies).length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {Object.entries(editDependencies).map(([child, parent]) => (
                      <div key={child} className={`flex items-center justify-between px-3 py-2 rounded ${isDark ? "bg-slate-700" : "bg-gray-50"}`}>
                        <span className={`text-sm ${textClass}`}>
                          <strong>{child}</strong> depends on <strong>{parent}</strong>
                        </span>
                        <button
                          onClick={() => handleRemoveDependency(child)}
                          className={`text-xs cursor-pointer ${isDark ? "text-red-400 hover:text-red-300" : "text-red-500 hover:text-red-700"}`}
                        >&times;</button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add dependency */}
                {selectColumns.length >= 2 && (
                  <div className="flex items-center gap-2">
                    <select value={newDepChild} onChange={(e) => setNewDepChild(e.target.value)} className={`flex-1 ${smallInputClass}`}>
                      <option value="">Child column...</option>
                      {selectColumns
                        .filter((c) => !editDependencies[c.column_name])
                        .map((c) => (
                          <option key={c.pk_id} value={c.column_name}>{c.column_name}</option>
                        ))}
                    </select>
                    <span className={`text-xs ${mutedClass}`}>depends on</span>
                    <select value={newDepParent} onChange={(e) => setNewDepParent(e.target.value)} className={`flex-1 ${smallInputClass}`}>
                      <option value="">Parent column...</option>
                      {selectColumns
                        .filter((c) => c.column_name !== newDepChild)
                        .map((c) => (
                          <option key={c.pk_id} value={c.column_name}>{c.column_name}</option>
                        ))}
                    </select>
                    <button
                      onClick={() => {
                        handleAddDependency(newDepChild, newDepParent);
                        setNewDepChild("");
                        setNewDepParent("");
                      }}
                      disabled={!newDepChild || !newDepParent}
                      className={`text-xs px-2 py-1 rounded font-medium disabled:opacity-40 cursor-pointer ${isDark ? "bg-blue-700 text-white" : "bg-blue-600 text-white hover:bg-blue-700"}`}
                    >Add</button>
                  </div>
                )}
              </div>

              {/* Section 2: Dependent Options */}
              {depCount > 0 && (
                <div className={`pt-3 border-t ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                  <h4 className={`text-sm font-medium mb-2 ${textClass}`}>
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs mr-1.5 ${isDark ? "bg-blue-900/40 text-blue-400" : "bg-blue-100 text-blue-700"}`}>2</span>
                    Dependent Options
                  </h4>
                  <p className={`text-xs mb-3 ${mutedClass}`}>
                    Define which options appear for child columns based on the parent&apos;s selected value.
                  </p>

                  {/* Existing dependent options */}
                  {Object.entries(editDependentOptions).map(([childCol, parentGroups]) => (
                    <div key={childCol} className="mb-3">
                      <div className={`text-xs font-medium mb-1 ${isDark ? "text-purple-400" : "text-purple-600"}`}>{childCol}</div>
                      {Object.entries(parentGroups).map(([parentValue, childOpts]) => (
                        <div key={parentValue} className={`ml-3 mb-2 p-2 rounded ${isDark ? "bg-slate-700/50" : "bg-gray-50"}`}>
                          <div className={`text-xs font-medium mb-1 ${mutedClass}`}>When parent = &quot;{parentValue}&quot;</div>
                          <div className="flex flex-wrap gap-1">
                            {childOpts.map((opt, oi) => (
                              <span key={oi} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${isDark ? "bg-slate-600 text-slate-300" : "bg-white text-gray-700 border border-gray-200"}`}>
                                {opt.label}
                                <button
                                  onClick={() => handleRemoveDependentOption(childCol, parentValue, oi)}
                                  className={`ml-0.5 cursor-pointer ${isDark ? "text-slate-500 hover:text-red-400" : "text-gray-400 hover:text-red-500"}`}
                                >&times;</button>
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}

                  {/* Add dependent option */}
                  <div className={`flex flex-wrap items-end gap-2 pt-2 border-t ${isDark ? "border-slate-700" : "border-gray-100"}`}>
                    <div className="flex-1 min-w-[100px]">
                      <label className={`block text-xs ${mutedClass}`}>Child Column</label>
                      <select value={newDepOptChild} onChange={(e) => setNewDepOptChild(e.target.value)} className={`w-full ${smallInputClass}`}>
                        <option value="">Select...</option>
                        {Object.keys(editDependencies).map((child) => (
                          <option key={child} value={child}>{child}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[100px]">
                      <label className={`block text-xs ${mutedClass}`}>Parent Value</label>
                      <input
                        type="text"
                        placeholder="e.g. Paper"
                        value={newDepOptParent}
                        onChange={(e) => setNewDepOptParent(e.target.value)}
                        className={`w-full ${smallInputClass}`}
                      />
                    </div>
                    <div className="w-20">
                      <label className={`block text-xs ${mutedClass}`}>ID</label>
                      <input type="text" placeholder="ID" value={newDepOptId} onChange={(e) => setNewDepOptId(e.target.value)} className={`w-full ${smallInputClass}`} />
                    </div>
                    <div className="flex-1 min-w-[100px]">
                      <label className={`block text-xs ${mutedClass}`}>Label</label>
                      <input type="text" placeholder="Label" value={newDepOptLabel} onChange={(e) => setNewDepOptLabel(e.target.value)} className={`w-full ${smallInputClass}`} />
                    </div>
                    <button
                      onClick={() => {
                        handleAddDependentOption(newDepOptChild, newDepOptParent, newDepOptId, newDepOptLabel);
                        setNewDepOptId("");
                        setNewDepOptLabel("");
                      }}
                      disabled={!newDepOptChild || !newDepOptParent || !newDepOptId || !newDepOptLabel}
                      className={`text-xs px-2 py-1 rounded font-medium disabled:opacity-40 cursor-pointer ${isDark ? "bg-blue-700 text-white" : "bg-blue-600 text-white hover:bg-blue-700"}`}
                    >Add</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Mappings Tab ───────────────────────────────────────────── */}
          {activeTab === "mappings" && (
            <div className="space-y-3 py-1">
              <div className="flex items-center justify-between">
                <p className={`text-xs ${mutedClass}`}>
                  Map dropdown value combinations to emission category names.
                </p>
                {depCount > 0 && (
                  <button
                    onClick={generateMappingsFromDependencies}
                    className={`text-xs px-2 py-1 rounded cursor-pointer ${isDark ? "text-purple-400 hover:bg-purple-900/30" : "text-purple-600 hover:bg-purple-50"}`}
                  >
                    Generate from Dependencies
                  </button>
                )}
              </div>

              {mappingCount > 0 ? (
                <div className={`border rounded-md overflow-hidden ${isDark ? "border-slate-600" : "border-gray-300"}`}>
                  <table className="w-full text-sm">
                    <thead className={isDark ? "bg-slate-700" : "bg-gray-50"}>
                      <tr>
                        <th className={`px-3 py-2 text-left font-medium text-xs ${labelClass}`}>Key</th>
                        <th className={`px-3 py-2 text-left font-medium text-xs ${labelClass}`}>Value</th>
                        <th className="px-3 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(editMappings).map(([key, value]) => (
                        <tr key={key} className={`border-t ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                          <td className={`px-3 py-1.5 text-xs font-mono ${mutedClass}`}>{key}</td>
                          <td className="px-3 py-1.5">
                            <input
                              type="text"
                              value={value}
                              onChange={(e) => handleUpdateMappingValue(key, e.target.value)}
                              className={`w-full ${smallInputClass}`}
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <button
                              onClick={() => handleRemoveMapping(key)}
                              className={`cursor-pointer ${isDark ? "text-red-400 hover:text-red-300" : "text-red-500 hover:text-red-700"}`}
                            >&times;</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className={`text-sm italic ${mutedClass}`}>No mappings configured.</p>
              )}

              {/* Add mapping manually */}
              <div className={`flex items-center gap-2 pt-2 border-t ${isDark ? "border-slate-700" : "border-gray-100"}`}>
                <input
                  type="text"
                  placeholder="Key (e.g. Paper|Recycled)"
                  value={newMappingKey}
                  onChange={(e) => setNewMappingKey(e.target.value)}
                  className={`flex-1 ${smallInputClass}`}
                />
                <input
                  type="text"
                  placeholder="Emission category name"
                  value={newMappingValue}
                  onChange={(e) => setNewMappingValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddMapping(); }}
                  className={`flex-1 ${smallInputClass}`}
                />
                <button
                  onClick={handleAddMapping}
                  disabled={!newMappingKey.trim() || !newMappingValue.trim()}
                  className={`text-xs px-2 py-1 rounded font-medium disabled:opacity-40 cursor-pointer ${isDark ? "bg-purple-700 text-white" : "bg-purple-600 text-white hover:bg-purple-700"}`}
                >Add</button>
              </div>
            </div>
          )}

          {/* ── Extra Fields Tab ───────────────────────────────────────── */}
          {activeTab === "extra_fields" && (
            <div className="space-y-3 py-1">
              <p className={`text-xs ${mutedClass}`}>
                Supplementary fields stored in <code className={`text-xs px-1 py-0.5 rounded ${isDark ? "bg-slate-700" : "bg-gray-100"}`}>extra_data</code>. These don&apos;t affect emission calculations.
              </p>

              {editExtraFields.length === 0 ? (
                <p className={`text-sm italic ${mutedClass}`}>
                  No extra fields configured. Click &quot;Add Field&quot; below.
                </p>
              ) : (
                <div className={`border rounded-md overflow-hidden ${isDark ? "border-slate-600" : "border-gray-300"}`}>
                  <table className="w-full text-sm">
                    <thead className={isDark ? "bg-slate-700" : "bg-gray-100"}>
                      <tr>
                        <th className={`px-3 py-2 text-left font-medium ${labelClass}`}>Key</th>
                        <th className={`px-3 py-2 text-left font-medium ${labelClass}`}>Label</th>
                        <th className={`px-3 py-2 text-left font-medium ${labelClass}`}>Type</th>
                        <th className={`px-3 py-2 text-left font-medium ${labelClass}`}>Req</th>
                        <th className={`px-3 py-2 text-left font-medium ${labelClass}`}>Options / Show For</th>
                        <th className="px-3 py-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {editExtraFields.map((field, idx) => (
                        <tr key={idx} className={`border-t ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={field.key}
                              onChange={(e) => updateExtraField(idx, { key: e.target.value })}
                              placeholder="field_key"
                              className={`w-full ${smallInputClass}`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={field.label}
                              onChange={(e) => updateExtraField(idx, { label: e.target.value })}
                              placeholder="Label"
                              className={`w-full ${smallInputClass}`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={field.type}
                              onChange={(e) => updateExtraField(idx, { type: e.target.value as ExtraFieldDefinition["type"] })}
                              className={`w-full ${smallInputClass}`}
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
                            {field.type === "select" ? (
                              <input
                                type="text"
                                value={(field.options || []).join(", ")}
                                onChange={(e) =>
                                  updateExtraField(idx, {
                                    options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                                  })
                                }
                                placeholder="opt1, opt2, opt3"
                                className={`w-full ${smallInputClass}`}
                              />
                            ) : (
                              <input
                                type="text"
                                value={(field.show_for || []).join(", ")}
                                onChange={(e) =>
                                  updateExtraField(idx, {
                                    show_for: e.target.value ? e.target.value.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
                                  })
                                }
                                placeholder="show_for (optional)"
                                className={`w-full ${smallInputClass}`}
                              />
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => removeExtraField(idx)}
                              className={`cursor-pointer ${isDark ? "text-red-400 hover:text-red-300" : "text-red-500 hover:text-red-700"}`}
                              title="Remove field"
                            >&times;</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <button
                onClick={addExtraField}
                className={`text-sm cursor-pointer ${isDark ? "text-blue-400 hover:text-blue-300" : "text-blue-600 hover:text-blue-700"}`}
              >
                + Add Field
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`flex justify-end gap-2 pt-3 border-t ${isDark ? "border-slate-700" : "border-gray-200"}`}>
          <button
            onClick={onClose}
            disabled={saving}
            className={`px-4 py-2 text-sm rounded-lg font-medium cursor-pointer ${isDark ? "border border-slate-600 text-slate-300 hover:bg-slate-700" : "border border-gray-300 text-gray-700 hover:bg-gray-100"}`}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !configName.trim()}
            className={`px-4 py-2 text-sm rounded-lg font-medium disabled:opacity-50 cursor-pointer ${isDark ? "bg-purple-600 text-white hover:bg-purple-500" : "bg-purple-600 text-white hover:bg-purple-700"}`}
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default EditColumnConfigModal;
