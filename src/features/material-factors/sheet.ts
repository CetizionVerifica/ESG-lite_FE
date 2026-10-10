import * as XLSX from "xlsx";
import { TEMPLATE_HEADERS, isBlankRow } from "./logic";

/** `line` is the row number people see in Excel (header is row 1). */
export type SheetRow = { line: number; raw: Record<string, unknown> };
export type Sheet = { headers: string[]; rows: SheetRow[] };

/** First worksheet of an .xlsx/.xls/.csv file: its header row and data rows (blank rows dropped). */
export async function readSheet(file: File): Promise<Sheet> {
  const book = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const first = book.SheetNames[0];
  if (!first) return { headers: [], rows: [] };
  const ws = book.Sheets[first];
  const head = (XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false })[0] ?? []).map((h) => String(h ?? "").trim());
  // sheet_to_json tags each object with its 0-based sheet row (__rowNum__, not enumerable).
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: true })
    .filter((r) => !isBlankRow(r))
    .map((raw) => ({ line: ((raw as { __rowNum__?: number }).__rowNum__ ?? 0) + 1, raw }));
  return { headers: head.filter(Boolean), rows };
}

/** An empty sheet with the import columns, for people to fill in. */
export function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Material factors");
  XLSX.writeFile(wb, "material-factors-template.xlsx");
}
