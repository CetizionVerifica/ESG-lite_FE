import type { ColumnConfig, ColumnEntity } from "../../lib/emissions";

/** Where a row's numbers go. Keys are what the AI service reads (`/v1/excel/*`). */
export type FieldKind = "category" | "value" | "column" | "unit" | "extra" | "date";

export interface MapField {
  /** Key sent in `mappings`: emission_category, activity_value, a column name, extra_<key>, date_of_reporting. */
  key: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  /** The site's own column name when a fixed key stands in for it (category or value column). */
  sourceColumn?: string;
  /** Sheet header it reads from, or null. */
  header: string | null;
  /** Matched by name on upload and not changed since: shows "Matched". */
  auto: boolean;
  skipped: boolean;
}

export const STEPS = [
  { id: "upload", label: "Upload" },
  { id: "map", label: "Map columns" },
  { id: "preview", label: "Preview" },
  { id: "import", label: "Import" },
] as const;
export type StepId = (typeof STEPS)[number]["id"];

/** The AI service stores a per-row date under this key; the legacy modal sent `reporting_date`, which it never read. */
export const DATE_KEY = "date_of_reporting";

// A site's category column is named freely ("Emission Category", "emission_category",
// "Fuel Category"); ignoring case and _/-/space lets one comparison match them all.
export const normaliseName = (name: string | null | undefined) =>
  String(name ?? "")
    .toLowerCase()
    .replace(/[_\-\s]+/g, " ")
    .trim();

/** The column that names the emission category, most specific first; a loose "*category" match only when it is the only one. */
export function findCategoryColumn(columns: ColumnEntity[]): ColumnEntity | null {
  const named = columns.map((col) => ({ col, name: normaliseName(col.column_name) }));
  const loose = named.filter((c) => c.name.includes("category"));
  return (
    named.find((c) => c.name === "emission category")?.col ??
    named.find((c) => c.name === "category")?.col ??
    (loose.length === 1 ? loose[0].col : null)
  );
}

/** The value column is the one number column; none or several and the user picks. */
export function findValueColumn(columns: ColumnEntity[]): ColumnEntity | null {
  const numeric = columns.filter((col) => normaliseName(col.column_type) === "number");
  return numeric.length === 1 ? numeric[0] : null;
}

const field = (f: Omit<MapField, "header" | "auto" | "skipped">): MapField => ({ ...f, header: null, auto: false, skipped: false });

/**
 * The fields a sheet maps onto for one site × category form, in the order the
 * legacy modal used. Multi-field categories (a `calculation` spec) have no
 * single value column: their value is the product of the method's fields.
 */
export function buildFields(config: ColumnConfig | null): MapField[] {
  const columns = config?.columns ?? [];
  const categoryColumn = findCategoryColumn(columns);
  const valueColumn = config?.calculation ? null : findValueColumn(columns);
  const fields: MapField[] = [
    field({ key: "emission_category", label: categoryColumn?.column_name || "Emission category", kind: "category", required: true, sourceColumn: categoryColumn?.column_name }),
  ];
  if (!config?.calculation) {
    fields.push(field({ key: "activity_value", label: valueColumn?.column_name || "Value (spend or quantity)", kind: "value", required: true, sourceColumn: valueColumn?.column_name }));
  }
  const promoted = new Set([categoryColumn, valueColumn].filter(Boolean).map((c) => normaliseName((c as ColumnEntity).column_name)));
  for (const col of columns) {
    if (promoted.has(normaliseName(col.column_name))) continue;
    fields.push(field({ key: col.column_name, label: col.column_name, kind: "column", required: true }));
  }
  fields.push(field({ key: "activity_data_unit", label: "Activity unit", kind: "unit", required: true }));
  for (const ef of config?.extra_fields ?? []) {
    fields.push(field({ key: `extra_${ef.key}`, label: ef.label, kind: "extra", required: false }));
  }
  fields.push(field({ key: DATE_KEY, label: "Reporting date", kind: "date", required: false }));
  return fields;
}

/** Category and unit drive the factor lookup, so they can't be skipped. */
export const canSkip = (f: MapField) => f.kind !== "category" && f.kind !== "unit";

/** Match each field to a header with the same name (its key, its extra key, or the site's column name). */
export function autoMap(fields: MapField[], headers: string[]): MapField[] {
  const used = new Set<string>();
  return fields.map((f) => {
    const candidates = [f.key, f.key.replace(/^extra_/, ""), f.sourceColumn, f.label, f.kind === "date" ? "reporting date" : null]
      .filter(Boolean)
      .map((c) => normaliseName(c));
    const match = headers.find((h) => !used.has(h) && candidates.includes(normaliseName(h)));
    if (!match) return { ...f, header: null, auto: false, skipped: false };
    used.add(match);
    return { ...f, header: match, auto: true, skipped: false };
  });
}

export function setHeader(fields: MapField[], key: string, header: string | null): MapField[] {
  return fields.map((f) => (f.key === key ? { ...f, header, auto: false, skipped: false } : f));
}

