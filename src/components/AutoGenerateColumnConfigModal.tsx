import { useState, useEffect, useCallback } from "react";
import Modal from "./Modal";
import {
  previewAutoGenerateColumnConfig,
  confirmAutoGenerateColumnConfig,
  ColumnConfigProposal,
  ProposedColumn,
  ProposedUnit,
  EfNamePair,
  ColumnOptionsMap,
  ColumnDependencies,
  DependentOptionsMap,
  EmissionCategoryMapping,
} from "../services/columnConfigService";
import { DropdownOptionValue } from "../services/columnService";

type Step = "loading" | "preview" | "submitting" | "result";
type Tab = "columns" | "options" | "dependencies" | "mappings";

interface AutoGenerateColumnConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  siteId: number;
  categoryId: number;
  onSuccess?: () => void;
}

export default function AutoGenerateColumnConfigModal({
  isOpen,
  onClose,
  siteId,
  categoryId,
  onSuccess,
}: AutoGenerateColumnConfigModalProps) {
  const [step, setStep] = useState<Step>("loading");
  const [proposal, setProposal] = useState<ColumnConfigProposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configName, setConfigName] = useState("");

  // Unit group selection (checkboxes) - both selected by default
  const [selectedGroupIndices, setSelectedGroupIndices] = useState<Set<number>>(new Set());

  // Track selected dimension for each unit group: Map<groupIndex, selectedDimCount>
  const [selectedDimensionsByGroup, setSelectedDimensionsByGroup] = useState<Map<number, number>>(new Map());

  const [createUnits, setCreateUnits] = useState(true);
  const [customUnits, setCustomUnits] = useState<string[]>([]);
  const [customUnitInput, setCustomUnitInput] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("columns");
  const [resultData, setResultData] = useState<{
    configName: string;
    unitsCreated: string[];
  } | null>(null);

  // Editable copies of the proposal group data
  const [editColumns, setEditColumns] = useState<ProposedColumn[]>([]);
  const [editColumnOptions, setEditColumnOptions] = useState<ColumnOptionsMap>({});
  const [editDependencies, setEditDependencies] = useState<ColumnDependencies>({});
  const [editDependentOptions, setEditDependentOptions] = useState<DependentOptionsMap>({});
  const [editMappings, setEditMappings] = useState<EmissionCategoryMapping>({});

  const [efNames, setEfNames] = useState<string[]>([]);
  // ECM name pairs: display_name (company) ↔ lookup_name (EF)
  const [efNamePairs, setEfNamePairs] = useState<EfNamePair[] | undefined>(undefined);

  // Pure function: build clean config from ef_names filtered by dimCount
  // Uses baseColumns for column names (LLM-inferred or existing)
  // When namePairs is provided (ECM source), display names become dropdown labels
  // and lookup names become the emission_category_mapping values
  const buildConfigForDimCount = (
    allEfNames: string[],
    dimCount: number,
    baseColumns: ProposedColumn[],
    namePairs?: EfNamePair[],
  ) => {
    const makeOption = (val: string) => ({ id: val, label: val });

    let parsed: { original: string; parts: string[] }[];

    if (namePairs && namePairs.length > 0) {
      // ECM mode: pad emission factors to match dimCount
      parsed = namePairs.map(p => {
        const parts = p.display_name.split(" - ").map(s => s.trim());

        // Pad with "Unknown" at the beginning if fewer parts than dimCount
        while (parts.length < dimCount) {
          parts.unshift("Unknown"); // Insert at beginning for Travel Mode
        }

        // Convert "-" to "Unknown"
        const cleanedParts = parts.map(pt => pt === "-" || pt === "" ? "Unknown" : pt);

        return {
          original: p.lookup_name,
          parts: cleanedParts.slice(0, dimCount), // Take only first dimCount parts
        };
      }).filter(item => item.parts.length === dimCount);
    } else {
      // EF mode: pad emission factors to match dimCount
      parsed = allEfNames.map(n => {
        const parts = n.split(" - ").map(p => p.trim());

        // Pad with "Unknown" at the beginning if fewer parts than dimCount
        while (parts.length < dimCount) {
          parts.unshift("Unknown"); // Insert at beginning for Travel Mode
        }

        // Convert "-" to "Unknown"
        const cleanedParts = parts.map(p => p === "-" || p === "" ? "Unknown" : p);

        return {
          original: n,
          parts: cleanedParts.slice(0, dimCount), // Take only first dimCount parts
        };
      }).filter(item => item.parts.length === dimCount);
    }

    // Build columns: reuse names from baseColumns where possible
    const existingSelect = baseColumns.filter(c => c.column_type === "select");
    const existingNumber = baseColumns.find(c => c.column_type === "number");

    const newColumns: ProposedColumn[] = [];
    for (let i = 0; i < dimCount; i++) {
      newColumns.push(existingSelect[i] || {
        existing_id: null,
        column_name: `Dimension ${i + 1}`,
        column_type: "select",
        is_new: true,
      });
    }
    newColumns.push(existingNumber || {
      existing_id: null,
      column_name: "Activity Data",
      column_type: "number",
      is_new: true,
    });

    const newOptions: ColumnOptionsMap = {};
    const newDeps: ColumnDependencies = {};
    const newDepOpts: DependentOptionsMap = {};
    const newMappings: EmissionCategoryMapping = {};

    if (dimCount === 1) {
      const colName = newColumns[0].column_name;
      const vals = [...new Set(parsed.map(e => e.parts[0]))].sort();
      newOptions[colName] = vals.map(makeOption);
      for (const entry of parsed) {
        newMappings[entry.parts[0]] = entry.original;
      }
    } else if (dimCount === 2) {
      const col1 = newColumns[0].column_name;
      const col2 = newColumns[1].column_name;
      const dim0Vals = [...new Set(parsed.map(e => e.parts[0]))].sort();
      const dim1Vals = [...new Set(parsed.map(e => e.parts[1]))].sort();
      newOptions[col1] = dim0Vals.map(makeOption);
      newOptions[col2] = dim1Vals.map(makeOption);
      newDeps[col2] = col1;
      const dim1ByDim0 = new Map<string, Set<string>>();
      for (const entry of parsed) {
        if (!dim1ByDim0.has(entry.parts[0])) dim1ByDim0.set(entry.parts[0], new Set());
        dim1ByDim0.get(entry.parts[0])!.add(entry.parts[1]);
      }
      newDepOpts[col2] = {};
      for (const [parentVal, childVals] of dim1ByDim0) {
        newDepOpts[col2][parentVal] = [...childVals].sort().map(makeOption);
      }
      for (const entry of parsed) {
        newMappings[`${entry.parts[0]}|${entry.parts[1]}`] = entry.original;
      }
    } else if (dimCount >= 3) {
      const col1 = newColumns[0].column_name;
      const col2 = newColumns[1].column_name;
      const col3 = newColumns[2].column_name;
      const dim0Vals = [...new Set(parsed.map(e => e.parts[0]))].sort();
      const dim1Vals = [...new Set(parsed.map(e => e.parts[1]))].sort();
      const dim2Vals = [...new Set(parsed.map(e => e.parts[2]))].sort();
      newOptions[col1] = dim0Vals.map(makeOption);
      newOptions[col2] = dim1Vals.map(makeOption);
      newOptions[col3] = dim2Vals.map(makeOption);
      newDeps[col2] = col1;
      newDeps[col3] = col2;
      const dim1ByDim0 = new Map<string, Set<string>>();
      for (const entry of parsed) {
        if (!dim1ByDim0.has(entry.parts[0])) dim1ByDim0.set(entry.parts[0], new Set());
        dim1ByDim0.get(entry.parts[0])!.add(entry.parts[1]);
      }
      newDepOpts[col2] = {};
      for (const [parentVal, childVals] of dim1ByDim0) {
        newDepOpts[col2][parentVal] = [...childVals].sort().map(makeOption);
      }
      const dim2ByDim1 = new Map<string, Set<string>>();
      for (const entry of parsed) {
        if (!dim2ByDim1.has(entry.parts[1])) dim2ByDim1.set(entry.parts[1], new Set());
        dim2ByDim1.get(entry.parts[1])!.add(entry.parts[2]);
      }
      newDepOpts[col3] = {};
      for (const [parentVal, childVals] of dim2ByDim1) {
        newDepOpts[col3][parentVal] = [...childVals].sort().map(makeOption);
      }
      for (const entry of parsed) {
        newMappings[`${entry.parts[0]}|${entry.parts[1]}|${entry.parts[2]}`] = entry.original;
      }
    }

    return { columns: newColumns, options: newOptions, deps: newDeps, depOpts: newDepOpts, mappings: newMappings };
  };

  // Load combined data from all selected groups with their selected dimensions
  const loadCombinedGroupsIntoState = useCallback(() => {
    if (!proposal) return;

    const combinedColumns: ProposedColumn[] = [];
    let combinedOptions: ColumnOptionsMap = {};
    let combinedDeps: ColumnDependencies = {};
    let combinedDepOpts: DependentOptionsMap = {};
    let combinedMappings: EmissionCategoryMapping = {};
    let combinedEfNames: string[] = [];
    let combinedEfNamePairs: EfNamePair[] = [];

    // Iterate through all selected groups
    for (const groupIdx of Array.from(selectedGroupIndices)) {
      const group = proposal.configs[groupIdx];
      const dimCount = selectedDimensionsByGroup.get(groupIdx);

      if (!group || !dimCount) continue;

      // Get data for this group's selected dimension
      const namesByDim = group.column_names_by_dim || {};
      const baseColumns = namesByDim[dimCount]?.columns || group.columns;

      // Use dimension-specific ef_names if backend provides it, otherwise fallback to filtering
      const dimConfig = namesByDim[dimCount];
      const efNamesForDim = dimConfig?.ef_names || group.ef_names.filter(n => n.split(" - ").length === dimCount);

      const result = buildConfigForDimCount(efNamesForDim, dimCount, baseColumns, group.ef_name_pairs);

      // Merge columns - deduplicate by column_name (keep dimensional columns unique, collect all activity columns)
      for (const col of result.columns) {
        const existingCol = combinedColumns.find(c => c.column_name === col.column_name);
        if (!existingCol) {
          combinedColumns.push(col);
        }
      }

      // Merge options - combine arrays for each column
      for (const [colName, options] of Object.entries(result.options)) {
        if (!combinedOptions[colName]) {
          combinedOptions[colName] = [];
        }
        const existingIds = new Set(combinedOptions[colName].map((opt) => opt.id));
        const newOptions = options.filter((opt) => !existingIds.has(opt.id));
        combinedOptions[colName] = [...combinedOptions[colName], ...newOptions];
      }

      // Merge dependencies (unchanged)
      combinedDeps = { ...combinedDeps, ...result.deps };

      // Merge dependent options - combine arrays
      for (const [colName, depMap] of Object.entries(result.depOpts)) {
        if (!combinedDepOpts[colName]) {
          combinedDepOpts[colName] = {};
        }
        for (const [parentVal, options] of Object.entries(depMap)) {
          if (!combinedDepOpts[colName][parentVal]) {
            combinedDepOpts[colName][parentVal] = [];
          }
          const existingIds = new Set(combinedDepOpts[colName][parentVal].map((opt) => opt.id));
          const newOptions = (options as DropdownOptionValue[]).filter((opt) => !existingIds.has(opt.id));
          combinedDepOpts[colName][parentVal] = [...combinedDepOpts[colName][parentVal], ...newOptions];
        }
      }

      // Merge mappings (unchanged)
      combinedMappings = { ...combinedMappings, ...result.mappings };
      combinedEfNames = [...combinedEfNames, ...group.ef_names];
      if (group.ef_name_pairs) {
        combinedEfNamePairs = [...combinedEfNamePairs, ...group.ef_name_pairs];
      }
    }

    // Set combined data to state
    setEditColumns(combinedColumns);
    setEditColumnOptions(combinedOptions);
    setEditDependencies(combinedDeps);
    setEditDependentOptions(combinedDepOpts);
    setEditMappings(combinedMappings);
    setEfNames(combinedEfNames);
    setEfNamePairs(combinedEfNamePairs.length > 0 ? combinedEfNamePairs : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal, selectedGroupIndices, selectedDimensionsByGroup]);

  const fetchPreview = useCallback(async () => {
    setStep("loading");
    setError(null);
    try {
      const data = await previewAutoGenerateColumnConfig(siteId, categoryId);
      setProposal(data);
      setConfigName(data.config_name);

      // Select all unit groups by default
      const allIndices = new Set(data.configs.map((_, idx) => idx));
      setSelectedGroupIndices(allIndices);

      // Set default dimension for each unit group (auto-select first available dimension)
      const defaultDimensions = new Map<number, number>();
      data.configs.forEach((group, idx) => {
        const detectedDim =
          group.pattern === "THREE_DIM" ? 3 : group.pattern === "TWO_DIM" ? 2 : 1;
        defaultDimensions.set(idx, detectedDim);
      });
      setSelectedDimensionsByGroup(defaultDimensions);

      // The useEffect will automatically load combined data when selections are set
      setActiveTab("columns");
      setStep("preview");
    } catch (err: any) {
      const msg =
        err?.response?.data?.message || err?.message || "Failed to generate preview";
      setError(msg);
      setStep("preview");
    }
  }, [siteId, categoryId]);

  useEffect(() => {
    if (isOpen && siteId && categoryId) {
      fetchPreview();
    }
  }, [isOpen, siteId, categoryId, fetchPreview]);

  // Reload combined data whenever unit group or dimension selections change
  useEffect(() => {
    if (proposal && selectedGroupIndices.size > 0 && selectedDimensionsByGroup.size > 0) {
      loadCombinedGroupsIntoState();
    }
  }, [selectedGroupIndices, selectedDimensionsByGroup, proposal, loadCombinedGroupsIntoState]);

  // Toggle unit group selection
  const handleGroupToggle = (idx: number) => {
    setSelectedGroupIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        // Prevent deselecting the last group (minimum 1 required)
        if (next.size > 1) {
          next.delete(idx);
          // Also remove its dimension selection
          setSelectedDimensionsByGroup((prevDims) => {
            const newDims = new Map(prevDims);
            newDims.delete(idx);
            return newDims;
          });
        }
      } else {
        next.add(idx);
        // Add default dimension for this group
        if (proposal?.configs[idx]) {
          const group = proposal.configs[idx];
          const detectedDim =
            group.pattern === "THREE_DIM" ? 3 : group.pattern === "TWO_DIM" ? 2 : 1;
          setSelectedDimensionsByGroup((prevDims) => {
            const newDims = new Map(prevDims);
            newDims.set(idx, detectedDim);
            return newDims;
          });
        }
      }
      return next;
    });
  };

  // Switch dimension for a specific unit group
  const handleDimensionChange = (groupIdx: number, dimCount: number) => {
    setSelectedDimensionsByGroup((prev) => {
      const next = new Map(prev);
      next.set(groupIdx, dimCount);
      return next;
    });
  };


  const handleConfirm = async () => {
    if (!proposal) return;

    setStep("submitting");
    setError(null);

    try {
      const selectedUnits: ProposedUnit[] = [
        ...(createUnits ? proposal.proposed_units.filter((u) => !u.already_exists) : []),
        ...customUnits.map((name) => ({ unit_name: name, already_exists: false })),
      ];

      const allUnitsCreated: string[] = [];

      // Use the user-edited state directly (what the preview shows)
      const selectedIndices = Array.from(selectedGroupIndices).sort((a, b) => a - b);
      const unitNames = selectedIndices
        .map((idx) => proposal.configs[idx]?.denominator_unit)
        .filter(Boolean);
      const configSuffix = unitNames.length > 1 ? unitNames.join(" + ") : unitNames[0] || "";

      const result = await confirmAutoGenerateColumnConfig({
        site_id: proposal.site_id,
        category_id: proposal.category_id,
        config_name: `${configName} - ${configSuffix}`,
        columns: editColumns,
        column_options: editColumnOptions,
        column_dependencies: editDependencies,
        dependent_options: editDependentOptions,
        emission_category_mapping: editMappings,
        create_units: createUnits,
        proposed_units: selectedUnits,
      });

      if (result.units_created) {
        allUnitsCreated.push(...result.units_created);
      }

      setResultData({
        configName: `${configName} - ${configSuffix}`,
        unitsCreated: allUnitsCreated,
      });
      setStep("result");
    } catch (err: any) {
      const msg =
        err?.response?.data?.message || err?.message || "Failed to create config";
      setError(msg);
      setStep("preview");
    }
  };

  const handleClose = () => {
    if (step === "result" && onSuccess) {
      onSuccess();
    }
    setStep("loading");
    setProposal(null);
    setError(null);
    setConfigName("");
    setResultData(null);
    setEfNamePairs(undefined);
    setCustomUnits([]);
    setCustomUnitInput("");
    onClose();
  };

  // ── Column name editing ──
  const handleColumnNameChange = (idx: number, newName: string) => {
    setEditColumns((prev) => {
      const updated = [...prev];
      const oldName = updated[idx].column_name;
      if (oldName === newName) return prev;
      updated[idx] = { ...updated[idx], column_name: newName };

      // Rename in column_options keys — use functional updater to avoid stale closure
      setEditColumnOptions((prevOpts) => {
        if (!prevOpts[oldName]) return prevOpts;
        const newOpts = { ...prevOpts };
        newOpts[newName] = newOpts[oldName];
        delete newOpts[oldName];
        return newOpts;
      });

      // Rename in dependencies
      setEditDependencies((prevDeps) => {
        const newDeps: ColumnDependencies = {};
        for (const [child, parent] of Object.entries(prevDeps)) {
          const newChild = child === oldName ? newName : child;
          const newParent = parent === oldName ? newName : parent;
          newDeps[newChild] = newParent;
        }
        return newDeps;
      });

      // Rename in dependent_options keys
      setEditDependentOptions((prevDO) => {
        const newDO: DependentOptionsMap = {};
        for (const [child, parentOptions] of Object.entries(prevDO)) {
          const newChild = child === oldName ? newName : child;
          newDO[newChild] = parentOptions;
        }
        return newDO;
      });

      return updated;
    });
  };

  // ── Swap two select dimensions (reorder) ──
  const handleSwapDimensions = (idxA: number, idxB: number) => {
    // Only swap select columns
    const selectIndices = editColumns
      .map((c, i) => (c.column_type === "select" ? i : -1))
      .filter((i) => i >= 0);
    const realA = selectIndices[idxA];
    const realB = selectIndices[idxB];
    if (realA === undefined || realB === undefined) return;

    const colA = editColumns[realA];
    const colB = editColumns[realB];

    // Swap columns in the array
    setEditColumns((prev) => {
      const updated = [...prev];
      updated[realA] = { ...colB };
      updated[realB] = { ...colA };
      return updated;
    });

    // Swap column_options values (keep keys = column names)
    setEditColumnOptions((prev) => {
      const updated = { ...prev };
      const optsA = prev[colA.column_name] || [];
      const optsB = prev[colB.column_name] || [];
      updated[colA.column_name] = optsB;
      updated[colB.column_name] = optsA;
      return updated;
    });

    // Swap in dependencies (swap which column is parent vs child)
    setEditDependencies((prev) => {
      const updated: ColumnDependencies = {};
      for (const [child, parent] of Object.entries(prev)) {
        const newChild =
          child === colA.column_name ? colB.column_name : child === colB.column_name ? colA.column_name : child;
        const newParent =
          parent === colA.column_name ? colB.column_name : parent === colB.column_name ? colA.column_name : parent;
        updated[newChild] = newParent;
      }
      return updated;
    });

    // Swap in dependent_options keys
    setEditDependentOptions((prev) => {
      const updated: DependentOptionsMap = {};
      for (const [child, parentOpts] of Object.entries(prev)) {
        const newChild =
          child === colA.column_name ? colB.column_name : child === colB.column_name ? colA.column_name : child;
        updated[newChild] = parentOpts;
      }
      return updated;
    });
  };

  // ── Reset a single dimension's options from efNames ──
  const handleResetDimension = (dimIdx: number) => {
    const makeOption = (val: string) => ({ id: val, label: val });

    // Extract display parts, using ECM pairs when available
    // No filtering by dimension count since we combine data from multiple groups with different dimensions
    let allParts: string[][];
    if (efNamePairs && efNamePairs.length > 0) {
      allParts = efNamePairs
        .map(p => p.display_name.split(" - ").map(s => s.trim()));
    } else {
      allParts = efNames
        .map(n => n.split(" - ").map(p => p.trim()));
    }

    const vals = [...new Set(
      allParts.filter(parts => parts.length > dimIdx).map(parts => parts[dimIdx])
    )].sort();

    const selectCols = editColumns.filter(c => c.column_type === "select");
    const col = selectCols[dimIdx];
    if (!col) return;

    setEditColumnOptions(prev => ({
      ...prev,
      [col.column_name]: vals.map(makeOption),
    }));
  };

  // ── Add / Remove manual dimensions ──
  const handleAddDimension = () => {
    const selectCols = editColumns.filter(c => c.column_type === "select");
    const newDimIdx = selectCols.length + 1;
    const newColName = `Dimension ${newDimIdx}`;

    // Insert new select column before the number column
    const numberIdx = editColumns.findIndex(c => c.column_type === "number");
    const insertIdx = numberIdx >= 0 ? numberIdx : editColumns.length;
    const newCol: ProposedColumn = {
      existing_id: null,
      column_name: newColName,
      column_type: "select",
      is_new: true,
    };

    setEditColumns(prev => {
      const updated = [...prev];
      updated.splice(insertIdx, 0, newCol);
      return updated;
    });

    // Initialize empty options for the new column
    setEditColumnOptions(prev => ({ ...prev, [newColName]: [] }));

    // Wire dependency: new column depends on the last existing select column
    if (selectCols.length > 0) {
      const parentCol = selectCols[selectCols.length - 1].column_name;
      setEditDependencies(prev => ({ ...prev, [newColName]: parentCol }));
      setEditDependentOptions(prev => ({ ...prev, [newColName]: {} }));
    }
  };

  const handleRemoveDimension = (dimIdx: number) => {
    const selectCols = editColumns.filter(c => c.column_type === "select");
    const col = selectCols[dimIdx];
    if (!col) return;
    const colName = col.column_name;

    // Remove the column
    setEditColumns(prev => prev.filter(c => c !== col));

    // Remove its options
    setEditColumnOptions(prev => {
      const updated = { ...prev };
      delete updated[colName];
      return updated;
    });

    // Remove dependencies referencing this column
    setEditDependencies(prev => {
      const updated: ColumnDependencies = {};
      for (const [child, parent] of Object.entries(prev)) {
        if (child === colName || parent === colName) continue;
        updated[child] = parent;
      }
      // Re-wire: if a column depended on this one, point it to this one's parent
      const thisParent = prev[colName];
      for (const [child, parent] of Object.entries(prev)) {
        if (parent === colName && child !== colName) {
          if (thisParent) {
            updated[child] = thisParent;
          } else {
            delete updated[child];
          }
        }
      }
      return updated;
    });

    // Remove dependent options for this column
    setEditDependentOptions(prev => {
      const updated = { ...prev };
      delete updated[colName];
      return updated;
    });

    // Remove mappings (they're now invalid)
    setEditMappings({});
  };

  const handleRemoveActivityColumn = (colIdx: number) => {
    setEditColumns(prev => prev.filter((_, idx) => idx !== colIdx));
  };

  // ── Dropdown option editing ──
  const handleRemoveOption = (colName: string, optIdx: number) => {
    setEditColumnOptions((prev) => {
      const updated = { ...prev };
      updated[colName] = updated[colName].filter((_, i) => i !== optIdx);
      return updated;
    });
  };

  const handleAddOption = (colName: string, id: string, label: string) => {
    setEditColumnOptions((prev) => {
      const updated = { ...prev };
      if (!updated[colName]) updated[colName] = [];
      if (updated[colName].some((o) => String(o.id) === id)) return prev;
      updated[colName] = [...updated[colName], { id, label }];
      return updated;
    });
  };

  // ── Dependent options editing ──
  const handleRemoveDependentOption = (
    childCol: string,
    parentValue: string,
    optIdx: number
  ) => {
    setEditDependentOptions((prev) => {
      const updated = JSON.parse(JSON.stringify(prev)) as DependentOptionsMap;
      if (updated[childCol]?.[parentValue]) {
        updated[childCol][parentValue] = updated[childCol][parentValue].filter(
          (_: DropdownOptionValue, i: number) => i !== optIdx
        );
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

  const handleAddDependentOption = (
    childCol: string,
    parentValue: string,
    id: string,
    label: string
  ) => {
    setEditDependentOptions((prev) => {
      const updated = JSON.parse(JSON.stringify(prev)) as DependentOptionsMap;
      if (!updated[childCol]) updated[childCol] = {};
      if (!updated[childCol][parentValue]) updated[childCol][parentValue] = [];
      if (updated[childCol][parentValue].some((o: DropdownOptionValue) => String(o.id) === id))
        return prev;
      updated[childCol][parentValue].push({ id, label });
      return updated;
    });
  };

  // ── Mapping editing ──
  const handleUpdateMappingValue = (key: string, value: string) => {
    setEditMappings((prev) => ({ ...prev, [key]: value }));
  };

  const handleRemoveMapping = (key: string) => {
    setEditMappings((prev) => {
      const updated = { ...prev };
      delete updated[key];
      return updated;
    });
  };

  const regenerateMappings = () => {
    const newMappings: EmissionCategoryMapping = {};
    Object.entries(editDependentOptions).forEach(([_childCol, parentOptions]) => {
      Object.entries(parentOptions).forEach(([parentValue, childOptions]) => {
        childOptions.forEach((childOption: DropdownOptionValue) => {
          const key = `${parentValue}|${childOption.label}`;
          newMappings[key] = `${parentValue} - ${childOption.label}`;
        });
      });
    });
    setEditMappings(newMappings);
  };

  const selectColumns = editColumns.filter((c) => c.column_type === "select");
  const hasDeps = Object.keys(editDependencies).length > 0;

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "columns", label: "Columns", count: editColumns.length },
    {
      key: "options",
      label: "Options",
      count: Object.values(editColumnOptions).reduce((s, o) => s + o.length, 0),
    },
    ...(hasDeps
      ? [
          {
            key: "dependencies" as Tab,
            label: "Dependencies",
            count: Object.keys(editDependencies).length,
          },
        ]
      : []),
    {
      key: "mappings",
      label: "Mappings",
      count: Object.keys(editMappings).length,
    },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Auto-Generate Column Config"
      className="!max-w-3xl"
    >
      <div className="space-y-4">
        {/* Loading */}
        {step === "loading" && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600" />
            <p className="text-gray-500 text-sm">Analyzing emission factors...</p>
          </div>
        )}

        {/* Submitting */}
        {step === "submitting" && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600" />
            <p className="text-gray-500 text-sm">Creating column config...</p>
          </div>
        )}

        {/* Preview */}
        {step === "preview" && (
          <>
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                {error}
              </div>
            )}

            {proposal && (
              <>
                {/* Header row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span>{proposal.site_name} / {proposal.category_name}</span>
                    {(() => {
                      const firstSelectedIdx = Array.from(selectedGroupIndices)[0];
                      return proposal.configs[firstSelectedIdx]?.source === "ecm" && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                          Using company names
                        </span>
                      );
                    })()}
                  </div>
                  {(() => {
                    const firstSelectedIdx = Array.from(selectedGroupIndices)[0];
                    return proposal.configs[firstSelectedIdx] && (
                      <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
                        {Object.keys(editMappings).length} emission factors (of {proposal.configs[firstSelectedIdx].ef_names.length} total)
                      </span>
                    );
                  })()}
                </div>

                {/* Existing config warning */}
                {proposal.existing_config_ids.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-700 text-sm">
                    {proposal.existing_config_ids.length} config(s) already exist for
                    this site + category.
                  </div>
                )}

                {/* Config name */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Config Name
                  </label>
                  <input
                    type="text"
                    value={configName}
                    onChange={(e) => setConfigName(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                {/* Unit Groups & Dimensions - Horizontal Layout */}
                {proposal.configs.length > 1 && (
                  <div className="border border-gray-200 rounded-lg p-3 space-y-3">
                    {/* Unit Group Selection */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-2">
                        Select Unit Groups ({selectedGroupIndices.size} selected)
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {proposal.configs.map((group, idx) => (
                          <label
                            key={idx}
                            className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border cursor-pointer transition-colors ${
                              selectedGroupIndices.has(idx)
                                ? "bg-purple-50 border-purple-600 text-purple-700"
                                : "bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedGroupIndices.has(idx)}
                              onChange={() => handleGroupToggle(idx)}
                              className="rounded border-gray-300 text-purple-600"
                            />
                            <span>{group.denominator_unit}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Dimension Selectors - Horizontal Cards */}
                    <div className="flex flex-wrap gap-2">
                      {Array.from(selectedGroupIndices)
                        .sort((a, b) => a - b)
                        .map((groupIdx) => {
                          const group = proposal.configs[groupIdx];
                          if (!group) return null;

                          // Calculate available dimensions for this group
                          const partCountSet = new Set(
                            group.ef_names.map((n) => n.split(" - ").length)
                          );
                          const availableDims = [...partCountSet]
                            .sort((a, b) => a - b)
                            .filter((c) => c <= 4);

                          const selectedDim = selectedDimensionsByGroup.get(groupIdx) || availableDims[0] || 1;

                          return (
                            <div
                              key={groupIdx}
                              className="flex-1 min-w-[200px] border border-purple-200 rounded-lg p-2.5 bg-purple-50/30"
                            >
                              <div className="flex items-center justify-between mb-1.5">
                                <span className="text-xs font-semibold text-purple-900">
                                  {group.denominator_unit}
                                </span>
                                <span className="text-[10px] text-gray-500">
                                  {group.ef_names.length} emission factors
                                </span>
                              </div>

                              <div>
                                <label className="block text-[10px] font-medium text-gray-500 mb-1">
                                  Dimensions (split by &ldquo; - &rdquo;)
                                </label>
                                <div className="flex gap-1">
                                  {availableDims.map((dim) => {
                                    const count = group.ef_names.filter(
                                      (n) => n.split(" - ").length === dim
                                    ).length;
                                    return (
                                      <button
                                        key={dim}
                                        onClick={() => handleDimensionChange(groupIdx, dim)}
                                        className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                                          dim === selectedDim
                                            ? "bg-purple-600 text-white"
                                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                        }`}
                                      >
                                        {dim}-dim
                                        <span
                                          className={`ml-1 text-[10px] ${
                                            dim === selectedDim ? "text-purple-200" : "text-gray-400"
                                          }`}
                                        >
                                          ({count})
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Tab navigation */}
                <div className="flex gap-1 border-b border-gray-200">
                  {tabs.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                        activeTab === tab.key
                          ? "border-purple-600 text-purple-700"
                          : "border-transparent text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      {tab.label}
                      {tab.count !== undefined && (
                        <span className="ml-1 text-xs text-gray-400">({tab.count})</span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                <div className="min-h-[240px] max-h-[400px] overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:hover:bg-gray-400">
                  {activeTab === "columns" && (
                    <ColumnsTab
                      columns={editColumns}
                      columnOptions={editColumnOptions}
                      onNameChange={handleColumnNameChange}
                      onSwapDimensions={handleSwapDimensions}
                      onResetDimension={handleResetDimension}
                      onAddDimension={handleAddDimension}
                      onRemoveDimension={handleRemoveDimension}
                      onRemoveActivityColumn={handleRemoveActivityColumn}
                    />
                  )}

                  {activeTab === "options" && (
                    <OptionsTab
                      columns={selectColumns}
                      columnOptions={editColumnOptions}
                      onRemoveOption={handleRemoveOption}
                      onAddOption={handleAddOption}
                    />
                  )}

                  {activeTab === "dependencies" && hasDeps && (
                    <DependenciesTab
                      dependencies={editDependencies}
                      dependentOptions={editDependentOptions}
                      columnOptions={editColumnOptions}
                      onRemoveDependentOption={handleRemoveDependentOption}
                      onAddDependentOption={handleAddDependentOption}
                    />
                  )}

                  {activeTab === "mappings" && (
                    <MappingsTab
                      mappings={editMappings}
                      hasDeps={hasDeps}
                      onUpdateValue={handleUpdateMappingValue}
                      onRemove={handleRemoveMapping}
                      onRegenerate={regenerateMappings}
                    />
                  )}
                </div>

                {/* Units - Always visible */}
                {proposal && (
                  <div className="pt-2 border-t border-gray-200 space-y-2">
                    {(() => {
                      const missingUnits = proposal.proposed_units.filter((u) => !u.already_exists);
                      const hasMissingUnits = missingUnits.length > 0;

                      return (
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={createUnits}
                            onChange={(e) => setCreateUnits(e.target.checked)}
                            className="rounded border-gray-300 text-purple-600"
                            disabled={!hasMissingUnits}
                          />
                          <span className={hasMissingUnits ? "text-gray-700" : "text-gray-400"}>
                            {hasMissingUnits ? (
                              <>
                                Also create missing unit{missingUnits.length !== 1 ? "s" : ""}:{" "}
                                <strong>
                                  {missingUnits.map((u) => u.unit_name).join(", ")}
                                </strong>
                              </>
                            ) : (
                              "No missing units to create (all units already exist)"
                            )}
                          </span>
                        </label>
                      );
                    })()}

                    {/* Custom units */}
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={customUnitInput}
                        onChange={(e) => setCustomUnitInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            const name = customUnitInput.trim().toLowerCase();
                            if (name && !customUnits.includes(name) && !proposal.proposed_units.some((u) => u.unit_name.toLowerCase() === name)) {
                              setCustomUnits((prev) => [...prev, name]);
                              setCustomUnitInput("");
                            }
                          }
                        }}
                        placeholder="Add custom unit..."
                        className="flex-1 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-purple-400"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const name = customUnitInput.trim().toLowerCase();
                          if (name && !customUnits.includes(name) && !proposal.proposed_units.some((u) => u.unit_name.toLowerCase() === name)) {
                            setCustomUnits((prev) => [...prev, name]);
                            setCustomUnitInput("");
                          }
                        }}
                        className="text-sm px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700"
                      >
                        + Add
                      </button>
                    </div>
                    {customUnits.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {customUnits.map((u) => (
                          <span key={u} className="inline-flex items-center gap-1 text-xs bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full">
                            {u}
                            <button
                              type="button"
                              onClick={() => setCustomUnits((prev) => prev.filter((x) => x !== u))}
                              className="text-purple-500 hover:text-purple-700 font-bold"
                            >
                              &times;
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-2 border-t border-gray-200">
                  <button
                    onClick={handleClose}
                    className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={!configName.trim()}
                    className="px-5 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    Create Config
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* Result */}
        {step === "result" && resultData && (
          <div className="flex flex-col items-center py-8 gap-4">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center">
              <svg
                className="w-7 h-7 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-800">Config Created</h3>
            <div className="text-sm text-gray-600 text-center space-y-1">
              <p>
                <strong>&ldquo;{resultData.configName}&rdquo;</strong> has been created
                with all columns, options, dependencies, and mappings.
              </p>
              {resultData.unitsCreated.length > 0 && (
                <p>
                  {resultData.unitsCreated.length} unit
                  {resultData.unitsCreated.length > 1 ? "s" : ""} created:{" "}
                  {resultData.unitsCreated.join(", ")}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-2">
                You can review and edit it from the config table below.
              </p>
            </div>
            <button
              onClick={handleClose}
              className="mt-2 px-5 py-2 text-sm font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ─── Tab: Columns ──────────────────────────────────────────────────────────────

function ColumnsTab({
  columns,
  columnOptions,
  onNameChange,
  onSwapDimensions,
  onResetDimension,
  onAddDimension,
  onRemoveDimension,
  onRemoveActivityColumn,
}: {
  columns: ProposedColumn[];
  columnOptions: ColumnOptionsMap;
  onNameChange: (idx: number, name: string) => void;
  onSwapDimensions: (idxA: number, idxB: number) => void;
  onResetDimension: (dimIdx: number) => void;
  onAddDimension: () => void;
  onRemoveDimension: (dimIdx: number) => void;
  onRemoveActivityColumn: (colIdx: number) => void;
}) {
  const selectColumns = columns.filter((c) => c.column_type === "select");
  const numberColumns = columns.filter((c) => c.column_type === "number");

  return (
    <div className="space-y-3 py-1">
      <p className="text-xs text-gray-400 mb-2">
        Edit column names. Each select column represents a dimension extracted
        from emission factor names. Use the arrows to reorder dimensions.
      </p>

      {/* Select (dimension) columns */}
      {selectColumns.map((col, dimIdx) => {
        const globalIdx = columns.indexOf(col);
        const opts = columnOptions[col.column_name] || [];
        const sampleValues = opts.slice(0, 6).map((o) => o.label);
        const moreCount = opts.length - sampleValues.length;

        return (
          <div
            key={globalIdx}
            className="border border-gray-200 rounded-lg p-3 space-y-2"
          >
            {/* Header row: badge + name input + swap buttons + new/existing */}
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded font-medium shrink-0 bg-indigo-100 text-indigo-700">
                Dim {dimIdx + 1}
              </span>
              <input
                type="text"
                value={col.column_name}
                onChange={(e) => onNameChange(globalIdx, e.target.value)}
                className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />

              {/* Swap buttons */}
              <div className="flex flex-col shrink-0">
                <button
                  onClick={() => onSwapDimensions(dimIdx, dimIdx - 1)}
                  disabled={dimIdx === 0}
                  className="text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed text-xs leading-none px-1"
                  title="Move up"
                >
                  &#9650;
                </button>
                <button
                  onClick={() => onSwapDimensions(dimIdx, dimIdx + 1)}
                  disabled={dimIdx === selectColumns.length - 1}
                  className="text-gray-400 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed text-xs leading-none px-1"
                  title="Move down"
                >
                  &#9660;
                </button>
              </div>

              {/* Reset dimension button */}
              <button
                onClick={() => onResetDimension(dimIdx)}
                className="text-xs text-gray-400 hover:text-purple-600 shrink-0 px-1.5 py-0.5 rounded hover:bg-purple-50 transition-colors"
                title="Reset this dimension's values from emission factor names"
              >
                Reset
              </button>

              {/* Remove dimension button */}
              <button
                onClick={() => onRemoveDimension(dimIdx)}
                className="text-xs text-gray-400 hover:text-red-500 shrink-0 px-1 py-0.5 rounded hover:bg-red-50 transition-colors"
                title="Remove this dimension"
              >
                &times;
              </button>

              {col.is_new ? (
                <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded shrink-0">
                  new
                </span>
              ) : (
                <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded shrink-0">
                  existing
                </span>
              )}
            </div>

            {/* Sample values */}
            <div className="flex flex-wrap gap-1 ml-1">
              {sampleValues.map((v) => (
                <span
                  key={v}
                  className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"
                >
                  {v}
                </span>
              ))}
              {moreCount > 0 && (
                <span className="text-xs text-gray-400 px-1 py-0.5">
                  +{moreCount} more
                </span>
              )}
              {opts.length === 0 && (
                <span className="text-xs text-gray-400 italic">No values</span>
              )}
            </div>
          </div>
        );
      })}

      {/* Add dimension button */}
      <button
        onClick={onAddDimension}
        className="w-full border border-dashed border-gray-300 rounded-lg py-2 text-xs text-gray-500 hover:border-purple-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"
      >
        + Add Dimension
      </button>

      {/* Number (activity) columns */}
      {numberColumns.map((col) => {
        const globalIdx = columns.indexOf(col);
        return (
          <div key={globalIdx} className="flex items-center gap-3">
            <span className="text-xs px-2 py-0.5 rounded font-medium shrink-0 w-16 text-center bg-emerald-100 text-emerald-700">
              number
            </span>
            <input
              type="text"
              value={col.column_name}
              onChange={(e) => onNameChange(globalIdx, e.target.value)}
              className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
            {col.is_new ? (
              <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded shrink-0">
                new
              </span>
            ) : (
              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded shrink-0">
                existing
              </span>
            )}
            <button
              onClick={() => onRemoveActivityColumn(globalIdx)}
              className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors shrink-0"
              title="Remove this activity column"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Tab: Dropdown Options ─────────────────────────────────────────────────────

function OptionsTab({
  columns,
  columnOptions,
  onRemoveOption,
  onAddOption,
}: {
  columns: ProposedColumn[];
  columnOptions: ColumnOptionsMap;
  onRemoveOption: (colName: string, idx: number) => void;
  onAddOption: (colName: string, id: string, label: string) => void;
}) {
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");

  const handleAdd = (colName: string) => {
    if (!newLabel.trim()) return;
    const id = newLabel.trim().toLowerCase().replace(/\s+/g, "_");
    onAddOption(colName, id, newLabel.trim());
    setNewLabel("");
  };

  return (
    <div className="space-y-4 py-1">
      <p className="text-xs text-gray-400">
        Dropdown options extracted from emission factor names. Click to remove, or add new ones.
      </p>
      {columns.map((col) => {
        const options = columnOptions[col.column_name] || [];
        return (
          <div key={col.column_name}>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-gray-700">
                {col.column_name}
                <span className="text-gray-400 font-normal ml-1">({options.length})</span>
              </span>
              <button
                onClick={() =>
                  setAddingTo(addingTo === col.column_name ? null : col.column_name)
                }
                className="text-xs text-purple-600 hover:text-purple-800"
              >
                {addingTo === col.column_name ? "Cancel" : "+ Add"}
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {options.map((opt, idx) => (
                <span
                  key={String(opt.id)}
                  className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-700 pl-2 pr-1 py-1 rounded group"
                >
                  {opt.label}
                  <button
                    onClick={() => onRemoveOption(col.column_name, idx)}
                    className="text-gray-400 hover:text-red-500 ml-0.5"
                    title="Remove"
                  >
                    &times;
                  </button>
                </span>
              ))}
              {options.length === 0 && (
                <span className="text-xs text-gray-400">No options</span>
              )}
            </div>

            {addingTo === col.column_name && (
              <div className="flex gap-2 mt-2">
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Option label"
                  className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAdd(col.column_name);
                  }}
                />
                <button
                  onClick={() => handleAdd(col.column_name)}
                  disabled={!newLabel.trim()}
                  className="px-3 py-1 text-xs font-medium bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-300"
                >
                  Add
                </button>
              </div>
            )}
          </div>
        );
      })}
      {columns.length === 0 && (
        <p className="text-sm text-gray-400">No dropdown columns in this config.</p>
      )}
    </div>
  );
}

// ─── Tab: Dependencies ─────────────────────────────────────────────────────────

function DependenciesTab({
  dependencies,
  dependentOptions,
  columnOptions,
}: {
  dependencies: ColumnDependencies;
  dependentOptions: DependentOptionsMap;
  columnOptions: ColumnOptionsMap;
  onRemoveDependentOption: (childCol: string, parentValue: string, idx: number) => void;
  onAddDependentOption: (
    childCol: string,
    parentValue: string,
    id: string,
    label: string
  ) => void;
}) {
  const depEntries = Object.entries(dependencies);
  const [selectedDepIdx, setSelectedDepIdx] = useState(0);

  const currentDep = depEntries[selectedDepIdx];
  const child = currentDep?.[0] || "";
  const parent = currentDep?.[1] || "";
  const parentOpts = columnOptions[parent] || [];
  const childDepOpts = dependentOptions[child] || {};

  return (
    <div className="space-y-3 py-1">
      {/* Dependency chain */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
        {depEntries.map(([ch, par], idx) => (
          <span key={ch} className="flex items-center gap-1.5">
            {idx === 0 && <span className="font-medium text-gray-700">{par}</span>}
            <span className="text-gray-400">&rarr;</span>
            <span className="font-medium text-gray-700">{ch}</span>
          </span>
        ))}
      </div>

      {/* Dependency selector (if multiple) */}
      {depEntries.length > 1 && (
        <div className="flex gap-1">
          {depEntries.map(([ch, par], idx) => (
            <button
              key={ch}
              onClick={() => setSelectedDepIdx(idx)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                idx === selectedDepIdx
                  ? "bg-purple-100 text-purple-700 border border-purple-300"
                  : "bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100"
              }`}
            >
              {ch} &larr; {par}
            </button>
          ))}
        </div>
      )}

      {/* Simple table: parent value → child values */}
      {currentDep && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-1/3">
                  {parent}
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                  {child} options
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {parentOpts.map((parentOpt) => {
                const opts = childDepOpts[parentOpt.label] || [];
                return (
                  <tr key={String(parentOpt.id)}>
                    <td className="px-3 py-2 text-xs font-medium text-gray-700 align-top">
                      {parentOpt.label}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-gray-600">
                      {opts.length > 0
                        ? opts.map((o: DropdownOptionValue) => o.label).join(", ")
                        : <span className="text-gray-400">&mdash;</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400">
        You can edit dependent options after creation from the config table.
      </p>
    </div>
  );
}

// ─── Tab: Emission Category Mappings ───────────────────────────────────────────

function MappingsTab({
  mappings,
  hasDeps,
  onUpdateValue,
  onRemove,
  onRegenerate,
}: {
  mappings: EmissionCategoryMapping;
  hasDeps: boolean;
  onUpdateValue: (key: string, value: string) => void;
  onRemove: (key: string) => void;
  onRegenerate: () => void;
}) {
  const entries = Object.entries(mappings);

  return (
    <div className="space-y-3 py-1">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          Maps dropdown value combinations to emission category names in the database.
        </p>
        {hasDeps && (
          <button
            onClick={onRegenerate}
            className="text-xs text-purple-600 hover:text-purple-800 font-medium shrink-0 ml-2"
          >
            Regenerate
          </button>
        )}
      </div>

      {entries.length > 0 ? (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                  Key
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                  Emission Category Name
                </th>
                <th className="px-3 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map(([key, value]) => (
                <tr key={key}>
                  <td className="px-3 py-1.5 text-xs text-gray-600 font-mono whitespace-nowrap">
                    {key}
                  </td>
                  <td className="px-3 py-1">
                    <input
                      type="text"
                      value={value}
                      onChange={(e) => onUpdateValue(key, e.target.value)}
                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-purple-500"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <button
                      onClick={() => onRemove(key)}
                      className="text-gray-400 hover:text-red-500 text-sm"
                    >
                      &times;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-400 text-center py-4">
          No mappings.{" "}
          {hasDeps && (
            <button onClick={onRegenerate} className="text-purple-600 hover:underline">
              Generate from dependencies
            </button>
          )}
        </p>
      )}
    </div>
  );
}
