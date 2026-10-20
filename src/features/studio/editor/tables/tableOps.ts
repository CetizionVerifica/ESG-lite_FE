// DS-8 · pure table edits (no React): static cells, rows and columns,
// column widths (% of the frame), merged cells (static tables only), the
// columns a bound table shows, the height a table needs, and moving a bound
// table that outgrows its frame into a flow section.
import type { Binding, Element, FlowSection, ReportDoc } from "../../../../lib/studio/contracts";
import { findElement, insertPage, removeElements, updateProps, type IdFn } from "../../../../lib/studio/docOps";

export type TableProps = Extract<Element, { type: "table" }>["props"];
export type Cell = string | number | null;
export interface Merge {
  r: number;
  c: number;
  rs: number;
  cs: number;
}

export const MAX_COLS = 20;
export const MAX_ROWS = 500;

/** A new static table: three columns, three rows. */
export const staticTableTemplate = (): Element => ({
  id: "table",
  type: "table",
  frame: { x: 0, y: 0, w: 120, h: 40, rotation: 0 },
  z: 0,
  source: "user",
  props: { style: "lined", columns: ["Item", "Detail", "Note"], rows: [["", "", ""], ["", "", ""], ["", "", ""]] },
});

export const colCount = (p: Pick<TableProps, "columns" | "rows">): number => Math.max(p.columns?.length ?? 0, ...(p.rows ?? []).map((r) => r.length), 0);

/** Sets a cell; r = -1 is the header. */
export function setCell(p: TableProps, r: number, c: number, v: string): TableProps {
  const n = colCount(p);
  if (r < 0) {
    const columns = Array.from({ length: n }, (_, j) => (j === c ? v : (p.columns?.[j] ?? "")));
    return { ...p, columns };
  }
  const rows = (p.rows ?? []).map((row, i) => (i === r ? Array.from({ length: n }, (_, j) => (j === c ? v : (row[j] ?? ""))) : row));
  return { ...p, rows };
}

const shiftMerges = (ms: Merge[] | undefined, f: (m: Merge) => Merge | null): Merge[] | undefined => {
  const out = (ms ?? []).map(f).filter((m): m is Merge => !!m && (m.rs > 1 || m.cs > 1));
  return out.length ? out : undefined;
};

export function addRow(p: TableProps, at = (p.rows ?? []).length): TableProps {
  if ((p.rows ?? []).length >= MAX_ROWS) return p;
  const rows = [...(p.rows ?? [])];
  rows.splice(at, 0, Array.from({ length: colCount(p) }, () => ""));
  return { ...p, rows, merges: shiftMerges(p.merges, (m) => (m.r >= at ? { ...m, r: m.r + 1 } : m.r + m.rs > at ? { ...m, rs: m.rs + 1 } : m)) };
}

export function removeRow(p: TableProps, at: number): TableProps {
  const rows = (p.rows ?? []).filter((_, i) => i !== at);
  return {
    ...p,
    rows,
    merges: shiftMerges(p.merges, (m) => (m.r > at ? { ...m, r: m.r - 1 } : m.r + m.rs > at ? (m.r === at && m.rs === 1 ? null : { ...m, rs: m.rs - 1 }) : m)),
  };
}

export function addColumn(p: TableProps, at = colCount(p)): TableProps {
  const n = colCount(p);
  if (n >= MAX_COLS) return p;
  const ins = <T,>(xs: T[], v: T) => {
    const out = Array.from({ length: n }, (_, j) => xs[j] ?? (v as T));
    out.splice(at, 0, v);
    return out;
  };
  return {
    ...p,
    columns: ins(p.columns ?? [], `Column ${n + 1}`),
    rows: (p.rows ?? []).map((r) => ins<Cell>(r, "")),
    colWidths: p.colWidths ? normalizeWidths(ins(p.colWidths, 100 / (n + 1))) : undefined,
    merges: shiftMerges(p.merges, (m) => (m.c >= at ? { ...m, c: m.c + 1 } : m.c + m.cs > at ? { ...m, cs: m.cs + 1 } : m)),
  };
}

export function removeColumn(p: TableProps, at: number): TableProps {
  if (colCount(p) <= 1) return p;
  const drop = <T,>(xs: T[] | undefined) => xs?.filter((_, j) => j !== at);
  return {
    ...p,
    columns: drop(p.columns),
    rows: (p.rows ?? []).map((r) => r.filter((_, j) => j !== at)),
    colWidths: p.colWidths ? normalizeWidths(drop(p.colWidths) ?? []) : undefined,
    merges: shiftMerges(p.merges, (m) => (m.c > at ? { ...m, c: m.c - 1 } : m.c + m.cs > at ? (m.c === at && m.cs === 1 ? null : { ...m, cs: m.cs - 1 }) : m)),
  };
}

/** Widths scaled to add up to 100 (each at least 1, one decimal). */
export function normalizeWidths(ws: number[]): number[] {
  const clean = ws.map((w) => (Number.isFinite(w) && w > 0 ? w : 1));
  const sum = clean.reduce((a, b) => a + b, 0) || 1;
  return clean.map((w) => Math.max(1, Math.round((w / sum) * 1000) / 10));
}

