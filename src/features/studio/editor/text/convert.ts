// DS-7 · TextDoc (01-contracts §2) ↔ TipTap JSON. The TipTap schema uses the
// contract's own node and mark names (`data` for chips, `footnote` for notes),
// so the conversion is a sanitising walk: only the allowed nodes, marks and
// attributes survive; anything else keeps its text and loses its markup
// (RS-7: paste is sanitised to the contract).
import type { DataToken, TextDoc, TextMark, TextNode } from "../../../../lib/studio/contracts";
import { MAX_FOOTNOTE_CHARS, NUMBER_FORMATS, MEASURES } from "../../../../lib/studio/contracts";

/** TipTap's JSON (JSONContent), typed loosely: it is what the editor emits. */
export interface PmJson {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: PmJson[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
}

const BLOCKS = new Set(["paragraph", "heading", "bulletList", "orderedList", "listItem"]);
const HEX = /^#[0-9a-fA-F]{6}$/;
const SAFE_HREF = /^(https?:\/\/|mailto:)/i;
const MARK_ORDER = ["bold", "italic", "highlight", "link", "footnote"] as const;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** A contract mark from any mark-like object, or null when it isn't allowed. */
export function cleanMark(m: { type?: string; attrs?: Record<string, unknown> } | undefined): TextMark | null {
  if (!m) return null;
  switch (m.type) {
    case "bold":
    case "italic":
      return { type: m.type };
    case "highlight": {
      const c = m.attrs?.color;
      return typeof c === "string" && HEX.test(c) ? { type: "highlight", attrs: { color: c.toLowerCase() } } : { type: "highlight" };
    }
    case "link": {
      const href = typeof m.attrs?.href === "string" ? m.attrs.href.trim() : "";
      return SAFE_HREF.test(href) && href.length <= 2000 ? { type: "link", attrs: { href } } : null;
    }
    case "footnote": {
      const note = typeof m.attrs?.note === "string" ? m.attrs.note.trim().slice(0, MAX_FOOTNOTE_CHARS) : "";
      return note ? { type: "footnote", attrs: { note } } : null;
    }
    default:
      return null;
  }
}

function cleanMarks(marks: PmJson["marks"]): TextMark[] | undefined {
  const out: TextMark[] = [];
  for (const m of marks ?? []) {
    const c = cleanMark(m);
    if (c && !out.some((x) => x.type === c.type)) out.push(c);
  }
  out.sort((a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type));
  return out.length ? out : undefined;
}

/** A data chip's attributes as the contract stores them (no nulls, known values only). */
export function cleanChipAttrs(a: Record<string, unknown> | undefined): DataToken["attrs"] | null {
  const b = a?.binding;
  if (!isObj(b) || (b.source !== "ghg" && b.source !== "kpi")) return null;
  const measure = MEASURES.includes(a?.measure as never) ? (a?.measure as DataToken["attrs"]["measure"]) : "value";
  const out: DataToken["attrs"] = { binding: b as unknown as DataToken["attrs"]["binding"], measure };
  if (NUMBER_FORMATS.includes(a?.format as never)) out.format = a?.format as DataToken["attrs"]["format"];
  const y = a?.year;
  if (y === "current" || y === "prior" || y === "base" || (typeof y === "number" && Number.isInteger(y))) out.year = y;
  return out;
}

type Inline = TextNode | DataToken;

function inline(nodes: PmJson[] | undefined): Inline[] {
  const out: Inline[] = [];
  for (const n of nodes ?? []) {
    if (n.type === "text") {
      if (!n.text) continue;
      const marks = cleanMarks(n.marks);
      const prev = out[out.length - 1];
      // Merge neighbours with the same marks (TipTap splits on every change).
      if (prev && prev.type === "text" && JSON.stringify((prev as TextNode).marks ?? null) === JSON.stringify(marks ?? null)) {
        (prev as TextNode).text = ((prev as TextNode).text ?? "") + n.text;
        continue;
      }
      out.push({ type: "text", text: n.text, ...(marks ? { marks } : {}) });
    } else if (n.type === "data") {
      const attrs = cleanChipAttrs(n.attrs);
      if (attrs) out.push({ type: "data", attrs });
    } else if (n.type === "hardBreak") {
      out.push({ type: "hardBreak" });
    } else if (n.content) {
      // An unknown inline wrapper (or a block in the wrong place): keep its inline content.
      out.push(...inline(n.content));
    }
  }
  return out;
}

function block(n: PmJson): TextNode[] {
  switch (n.type) {
    case "paragraph": {
      const c = inline(n.content);
      return [{ type: "paragraph", ...(c.length ? { content: c } : {}) }];
    }
    case "heading": {
      const lv = Number(n.attrs?.level);
      const level = lv === 3 || lv === 4 ? lv : 2;
      const c = inline(n.content);
      return [{ type: "heading", attrs: { level }, ...(c.length ? { content: c } : {}) }];
    }
    case "bulletList":
    case "orderedList": {
      const items = (n.content ?? []).flatMap((li) => listItem(li));
      if (!items.length) return [];
      const start = Number(n.attrs?.start);
      const attrs = n.type === "orderedList" && Number.isInteger(start) && start > 1 ? { attrs: { start } } : {};
      return [{ type: n.type, ...attrs, content: items }];
    }
    case "listItem":
      return blocks(n.content);
    case "text":
    case "data":
    case "hardBreak": {
      const c = inline([n]);
      return c.length ? [{ type: "paragraph", content: c }] : [];
    }
    default:
      // Unknown blocks (blockquote, code block, table, image…): keep their text as paragraphs.
      return n.content ? (n.content.some((x) => BLOCKS.has(x.type ?? "")) ? blocks(n.content) : block({ type: "paragraph", content: n.content })) : [];
  }
}

function listItem(li: PmJson): TextNode[] {
  if (li.type !== "listItem") return [];
  const content = blocks(li.content);
  return [{ type: "listItem", content: content.length ? content : [{ type: "paragraph" }] }];
}

function blocks(nodes: PmJson[] | undefined): TextNode[] {
  return (nodes ?? []).flatMap(block);
}

/** TipTap JSON → a contract TextDoc (sanitised). */
export function fromTiptap(json: PmJson | null | undefined): TextDoc {
  const content = blocks(json?.content);
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

/** A contract TextDoc → TipTap JSON (also sanitised: a doc from anywhere loads safely). */
export function toTiptap(doc: TextDoc | null | undefined): PmJson {
  const clean = fromTiptap(doc as unknown as PmJson);
  return clean as unknown as PmJson;
}

/** True when two TextDocs are the same after sanitising (no history step for a no-op edit). */
export const sameText = (a: TextDoc | undefined, b: TextDoc | undefined): boolean => JSON.stringify(fromTiptap(a as unknown as PmJson)) === JSON.stringify(fromTiptap(b as unknown as PmJson));

/** A one-paragraph TextDoc. */
export const plainDoc = (text: string): TextDoc => ({ type: "doc", content: [{ type: "paragraph", ...(text ? { content: [{ type: "text", text }] } : {}) }] });

/** Every data chip of a TextDoc, in order. */
export function chipsOf(doc: TextDoc | undefined): DataToken[] {
  const out: DataToken[] = [];
  const walk = (n: TextNode | DataToken) => {
    if (n.type === "data") out.push(n as DataToken);
    else for (const c of (n as TextNode).content ?? []) walk(c);
  };
  for (const n of doc?.content ?? []) walk(n);
  return out;
}

/** Plain text of a TextDoc; chips show as `chip(attrs)` (their display string). */
export function textOf(doc: TextDoc | undefined, chip: (t: DataToken) => string = () => "#"): string {
  const walk = (n: TextNode | DataToken): string => (n.type === "data" ? chip(n as DataToken) : n.type === "hardBreak" ? "\n" : ((n as TextNode).text ?? "") + ((n as TextNode).content ?? []).map(walk).join(""));
  return (doc?.content ?? []).map(walk).join("\n");
}

/**
 * Pasted HTML before ProseMirror parses it: scripts, styles, images, iframes,
 * objects and comments go; style/class/event attributes go. ProseMirror's
 * schema then keeps only our nodes and marks.
 */
export function cleanPastedHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|iframe|object|embed|svg|math|template|noscript)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<(img|meta|link|base|input|video|audio|source|embed)\b[^>]*>/gi, "")
    .replace(/\s(style|class|id|on[a-z]+|srcset|src)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
}
