// AS-1 · reading a file in the person's browser for the help assistant. The file
// itself never leaves the page: only its text, or pictures of a few pages, go to
// the server with the question. Any file can be attached: one we can't open
// still goes by its name.
import { ASSISTANT_MAX_FILE_CHARS, ASSISTANT_MAX_FILE_IMAGES, ASSISTANT_MAX_IMAGE_CHARS, type AssistantAttachment, type AssistantFileType } from "./contracts";

export const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const PICTURE_SIZE = 1600;
const PDF_MAX_PAGES = 30;
/** Fewer characters than this a page means a scan: send pictures of it instead. */
const SCANNED_PAGE_CHARS = 40;
const SHEET_ROWS = 200;

export interface PreparedFile {
  attachment: AssistantAttachment;
  /** What the person sees on the chip: what was read, or why it couldn't be. */
  note: string;
  preview?: string;
}

const BY_EXTENSION: Record<string, AssistantFileType> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  gif: "image",
  bmp: "image",
  pdf: "pdf",
  xlsx: "spreadsheet",
  xlsm: "spreadsheet",
  xlsb: "spreadsheet",
  xls: "spreadsheet",
  ods: "spreadsheet",
  csv: "csv",
  tsv: "csv",
  docx: "word",
  pptx: "slides",
  txt: "text",
  md: "text",
  json: "text",
  xml: "text",
  log: "text",
};

export function fileTypeOf(name: string, mime = ""): AssistantFileType {
  const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";
  if (BY_EXTENSION[extension]) return BY_EXTENSION[extension];
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("text/")) return "text";
  return "other";
}

export function clipText(text: string): { text: string; truncated: boolean } {
  const clean = text.replace(/\r\n/g, "\n").trim();
  return clean.length > ASSISTANT_MAX_FILE_CHARS ? { text: clean.slice(0, ASSISTANT_MAX_FILE_CHARS), truncated: true } : { text: clean, truncated: false };
}

