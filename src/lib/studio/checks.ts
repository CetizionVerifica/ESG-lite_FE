// DS-12 · the checks panel's pure side (05-ux S8, RS S5): grouping, counts and
// the words around a check, and the doc edits behind its one-click fixes.
//
//   groupChecks(checks)          Must fix (errors) · Review (warnings) · For info
//   countsLine(checks)           "1 must fix · 2 to review · 2 for info"
//   counterLabel(checks)         the top bar's "⚑ 3 checks" (errors + warnings)
//   finalBlock(checks, opts)     why a final can't be made yet, or null
//   pageLabel(doc, pageId)       "page 12" (printed pages only), for "Go to page 12"
//   fixLabel(check)              the button text of its fix
//   replaceTypedNumber(...)      NUMBER_MISMATCH → a data chip in place of the typed number
//   moveInside(...)              OUTSIDE_SAFE_AREA → the nearest frame inside the margin
//   insertFix(...)               add_market_note / add_gas_chart / add_biogenic / add_factor_table
//
// Server checks are the truth (POST /studio/docs/:id/checks); nothing here decides
// whether a final may be made, it only says so in words.
import type { Check, CheckFix, CheckId, DataToken, Element, FlowSection, GhgBinding, KpiBinding, Measure, Page, ReportDoc, TextDoc } from "./contracts";
import { PAGE_FORMAT_SIZES } from "./contracts";

export type CheckGroup = "must" | "review" | "info";
export const GROUP_OF: Record<Check["severity"], CheckGroup> = { error: "must", warning: "review", info: "info" };
export const GROUP_TITLE: Record<CheckGroup, string> = { must: "Must fix", review: "Review", info: "For info" };

export function groupChecks(checks: Check[]): Record<CheckGroup, Check[]> {
  const out: Record<CheckGroup, Check[]> = { must: [], review: [], info: [] };
  for (const c of checks) out[GROUP_OF[c.severity]].push(c);
  return out;
}

export function countsLine(checks: Check[]): string {
  const g = groupChecks(checks);
  if (!checks.length) return "Nothing to fix";
  return [g.must.length && `${g.must.length} must fix`, g.review.length && `${g.review.length} to review`, g.info.length && `${g.info.length} for info`].filter(Boolean).join(" · ");
}

/** The top bar counter: errors and warnings (info rows don't count). */
export function counterLabel(checks: Check[] | undefined): string {
  if (!checks) return "Checks";
  const n = checks.filter((c) => c.severity !== "info").length;
  return n === 0 ? "No checks" : `${n} ${n === 1 ? "check" : "checks"}`;
}

/** A stable key for a check row (React keys, focus from a marker). */
export const checkKey = (c: Check, i = 0): string => `${c.id}|${c.pageId ?? ""}|${c.elementId ?? ""}|${(c.details as { category?: number; paragraph?: number; start?: number } | undefined)?.category ?? ""}|${(c.details as { start?: number } | undefined)?.start ?? ""}|${i}`;

/** Why the final is blocked, in words; null when it can be made (warnings are acknowledged in the dialog). */
export function finalBlock(checks: Check[] | undefined, opts: { canFinal: boolean }): string | null {
  if (!opts.canFinal) return "Only a Manager can make the final.";
  if (!checks) return null;
  const errors = checks.filter((c) => c.severity === "error");
  if (!errors.length) return null;
  const pending = errors.find((c) => c.id === "GHG_PENDING_ENTRIES");
  const rest = errors.length - (pending ? 1 : 0);
  if (pending && !rest) return pending.message;
  return `Fix ${errors.length} ${errors.length === 1 ? "check" : "checks"} to generate the final.`;
}

/** The warning ids a final must acknowledge (one per id). */
export const warningIds = (checks: Check[] | undefined): CheckId[] => [...new Set((checks ?? []).filter((c) => c.severity === "warning").map((c) => c.id))];

