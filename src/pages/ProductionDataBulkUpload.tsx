import { useState, useRef, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import Modal from "../components/Modal";
import Dropdown, { DropdownOption } from "../components/Dropdown";
import { Product } from "../services/productService";
import { bulkCreateProductionData } from "../services/productionDataService";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    products: Product[];
    siteId: number;
    isDark: boolean;
    onImportComplete: () => void;
}

interface ParsedRow {
    rowIndex: number;
    product: string;
    quantity: number | null;
    unit: string;
    dateRaw: string;
    month: number | null;
    year: number | null;
    notes: string;
}

interface ReviewRow extends ParsedRow {
    id: number;
    matchedProductId: number | null;
    matchedProductUnit: string;
    errors: string[];
    startDate: string;
    endDate: string;
}

interface ExcludedRow {
    rowIndex: number;
    product: string;
    reason: string;
}

type Stage = "upload" | "review";

// Accepts: product, quantity, unit, date, notes
// Also accepts separate month+year columns as fallback

const MONTH_NAMES: Record<string, number> = {
    january: 1, jan: 1,
    february: 2, feb: 2,
    march: 3, mar: 3,
    april: 4, apr: 4,
    may: 5,
    june: 6, jun: 6,
    july: 7, jul: 7,
    august: 8, aug: 8,
    september: 9, sep: 9, sept: 9,
    october: 10, oct: 10,
    november: 11, nov: 11,
    december: 12, dec: 12,
};

/**
 * Parse a flexible date string into { month, year }.
 * Supported formats:
 *   - "19-03-2027" or "19/03/2027" (DD-MM-YYYY)
 *   - "03-2027" or "03/2027" (MM-YYYY)
 *   - "march, 2027" or "mar, 2027" or "March 2027"
 *   - "03, 2027"
 *   - "2027-03-19" (ISO date)
 *   - Excel serial date number
 */
function parseDateToMonthYear(raw: any): { month: number | null; year: number | null } {
    if (raw === null || raw === undefined || raw === "") {
        return { month: null, year: null };
    }

    // Handle Excel serial date numbers
    if (typeof raw === "number") {
        // Could be an Excel serial number — convert
        const d = XLSX.SSF.parse_date_code(raw);
        if (d && d.y && d.m) {
            return { month: d.m, year: d.y };
        }
        return { month: null, year: null };
    }

    const str = String(raw).trim();
    if (!str) return { month: null, year: null };

    // Try ISO format: 2027-03-19 or 2027-03
    const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/);
    if (isoMatch) {
        return { month: parseInt(isoMatch[2]), year: parseInt(isoMatch[1]) };
    }

    // Try DD-MM-YYYY or DD/MM/YYYY
    const ddmmyyyy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (ddmmyyyy) {
        const day = parseInt(ddmmyyyy[1]);
        const m = parseInt(ddmmyyyy[2]);
        const y = parseInt(ddmmyyyy[3]);
        // If first number > 12, it's DD-MM-YYYY; otherwise still treat as DD-MM-YYYY
        if (day > 12) {
            return { month: m, year: y };
        }
        // Ambiguous but assume DD-MM-YYYY (common in India)
        return { month: m, year: y };
    }

    // Try MM-YYYY or MM/YYYY
    const mmyyyy = str.match(/^(\d{1,2})[-/](\d{4})$/);
    if (mmyyyy) {
        return { month: parseInt(mmyyyy[1]), year: parseInt(mmyyyy[2]) };
    }

    // Try "month_name, year" or "month_name year" or "month_name-year"
    // Supports both 4-digit (2027) and 2-digit (27) years
    // e.g., "march, 2027", "mar 2027", "Mar-27", "march 27"
    const monthNameMatch = str.match(/^([a-zA-Z]+)[,\s-]+(\d{2,4})$/);
    if (monthNameMatch) {
        const mName = monthNameMatch[1].toLowerCase();
        const m = MONTH_NAMES[mName];
        if (m) {
            let y = parseInt(monthNameMatch[2]);
            if (y < 100) y += 2000; // 27 → 2027
            return { month: m, year: y };
        }
    }

    // Try "MM, YYYY" or "MM, YY" (e.g., "03, 2027", "03, 27")
    const numCommaYear = str.match(/^(\d{1,2})[,\s]+(\d{2,4})$/);
    if (numCommaYear) {
        let y = parseInt(numCommaYear[2]);
        if (y < 100) y += 2000;
        return { month: parseInt(numCommaYear[1]), year: y };
    }

    return { month: null, year: null };
}

