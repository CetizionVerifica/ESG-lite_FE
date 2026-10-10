import type { Product } from "../../services/productService";
import { monthRange } from "./logic";

/**
 * Upload sheet logic, moved from pages/ProductionDataBulkUpload.tsx with the
 * same column and date rules. Pure, so it is unit tested; reading the file is
 * in sheet.ts.
 */

export const TEMPLATE_ROWS: (string | number)[][] = [
  ["product", "quantity", "unit", "date", "notes"],
  ["Product A", 100, "MT", "march, 2025", "Sample entry"],
  ["Product B", 200, "KG", "04, 2025", "Another entry"],
];

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

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

type MonthYear = { month: number | null; year: number | null };
const NONE: MonthYear = { month: null, year: null };

const valid = (month: number, year: number): MonthYear => (month >= 1 && month <= 12 && year >= 1900 ? { month, year } : NONE);

/** Excel serial day number → calendar month (1900 date system, as Excel writes it). */
function fromSerial(serial: number): MonthYear {
  if (!Number.isFinite(serial) || serial < 1) return NONE;
  // Day 0 is 1899-12-30 once Excel's phantom 1900-02-29 is allowed for.
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
  return valid(d.getUTCMonth() + 1, d.getUTCFullYear());
}

/**
 * A sheet's date cell → month and year. Accepts, as the old upload did:
 * DD-MM-YYYY (or /), MM-YYYY, ISO 2027-03-19 / 2027-03, "March 2027",
 * "mar, 27", "03, 2027", Excel serial numbers and real dates.
 */
export function parseDateToMonthYear(raw: unknown): MonthYear {
  if (raw === null || raw === undefined || raw === "") return NONE;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? NONE : valid(raw.getMonth() + 1, raw.getFullYear());
  if (typeof raw === "number") return fromSerial(raw);

  const str = String(raw).trim();
  if (!str) return NONE;
  let m: RegExpMatchArray | null;
  if ((m = str.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/))) return valid(Number(m[2]), Number(m[1]));
  // DD-MM-YYYY; an ambiguous 03-04-2027 is read day first, as before.
  if ((m = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/))) return valid(Number(m[2]), Number(m[3]));
  if ((m = str.match(/^(\d{1,2})[-/](\d{4})$/))) return valid(Number(m[1]), Number(m[2]));
  const year = (y: string) => (Number(y) < 100 ? Number(y) + 2000 : Number(y));
  if ((m = str.match(/^([a-zA-Z]+)[,\s-]+(\d{2,4})$/))) {
    const month = MONTH_NAMES[m[1].toLowerCase()];
    return month ? valid(month, year(m[2])) : NONE;
  }
  if ((m = str.match(/^(\d{1,2})[,\s]+(\d{2,4})$/))) return valid(Number(m[1]), year(m[2]));
  return NONE;
}