/** "page 12": the page's place among printed pages (flow sections count as one). */
export function pageLabel(doc: ReportDoc, pageId: string | undefined): string | null {
  if (!pageId) return null;
  const shown = doc.pages.filter((p) => !p.hidden);
  const i = shown.findIndex((p) => p.id === pageId);
  return i < 0 ? null : `page ${i + 1}`;
}

const FIX_LABELS: Record<CheckFix, string> = {
  replace_with_token: "Replace with linked value",
  shrink_text: "Shrink text to fit",
  move_inside: "Move inside margin",
  open_values: "Open missing values",
  open_inputs: "Open report details",
  mark_excluded: "Mark as excluded…",
  open_pending: "Open Review",
  add_market_note: "Add market-based note",
  add_gas_chart: "Add per-gas chart",
  add_biogenic: "Add biogenic CO₂",
  add_factor_table: "Add emission factors",
  open_link: "Open",
};
const LINK_LABELS: Array<[RegExp, string]> = [
  [/^\/data\/approvals/, "Open Review"],
  [/^\/data\/ledger/, "Open site data"],
  [/^\/data\/mine/, "My entries"],
  [/^\/settings\/scope3/, "Scope 3 screening"],
  [/^\/kpi\/dashboard/, "Open KPI dashboard"],
];

export function fixLabel(c: Check): string | null {
  if (!c.fix) return null;
  if (c.fix === "open_link" || c.fix === "open_values") {
    const link = checkLink(c);
    const named = link ? LINK_LABELS.find(([rx]) => rx.test(link))?.[1] : undefined;
    return named ?? FIX_LABELS[c.fix];
  }
  return FIX_LABELS[c.fix];
}

/** The app link a fix opens, when it is one. */
export function checkLink(c: Check): string | null {
  const link = (c.details as { link?: unknown } | undefined)?.link;
  return typeof link === "string" && link.startsWith("/") ? link : null;
}

/** The report input a fix opens. */
export const checkInputKey = (c: Check): string | null => {
  const k = (c.details as { inputKey?: unknown } | undefined)?.inputKey;
  return typeof k === "string" ? k : null;
};

// ---------------------------------------------------------------------------
// Fixes: pure doc edits
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * Replaces characters [start, end) of the n-th paragraph/heading of a TextDoc
 * with a data chip (the server counts paragraphs and offsets the same way:
 * a chip is one character, a hard break is "\n"). Marks of the cut text are
 * kept on what remains. Returns null when the range doesn't match `expected`.
 */
export function replaceTypedNumber(text: TextDoc, paragraph: number, start: number, end: number, chip: DataToken, expected?: string): TextDoc | null {
  let seen = -1;
  let done = false;
  const visitBlock = (block: Json): Json => {
    let pos = 0;
    const out: unknown[] = [];
    const visitInline = (n: Json): void => {
      if (n.type === "text" && typeof n.text === "string") {
        const s = n.text;
        const a = pos;
        const b = pos + s.length;
        pos = b;
        if (done || end <= a || start >= b) {
          out.push(n);
          return;
        }
        const from = Math.max(0, start - a);
        const to = Math.min(s.length, end - a);
        if (from > 0) out.push({ ...n, text: s.slice(0, from) });
        if (start >= a) out.push(chip);
        if (to < s.length) out.push({ ...n, text: s.slice(to) });
        if (end <= b) done = true;
        return;
      }
      pos += n.type === "data" || n.type === "hardBreak" ? 1 : 0;
      out.push(n);
    };
    const flat = (n: unknown) => {
      if (!isObj(n)) return;
      if (Array.isArray(n.content) && n.type !== "text") n.content.forEach((c) => visitInline(c as Json));
    };
    flat(block);
    return { ...block, content: out };
  };
  const typedOf = (block: Json): string =>
    (Array.isArray(block.content) ? block.content : []).map((c) => (isObj(c) ? (c.type === "text" ? String(c.text ?? "") : c.type === "data" ? "⁣" : c.type === "hardBreak" ? "\n" : "") : "")).join("");
  const walk = (n: unknown): unknown => {
    if (!isObj(n)) return n;
    if (n.type === "paragraph" || n.type === "heading") {
      seen++;
      if (seen !== paragraph) return n;
      if (expected !== undefined && typedOf(n).slice(start, end) !== expected) return n;
      return visitBlock(n);
    }
    return Array.isArray(n.content) ? { ...n, content: n.content.map(walk) } : n;
  };
  const next = walk(text) as TextDoc;
  return done ? next : null;
}

