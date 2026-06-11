import { useState, useMemo, useCallback, useRef } from "react";
import {
  Upload,
  AlertTriangle,
  Check,
  Loader2,
  X,
  Pencil,
  Filter,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Info,
  Search,
  Plus,
} from "lucide-react";
import Modal from "./Modal";
import Dropdown, { DropdownOption } from "./Dropdown";
import AutoGenerateColumnConfigModal from "./AutoGenerateColumnConfigModal";
import {
  parseEmissionFactorExcel,
  reAnalyzeEmissionFactors,
  ParsedEmissionFactor,
  CategorySuggestion,
  updateUploadResults,
  SchemaDetected,
  ColumnHeader,
} from "../services/emissionFactorParseService";
import { bulkCreateEmissionFactors } from "../services/emissionFactorService";

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

interface SmartUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  sites: Site[];
  categories: Category[];
  onRefresh: () => void;
}

type Step = "idle" | "uploading" | "configure" | "re-analyzing" | "preview" | "submitting" | "result";

interface EditableRow extends ParsedEmissionFactor {
  _id: number;
  _excluded: boolean;
}

// ---------------------------------------------------------------------------
// Inline editable cell
// ---------------------------------------------------------------------------
const EditableCell = ({
  value,
  onChange,
  type = "text",
}: {
  value: string | number;
  onChange: (v: string | number) => void;
  type?: "text" | "number";
}) => {
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState(String(value));

  if (!editing) {
    return (
      <span
        className="cursor-pointer hover:bg-yellow-50 px-1 py-0.5 rounded inline-flex items-center gap-1 group"
        onClick={() => {
          setEditing(true);
          setTemp(String(value));
        }}
      >
        {value || <span className="text-gray-400">-</span>}
        <Pencil
          size={12}
          className="text-gray-300 group-hover:text-gray-500 shrink-0"
        />
      </span>
    );
  }

  const commit = () => {
    setEditing(false);
    if (type === "number") {
      const parsed = parseFloat(temp);
      if (!isNaN(parsed)) onChange(parsed);
    } else {
      onChange(temp);
    }
  };

  return (
    <input
      autoFocus
      type={type}
      step={type === "number" ? "any" : undefined}
      value={temp}
      onChange={(e) => setTemp(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setEditing(false);
      }}
      className="w-full border border-blue-300 px-1.5 py-0.5 rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
    />
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const SmartUploadModal = ({
  isOpen,
  onClose,
  sites,
  categories,
  onRefresh,
}: SmartUploadModalProps) => {
  const [step, setStep] = useState<Step>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [layoutType, setLayoutType] = useState("");
  const [parentCategories, setParentCategories] = useState<string[]>([]);
  const [selectedParent, setSelectedParent] = useState<string | null>(null);

  // Target site
  const [selectedSiteValue, setSelectedSiteValue] = useState<
    string | number
  >("all");

  // Category mapping: parentCategory → DB categoryId
  // For single/no parent: key is "__all__"
  const [categoryMapping, setCategoryMapping] = useState<
    Record<string, number | null>
  >({});

  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    created: number;
    skipped: number;
    errors: string[];
    siteBreakdown?: {
      assigned: { name: string; category: string }[];
      notAssigned: { name: string; category: string }[];
    };
  } | null>(null);

  const [warningsExpanded, setWarningsExpanded] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [suggestions, setSuggestions] = useState<CategorySuggestion[]>([]);
  const [uploadId, setUploadId] = useState<number | null>(null);
  const [autoGenTarget, setAutoGenTarget] = useState<{
    siteId: number;
    categoryId: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sheet & column mapping state (configure step)
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [availableColumns, setAvailableColumns] = useState<ColumnHeader[]>([]);
  const [detectedSchema, setDetectedSchema] = useState<SchemaDetected | null>(null);

  // Column mapping overrides — user picks which column maps to what
  const [colCategoryName, setColCategoryName] = useState<number | null>(null);
  const [colFactorValue, setColFactorValue] = useState<number | null>(null);
  const [colUnit, setColUnit] = useState<number | null>(null);
  const [colSource, setColSource] = useState<number | null>(null);

  // ---- derived: multi-parent mode ----
  const hasMultipleParents = parentCategories.length > 1;

  // ---- derived: sites & categories ----
  const isAllSites = selectedSiteValue === "all";
  const specificSiteId = isAllSites ? null : Number(selectedSiteValue);
  const selectedSite = sites.find((s) => s.site_id === specificSiteId);

  const siteOptions: DropdownOption[] = useMemo(
    () => [
      { id: "all", label: "All Sites" },
      ...sites.map((s) => ({ id: s.site_id, label: s.name })),
    ],
    [sites]
  );

  // All unique categories across every site
  const allUniqueCategories = useMemo(() => {
    const map = new Map<number, Category>();
    for (const site of sites) {
      for (const cat of site.categories || []) {
        if (!map.has(cat.category_id)) {
          map.set(cat.category_id, cat);
        }
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.category_name.localeCompare(b.category_name)
    );
  }, [sites]);

  const categoryOptions: DropdownOption[] = useMemo(() => {
    const cats = isAllSites
      ? allUniqueCategories
      : selectedSite?.categories || [];
    return cats.map((c) => ({ id: c.category_id, label: c.category_name }));
  }, [isAllSites, allUniqueCategories, selectedSite]);

  // Parent-category filter dropdown options (from Excel data)
  const parentFilterOptions: DropdownOption[] = useMemo(
    () => [
      { id: "all", label: "All Groups" },
      ...parentCategories.map((pc) => ({ id: pc, label: pc })),
    ],
    [parentCategories]
  );

  // How many groups have a mapped DB category
  const mappedGroupCount = useMemo(
    () =>
      Object.values(categoryMapping).filter((v) => v !== null && v !== undefined)
        .length,
    [categoryMapping]
  );

  // Count factors per parent category (for the mapping table labels)
  const factorCountByParent = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) {
      const key = r.parent_category || "__all__";
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [rows]);

  // ---- derived: rows ----
  const filteredRows = useMemo(() => {
    let res = rows.filter((r) => selectedYears.includes(r.year));
    if (selectedParent) {
      res = res.filter((r) => r.parent_category === selectedParent);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      res = res.filter(
        (r) =>
          (r.emission_category_name || "").toLowerCase().includes(q) ||
          String(r.factor_value).includes(q) ||
          (r.denominator_unit || "").toLowerCase().includes(q) ||
          (r.source || "").toLowerCase().includes(q)
      );
    }
    return res;
  }, [rows, selectedYears, selectedParent, searchTerm]);

  const includedRows = useMemo(
    () => filteredRows.filter((r) => !r._excluded),
    [filteredRows]
  );

  // ---- helpers ----
  const updateMapping = (parentCat: string, dbCategoryId: number | null) => {
    setCategoryMapping((prev) => ({ ...prev, [parentCat]: dbCategoryId }));
  };

  const addManualRow = () => {
    const newId = rows.length > 0 ? Math.max(...rows.map((r) => r._id)) + 1 : 0;
    const defaultYear = selectedYears.length > 0 ? selectedYears[0] : new Date().getFullYear();
    const newRow: EditableRow = {
      _id: newId,
      _excluded: false,
      year: defaultYear,
      factor_value: 0,
      emission_category_name: "",
      denominator_unit: "",
      source: "",
      parent_category: selectedParent || parentCategories[0] || undefined,
    };
    setRows((prev) => [...prev, newRow]);
  };

  // ---- reset ----
  const reset = useCallback(() => {
    setStep("idle");
    setFile(null);
    setRows([]);
    setAvailableYears([]);
    setSelectedYears([]);
    setWarnings([]);
    setLayoutType("");
    setParentCategories([]);
    setSheetNames([]);
    setSelectedSheet(null);
    setAvailableColumns([]);
    setDetectedSchema(null);
    setColCategoryName(null);
    setColFactorValue(null);
    setColUnit(null);
    setColSource(null);
    setSelectedParent(null);
    setSelectedSiteValue("all");
    setCategoryMapping({});
    setError(null);
    setResult(null);
    setWarningsExpanded(false);
    setSearchTerm("");
    setSuggestions([]);
    setUploadId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  // ---- Populate state from parse response ----
  const applyParseResult = (data: {
    factors: ParsedEmissionFactor[];
    available_years: number[];
    warnings: string[];
    schema_detected: SchemaDetected;
    parent_categories: string[];
    category_suggestions?: CategorySuggestion[];
    upload_id?: number;
    sheet_names: string[];
    selected_sheet?: string;
    available_columns: ColumnHeader[];
  }) => {
    const editableRows: EditableRow[] = data.factors.map((f, i) => ({
      ...f,
      _id: i,
      _excluded: false,
    }));
    setRows(editableRows);
    setAvailableYears(data.available_years);
    setSelectedYears([...data.available_years]);
    setWarnings(data.warnings);
    setLayoutType(data.schema_detected.layout_type);
    setParentCategories(data.parent_categories);
    setSelectedParent(null);
    setSuggestions(data.category_suggestions || []);
    setUploadId(data.upload_id ?? null);
    setSheetNames(data.sheet_names);
    setSelectedSheet(data.selected_sheet ?? data.sheet_names[0] ?? null);
    setAvailableColumns(data.available_columns);
    setDetectedSchema(data.schema_detected);

    // Auto-fill column mapping from detected schema
    const schema = data.schema_detected;
    setColCategoryName(
      schema.descriptor_columns?.[0]?.column_index ?? null
    );
    setColUnit(schema.unit_column?.column_index ?? null);
    setColSource(schema.source_column?.column_index ?? null);
    if (schema.layout_type === "simple" && schema.years?.[0]?.value_column) {
      setColFactorValue(schema.years[0].value_column);
    } else {
      setColFactorValue(null);
    }
    // Build category mapping — auto-fill from AI suggestions
    const keys =
      data.parent_categories.length > 1
        ? data.parent_categories
        : ["__all__"];
    const mapping: Record<string, number | null> = {};
    for (const k of keys) mapping[k] = null;

    for (const s of data.category_suggestions || []) {
      if (
        s.suggested_category_id !== null &&
        (s.confidence === "high" || s.confidence === "medium")
      ) {
        const key =
          data.parent_categories.length > 1 ? s.parent_category : "__all__";
        mapping[key] = s.suggested_category_id;
      }
    }
    setCategoryMapping(mapping);
  };

  // ---- Step 1: Analyze file ----
  const handleAnalyze = async () => {
    if (!file) return;
    setStep("uploading");
    setError(null);

    try {
      // Pass DB categories so the backend can infer mappings in one call
      const dbCats = allUniqueCategories.map((c) => ({
        id: c.category_id,
        name: c.category_name,
      }));
      const data = await parseEmissionFactorExcel(file, dbCats);
      applyParseResult(data);
      setStep("configure");
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Failed to analyze file. Please try again.";
      setError(msg);
      setStep("idle");
    }
  };

  // ---- Re-analyze: change sheet or column mapping ----
  const handleReAnalyze = async (newSheet?: string, schemaOverride?: Record<string, unknown>) => {
    if (!uploadId) return;
    setStep("re-analyzing");
    setError(null);

    try {
      const dbCats = allUniqueCategories.map((c) => ({
        id: c.category_id,
        name: c.category_name,
      }));
      const data = await reAnalyzeEmissionFactors(uploadId, {
        sheet_name: newSheet ?? selectedSheet ?? undefined,
        schema_override: schemaOverride,
        db_categories: dbCats,
      });
      applyParseResult(data);
      setStep("configure");
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.message ||
        "Re-analysis failed. Please try again.";
      setError(msg);
      setStep("configure");
    }
  };

  // ---- Edit handlers ----
  const updateRow = (id: number, field: string, value: string | number) => {
    setRows((prev) =>
      prev.map((r) => (r._id === id ? { ...r, [field]: value } : r))
    );
  };

  const toggleExclude = (id: number) => {
    setRows((prev) =>
      prev.map((r) => (r._id === id ? { ...r, _excluded: !r._excluded } : r))
    );
  };

  const toggleAllVisible = () => {
    const allIncluded = filteredRows.every((r) => !r._excluded);
    const filteredIds = new Set(filteredRows.map((r) => r._id));
    setRows((prev) =>
      prev.map((r) =>
        filteredIds.has(r._id) ? { ...r, _excluded: allIncluded } : r
      )
    );
  };

  const toggleYear = (year: number) => {
    setSelectedYears((prev) =>
      prev.includes(year) ? prev.filter((y) => y !== year) : [...prev, year]
    );
  };

  // ---- Submit ----
  const handleSubmit = async () => {
    // Validate mapping
    if (hasMultipleParents) {
      if (mappedGroupCount === 0) {
        setError("Please map at least one group to a category.");
        return;
      }
    } else {
      if (!categoryMapping.__all__) {
        setError("Please select a target category.");
        return;
      }
    }

    if (includedRows.length === 0) {
      setError("No factors selected for upload.");
      return;
    }

    setStep("submitting");
    setError(null);

    try {
      let totalCreated = 0;
      let totalSkipped = 0;
      const allErrors: string[] = [];

      // Build groups: { parentCat, dbCategoryId, rows }
      type FactorGroup = {
        parentCat: string | null;
        dbCategoryId: number;
        rows: EditableRow[];
      };
      const groups: FactorGroup[] = [];

      if (hasMultipleParents) {
        for (const [parentCat, dbCatId] of Object.entries(categoryMapping)) {
          if (dbCatId === null) continue;
          const groupRows = includedRows.filter(
            (r) => r.parent_category === parentCat
          );
          if (groupRows.length > 0) {
            groups.push({
              parentCat,
              dbCategoryId: dbCatId,
              rows: groupRows,
            });
          }
        }
      } else {
        groups.push({
          parentCat:
            parentCategories.length === 1 ? parentCategories[0] : null,
          dbCategoryId: categoryMapping.__all__!,
          rows: includedRows,
        });
      }

      // For each group, determine target sites and upload
      // Track which sites were assigned vs skipped (for "All Sites" mode)
      const assignedSites: { name: string; category: string }[] = [];
      const notAssignedSites: { name: string; category: string }[] = [];

      for (const group of groups) {
        const catName =
          categories.find((c) => c.category_id === group.dbCategoryId)
            ?.category_name || `Category ${group.dbCategoryId}`;

        const groupSites = isAllSites
          ? sites.filter((s) =>
              (s.categories || []).some(
                (c) => c.category_id === group.dbCategoryId
              )
            )
          : selectedSite
            ? [selectedSite]
            : [];

        // Track sites not assigned to this category
        if (isAllSites) {
          const skipped = sites.filter(
            (s) =>
              !(s.categories || []).some(
                (c) => c.category_id === group.dbCategoryId
              )
          );
          for (const s of skipped) {
            notAssignedSites.push({ name: s.name, category: catName });
          }
          for (const s of groupSites) {
            assignedSites.push({ name: s.name, category: catName });
          }
        }

        for (const site of groupSites) {
          const factors = group.rows.map((r) => {
            // Store the FULL composite name (e.g. "Road - Van - CNG [km]").
            // The column-config generator splits these by " - " to build the
            // dropdown hierarchy + emission_category_mapping, and emission
            // calculation looks factors up by this full name. Stripping the
            // parent prefix here breaks both (and collapses distinct rows that
            // share a leaf, e.g. the two HGV variants → "All rigids [km]").
            const ecName = r.emission_category_name || undefined;
            return {
              site_id: site.site_id,
              category_id: group.dbCategoryId,
              year: r.year,
              factor_value: r.factor_value,
              denominator_unit: r.denominator_unit || undefined,
              source: r.source || undefined,
              emission_category_name: ecName,
              global_category_name: ecName,
            };
          });

          try {
            const res = await bulkCreateEmissionFactors(factors);
            totalCreated += res.created ?? 0;
            totalSkipped += res.skipped ?? 0;
            if (res.errors) allErrors.push(...res.errors);
          } catch (err: any) {
            allErrors.push(
              `Failed for site "${site.name}"${group.parentCat ? ` / ${group.parentCat}` : ""}: ${
                err?.response?.data?.message ||
                err?.message ||
                "Unknown error"
              }`
            );
          }
        }
      }

      setResult({
        created: totalCreated,
        skipped: totalSkipped,
        errors: allErrors,
        siteBreakdown:
          isAllSites
            ? { assigned: assignedSites, notAssigned: notAssignedSites }
            : undefined,
      });
      setStep("result");
      onRefresh();

      // Record upload results in Python backend
      if (uploadId) {
        const categoryIds = [
          ...new Set(
            Object.values(categoryMapping).filter(
              (v): v is number => v !== null
            )
          ),
        ];
        updateUploadResults(uploadId, {
          records_created: totalCreated,
          records_skipped: totalSkipped,
          status: allErrors.length > 0 ? "completed_with_errors" : "completed",
          site_id: specificSiteId ?? undefined,
          category_ids: categoryIds.length > 0 ? categoryIds : undefined,
        }).catch(() => {}); // fire-and-forget
      }

      if (totalCreated > 0 && totalSkipped === 0 && allErrors.length === 0 && !specificSiteId) {
        setTimeout(handleClose, 2000);
      }
    } catch (err: any) {
      setError(
        err?.response?.data?.message || "Failed to upload emission factors."
      );
      setStep("preview");
    }
  };

  // ---- Render ----
  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Smart Upload Emission Factors"
      className="!max-w-6xl"
    >
      <div className="space-y-4">
        {/* ========== IDLE ========== */}
        {step === "idle" && (
          <>
            <p className="text-sm text-gray-600">
              Upload a complex emission factor Excel file. The system will
              automatically detect the layout and extract structured data for
              your review.
            </p>

            <div>
              <label className="block text-sm font-medium mb-1">
                Excel File *
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleAnalyze}
                disabled={!file}
                className="px-5 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2"
              >
                <Upload size={16} />
                Analyze File
              </button>
            </div>
          </>
        )}

        {/* ========== UPLOADING ========== */}
        {step === "uploading" && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 size={32} className="animate-spin text-purple-500" />
            <p className="text-sm text-gray-600">
              Analyzing spreadsheet structure...
            </p>
            <p className="text-xs text-gray-400">
              This may take a few seconds
            </p>
          </div>
        )}

        {/* ========== CONFIGURE (sheet & column mapping) ========== */}
        {step === "configure" && (
          <>
            {/* Summary of what was detected */}
            <div className="flex items-center gap-3 bg-purple-50 border border-purple-200 rounded-lg px-4 py-3">
              <Check size={18} className="text-purple-500 shrink-0" />
              <div className="text-sm">
                <span className="font-medium text-purple-800">
                  Found {rows.length} emission factors
                </span>{" "}
                <span className="text-purple-600">
                  across years {availableYears.join(", ")} (
                  {layoutType.replace(/_/g, " ")} layout)
                </span>
              </div>
            </div>

            {/* Warnings */}
            {warnings.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-medium text-yellow-800">
                  <AlertTriangle size={16} />
                  {warnings.length} warning(s)
                </div>
                <div className="mt-2 text-xs text-yellow-700 space-y-1 max-h-32 overflow-y-auto">
                  {warnings.map((w, i) => (
                    <p key={i}>{w}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Sheet picker */}
            {sheetNames.length > 1 && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Sheet
                </label>
                <div className="flex flex-wrap gap-2">
                  {sheetNames.map((name) => (
                    <button
                      key={name}
                      onClick={() => {
                        if (name !== selectedSheet) {
                          setSelectedSheet(name);
                          handleReAnalyze(name);
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        name === selectedSheet
                          ? "bg-purple-600 text-white border-purple-600"
                          : "bg-white text-gray-700 border-gray-200 hover:border-purple-300 hover:bg-purple-50"
                      }`}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Column mapping */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Column Mapping
                </span>
                <span className="text-xs text-gray-400 ml-2">
                  (auto-detected — adjust if needed)
                </span>
              </div>
              <div className="divide-y divide-gray-100 p-4 space-y-3">
                {/* Category Name column */}
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-700 w-40 shrink-0 font-medium">
                    Category Name *
                  </label>
                  <ArrowRight size={14} className="text-gray-300 shrink-0" />
                  <select
                    value={colCategoryName ?? ""}
                    onChange={(e) => setColCategoryName(e.target.value ? Number(e.target.value) : null)}
                    className="flex-1 border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-400"
                  >
                    <option value="">-- Select column --</option>
                    {availableColumns.map((col) => (
                      <option key={col.column_index} value={col.column_index}>
                        {col.header_name} (e.g. {col.sample_values[0] || "—"})
                      </option>
                    ))}
                  </select>
                  {detectedSchema?.descriptor_columns?.[0]?.column_index === colCategoryName && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 shrink-0">
                      AI detected
                    </span>
                  )}
                </div>

                {/* Factor Value column */}
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-700 w-40 shrink-0 font-medium">
                    Factor Value *
                  </label>
                  <ArrowRight size={14} className="text-gray-300 shrink-0" />
                  <select
                    value={colFactorValue ?? ""}
                    onChange={(e) => setColFactorValue(e.target.value ? Number(e.target.value) : null)}
                    className="flex-1 border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-400"
                  >
                    <option value="">-- Select column --</option>
                    {availableColumns.map((col) => (
                      <option key={col.column_index} value={col.column_index}>
                        {col.header_name} (e.g. {col.sample_values[0] || "—"})
                      </option>
                    ))}
                  </select>
                  {detectedSchema?.years?.[0]?.value_column === colFactorValue && colFactorValue !== null && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 shrink-0">
                      AI detected
                    </span>
                  )}
                </div>

                {/* Unit column */}
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-700 w-40 shrink-0">
                    Unit
                  </label>
                  <ArrowRight size={14} className="text-gray-300 shrink-0" />
                  <select
                    value={colUnit ?? ""}
                    onChange={(e) => setColUnit(e.target.value ? Number(e.target.value) : null)}
                    className="flex-1 border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-400"
                  >
                    <option value="">-- None --</option>
                    {availableColumns.map((col) => (
                      <option key={col.column_index} value={col.column_index}>
                        {col.header_name} (e.g. {col.sample_values[0] || "—"})
                      </option>
                    ))}
                  </select>
                  {detectedSchema?.unit_column?.column_index === colUnit && colUnit !== null && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 shrink-0">
                      AI detected
                    </span>
                  )}
                </div>

                {/* Source column */}
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-700 w-40 shrink-0">
                    Source
                  </label>
                  <ArrowRight size={14} className="text-gray-300 shrink-0" />
                  <select
                    value={colSource ?? ""}
                    onChange={(e) => setColSource(e.target.value ? Number(e.target.value) : null)}
                    className="flex-1 border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-purple-400"
                  >
                    <option value="">-- None --</option>
                    {availableColumns.map((col) => (
                      <option key={col.column_index} value={col.column_index}>
                        {col.header_name} (e.g. {col.sample_values[0] || "—"})
                      </option>
                    ))}
                  </select>
                  {detectedSchema?.source_column?.column_index === colSource && colSource !== null && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 shrink-0">
                      AI detected
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={reset}
                className="px-4 py-2 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 text-sm"
              >
                Back
              </button>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    // User changed columns — re-analyze with override
                    if (!detectedSchema) return;
                    const hasChanges =
                      colCategoryName !== detectedSchema.descriptor_columns?.[0]?.column_index ||
                      colFactorValue !== (detectedSchema.years?.[0]?.value_column ?? null) ||
                      colUnit !== (detectedSchema.unit_column?.column_index ?? null) ||
                      colSource !== (detectedSchema.source_column?.column_index ?? null);

                    if (hasChanges && colCategoryName && colFactorValue) {
                      // Build a simple schema override from user selections
                      const override: Record<string, unknown> = {
                        ...detectedSchema,
                        descriptor_columns: [
                          { column_index: colCategoryName, header_name: availableColumns.find(c => c.column_index === colCategoryName)?.header_name || "Category" },
                        ],
                        unit_column: colUnit
                          ? { column_index: colUnit, header_name: availableColumns.find(c => c.column_index === colUnit)?.header_name || "Unit" }
                          : null,
                        source_column: colSource
                          ? { column_index: colSource, header_name: availableColumns.find(c => c.column_index === colSource)?.header_name || "Source" }
                          : null,
                        years: detectedSchema.years.map((y) => ({
                          ...y,
                          value_column: colFactorValue,
                        })),
                      };
                      handleReAnalyze(selectedSheet ?? undefined, override);
                    } else {
                      // No changes — just proceed
                      setStep("preview");
                    }
                  }}
                  disabled={!colCategoryName || !colFactorValue}
                  className="px-5 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium flex items-center gap-2"
                >
                  Continue to Preview
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}

        {/* ========== RE-ANALYZING ========== */}
        {step === "re-analyzing" && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 size={32} className="animate-spin text-purple-500" />
            <p className="text-sm text-gray-600">
              Re-analyzing with new settings...
            </p>
            <p className="text-xs text-gray-400">
              This may take a few seconds
            </p>
          </div>
        )}

        {/* ========== PREVIEW ========== */}
        {step === "preview" && (
          <>
            {/* Summary */}
            <div className="flex items-center justify-between bg-purple-50 border border-purple-200 rounded-lg px-4 py-3">
              <div className="flex items-center gap-3">
                <Check size={18} className="text-purple-500 shrink-0" />
                <div className="text-sm">
                  <span className="font-medium text-purple-800">
                    Found {rows.length} emission factors
                  </span>{" "}
                  <span className="text-purple-600">
                    across years {availableYears.join(", ")} (
                    {layoutType.replace(/_/g, " ")} layout)
                    {selectedSheet && sheetNames.length > 1 && (
                      <> &middot; sheet: {selectedSheet}</>
                    )}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setStep("configure")}
                className="text-xs text-purple-600 hover:text-purple-800 underline shrink-0"
              >
                Change Settings
              </button>
            </div>

            {/* Warnings — expandable */}
            {warnings.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-yellow-800">
                    <AlertTriangle size={16} />
                    {warnings.length} warning(s) found
                  </div>
                  <button
                    onClick={() => setWarningsExpanded(!warningsExpanded)}
                    className="p-1 rounded hover:bg-yellow-100 transition-colors"
                    title={warningsExpanded ? "Collapse" : "Expand"}
                  >
                    {warningsExpanded ? (
                      <ChevronUp size={16} className="text-yellow-600" />
                    ) : (
                      <ChevronDown size={16} className="text-yellow-600" />
                    )}
                  </button>
                </div>
                {warningsExpanded && (
                  <div className="px-4 pb-3 max-h-40 overflow-y-auto text-xs text-yellow-700 space-y-1 border-t border-yellow-200 pt-2">
                    {warnings.map((w, i) => (
                      <p key={i} className="flex gap-2">
                        <span className="text-yellow-500 font-mono shrink-0">
                          #{i + 1}
                        </span>
                        <span>{w}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Target site */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Target Site
              </label>
              <Dropdown
                options={siteOptions}
                placeholder="Select Site"
                value={selectedSiteValue}
                onChange={(opt) => {
                  setSelectedSiteValue(opt?.id ?? "all");
                  // Reset mapping when site changes since categories differ
                  const resetMap: Record<string, number | null> = {};
                  for (const key of Object.keys(categoryMapping)) {
                    resetMap[key] = null;
                  }
                  setCategoryMapping(resetMap);
                }}
                searchable
                clearable={false}
              />
            </div>

            {/* Category mapping — multi-parent: one dropdown per group */}
            {hasMultipleParents ? (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Map each Excel group to a database category
                  </span>
                </div>
                <div className="divide-y divide-gray-100">
                  {parentCategories.map((pc) => {
                    const count = factorCountByParent[pc] || 0;
                    const mapped = categoryMapping[pc];
                    const suggestion = suggestions.find(
                      (s) => s.parent_category === pc
                    );
                    return (
                      <div
                        key={pc}
                        className="flex items-center gap-3 px-4 py-3"
                      >
                        <div className="min-w-[200px] shrink-0">
                          <span className="text-sm font-medium text-gray-700">
                            {pc}
                          </span>
                          <span className="text-xs text-gray-400 ml-2">
                            ({count} factors)
                          </span>
                        </div>
                        <ArrowRight
                          size={14}
                          className="text-gray-300 shrink-0"
                        />
                        <div className="flex-1">
                          <Dropdown
                            options={categoryOptions}
                            placeholder="Select Category"
                            value={mapped}
                            onChange={(opt) =>
                              updateMapping(pc, (opt?.id as number) ?? null)
                            }
                            searchable
                          />
                        </div>
                        {mapped && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Check size={16} className="text-green-500" />
                            {suggestion?.suggested_category_id === mapped && (
                              <span
                                className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                                  suggestion.confidence === "high"
                                    ? "bg-green-100 text-green-700"
                                    : suggestion.confidence === "medium"
                                      ? "bg-yellow-100 text-yellow-700"
                                      : "bg-gray-100 text-gray-500"
                                }`}
                              >
                                AI {suggestion.confidence}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="bg-gray-50 px-4 py-2 text-xs text-gray-500">
                  {mappedGroupCount} of {parentCategories.length} groups mapped
                  {mappedGroupCount < parentCategories.length &&
                    " — unmapped groups will be skipped"}
                </div>
              </div>
            ) : (
              /* Single category dropdown */
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Target Category *
                </label>
                <Dropdown
                  options={categoryOptions}
                  placeholder="Select Category"
                  value={categoryMapping.__all__ ?? null}
                  onChange={(opt) =>
                    updateMapping("__all__", (opt?.id as number) ?? null)
                  }
                  searchable
                />
                {(() => {
                  const s = suggestions.find(
                    (sg) => sg.suggested_category_id === categoryMapping.__all__
                  );
                  return s && categoryMapping.__all__ ? (
                    <span
                      className={`mt-1 inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                        s.confidence === "high"
                          ? "bg-green-100 text-green-700"
                          : s.confidence === "medium"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      AI suggested ({s.confidence} confidence)
                    </span>
                  ) : null;
                })()}
              </div>
            )}

            {/* Duplicate info */}
            <div className="flex items-start gap-2 text-xs text-gray-500">
              <Info size={14} className="shrink-0 mt-0.5" />
              <span>
                Existing factors with matching site, category, year, and name
                will be automatically skipped (no duplicates).
              </span>
            </div>

            {/* Filters row: parent category dropdown + year chips */}
            <div className="flex flex-wrap items-end gap-4">
              {hasMultipleParents && (
                <div className="min-w-[200px]">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-gray-500 mb-1">
                    <Filter size={12} />
                    Filter by Group
                  </label>
                  <Dropdown
                    options={parentFilterOptions}
                    placeholder="All Groups"
                    value={selectedParent ?? "all"}
                    onChange={(opt) =>
                      setSelectedParent(
                        opt?.id === "all" ? null : String(opt?.id)
                      )
                    }
                    clearable={false}
                  />
                </div>
              )}

              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Years
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {availableYears.map((y) => (
                    <button
                      key={y}
                      onClick={() => toggleYear(y)}
                      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                        selectedYears.includes(y)
                          ? "bg-purple-600 text-white"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      {y}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Search bar + Add row */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  placeholder="Search by name, value, unit..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-purple-400 focus:border-purple-400"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <button
                onClick={addManualRow}
                className="flex items-center gap-1 px-3 py-1.5 text-sm border border-dashed border-purple-300 text-purple-600 rounded hover:bg-purple-50 transition-colors shrink-0"
              >
                <Plus size={14} />
                Add Row
              </button>
            </div>

            {/* Data table with row numbers */}
            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-[400px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2 text-left w-10">
                        <input
                          type="checkbox"
                          checked={
                            filteredRows.length > 0 &&
                            filteredRows.every((r) => !r._excluded)
                          }
                          ref={(el) => {
                            if (el) {
                              const some = filteredRows.some(
                                (r) => !r._excluded
                              );
                              const all = filteredRows.every(
                                (r) => !r._excluded
                              );
                              el.indeterminate = some && !all;
                            }
                          }}
                          onChange={toggleAllVisible}
                        />
                      </th>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-400 w-12">
                        #
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Year
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Emission Category Name
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Factor Value
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Unit
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Source
                      </th>
                      <th className="px-3 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredRows.map((row, idx) => {
                      // Show the full composite name — this is exactly what gets stored.
                      const displayName = row.emission_category_name || "";

                      return (
                        <tr
                          key={row._id}
                          className={`${
                            row._excluded
                              ? "opacity-40 bg-gray-50"
                              : "hover:bg-gray-50"
                          } transition-opacity`}
                        >
                          <td className="px-3 py-1.5">
                            <input
                              type="checkbox"
                              checked={!row._excluded}
                              onChange={() => toggleExclude(row._id)}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-xs text-gray-400 tabular-nums font-mono">
                            {idx + 1}
                          </td>
                          <td className="px-3 py-1.5 text-gray-700 tabular-nums">
                            {row.year}
                          </td>
                          <td className="px-3 py-1.5 max-w-[250px]">
                            <EditableCell
                              value={displayName}
                              onChange={(v) =>
                                updateRow(
                                  row._id,
                                  "emission_category_name",
                                  selectedParent
                                    ? `${selectedParent} - ${v}`
                                    : String(v)
                                )
                              }
                            />
                          </td>
                          <td className="px-3 py-1.5 tabular-nums">
                            <EditableCell
                              value={row.factor_value}
                              type="number"
                              onChange={(v) =>
                                updateRow(row._id, "factor_value", v)
                              }
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            <EditableCell
                              value={row.denominator_unit || ""}
                              onChange={(v) =>
                                updateRow(row._id, "denominator_unit", v)
                              }
                            />
                          </td>
                          <td className="px-3 py-1.5 text-xs text-gray-500 max-w-[200px] truncate">
                            {row.source || "-"}
                          </td>
                          <td className="px-3 py-1.5">
                            {!row._excluded && (
                              <button
                                onClick={() => toggleExclude(row._id)}
                                className="text-gray-300 hover:text-red-500"
                                title="Exclude row"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-sm text-gray-500">
                {includedRows.length} of {filteredRows.length} factors selected
                {hasMultipleParents && (
                  <> &middot; {mappedGroupCount}/{parentCategories.length} groups mapped</>
                )}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => sheetNames.length > 1 ? setStep("configure") : reset()}
                  className="px-4 py-2 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 text-sm"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={
                    includedRows.length === 0 ||
                    (hasMultipleParents
                      ? mappedGroupCount === 0
                      : !categoryMapping.__all__)
                  }
                  className="px-5 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
                >
                  Upload {includedRows.length} Factor(s)
                  {isAllSites ? " to All Sites" : ""}
                </button>
              </div>
            </div>
          </>
        )}

        {/* ========== SUBMITTING ========== */}
        {step === "submitting" && (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 size={32} className="animate-spin text-purple-500" />
            <p className="text-sm text-gray-600">
              Uploading emission factors
              {isAllSites ? " to all sites" : ""}...
            </p>
          </div>
        )}

        {/* ========== RESULT ========== */}
        {step === "result" && result && (
          <>
            <div
              className={`p-4 rounded-lg text-sm ${
                result.errors.length > 0
                  ? "bg-red-50 border border-red-200"
                  : result.skipped > 0
                    ? "bg-yellow-50 border border-yellow-200"
                    : "bg-green-50 border border-green-200"
              }`}
            >
              <p className="font-medium">
                Upload complete: {result.created} created
                {result.skipped > 0 && `, ${result.skipped} skipped (duplicates)`}
              </p>
              {result.errors.length > 0 && (
                <div className="mt-2 max-h-32 overflow-y-auto text-xs space-y-0.5">
                  {result.errors.map((err, i) => (
                    <p key={i} className="text-red-600">
                      {err}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {/* Site breakdown for "All Sites" uploads */}
            {result.siteBreakdown && (
              <div className="space-y-2">
                {result.siteBreakdown.assigned.length > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-xs font-medium text-green-800 mb-1.5">
                      Uploaded to {result.siteBreakdown.assigned.length} site(s):
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {result.siteBreakdown.assigned.map((s, i) => (
                        <span
                          key={i}
                          className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded"
                        >
                          {s.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {result.siteBreakdown.notAssigned.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-xs font-medium text-amber-800 mb-1.5">
                      Skipped {result.siteBreakdown.notAssigned.length} site(s) — category not assigned:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {result.siteBreakdown.notAssigned.map((s, i) => (
                        <span
                          key={i}
                          className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded"
                          title={`"${s.category}" is not assigned to this site`}
                        >
                          {s.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Auto-generate column config prompt */}
            {result.created > 0 && specificSiteId && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <p className="text-sm text-purple-800 font-medium mb-2">
                  Auto-generate column config for data entry?
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    ...new Set(
                      Object.values(categoryMapping).filter(
                        (v): v is number => v !== null
                      )
                    ),
                  ].map((catId) => {
                    const cat = categories.find((c) => c.category_id === catId);
                    return (
                      <button
                        key={catId}
                        onClick={() =>
                          setAutoGenTarget({
                            siteId: specificSiteId,
                            categoryId: catId,
                          })
                        }
                        className="px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
                      >
                        Generate for {cat?.category_name || `Category ${catId}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 text-sm"
              >
                Close
              </button>
            </div>
          </>
        )}

        {/* Auto-generate column config modal */}
        {autoGenTarget && (
          <AutoGenerateColumnConfigModal
            isOpen={!!autoGenTarget}
            onClose={() => setAutoGenTarget(null)}
            siteId={autoGenTarget.siteId}
            categoryId={autoGenTarget.categoryId}
            onSuccess={() => setAutoGenTarget(null)}
          />
        )}
      </div>
    </Modal>
  );
};

export default SmartUploadModal;
