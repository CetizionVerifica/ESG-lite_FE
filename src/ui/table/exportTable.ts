import { toCsv } from "./tableLogic";

export type ExportFormat = "csv" | "xlsx";

/** Saves a blob through a temporary link. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The file name from a Content-Disposition header, or the fallback. */
export function fileNameFrom(disposition: string | null | undefined, fallback: string): string {
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition ?? "");
  return m ? decodeURIComponent(m[1]) : fallback;
}

const download = saveBlob;

/** Downloads a matrix (header row first) as CSV or XLSX. xlsx is loaded only when needed. */
export async function exportMatrix(matrix: Array<Array<string | number>>, baseName: string, format: ExportFormat) {
  if (format === "csv") {
    // BOM so Excel reads UTF-8 (tCO₂e) correctly.
    download(new Blob(["﻿", toCsv(matrix)], { type: "text/csv;charset=utf-8" }), `${baseName}.csv`);
    return;
  }
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet(matrix);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Data");
  const out = XLSX.write(book, { bookType: "xlsx", type: "array" });
  download(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${baseName}.xlsx`);
}
