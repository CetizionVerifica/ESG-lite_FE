// AT-2 · pure helpers for "Layouts for page N" and "Try another template" (AI drawer):
// what a page holds (the drawer's subtitle), the check an option must pass before Apply
// (every element kept with its props, only frame and z moved, only layout decoration
// added: the same rule the server checks), replacing the page as one change, and the
// summary lines of a template swap. No React, no network.
import type { Element, FreeformPage, ReportDoc, TemplateSwapPreview, TextNode } from "../../../lib/studio/contracts";

const DECOR = new Set<Element["type"]>(["shape", "divider", "line", "page_number"]);
export const isDecor = (e: Pick<Element, "type">): boolean => DECOR.has(e.type);
const locked = (e: Element) => e.locked === true || e.templateLocked === true;

/** JSON with sorted keys (the server's jsonb reorders them). */
export const canon = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(canon).join(",")}]`
    : v && typeof v === "object"
      ? `{${Object.keys(v as Record<string, unknown>)
          .sort()
          .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
          .map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`)
          .join(",")}}`
      : JSON.stringify(v);

const withoutPosition = (e: Element) => canon({ ...e, frame: null, z: null });

function chipsIn(nodes: TextNode[] | undefined): number {
  let n = 0;
  for (const node of nodes ?? []) n += (node.type === "data" ? 1 : 0) + chipsIn(node.content);
  return n;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "uses the page's own text, 1 chart, 1 table and 3 data chips" */
export function pageSummary(page: FreeformPage): string {
  let charts = 0;
  let tables = 0;
  let figures = 0;
  let chips = 0;
  let text = false;
  for (const e of page.elements) {
    if (e.type === "chart") charts++;
    else if (e.type === "table") tables++;
    else if (e.type === "kpi_tile" || e.type === "big_number" || e.type === "progress") figures++;
    else if (e.type === "text" || e.type === "callout") {
      text = true;
      chips += chipsIn(e.props.doc.content);
    }
  }
  const parts = [
    ...(text ? ["the page's own text"] : []),
    ...(charts ? [plural(charts, "chart")] : []),
    ...(tables ? [plural(tables, "table")] : []),
    ...(figures ? [plural(figures, "figure tile")] : []),
    ...(chips ? [plural(chips, "data chip")] : []),
  ];
  if (!parts.length) return "uses the page's own elements";
  const last = parts.pop();
  return `uses ${parts.length ? `${parts.join(", ")} and ${last}` : last}`;
}

/**
 * Why an option can't be applied ([] = fine): an element missing or changed beyond
 * its position, a locked element moved, or a new element that isn't decoration.
 * Decoration from the page's old layout (`<pageId>.<slot>` ids) may give way.
 */
export function layoutOptionIssues(original: FreeformPage, option: FreeformPage): string[] {
  const issues: string[] = [];
  if (option.id !== original.id) issues.push("The option is for another page");
  const now = new Map(option.elements.map((e) => [e.id, e]));
  for (const e of original.elements) {
    const n = now.get(e.id);
    if (isDecor(e) && e.id.startsWith(`${original.id}.`) && !locked(e)) continue;
    if (!n) issues.push(`${e.id} is missing`);
    else if (locked(e) && canon(n) !== canon(e)) issues.push(`${e.id} is locked`);
    else if (n.type !== e.type || withoutPosition(n) !== withoutPosition(e)) issues.push(`${e.id} changed`);
  }
  const before = new Set(original.elements.map((e) => e.id));
  for (const e of option.elements) if (!before.has(e.id) && !isDecor(e)) issues.push(`${e.id} is new`);
  return issues;
}

/** The doc with the page replaced by `option`; null when the page is gone or the option breaks the rule. */
export function applyLayoutOption(doc: ReportDoc, option: FreeformPage): ReportDoc | null {
  const page = doc.pages.find((p): p is FreeformPage => p.kind === "freeform" && p.id === option.id);
  if (!page || layoutOptionIssues(page, option).length) return null;
  return { ...doc, pages: doc.pages.map((p) => (p.id === option.id ? option : p)) };
}

/** Elements the option moves or adds (the ghost outlines on the page). */
export function changedIds(original: FreeformPage, option: FreeformPage): string[] {
  const before = new Map(original.elements.map((e) => [e.id, e]));
  return option.elements.filter((e) => {
    const b = before.get(e.id);
    return !b || canon(b.frame) !== canon(e.frame);
  }).map((e) => e.id);
}

/** Content kept at its old frame in an option (no slot for it). */
export function keptInPlace(original: FreeformPage, option: FreeformPage): number {
  const now = new Map(option.elements.map((e) => [e.id, e]));
  return original.elements.filter((e) => !isDecor(e) && !locked(e) && !e.hidden && canon(now.get(e.id)?.frame) === canon(e.frame)).length;
}

export interface SwapSummary {
  mapped: number;
  kept: number;
  unplaced: number;
  locked: number;
}
export function swapSummary(p: Pick<TemplateSwapPreview, "pages" | "unplaced">): SwapSummary {
  return {
    mapped: p.pages.filter((x) => x.status === "mapped").length,
    kept: p.pages.filter((x) => x.status !== "mapped").length,
    unplaced: p.unplaced.filter((u) => u.reason === "no_slot").length,
    locked: p.unplaced.filter((u) => u.reason === "locked").length,
  };
}

/** "12 pages take the new layouts; 3 keep their own. 2 items stay where they were." */
export function swapSummaryText(s: SwapSummary): string {
  const parts = [`${plural(s.mapped, "page")} take${s.mapped === 1 ? "s" : ""} the new layouts`];
  if (s.kept) parts.push(`${plural(s.kept, "page")} keep${s.kept === 1 ? "s" : ""} ${s.kept === 1 ? "its" : "their"} own`);
  let out = `${parts.join("; ")}.`;
  if (s.unplaced) out += ` ${plural(s.unplaced, "item")} stay${s.unplaced === 1 ? "s" : ""} where ${s.unplaced === 1 ? "it was" : "they were"}.`;
  if (s.locked) out += ` ${plural(s.locked, "locked item")} ${s.locked === 1 ? "doesn't" : "don't"} move.`;
  return out;
}

/** Every text, chart and chip of `before` is in `after` (the swap's promise, checked before Apply). */
export function swapKeepsContent(before: ReportDoc, after: ReportDoc): boolean {
  const content = (d: ReportDoc) =>
    new Map(d.pages.flatMap((p) => (p.kind === "freeform" ? p.elements.filter((e) => !isDecor(e)) : [])).map((e) => [e.id, e] as const));
  const a = content(after);
  for (const [id, e] of content(before)) {
    const n = a.get(id);
    if (!n || n.type !== e.type) return false;
    // Text may take the new template's style and alignment; its words and chips stay.
    const strip = (x: Element) => canon({ ...x, frame: null, z: null, props: x.type === "text" ? { ...x.props, style: null, align: null } : x.props });
    if (strip(n) !== strip(e)) return false;
  }
  return true;
}