/** The words of a Word or PowerPoint XML part, a line per paragraph. */
export function xmlToText(xml: string): string {
  return xml
    .replace(/<\/(w|a):p>/g, "\n")
    .replace(/<(w:tab|w:br|a:br)\b[^>]*\/>/g, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const humanSize = (bytes: number): string => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`);

const safeName = (name: string): string => (name.length > 120 ? `${name.slice(0, 80)}…${name.slice(-30)}` : name);

/** On white, so a transparent PNG doesn't turn black as a JPEG. */
function canvasPicture(canvas: HTMLCanvasElement): string {
  let quality = 0.82;
  let url = canvas.toDataURL("image/jpeg", quality);
  while (url.length > ASSISTANT_MAX_IMAGE_CHARS && quality > 0.35) {
    quality -= 0.15;
    url = canvas.toDataURL("image/jpeg", quality);
  }
  if (url.length > ASSISTANT_MAX_IMAGE_CHARS) throw new Error("Picture too large");
  return url;
}

function whiteCanvas(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas");
  ctx.fillStyle = "#fff"; // a canvas fill, not a theme colour
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

async function readImage(file: File, base: AssistantAttachment): Promise<PreparedFile> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, PICTURE_SIZE / Math.max(bitmap.width, bitmap.height));
  const { canvas, ctx } = whiteCanvas(bitmap.width * scale, bitmap.height * scale);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const url = canvasPicture(canvas);
  return { attachment: { ...base, images: [url] }, note: "Picture ready", preview: url };
}

async function readPdf(file: File, base: AssistantAttachment): Promise<PreparedFile> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await task.promise;
  try {
    const pages = Math.min(doc.numPages, PDF_MAX_PAGES);
    const parts: string[] = [];
    for (let n = 1; n <= pages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      parts.push(content.items.map((item) => ("str" in item ? `${item.str}${item.hasEOL ? "\n" : " "}` : "")).join(""));
    }
    const words = parts.join("\n\n").trim();
    if (words.length >= pages * SCANNED_PAGE_CHARS) {
      const { text, truncated } = clipText(words);
      return { attachment: { ...base, text, truncated: truncated || doc.numPages > pages }, note: `Read ${doc.numPages === 1 ? "1 page" : `${pages} of ${doc.numPages} pages`.replace(/^(\d+) of \1 /, "$1 ")}` };
    }
    // A scan: the pages have no text, so the model reads pictures of the first few.
    const images: string[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, ASSISTANT_MAX_FILE_IMAGES); n++) {
      const page = await doc.getPage(n);
      const unit = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(2, PICTURE_SIZE / Math.max(unit.width, unit.height)) });
      const { canvas } = whiteCanvas(viewport.width, viewport.height);
      await page.render({ canvas, viewport }).promise;
      images.push(canvasPicture(canvas));
    }
    return {
      attachment: { ...base, images, truncated: doc.numPages > images.length },
      note: doc.numPages > images.length ? `Scanned: looking at the first ${images.length} of ${doc.numPages} pages` : "Scanned: looking at the pages",
      preview: images[0],
    };
  } finally {
    void task.destroy();
  }
}

async function readSheet(file: File, base: AssistantAttachment): Promise<PreparedFile> {
  const XLSX = await import("xlsx");
  const book = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", sheetRows: SHEET_ROWS + 1 });
  let cut = false;
  const parts = book.SheetNames.map((name) => {
    const csv = XLSX.utils.sheet_to_csv(book.Sheets[name], { blankrows: false }).trim();
    if (csv.split("\n").length > SHEET_ROWS) cut = true;
    return csv ? `Sheet: ${name}\n${csv}` : "";
  }).filter(Boolean);
  const { text, truncated } = clipText(parts.join("\n\n"));
  const sheets = book.SheetNames.length;
  return { attachment: { ...base, text, truncated: truncated || cut }, note: `Read ${sheets === 1 ? "1 sheet" : `${sheets} sheets`}${truncated || cut ? ", the first rows" : ""}` };
}

async function readOffice(file: File, base: AssistantAttachment): Promise<PreparedFile> {
  const XLSX = await import("xlsx");
  const zip: { FullPaths: string[]; FileIndex: Array<{ content: Uint8Array }> } = XLSX.CFB.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
  const wanted = base.type === "word" ? /word\/document\.xml$/ : /ppt\/slides\/slide(\d+)\.xml$/;
  const order = (path: string) => Number(wanted.exec(path)?.[1] ?? 0);
  const parts = zip.FullPaths.map((path, i) => ({ path, entry: zip.FileIndex[i] }))
    .filter((x) => wanted.test(x.path))
    .sort((a, b) => order(a.path) - order(b.path))
    .map((x) => xmlToText(new TextDecoder().decode(x.entry.content)));
  const { text, truncated } = clipText(parts.join("\n\n"));
  if (!text) throw new Error("No text");
  return { attachment: { ...base, text, truncated }, note: truncated ? "Read the first part" : `Read ${base.type === "word" ? "the document" : parts.length === 1 ? "1 slide" : `${parts.length} slides`}` };
}

async function readText(file: File, base: AssistantAttachment): Promise<PreparedFile> {
  const { text, truncated } = clipText(await file.text());
  return { attachment: { ...base, text, truncated }, note: truncated ? "Read the first part" : "Read the file" };
}

const READERS: Partial<Record<AssistantFileType, (file: File, base: AssistantAttachment) => Promise<PreparedFile>>> = {
  image: readImage,
  pdf: readPdf,
  spreadsheet: readSheet,
  csv: readText,
  text: readText,
  word: readOffice,
  slides: readOffice,
};

const nameOnly = (base: AssistantAttachment, note: string): PreparedFile => ({ attachment: base, note });

/** Never fails: a file that can't be opened keeps its name and says why. */
export async function prepareFile(file: File): Promise<PreparedFile> {
  const base: AssistantAttachment = { name: safeName(file.name || "pasted-picture.png"), type: fileTypeOf(file.name, file.type) };
  if (file.size > MAX_SOURCE_BYTES) return nameOnly(base, `Too big to read (${humanSize(file.size)}), so going by its name`);
  const reader = READERS[base.type];
  if (!reader) return nameOnly(base, "Can't read inside this file type, so going by its name");
  try {
    return await reader(file, base);
  } catch (err) {
    const locked = (err as { name?: string })?.name === "PasswordException";
    return nameOnly(base, locked ? "This file has a password, so going by its name" : "Couldn't open this file, so going by its name");
  }
}