function normalizeHeader(h: string): string {
    return h.toString().trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function computeDates(month: number, year: number): { start: string; end: string } {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { start: fmt(startDate), end: fmt(endDate) };
}

function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
        ["product", "quantity", "unit", "date", "notes"],
        ["Product A", 100, "MT", "march, 2025", "Sample entry"],
        ["Product B", 200, "KG", "04, 2025", "Another entry"],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "production_data_template.xlsx");
}

const ProductionDataBulkUpload = ({ isOpen, onClose, products, siteId, isDark, onImportComplete }: Props) => {
    const [stage, setStage] = useState<Stage>("upload");
    const [dragging, setDragging] = useState(false);
    const [parseError, setParseError] = useState<string | null>(null);
    const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
    const [excludedRows, setExcludedRows] = useState<ExcludedRow[]>([]);
    const [totalParsed, setTotalParsed] = useState(0);
    const [submitting, setSubmitting] = useState(false);
    const [result, setResult] = useState<{ created: number; errors: { row: number; message: string }[] } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const productOptions: DropdownOption[] = useMemo(
        () => products.map((p) => ({ id: p.product_id, label: `${p.name} (${p.unit})` })),
        [products],
    );

    const reset = () => {
        setStage("upload");
        setDragging(false);
        setParseError(null);
        setReviewRows([]);
        setExcludedRows([]);
        setTotalParsed(0);
        setSubmitting(false);
        setResult(null);
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    // Match product name — exact match only (case-insensitive, ignoring extra spaces)
    const matchProduct = useCallback(
        (name: string): Product | null => {
            const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
            const input = normalize(name);
            if (!input) return null;
            return products.find((p) => normalize(p.name) === input) || null;
        },
        [products],
    );

    const validateRow = (row: ReviewRow): string[] => {
        const errs: string[] = [];
        if (!row.matchedProductId) errs.push("No product selected");
        if (row.quantity === null || row.quantity <= 0) errs.push("Quantity must be a positive number");
        if (!row.unit.trim()) errs.push("Unit is required");
        if (!row.startDate) errs.push("Start date required — please select");
        if (!row.endDate) errs.push("End date required — please select");
        if (row.startDate && row.endDate && row.startDate > row.endDate) errs.push("Start date cannot be after end date");
        return errs;
    };

    const handleFile = useCallback(
        (file: File) => {
            if (file.size > 5 * 1024 * 1024) {
                setParseError("File size exceeds 5MB limit.");
                return;
            }

            const ext = file.name.split(".").pop()?.toLowerCase();
            if (!["xlsx", "xls", "csv"].includes(ext || "")) {
                setParseError("Unsupported file type. Please upload .xlsx, .xls, or .csv files.");
                return;
            }

            setParseError(null);

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: "array" });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
                        defval: "",
                        raw: true, // keep raw values so Excel dates come as serial numbers
                    });

                    if (jsonData.length === 0) {
                        setParseError("The file is empty or has no data rows.");
                        return;
                    }

                    // Validate headers — accept either "date" column or separate "month"+"year"
                    const rawHeaders = Object.keys(jsonData[0]);
                    const normalizedHeaders = rawHeaders.map(normalizeHeader);

                    const hasDateCol = normalizedHeaders.includes("date");
                    const hasMonthYear = normalizedHeaders.includes("month") && normalizedHeaders.includes("year");

                    if (!hasDateCol && !hasMonthYear) {
                        setParseError(
                            `Missing required column: "date" (or separate "month" + "year" columns). Found: ${rawHeaders.join(", ")}`,
                        );
                        return;
                    }

                    const baseRequired = ["product", "quantity", "unit"];
                    const missingBase = baseRequired.filter((h) => !normalizedHeaders.includes(h));
                    if (missingBase.length > 0) {
                        setParseError(`Missing required columns: ${missingBase.join(", ")}`);
                        return;
                    }

                    // Build header mapping (normalized → original key)
                    const headerMap: Record<string, string> = {};
                    rawHeaders.forEach((h) => {
                        headerMap[normalizeHeader(h)] = h;
                    });

                    // Parse rows
                    const parsed: ParsedRow[] = jsonData.map((row, i) => {
                        let month: number | null = null;
                        let year: number | null = null;
                        let dateRaw = "";

                        if (hasDateCol) {
                            const rawDate = row[headerMap["date"]];
                            dateRaw = String(rawDate ?? "").trim();
                            const result = parseDateToMonthYear(rawDate);
                            month = result.month;
                            year = result.year;
                        } else {
                            month = parseInt(row[headerMap["month"]]) || null;
                            year = parseInt(row[headerMap["year"]]) || null;
                            dateRaw = `${month || "?"}-${year || "?"}`;
                        }

                        // Try notes column with various names
                        const notesKey = headerMap["notes"] || headerMap["note"];
                        const notes = notesKey ? String(row[notesKey] || "").trim() : "";

                        return {
                            rowIndex: i + 1,
                            product: String(row[headerMap["product"]] || "").trim(),
                            quantity: isNaN(parseFloat(row[headerMap["quantity"]])) ? null : parseFloat(row[headerMap["quantity"]]),
                            unit: String(row[headerMap["unit"]] || "").trim(),
                            dateRaw,
                            month,
                            year,
                            notes,
                        };
                    });

                    setTotalParsed(parsed.length);

                    // Split into valid (matched product) and excluded (unmatched product)
                    const valid: ReviewRow[] = [];
                    const excluded: ExcludedRow[] = [];

                    parsed.forEach((p) => {
                        const matched = matchProduct(p.product);
                        if (!matched) {
                            excluded.push({
                                rowIndex: p.rowIndex,
                                product: p.product,
                                reason: `Product "${p.product}" is not assigned to your site`,
                            });
                        } else {
                            const dates =
                                p.month && p.year ? computeDates(p.month, p.year) : { start: "", end: "" };
                            const row: ReviewRow = {
                                ...p,
                                id: p.rowIndex,
                                matchedProductId: matched.product_id,
                                matchedProductUnit: matched.unit,
                                unit: p.unit || matched.unit,
                                errors: [],
                                startDate: dates.start,
                                endDate: dates.end,
                            };
                            row.errors = validateRow(row);
                            valid.push(row);
                        }
                    });

                    setReviewRows(valid);
                    setExcludedRows(excluded);
                    setStage("review");
                } catch (err) {
                    console.error("Excel parse error:", err);
                    setParseError("Failed to parse the file. Please check the format.");
                }
            };
            reader.readAsArrayBuffer(file);
        },
        [matchProduct],
    );

    const updateRow = (id: number, field: string, value: any) => {
        setReviewRows((prev) =>
            prev.map((row) => {
                if (row.id !== id) return row;
                const updated = { ...row, [field]: value };

                // If product changed, update unit to product's default
                if (field === "matchedProductId") {
                    const prod = products.find((p) => p.product_id === value);
                    if (prod) {
                        updated.matchedProductUnit = prod.unit;
                        updated.unit = prod.unit;
                    }
                }

                updated.errors = validateRow(updated);
                return updated;
            }),
        );
    };

    const validRows = reviewRows.filter((r) => r.errors.length === 0);
    const errorRows = reviewRows.filter((r) => r.errors.length > 0);
    const allValid = reviewRows.length > 0 && errorRows.length === 0;

    const handleSubmit = async () => {
        if (validRows.length === 0) return;

        setSubmitting(true);
        try {
            const entries = validRows.map((r) => ({
                product_id: r.matchedProductId!,
                site_id: siteId,
                quantity: r.quantity!,
                unit: r.unit,
                start_date: r.startDate,
                end_date: r.endDate,
                notes: r.notes || undefined,
            }));

            const res = await bulkCreateProductionData(entries);
            setResult(res);
            if (res.created > 0) {
                onImportComplete();
            }
        } catch (err: any) {
            setResult({ created: 0, errors: [{ row: 0, message: err?.response?.data?.message || "Upload failed" }] });
        } finally {
            setSubmitting(false);
        }
    };

    // Theme classes
    const cardBg = isDark ? "bg-slate-800 border-slate-600" : "bg-white border-gray-200";
    const textPrimary = isDark ? "text-slate-200" : "text-gray-900";
    const textSecondary = isDark ? "text-slate-400" : "text-gray-500";
    const inputCls = isDark
        ? "border border-slate-600 bg-slate-700 text-slate-200 px-2 py-1.5 rounded text-sm focus:outline-none focus:ring focus:ring-blue-500/30"
        : "border border-gray-300 px-2 py-1.5 rounded text-sm focus:outline-none focus:ring focus:ring-blue-300";
    const thCls = isDark
        ? "px-3 py-2 text-left text-xs font-semibold text-slate-300 bg-slate-800 border-b border-slate-600"
        : "px-3 py-2 text-left text-xs font-semibold text-gray-600 bg-gray-50 border-b border-gray-200";
    const tdCls = isDark
        ? "px-3 py-2 text-sm text-slate-300 border-b border-slate-700"
        : "px-3 py-2 text-sm text-gray-900 border-b border-gray-100";

    return (
        <Modal
            isOpen={isOpen}
            onClose={handleClose}
            title="Upload Production Data"
            isDark={isDark}
            className="max-w-[95vw]! max-h-[90vh]!">
            {/* Result */}
            {result && (
                <div className={`mb-4 p-4 rounded-lg border ${result.created > 0
                    ? isDark ? "bg-green-900/20 border-green-700/30 text-green-400" : "bg-green-50 border-green-200 text-green-800"
                    : isDark ? "bg-red-900/20 border-red-700/30 text-red-400" : "bg-red-50 border-red-200 text-red-800"
                }`}>
                    <p className="font-medium">{result.created} entries created successfully.</p>
                    {result.errors.length > 0 && (
                        <div className="mt-2 text-sm">
                            <p className="font-medium">Errors:</p>
                            {result.errors.map((e, i) => (
                                <p key={i}>Row {e.row}: {e.message}</p>
                            ))}
                        </div>
                    )}
                    <div className="mt-3 flex gap-2">
                        <button onClick={handleClose} className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
                            Done
                        </button>
                        <button onClick={reset} className={`px-4 py-1.5 rounded text-sm ${isDark ? "bg-slate-600 text-slate-200 hover:bg-slate-500" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}>
                            Upload Another
                        </button>
                    </div>
                </div>
            )}

            {/* Stage 1: Upload */}
            {stage === "upload" && !result && (
                <div className="flex flex-col items-center py-8 px-4">
                    <div
                        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={(e) => {
                            e.preventDefault();
                            setDragging(false);
                            const file = e.dataTransfer.files[0];
                            if (file) handleFile(file);
                        }}
                        onClick={() => fileInputRef.current?.click()}
                        className={`w-full max-w-lg border-2 border-dashed rounded-xl p-12 flex flex-col items-center gap-4 transition-all cursor-pointer ${
                            dragging
                                ? "border-blue-500 bg-blue-50"
                                : isDark
                                    ? "border-slate-600 bg-slate-800 hover:border-blue-400"
                                    : "border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50"
                        }`}>
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
                            dragging ? "bg-blue-100" : isDark ? "bg-slate-700" : "bg-gray-100"
                        }`}>
                            <svg className={`w-8 h-8 ${dragging ? "text-blue-600" : isDark ? "text-slate-400" : "text-gray-400"}`}
                                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                            </svg>
                        </div>
                        <div className="text-center">
                            <p className={`text-lg font-medium ${textPrimary}`}>
                                {dragging ? "Drop your file here" : "Drag & drop your Excel file"}
                            </p>
                            <p className={`text-sm mt-1 ${textSecondary}`}>
                                or <span className="text-blue-500 underline">browse</span> to select a file
                            </p>
                            <p className={`text-xs mt-2 ${textSecondary}`}>
                                Supports .xlsx, .xls, .csv (max 5MB)
                            </p>
                        </div>
                    </div>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleFile(file);
                            e.currentTarget.value = "";
                        }}
                    />

                    {parseError && (
                        <div className={`mt-4 w-full max-w-lg p-3 rounded-lg text-sm ${
                            isDark ? "bg-red-900/20 border border-red-700/30 text-red-400" : "bg-red-50 border border-red-200 text-red-700"
                        }`}>
                            {parseError}
                        </div>
                    )}

                    <div className="mt-6 flex items-center gap-4">
                        <button onClick={downloadTemplate} className="text-sm text-blue-500 hover:text-blue-600 underline">
                            Download Template
                        </button>
                        <span className={`text-xs ${textSecondary}`}>
                            Columns: product, quantity, unit, date, notes
                        </span>
                    </div>
                </div>
            )}

            {/* Stage 2: Review */}
            {stage === "review" && !result && (
                <div>
                    {/* Summary Bar */}
                    <div className={`flex flex-wrap gap-4 mb-4 p-3 rounded-lg border ${cardBg}`}>
                        <div className="flex items-center gap-2">
                            <span className={`text-xs font-medium ${textSecondary}`}>Total Rows</span>
                            <span className={`text-sm font-bold ${textPrimary}`}>{totalParsed}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500" />
                            <span className={`text-xs font-medium ${textSecondary}`}>Valid</span>
                            <span className="text-sm font-bold text-green-600">{validRows.length}</span>
                        </div>
                        {errorRows.length > 0 && (
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-yellow-500" />
                                <span className={`text-xs font-medium ${textSecondary}`}>Needs Fix</span>
                                <span className="text-sm font-bold text-yellow-600">{errorRows.length}</span>
                            </div>
                        )}
                        {excludedRows.length > 0 && (
                            <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-red-500" />
                                <span className={`text-xs font-medium ${textSecondary}`}>Excluded</span>
                                <span className="text-sm font-bold text-red-600">{excludedRows.length}</span>
                            </div>
                        )}
                    </div>

                    {/* Error banner when some rows have issues */}
                    {errorRows.length > 0 && (
                        <div className={`mb-4 p-3 rounded-lg text-sm ${
                            isDark ? "bg-yellow-900/20 border border-yellow-700/30 text-yellow-400" : "bg-yellow-50 border border-yellow-200 text-yellow-800"
                        }`}>
                            {errorRows.length} row{errorRows.length !== 1 ? "s have" : " has"} validation errors. Please fix them before uploading, or only the {validRows.length} valid row{validRows.length !== 1 ? "s" : ""} will be uploaded.
                        </div>
                    )}

                    {/* Matched Rows Table */}
                    {reviewRows.length > 0 && (
                        <div className="overflow-x-auto mb-4">
                            <table className="w-full">
                                <thead>
                                    <tr>
                                        <th className={thCls}>#</th>
                                        <th className={thCls}>Product</th>
                                        <th className={thCls}>Quantity</th>
                                        <th className={thCls}>Unit</th>
                                        <th className={thCls}>Start Date</th>
                                        <th className={thCls}>End Date</th>
                                        <th className={thCls}>Notes</th>
                                        <th className={thCls}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reviewRows.map((row) => {
                                        const hasErrors = row.errors.length > 0;
                                        const rowBg = hasErrors
                                            ? isDark ? "bg-red-900/10" : "bg-red-50/50"
                                            : "";
                                        return (
                                            <tr key={row.id} className={rowBg}>
                                                <td className={tdCls}>{row.rowIndex}</td>
                                                <td className={`${tdCls} min-w-[180px]`}>
                                                    <Dropdown
                                                        options={productOptions}
                                                        value={row.matchedProductId}
                                                        onChange={(opt) => updateRow(row.id, "matchedProductId", opt?.id as number)}
                                                        placeholder="Select"
                                                        searchable
                                                    />
                                                </td>
                                                <td className={tdCls}>
                                                    <input
                                                        type="number"
                                                        value={row.quantity ?? ""}
                                                        onChange={(e) => updateRow(row.id, "quantity", parseFloat(e.target.value) || null)}
                                                        className={`${inputCls} w-24`}
                                                        step="0.0001"
                                                        min="0"
                                                    />
                                                </td>
                                                <td className={tdCls}>
                                                    <input
                                                        type="text"
                                                        value={row.unit}
                                                        onChange={(e) => updateRow(row.id, "unit", e.target.value)}
                                                        className={`${inputCls} w-20`}
                                                    />
                                                </td>
                                                <td className={tdCls}>
                                                    <input
                                                        type="date"
                                                        value={row.startDate}
                                                        onChange={(e) => updateRow(row.id, "startDate", e.target.value)}
                                                        className={`${inputCls} w-36`}
                                                    />
                                                </td>
                                                <td className={tdCls}>
                                                    <input
                                                        type="date"
                                                        value={row.endDate}
                                                        onChange={(e) => updateRow(row.id, "endDate", e.target.value)}
                                                        className={`${inputCls} w-36`}
                                                    />
                                                </td>
                                                <td className={tdCls}>
                                                    <input
                                                        type="text"
                                                        value={row.notes}
                                                        onChange={(e) => updateRow(row.id, "notes", e.target.value)}
                                                        className={`${inputCls} w-32`}
                                                    />
                                                </td>
                                                <td className={`${tdCls} min-w-[200px]`}>
                                                    {hasErrors ? (
                                                        <div className="flex items-start gap-1">
                                                            <span className="text-red-500 text-sm shrink-0">&#10007;</span>
                                                            <div className="text-xs text-red-500">
                                                                {row.errors.map((e, i) => (
                                                                    <div key={i}>{e}</div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className="text-green-500 text-sm">&#10003;</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Excluded Rows */}
                    {excludedRows.length > 0 && (
                        <div className={`mb-4 rounded-lg border ${isDark ? "border-red-700/30 bg-red-900/10" : "border-red-200 bg-red-50"}`}>
                            <div className={`px-4 py-2 border-b font-medium text-sm flex items-center gap-2 ${
                                isDark ? "border-red-700/30 text-red-400" : "border-red-200 text-red-700"
                            }`}>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                                </svg>
                                {excludedRows.length} row{excludedRows.length !== 1 ? "s" : ""} excluded — product not assigned to your site
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr>
                                            <th className={thCls}>Row #</th>
                                            <th className={thCls}>Product Name (from Excel)</th>
                                            <th className={thCls}>Reason</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {excludedRows.map((row, i) => (
                                            <tr key={i}>
                                                <td className={tdCls}>{row.rowIndex}</td>
                                                <td className={`${tdCls} font-medium`}>{row.product}</td>
                                                <td className={`${tdCls} text-xs ${isDark ? "text-red-400" : "text-red-600"}`}>{row.reason}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-2">
                        <button
                            onClick={reset}
                            className={`px-4 py-2 rounded text-sm ${isDark ? "bg-slate-600 text-slate-200 hover:bg-slate-500" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}>
                            Back
                        </button>
                        <div className="flex items-center gap-3">
                            {!allValid && validRows.length > 0 && (
                                <span className={`text-xs ${textSecondary}`}>
                                    Only {validRows.length} valid row{validRows.length !== 1 ? "s" : ""} will be uploaded
                                </span>
                            )}
                            <button
                                onClick={handleSubmit}
                                disabled={validRows.length === 0 || submitting}
                                className={`px-6 py-2 rounded text-sm font-medium text-white transition-colors ${
                                    validRows.length === 0 || submitting
                                        ? "bg-gray-400 cursor-not-allowed"
                                        : "bg-blue-600 hover:bg-blue-700"
                                }`}>
                                {submitting
                                    ? "Uploading..."
                                    : `Upload ${validRows.length} ${validRows.length === 1 ? "Entry" : "Entries"}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    );
};

export default ProductionDataBulkUpload;