export function normalizeHeader(h: string): string {
  return h.toString().trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

const normalizeName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** `line` is the row number people see in Excel (header is row 1). */
export type SheetRow = { line: number; raw: Record<string, unknown> };

export type ParsedRow = {
  line: number;
  product: string;
  quantity: number | null;
  unit: string;
  /** The date cell as written, for the review grid. */
  dateText: string;
  month: number | null;
  year: number | null;
  notes: string;
};

/** Checks the header row; returns the problem in words, or null. */
export function headerProblem(headers: string[]): string | null {
  const norm = headers.map(normalizeHeader);
  const missing = ["product", "quantity", "unit"].filter((h) => !norm.includes(h));
  if (missing.length) return `The sheet is missing the ${missing.join(", ")} ${missing.length === 1 ? "column" : "columns"}. Use the template's column names.`;
  if (!norm.includes("date") && !(norm.includes("month") && norm.includes("year")))
    return `The sheet needs a "date" column (or "month" and "year" columns). It has: ${headers.join(", ") || "no headers"}.`;
  return null;
}

/** Sheet rows → parsed rows. Call after headerProblem returned null. */
export function parseRows(headers: string[], rows: SheetRow[]): ParsedRow[] {
  const key: Record<string, string> = {};
  for (const h of headers) key[normalizeHeader(h)] = h;
  const cell = (r: SheetRow, k: string) => (key[k] !== undefined ? r.raw[key[k]] : undefined);
  const text = (v: unknown) => (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());
  const hasDate = key.date !== undefined;
  return rows.map((r) => {
    let my: MonthYear;
    let dateText: string;
    if (hasDate) {
      my = parseDateToMonthYear(cell(r, "date"));
      dateText = text(cell(r, "date"));
    } else {
      const month = parseInt(text(cell(r, "month")), 10);
      const year = parseInt(text(cell(r, "year")), 10);
      my = Number.isFinite(month) && Number.isFinite(year) ? valid(month, year) : NONE;
      dateText = `${text(cell(r, "month")) || "?"}-${text(cell(r, "year")) || "?"}`;
    }
    const q = parseFloat(text(cell(r, "quantity")).replace(/,/g, ""));
    return {
      line: r.line,
      product: text(cell(r, "product")),
      quantity: Number.isFinite(q) ? q : null,
      unit: text(cell(r, "unit")),
      dateText,
      ...my,
      notes: text(cell(r, "notes") ?? cell(r, "note")),
    };
  });
}

export type ReviewRow = {
  line: number;
  productId: number | null;
  quantity: number | null;
  unit: string;
  start: string;
  end: string;
  notes: string;
  /** What the sheet said, shown when the date couldn't be read. */
  dateText: string;
};

export type ExcludedRow = { line: number; product: string; reason: string };

/**
 * Splits parsed rows: products that match one of the site's products (exact
 * name, ignoring case and extra spaces) go to review; the rest are excluded.
 * A row without a unit takes the product's.
 */
export function toReview(parsed: ParsedRow[], products: Product[], siteName: string): { rows: ReviewRow[]; excluded: ExcludedRow[] } {
  const rows: ReviewRow[] = [];
  const excluded: ExcludedRow[] = [];
  for (const p of parsed) {
    const match = p.product ? products.find((x) => normalizeName(x.name) === normalizeName(p.product)) : undefined;
    if (!match) {
      excluded.push({
        line: p.line,
        product: p.product,
        reason: p.product ? `${p.product} isn't a product of ${siteName}` : "The product cell is empty",
      });
      continue;
    }
    const range = p.month && p.year ? monthRange(`${p.year}-${String(p.month).padStart(2, "0")}`) : { start: "", end: "" };
    rows.push({ line: p.line, productId: match.product_id, quantity: p.quantity, unit: p.unit || match.unit, start: range.start, end: range.end, notes: p.notes, dateText: p.dateText });
  }
  return { rows, excluded };
}

export type RowErrors = Partial<Record<"product" | "quantity" | "unit" | "start" | "end", string>>;

export function rowErrors(r: ReviewRow): RowErrors {
  const e: RowErrors = {};
  if (!r.productId) e.product = "Choose a product";
  if (r.quantity === null || !(r.quantity > 0)) e.quantity = "Quantity must be above 0";
  if (!r.unit.trim()) e.unit = "Unit is required";
  if (!r.start) e.start = r.dateText ? `Couldn't read "${r.dateText}"; pick the start` : "Pick the start date";
  if (!r.end) e.end = "Pick the end date";
  else if (r.start && r.end < r.start) e.end = "End is before the start";
  return e;
}

export const isValidRow = (r: ReviewRow) => Object.keys(rowErrors(r)).length === 0;

export function bulkEntries(rows: ReviewRow[], siteId: number) {
  return rows.map((r) => ({
    product_id: r.productId!,
    site_id: siteId,
    quantity: r.quantity!,
    unit: r.unit.trim(),
    start_date: r.start,
    end_date: r.end,
    ...(r.notes.trim() ? { notes: r.notes.trim() } : {}),
  }));
}

/** The server numbers its errors by position in what was sent (1-based); map them back to sheet lines. */
export function failedLines(sent: ReviewRow[], errors: { row: number; message: string }[]): { line: number | null; message: string }[] {
  return errors.map((e) => ({ line: sent[e.row - 1]?.line ?? null, message: e.message }));
}
