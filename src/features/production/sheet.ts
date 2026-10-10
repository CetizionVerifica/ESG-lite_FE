import * as XLSX from "xlsx";
import { TEMPLATE_ROWS, type SheetRow } from "./upload";

export type Sheet = { headers: string[]; rows: SheetRow[] };

const isBlank = (raw: Record<string, unknown>) => Object.values(raw).every((v) => v === null || v === undefined || String(v).trim() === "");

/** First worksheet of an .xlsx/.xls/.csv file: header row and data rows (blank rows dropped). */
export async function readSheet(file: File): Promise<Sheet> {
  // raw values keep Excel dates as serial numbers, as the old upload read them.
  const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const first = book.SheetNames[0];
  if (!first) return { headers: [], rows: [] };
  const ws = book.Sheets[first];
  const head = (XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false })[0] ?? []).map((h) => String(h ?? "").trim());
  // sheet_to_json tags each object with its 0-based sheet row (__rowNum__, not enumerable).
  const rows = XLSX.utils
    .sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: true })
    .filter((r) => !isBlank(r))
    .map((raw) => ({ line: ((raw as { __rowNum__?: number }).__rowNum__ ?? 0) + 1, raw }));
  return { headers: head.filter(Boolean), rows };
}

/** The template with the old upload's columns and two sample rows. */
export function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet(TEMPLATE_ROWS);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Template");
  XLSX.writeFile(wb, "production_data_template.xlsx");
}
