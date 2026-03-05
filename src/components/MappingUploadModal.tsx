import { useState, useEffect, useMemo } from "react";
import {
  Upload,
  AlertTriangle,
  Check,
  Loader2,
  Pencil,
  Search,
} from "lucide-react";
import Modal from "./Modal";
import Dropdown, { DropdownOption } from "./Dropdown";
import {
  parseMappingExcel,
  ParsedMappingRow,
  bulkCreateMappings,
  CreateMappingPayload,
  BulkCreateResult,
} from "../services/categoryMappingService";
import { getEmissionCategoryNames } from "../services/emissionFactorService";

interface Company {
  company_id: number;
  name: string;
}

interface Site {
  site_id: number;
  name: string;
}

interface Category {
  category_id: number;
  category_name: string;
}

interface MappingUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  companies: Company[];
  sites: Site[];
  categories: Category[];
  onRefresh: () => void;
}

type Step = "idle" | "uploading" | "preview" | "submitting" | "result";

interface EditableRow extends ParsedMappingRow {
  _id: number;
  _excluded: boolean;
}

// ---------------------------------------------------------------------------
// Inline editable cell
// ---------------------------------------------------------------------------
const EditableCell = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState(value);

  if (!editing) {
    return (
      <span
        className="cursor-pointer hover:bg-yellow-50 px-1 py-0.5 rounded inline-flex items-center gap-1 group"
        onClick={() => {
          setEditing(true);
          setTemp(value);
        }}
      >
        {value || <span className="text-gray-400">-</span>}
        <Pencil
          size={12}
          className="opacity-0 group-hover:opacity-100 text-gray-400"
        />
      </span>
    );
  }

  return (
    <input
      autoFocus
      className="border border-blue-400 rounded px-1 py-0.5 text-sm w-full"
      value={temp}
      onChange={(e) => setTemp(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (temp.trim() !== value) onChange(temp.trim());
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          setEditing(false);
          if (temp.trim() !== value) onChange(temp.trim());
        }
        if (e.key === "Escape") {
          setEditing(false);
          setTemp(value);
        }
      }}
    />
  );
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const MappingUploadModal = ({
  isOpen,
  onClose,
  companies,
  sites,
  categories,
  onRefresh,
}: MappingUploadModalProps) => {
  const [step, setStep] = useState<Step>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<DropdownOption | null>(
    null
  );
  const [selectedSite, setSelectedSite] = useState<DropdownOption | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<DropdownOption | null>(null);
  const [selectAll, setSelectAll] = useState(true);
  const [result, setResult] = useState<BulkCreateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [knownCategoryNames, setKnownCategoryNames] = useState<Set<string>>(new Set());

  // Fetch known emission_category_name values when category (and optionally site) is selected
  useEffect(() => {
    if (!selectedCategory) {
      setKnownCategoryNames(new Set());
      return;
    }
    const categoryId = Number(selectedCategory.id);
    const siteId = selectedSite ? Number(selectedSite.id) : undefined;
    getEmissionCategoryNames(categoryId, siteId)
      .then((names) => setKnownCategoryNames(new Set(names)))
      .catch(() => setKnownCategoryNames(new Set()));
  }, [selectedCategory, selectedSite]);

  // Reset state on close
  const handleClose = () => {
    setStep("idle");
    setFile(null);
    setRows([]);
    setWarnings([]);
    setSearchTerm("");
    setSelectedCompany(null);
    setSelectedSite(null);
    setSelectedCategory(null);
    setSelectAll(true);
    setResult(null);
    setError(null);
    setKnownCategoryNames(new Set());
    onClose();
  };

  // Parse file
  const handleAnalyze = async () => {
    if (!file) return;
    setStep("uploading");
    setError(null);

    try {
      const data = await parseMappingExcel(file);
      const editableRows: EditableRow[] = data.mappings.map((m, i) => ({
        ...m,
        _id: i,
        _excluded: false,
      }));
      setRows(editableRows);
      setWarnings(data.warnings);
      setStep("preview");
    } catch (err: any) {
      setError(
        err?.response?.data?.detail || err.message || "Failed to parse file"
      );
      setStep("idle");
    }
  };

  // Submit mappings
  const handleSubmit = async () => {
    if (!selectedCompany || !selectedCategory) return;
    setStep("submitting");
    setError(null);

    try {
      const includedRows = filteredRows.filter((r) => !r._excluded);
      const payloads: CreateMappingPayload[] = includedRows.map((r) => ({
        company_id: Number(selectedCompany.id),
        company_name: String(selectedCompany.label),
        site_id: selectedSite ? Number(selectedSite.id) : null,
        category_id: Number(selectedCategory.id),
        company_category_name: r.company_category_name,
        global_category_name: r.global_category_name,
      }));

      const res = await bulkCreateMappings(payloads);
      setResult(res);
      setStep("result");
      onRefresh();
    } catch (err: any) {
      setError(
        err?.response?.data?.message || err.message || "Upload failed"
      );
      setStep("preview");
    }
  };

  // Filtered rows by search
  const filteredRows = useMemo(() => {
    if (!searchTerm) return rows;
    const term = searchTerm.toLowerCase();
    return rows.filter(
      (r) =>
        r.company_category_name.toLowerCase().includes(term) ||
        r.global_category_name.toLowerCase().includes(term)
    );
  }, [rows, searchTerm]);

  const includedCount = filteredRows.filter((r) => !r._excluded).length;
  const matchedCount = knownCategoryNames.size > 0
    ? rows.filter((r) => !r._excluded && knownCategoryNames.has(r.global_category_name)).length
    : 0;
  const unmatchedCount = knownCategoryNames.size > 0
    ? rows.filter((r) => !r._excluded && !knownCategoryNames.has(r.global_category_name)).length
    : 0;

  // Toggle select all
  const handleToggleAll = () => {
    const newVal = !selectAll;
    setSelectAll(newVal);
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        _excluded: !newVal,
      }))
    );
  };

  // Update a row field
  const updateRow = (
    id: number,
    field: keyof ParsedMappingRow,
    value: string
  ) => {
    setRows((prev) =>
      prev.map((r) => (r._id === id ? { ...r, [field]: value } : r))
    );
  };

  // Toggle single row
  const toggleRow = (id: number) => {
    setRows((prev) =>
      prev.map((r) => (r._id === id ? { ...r, _excluded: !r._excluded } : r))
    );
  };

  // Dropdown options
  const companyOptions: DropdownOption[] = companies.map((c) => ({
    id: c.company_id,
    label: c.name,
  }));

  const categoryOptions: DropdownOption[] = categories.map((c) => ({
    id: c.category_id,
    label: c.category_name,
  }));

  const siteOptions: DropdownOption[] = [
    { id: "all", label: "All Sites (Company-wide)" },
    ...sites.map((s) => ({ id: s.site_id, label: s.name })),
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Upload Category Mapping"
    >
      {/* Step: idle */}
      {step === "idle" && (
        <div className="space-y-4">
          {/* Company + Category + Site selection */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Company *
              </label>
              <Dropdown
                options={companyOptions}
                value={selectedCompany?.id ?? null}
                onChange={(opt) => setSelectedCompany(opt)}
                placeholder="Select company"
                searchable
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category *
              </label>
              <Dropdown
                options={categoryOptions}
                value={selectedCategory?.id ?? null}
                onChange={(opt) => setSelectedCategory(opt)}
                placeholder="Select category"
                searchable
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Site (optional)
              </label>
              <Dropdown
                options={siteOptions}
                value={selectedSite?.id ?? null}
                onChange={(opt) =>
                  setSelectedSite(opt.id === "all" ? null : opt)
                }
                placeholder="All Sites (Company-wide)"
                searchable
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Excel File (.xlsx)
            </label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            <p className="mt-1 text-xs text-gray-500">
              Expected columns: Company Category Name | Global Category Name
              (EF Category)
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <button
            onClick={handleAnalyze}
            disabled={!file || !selectedCompany || !selectedCategory}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Upload size={16} />
            Analyze File
          </button>
        </div>
      )}

      {/* Step: uploading */}
      {step === "uploading" && (
        <div className="flex flex-col items-center py-12 gap-3">
          <Loader2 size={32} className="animate-spin text-blue-600" />
          <p className="text-gray-600">Parsing mapping file...</p>
        </div>
      )}

      {/* Step: preview */}
      {step === "preview" && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded text-sm">
            <Check size={16} className="text-blue-600" />
            Found <strong>{rows.length}</strong> mapping(s) in{" "}
            <strong>{file?.name}</strong>
          </div>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm space-y-1">
              <div className="flex items-center gap-1 font-medium text-yellow-800">
                <AlertTriangle size={14} />
                {warnings.length} warning(s)
              </div>
              {warnings.slice(0, 5).map((w, i) => (
                <p key={i} className="text-yellow-700 text-xs">
                  {w}
                </p>
              ))}
              {warnings.length > 5 && (
                <p className="text-yellow-600 text-xs">
                  ...and {warnings.length - 5} more
                </p>
              )}
            </div>
          )}

          {/* Selected context */}
          <div className="flex gap-3 text-sm text-gray-600">
            <span><strong>Company:</strong> {selectedCompany?.label}</span>
            <span><strong>Category:</strong> {selectedCategory?.label}</span>
            {selectedSite && <span><strong>Site:</strong> {selectedSite.label}</span>}
          </div>

          {/* Match summary */}
          {knownCategoryNames.size > 0 && unmatchedCount > 0 && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>
                <strong>{matchedCount}</strong> of {matchedCount + unmatchedCount} global category names match existing emission factors.
                {" "}<strong>{unmatchedCount}</strong> unmatched — these mappings will work once matching emission factors are uploaded.
              </span>
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder="Search mappings..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Table */}
          <div className="max-h-[400px] overflow-auto border rounded">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="p-2 text-left w-10">
                    <input
                      type="checkbox"
                      checked={selectAll}
                      onChange={handleToggleAll}
                    />
                  </th>
                  <th className="p-2 text-left">Company Category</th>
                  <th className="p-2 text-left">Global Category (EF Name)</th>
                  {knownCategoryNames.size > 0 && (
                    <th className="p-2 text-center w-16">Match</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr
                    key={row._id}
                    className={`border-t ${
                      row._excluded ? "opacity-40 bg-gray-50" : ""
                    }`}
                  >
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={!row._excluded}
                        onChange={() => toggleRow(row._id)}
                      />
                    </td>
                    <td className="p-2">
                      <EditableCell
                        value={row.company_category_name}
                        onChange={(v) =>
                          updateRow(row._id, "company_category_name", v)
                        }
                      />
                    </td>
                    <td className="p-2">
                      <EditableCell
                        value={row.global_category_name}
                        onChange={(v) =>
                          updateRow(row._id, "global_category_name", v)
                        }
                      />
                    </td>
                    {knownCategoryNames.size > 0 && (
                      <td className="p-2 text-center">
                        {knownCategoryNames.has(row.global_category_name) ? (
                          <Check size={14} className="inline text-green-600" />
                        ) : (
                          <span title="No matching emission factor found">
                            <AlertTriangle size={14} className="inline text-yellow-500" />
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Action bar */}
          <div className="flex justify-between items-center pt-2">
            <button
              onClick={() => {
                setStep("idle");
                setRows([]);
                setWarnings([]);
              }}
              className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={!selectedCompany || !selectedCategory || includedCount === 0}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Upload {includedCount} Mapping(s)
            </button>
          </div>
        </div>
      )}

      {/* Step: submitting */}
      {step === "submitting" && (
        <div className="flex flex-col items-center py-12 gap-3">
          <Loader2 size={32} className="animate-spin text-blue-600" />
          <p className="text-gray-600">Creating mappings...</p>
        </div>
      )}

      {/* Step: result */}
      {step === "result" && result && (
        <div className="space-y-4">
          <div
            className={`p-4 rounded border ${
              result.skipped > 0
                ? "bg-yellow-50 border-yellow-200"
                : "bg-green-50 border-green-200"
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              <Check
                size={18}
                className={
                  result.skipped > 0 ? "text-yellow-600" : "text-green-600"
                }
              />
              {result.message}
            </div>
            <div className="mt-2 text-sm space-y-1">
              <p>Created: {result.created}</p>
              <p>Skipped: {result.skipped}</p>
            </div>
            {result.errors.length > 0 && (
              <div className="mt-2 text-sm text-red-600">
                {result.errors.slice(0, 10).map((e, i) => (
                  <p key={i}>{e}</p>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleClose}
            className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            Close
          </button>
        </div>
      )}
    </Modal>
  );
};

export default MappingUploadModal;
