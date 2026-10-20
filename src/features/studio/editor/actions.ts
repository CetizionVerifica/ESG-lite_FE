// DS-6 · shared editor actions and labels (no components here): the ⋯ menu
// entries, layer names and report colour swatches.
import type { Element, ReportDoc, TextDoc, TextNode } from "../../../lib/studio/contracts";
import { copyStyle, duplicateElements, pasteStyle, removeElements } from "../../../lib/studio/docOps";
import type { EditorApi } from "./EditorContext";

/** The ⋯ menu entries for a selection (also the context menu). */
export function moreItems(ed: EditorApi) {
  const page = ed.page;
  const sel = ed.selected;
  const ids = sel.map((e) => e.id);
  const pageId = page?.id ?? "";
  const editable = !ed.readOnly && sel.some((e) => !e.locked && !e.templateLocked);
  return [
    { label: "Copy style", disabled: sel.length !== 1, onSelect: () => sel[0] && ed.setClip(copyStyle(sel[0])) },
    { label: "Paste style", disabled: !ed.ui.clip || !editable, onSelect: () => ed.ui.clip && ed.commit(pasteStyle(ed.doc, pageId, ids, ed.ui.clip), "Paste style") },
    {
      label: "Duplicate",
      disabled: ed.readOnly || !sel.length,
      onSelect: () => {
        const r = duplicateElements(ed.doc, pageId, ids, { newId: ed.newId });
        ed.commit(r.doc, "Duplicate", { select: r.ids });
      },
    },
    { label: "Comment", onSelect: () => ed.setCommentMode(true) },
    { label: "Ask AI", onSelect: () => ed.openDrawer("ai") },
    { kind: "separator" as const },
    { label: "Delete", danger: true, disabled: !editable, onSelect: () => ed.commit(removeElements(ed.doc, pageId, ids), "Delete", { select: [] }) },
  ];
}


const TYPE_LABEL: Record<Element["type"], string> = {
  text: "Text",
  kpi_tile: "KPI tile",
  chart: "Chart",
  table: "Table",
  image: "Image",
  shape: "Shape",
  icon: "Icon",
  sdg: "SDG badge",
  divider: "Divider",
  page_number: "Page number",
  placeholder: "Placeholder",
  frame: "Frame",
  grid: "Photo grid",
  line: "Line",
  big_number: "Big number",
  progress: "Progress",
  callout: "Callout",
  qr: "QR code",
};

const plain = (d: TextDoc | TextNode | { type: "data" }): string => {
  if ((d as TextNode).text) return (d as TextNode).text as string;
  if (d.type === "data") return "▢";
  return ((d as TextNode).content ?? []).map((c) => plain(c as TextNode)).join(" ");
};

/** A short name for an element in Layers. */
export function layerName(el: Element): string {
  const base = TYPE_LABEL[el.type] ?? el.type;
  if (el.type === "text" || el.type === "callout") {
    const t = plain(el.props.doc).replace(/\s+/g, " ").trim();
    return t ? `${base}: ${t.length > 32 ? `${t.slice(0, 32)}…` : t}` : base;
  }
  if (el.type === "chart" && el.props.title) return `${base}: ${el.props.title}`;
  if ((el.type === "kpi_tile" || el.type === "big_number" || el.type === "progress") && el.props.label) return `${base}: ${el.props.label}`;
  return base;
}


/** Report colours to pick from: the doc's theme roles, then the brand kit's. */
export function themeSwatches(doc: ReportDoc): string[] {
  const c = doc.design.theme.colors ?? {};
  const out = [c.primary, c.accent, c.ink, c.surface, c.muted, c.coverFrom, c.coverTo].filter((x): x is string => !!x);
  return [...new Set(out.map((x) => x.toLowerCase()))];
}