/** A chip for a check's suggested binding (NUMBER_MISMATCH `details.chip`). */
export function chipFor(c: Check): DataToken | null {
  const chip = (c.details as { chip?: { binding?: GhgBinding | KpiBinding; measure?: Measure } } | undefined)?.chip;
  if (!chip?.binding || !chip.measure) return null;
  return { type: "data", attrs: { binding: chip.binding, measure: chip.measure } } as DataToken;
}

/** The text of an element (text or callout). */
export const elementText = (e: Element | undefined): TextDoc | null => (e && (e.type === "text" || e.type === "callout") ? e.props.doc : null);

/** NUMBER_MISMATCH fix on a doc: the typed number becomes the chip. Null when the text has changed since. */
export function applyReplaceWithToken(doc: ReportDoc, c: Check): ReportDoc | null {
  const d = c.details as { paragraph?: number; start?: number; end?: number; typed?: string } | undefined;
  const chip = chipFor(c);
  if (!chip || !d || d.paragraph === undefined || d.start === undefined || d.end === undefined) return null;
  let changed = false;
  const pages = doc.pages.map((p) => {
    if (p.id !== c.pageId) return p;
    if (p.kind === "flow") {
      if (c.elementId || !p.content) return p;
      const t = replaceTypedNumber(p.content, d.paragraph!, d.start!, d.end!, chip, d.typed);
      if (!t) return p;
      changed = true;
      return { ...p, content: t };
    }
    return {
      ...p,
      elements: p.elements.map((e) => {
        if (e.id !== c.elementId) return e;
        const text = elementText(e);
        const t = text ? replaceTypedNumber(text, d.paragraph!, d.start!, d.end!, chip, d.typed) : null;
        if (!t) return e;
        changed = true;
        return { ...e, props: { ...e.props, doc: t } } as Element;
      }),
    };
  });
  return changed ? { ...doc, pages } : null;
}

/** OUTSIDE_SAFE_AREA fix: the nearest position inside the safe margin (the frame shrinks only if it is larger than the area). */
export function moveInside(doc: ReportDoc, pageId: string, elementId: string, safeMm: number): ReportDoc {
  const size = PAGE_FORMAT_SIZES[doc.format] ?? PAGE_FORMAT_SIZES.a4;
  return {
    ...doc,
    pages: doc.pages.map((p) =>
      p.id !== pageId || p.kind !== "freeform"
        ? p
        : {
            ...p,
            elements: p.elements.map((e) => {
              if (e.id !== elementId) return e;
              const maxW = size.wMm - 2 * safeMm;
              const maxH = size.hMm - 2 * safeMm;
              const w = Math.min(e.frame.w, maxW);
              const h = Math.min(e.frame.h, maxH);
              const x = Math.min(Math.max(e.frame.x, safeMm), size.wMm - safeMm - w);
              const y = Math.min(Math.max(e.frame.y, safeMm), size.hMm - safeMm - h);
              return { ...e, frame: { ...e.frame, x, y, w, h } };
            }),
          },
    ),
  };
}

const ghg = (metric: GhgBinding["metric"], extra: Partial<GhgBinding> = {}): GhgBinding => ({ source: "ghg", metric, years: { last: 1 }, sites: "all", ...extra }) as GhgBinding;

