import { createElement } from "react";
import type { PdfTheme } from "../../theme";
import type { TargetsPdfProps } from "./components/TargetsPdf";
import { type Pathway, type TargetModel, exportBaseName, exportSheets } from "./logic";

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** XLSX with Summary, Pathway, Scope-wise and Actual vs target sheets. xlsx loads on demand. */
export async function exportXlsx(model: TargetModel, siteNames: string[], pathway: Pathway) {
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();
  for (const sheet of exportSheets(model, siteNames, pathway)) XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(sheet.rows), sheet.name);
  const out = XLSX.write(book, { bookType: "xlsx", type: "array" });
  download(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${exportBaseName(model)}.xlsx`);
}

/** Branded PDF summary. @react-pdf loads on demand. */
export async function exportPdf(props: Omit<TargetsPdfProps, "theme"> & { theme: PdfTheme }) {
  const [{ pdf }, { TargetsPdf }] = await Promise.all([import("@react-pdf/renderer"), import("./components/TargetsPdf")]);
  const render = (p: TargetsPdfProps) => pdf(createElement(TargetsPdf, p) as Parameters<typeof pdf>[0]).toBlob();
  let blob: Blob;
  try {
    blob = await render(props);
  } catch (e) {
    // A logo the browser can't fetch (CORS) fails the whole document: print without it.
    if (!props.theme.logoUrl) throw e;
    blob = await render({ ...props, theme: { ...props.theme, logoUrl: null } });
  }
  download(blob, `${exportBaseName(props.model)}.pdf`);
}