/** Sets one column's width (%) and spreads the rest over the other columns. */
export function setColumnWidth(p: TableProps, n: number, c: number, pct: number): TableProps {
  const cur = p.colWidths?.length === n ? p.colWidths : Array.from({ length: n }, () => 100 / n);
  const w = Math.min(100 - (n - 1), Math.max(1, pct));
  const rest = cur.reduce((a, x, j) => (j === c ? a : a + x), 0) || 1;
  const next = cur.map((x, j) => (j === c ? w : (x / rest) * (100 - w)));
  return { ...p, colWidths: normalizeWidths(next) };
}

/** Merges a rectangle of body cells (static tables only); overlapping merges are replaced. */
export function mergeCells(p: TableProps, sel: { r0: number; c0: number; r1: number; c1: number }): TableProps {
  if (p.binding) return p;
  const r = Math.min(sel.r0, sel.r1);
  const c = Math.min(sel.c0, sel.c1);
  const rs = Math.abs(sel.r1 - sel.r0) + 1;
  const cs = Math.abs(sel.c1 - sel.c0) + 1;
  if (rs === 1 && cs === 1) return p;
  const overlaps = (m: Merge) => m.r < r + rs && r < m.r + m.rs && m.c < c + cs && c < m.c + m.cs;
  return { ...p, merges: [...(p.merges ?? []).filter((m) => !overlaps(m)), { r, c, rs, cs }] };
}

/** Removes the merge that covers (r, c). */
export function unmergeAt(p: TableProps, r: number, c: number): TableProps {
  const merges = (p.merges ?? []).filter((m) => !(r >= m.r && r < m.r + m.rs && c >= m.c && c < m.c + m.cs));
  return { ...p, merges: merges.length ? merges : undefined };
}

export const mergeAt = (p: TableProps, r: number, c: number): Merge | undefined => (p.merges ?? []).find((m) => r >= m.r && r < m.r + m.rs && c >= m.c && c < m.c + m.cs);

/** Bound table: show only these columns (by heading; the label column always shows). Empty = all. */
export const pickColumns = (p: TableProps, cols: string[]): TableProps => ({ ...p, columns: cols.length ? cols : undefined });

/** Height (mm) the renderer's table needs: header + body rows at 8.5 pt with the table padding (css.ts). */
export const tableHeightMm = (bodyRows: number, header = true): number => (header ? 7.2 : 0) + bodyRows * 5.6;

export const overflows = (el: Pick<Element, "frame">, bodyRows: number): boolean => tableHeightMm(bodyRows) > el.frame.h + 0.5;

/** The flow section a bound table becomes when it outgrows its frame. */
export function flowFor(binding: Binding, name: string, id: string): FlowSection {
  if (binding.source === "ghg" && (binding.metric === "scope3" || binding.metric === "scope3_category") && binding.breakdown === "scope3_category")
    return { id, kind: "flow", name, flowType: "scope3_categories", options: { showDq: true, showMethod: true } };
  const by = binding.source === "ghg" || binding.source === "kpi" ? binding.years : null;
  const years = !by ? { last: 3 } : Array.isArray(by) ? { last: Math.max(1, by.length) } : by;
  return { id, kind: "flow", name, flowType: "data_tables", options: { years, ...(binding.source === "kpi" ? { kpis: binding.kpis } : {}) } };
}

/** Moves a bound table into a new flow section right after its page (the table leaves the page). */
export function moveTableToFlow(doc: ReportDoc, pageId: string, id: string, newId: IdFn, name = "Data tables"): { doc: ReportDoc; pageId: string } | null {
  const el = findElement(doc, pageId, id);
  if (!el || el.type !== "table" || !el.props.binding) return null;
  const at = doc.pages.findIndex((p) => p.id === pageId);
  const flowId = newId("page");
  const section = flowFor(el.props.binding, name, flowId);
  const next = insertPage(removeElements(doc, pageId, [id]), section, at + 1);
  return { doc: next, pageId: flowId };
}

export const patchTable = (doc: ReportDoc, pageId: string, id: string, next: TableProps): ReportDoc => updateProps(doc, pageId, [id], "table", next);

/** A table of figures bound to data (columns from the breakdown, a row per year). */
export const boundTableTemplate = (binding: Binding): Element => ({
  id: "table",
  type: "table",
  frame: { x: 0, y: 0, w: 120, h: 30, rotation: 0 },
  z: 0,
  source: "user",
  props: { style: "lined", binding, totalRow: false },
});

/** The columns and row count a bound table's resolved value gives (as the renderer's tableFromValue). */
export function boundShape(v: { table?: { columns: string[]; rows: unknown[] } | null; series?: { label: string; values: { key: string }[] }[] } | undefined): { columns: string[]; rows: number } {
  if (!v) return { columns: [], rows: 0 };
  if (v.table) return { columns: v.table.columns, rows: v.table.rows.length };
  const keys: string[] = [];
  for (const s of v.series ?? []) for (const p of s.values) if (!keys.includes(p.key)) keys.push(p.key);
  return { columns: ["", ...keys], rows: (v.series ?? []).length };
}