export function toggleSkip(fields: MapField[], key: string): MapField[] {
  return fields.map((f) => (f.key === key && canSkip(f) ? { ...f, skipped: !f.skipped, header: f.skipped ? f.header : null, auto: false } : f));
}

export type MatchChip = "matched" | "check" | "skipped" | null;

/** "Matched" for an untouched name match, "Check" for a required field still empty. */
export function matchChip(f: MapField): MatchChip {
  if (f.skipped) return "skipped";
  if (f.header && f.auto) return "matched";
  if (!f.header && f.required) return "check";
  return null;
}

/** Fields still to map before the preview: required, not mapped, not skipped. */
export const unmapped = (fields: MapField[]) => fields.filter((f) => f.required && !f.header && !f.skipped);

/**
 * `mappings` for the AI service. A promoted column goes out under the fixed key
 * the service reads (emission_category / activity_value) and under the site's
 * own column name, so imported rows store it where reports and the edit form
 * look for it, as typed entries do.
 */
export function mappingsFor(fields: MapField[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    if (f.skipped || !f.header) continue;
    out[f.key] = f.header;
    if (f.sourceColumn && f.sourceColumn !== f.key) out[f.sourceColumn] = f.header;
  }
  return out;
}

/** Header row for "Download template": the names autoMap recognises. */
export const templateHeaders = (fields: MapField[]) => fields.map((f) => f.sourceColumn || (f.kind === "date" ? "Reporting date" : f.label));

/** One preview row as `/v1/excel/preview` returns it: the mapped cells plus the calculation. */
export interface PreviewRow {
  emission_category?: string;
  activity_data_unit?: string;
  global_category_name?: string | null;
  factor_value?: number | null;
  denominator_unit?: string | null;
  total_emission?: number | null;
  date_of_reporting?: string;
  row_error?: string;
  [column: string]: unknown;
}

export type IssueKind = "skip" | "no-factor" | "zero";
export interface RowIssue {
  kind: IssueKind;
  text: string;
}

/**
 * What is wrong with a preview row, if anything. `row_error` rows are skipped on
 * import (multi-field categories). Other categories still save a row with no
 * factor match or no value, at 0 tCO₂e, so those are flagged rather than hidden.
 */
export function rowIssue(row: PreviewRow): RowIssue | null {
  if (row.row_error) return { kind: "skip", text: `Won't import: ${row.row_error}` };
  if (!row.global_category_name) {
    return { kind: "no-factor", text: row.emission_category ? `No factor for "${row.emission_category}", saved as 0 tCO₂e` : "No emission category, saved as 0 tCO₂e" };
  }
  if (!Number(row.total_emission)) return { kind: "zero", text: "Works out to 0 tCO₂e. Check the value and unit." };
  return null;
}

export function previewCounts(rows: PreviewRow[]) {
  const issues = rows.filter((r) => rowIssue(r)).length;
  return { valid: rows.length - issues, issues };
}

/** One skipped row as `/v1/excel/import` lists it (python_AI_service #21). */
export interface SkippedRow {
  row: number;
  emission_category: string | null;
  reason: string;
}

export interface ImportResult {
  inserted: number;
  skipped: number;
  total_rows: number;
  upload_batch_id?: string | null;
  skipped_rows?: SkippedRow[];
}

/**
 * Rows for the skipped-rows CSV. The service lists them since #21; an older
 * service only gives a count, so fall back to the preview rows it would skip
 * (the first page only, which the file says).
 */
export function skippedMatrix(result: ImportResult, preview: PreviewRow[]): { matrix: string[][]; partial: boolean } | null {
  if (!result.skipped) return null;
  if (result.skipped_rows?.length) {
    return {
      matrix: [["Row", "Emission category", "Reason"], ...result.skipped_rows.map((r) => [String(r.row), r.emission_category ?? "", r.reason])],
      partial: result.skipped_rows.length < result.skipped,
    };
  }
  const fromPreview = preview.filter((r) => r.row_error);
  if (!fromPreview.length) return null;
  return {
    // Row stays empty: the preview holds only the ticked categories, so its positions aren't sheet rows.
    matrix: [["Row", "Emission category", "Reason"], ...fromPreview.map((r) => ["", String(r.emission_category ?? ""), String(r.row_error)])],
    partial: true,
  };
}

/** Last day of a "YYYY-MM" month: the date rows are filed on when the sheet has no date column. */
export function monthEndDate(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${month}-${String(last).padStart(2, "0")}`;
}

export const ACCEPT = [".xlsx", ".xls", ".csv"];
export const MAX_BYTES = 100 * 1024 * 1024;

/** The AI service checks this too; checking first saves an upload that would be refused. */
export function fileProblem(file: File): string | null {
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
  if (!["xlsx", "xls", "csv"].includes(ext)) return "Choose an .xlsx, .xls or .csv file.";
  if (file.size > MAX_BYTES) return "The file is over 100 MB. Split it and upload each part.";
  return null;
}