/** The element (or flow section) an "add" fix inserts. */
export function fixElement(fix: "add_market_note" | "add_gas_chart" | "add_biogenic", id: string): Element {
  const frame = { x: 0, y: 0, w: 80, h: 28, rotation: 0 };
  if (fix === "add_market_note") {
    return { id, type: "kpi_tile", frame, z: 0, source: "user", props: { binding: ghg("scope2_market"), label: "Scope 2 (market-based)", showDelta: false, showSparkline: false, variant: "plain" } } as Element;
  }
  if (fix === "add_biogenic") {
    return { id, type: "big_number", frame, z: 0, source: "user", props: { binding: ghg("biogenic_co2"), label: "Biogenic CO₂, reported separately", showDelta: false } } as Element;
  }
  return { id, type: "chart", frame: { ...frame, w: 90, h: 70 }, z: 0, source: "user", props: { binding: ghg("total", { breakdown: "gas" }), kind: "gas_split", title: "Emissions by gas", options: { showValues: true } } } as Element;
}

export function factorSection(id: string): FlowSection {
  return { id, kind: "flow", name: "Emission factors", flowType: "ghg_factor_table", options: { columns: 1 } } as FlowSection;
}

/** The page an "add" fix goes on: the check's page, else the first page that binds `metrics`, else the page in view. */
export function targetPage(doc: ReportDoc, c: Check, metrics: string[], inView: string | null): string | null {
  const free = (p: Page | undefined) => (p && p.kind === "freeform" && !p.hidden ? p.id : null);
  const own = free(doc.pages.find((p) => p.id === c.pageId));
  if (own) return own;
  const hit = doc.pages.find((p) => p.kind === "freeform" && !p.hidden && p.elements.some((e) => metrics.includes(String((e.props as { binding?: { metric?: string } }).binding?.metric))));
  return free(hit) ?? free(doc.pages.find((p) => p.id === inView)) ?? free(doc.pages.find((p) => p.kind === "freeform" && !p.hidden));
}

/** Where the factors section goes: after the last flow section, else at the end. */
export function factorSectionIndex(doc: ReportDoc): number {
  let i = -1;
  doc.pages.forEach((p, n) => {
    if (p.kind === "flow") i = n;
  });
  return i >= 0 ? i + 1 : doc.pages.length;
}

/** "Category 9 · <name>" from a check's details. */
export function exclusionWhat(c: Check): string {
  const d = c.details as { category?: number; name?: string | null; what?: string } | undefined;
  if (d?.what) return d.what;
  if (d?.category) return `Category ${d.category}${d.name ? ` · ${d.name}` : ""}`;
  return "";
}

// ---------------------------------------------------------------------------
// Exclusions ("Mark as excluded…")
// ---------------------------------------------------------------------------

export type Exclusion = { what: string; reason: string };

/** Plain text of a TextDoc (an AI draft). */
export const plainText = (t: TextDoc | undefined): string =>
  (t?.content ?? [])
    .map((b) => (b.content ?? []).map((n) => ("text" in n && typeof n.text === "string" ? n.text : "")).join(""))
    .filter(Boolean)
    .join("\n");

/** The exclusions after setting `what`'s reason: the entry for the same category is replaced, else added. */
const CATEGORY = /^\s*(?:category|cat\.?)\s*(\d{1,2})\b/i;
/** The index of the entry for `what` (the same text, or the same Scope 3 category number). */
export function findExclusion(list: Exclusion[], what: string): number {
  const cat = CATEGORY.exec(what)?.[1];
  return list.findIndex((e) => e.what === what || (!!cat && CATEGORY.exec(e.what)?.[1] === cat));
}

export function withExclusion(list: Exclusion[], what: string, reason: string): Exclusion[] {
  const i = findExclusion(list, what);
  const entry = { what: i >= 0 ? list[i].what : what, reason };
  return i >= 0 ? list.map((e, n) => (n === i ? entry : e)) : [...list, entry];
}
