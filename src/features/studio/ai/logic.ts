// DS-9 · pure helpers for the AI panel: what the panel says about the
// selection, the quick chips, the word diff of a text suggestion, applying an
// accepted suggestion to the doc (the only place a suggestion changes it), the
// "Based on" line and the budget meter. No React, no network.
import type { AiAction, AiTarget, AiUsage, DataToken, Element, FreeformPage, ReportDoc, ReportKind, Suggestion, SuggestionSource, TextDoc, TextNode } from "../../../lib/studio/contracts";

export type SelectionKind = "none" | "text" | "chart" | "image" | "other";

export const selectionKindOf = (el: Pick<Element, "type"> | null | undefined): SelectionKind => {
  if (!el) return "none";
  if (el.type === "text" || el.type === "callout") return "text";
  if (el.type === "chart") return "chart";
  if (el.type === "image" || el.type === "frame") return "image";
  return "other";
};

/** Card titles per action (05-ux copy: plain words, never "Magic"). */
export const ACTION_TITLES: Record<AiAction, string> = {
  draft_report: "Report draft",
  draft_page: "Page draft",
  headline: "Headline",
  body: "Body text",
  leadership_draft: "Leadership message",
  about_report: "About this report",
  rewrite_shorter: "Shorter",
  rewrite_longer: "Longer",
  rewrite_formal: "More formal",
  rewrite_plain: "Plain English",
  explain_change: "Explaining the change",
  add_target_context: "Target context",
  chart_title: "Chart title",
  chart_kind: "Chart type",
  suggest_layouts: "Layouts",
  fill_page: "Page content",
  alt_text: "Alt text",
  cover_art: "Cover image",
  honesty_check: "Balance check",
  jargon_check: "Plain-language check",
  missing_disclosures: "Missing disclosures",
  design_from_brief: "Design ideas",
  suggest_style: "Style",
  ghg_exec_summary: "Executive summary",
  ghg_methodology_text: "Methodology",
  scope3_category_text: "Scope 3 category",
  exclusion_reason_draft: "Exclusion reasons",
  summarise_for_deck: "Slide summary",
  summarise_for_social: "Social card summary",
  apply_brand_voice: "In your brand voice",
};

/** The "AI ▾" rewrite menu on the text toolbar. */
export const REWRITE_ITEMS: { action: AiAction; label: string; prompt: string }[] = [
  { action: "rewrite_shorter", label: "Shorter", prompt: "Make it shorter" },
  { action: "rewrite_longer", label: "Longer", prompt: "Make it longer" },
  { action: "rewrite_formal", label: "More formal", prompt: "Make it more formal" },
  { action: "rewrite_plain", label: "Plain English", prompt: "Rewrite it in plain English" },
  { action: "apply_brand_voice", label: "In our brand voice", prompt: "Rewrite it in our brand voice" },
  { action: "headline", label: "Suggest a headline", prompt: "Suggest a headline" },
];

/** Quick chips under the chat (05-ux S4), by report kind. */
export function quickChips(kind: ReportKind, sel: SelectionKind): string[] {
  const common = ["Check for missing disclosures", ...(sel === "text" ? ["Make it more concise"] : [])];
  if (kind === "ghg") return ["Write the executive summary", "Explain the change in Scope 2", "Draft exclusion reasons", "Suggest a layout for this page", ...common];
  return ["Draft the leadership message", "Write the about-this-report text", "Suggest a layout for this page", ...common];
}

const TYPE_LABEL: Partial<Record<Element["type"], string>> = {
  text: "Text",
  callout: "Callout",
  chart: "Chart",
  table: "Table",
  image: "Image",
  frame: "Frame",
  kpi_tile: "KPI tile",
  big_number: "Big number",
};

const short = (s: string, n = 32) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** The panel header's "About: …" line for the selection, or null with nothing selected. */
export function aboutLabel(doc: ReportDoc, page: FreeformPage | undefined, el: Element | null | undefined, chip: (a: DataToken["attrs"]) => string = () => "…"): string | null {
  if (!el || !page) return null;
  const n = doc.pages.findIndex((p) => p.id === page.id) + 1;
  let what = TYPE_LABEL[el.type] ?? "Element";
  if (el.type === "chart" && el.props.title) what = `${el.props.title} chart`;
  else if ((el.type === "text" || el.type === "callout") && textOf(el.props.doc, chip).trim()) what = `“${short(textOf(el.props.doc, chip).replace(/\s+/g, " "))}”`;
  return `${what} (page ${n})`;
}

/** A TextDoc as plain text, chips shown by `chip` (the server's display), paragraphs on new lines. */
export function textOf(doc: TextDoc | undefined, chip: (a: DataToken["attrs"]) => string): string {
  const node = (n: TextNode | DataToken): string => {
    if (n.type === "data") return chip((n as DataToken).attrs);
    const t = n as TextNode;
    if (t.type === "text") return t.text ?? "";
    if (t.type === "hardBreak") return " ";
    const inner = (t.content ?? []).map(node);
    if (t.type === "bulletList" || t.type === "orderedList") return inner.map((l) => `• ${l}`).join("\n");
    return inner.join("");
  };
  return (doc?.content ?? []).map(node).join("\n");
}

/** Every chip in a TextDoc (for one resolve call). */
export function tokensOf(doc: TextDoc | undefined): DataToken[] {
  const out: DataToken[] = [];
  const walk = (n: TextNode | DataToken) => {
    if (n.type === "data") out.push(n as DataToken);
    else (n as TextNode).content?.forEach(walk);
  };
  doc?.content.forEach(walk);
  return out;
}

export interface DiffPart {
  op: "same" | "add" | "del";
  text: string;
}

/** Word diff (LCS over words and spaces): what the card shows for a text suggestion. */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = before.split(/(\s+)/).filter((w) => w !== "");
  const b = after.split(/(\s+)/).filter((w) => w !== "");
  // Long texts: no word alignment, just "removed" and "added".
  if (a.length * b.length > 250_000) return [...(before ? [{ op: "del" as const, text: before }] : []), ...(after ? [{ op: "add" as const, text: after }] : [])];
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffPart[] = [];
  const push = (op: DiffPart["op"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += text;
    else out.push({ op, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push("del", a[i++]);
    else push("add", b[j++]);
  }
  while (i < a.length) push("del", a[i++]);
  while (j < b.length) push("add", b[j++]);
  return out;
}

const METRIC_LABEL: Record<string, string> = {
  total: "Total emissions",
  scope1: "Scope 1",
  scope2_location: "Scope 2 (location-based)",
  scope2_market: "Scope 2 (market-based)",
  scope3: "Scope 3",
  biogenic_co2: "Biogenic CO₂",
  gas_co2: "CO₂",
  gas_ch4: "CH₄",
  gas_n2o: "N₂O",
  gas_other: "Other gases",
  intensity_revenue: "Intensity per revenue",
  intensity_output: "Intensity per unit of output",
  intensity_employee: "Intensity per employee",
  base_year_total: "Base year",
  dq_score: "Data quality",
  primary_data_pct: "Primary data",
  sites_covered: "Sites with data",
  months_covered: "Months with data",
};
const INPUT_LABEL: Record<string, string> = { consolidation_approach: "Consolidation approach", reporting_period: "Reporting period", exclusions: "Exclusions", conformance: "Conformance", gwp_set: "GWP values", verification: "Verification" };

/** "Based on: Total emissions 2025 · Scope 1 2024 · Reporting period" */
export function sourcesLine(sources: SuggestionSource[]): string | null {
  if (!sources.length) return null;
  const parts = sources.map((s) => {
    if (s.source === "ghg") return `${s.metric === "scope3_category" && s.scope3Category ? `Scope 3 Category ${s.scope3Category}` : (METRIC_LABEL[s.metric] ?? s.metric)} ${s.year}`;
    if (s.source === "kpi") return `${s.kpi} ${s.year}`;
    return INPUT_LABEL[s.key] ?? s.key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
  });
  return `Based on: ${[...new Set(parts)].join(" · ")}`;
}

/** Budget meter text and state. */
export function budgetState(u: AiUsage | undefined): { label: string; pct: number; paused: boolean } | null {
  if (!u) return null;
  const pct = Math.min(100, Math.round(Math.max(u.todayUsd / (u.budgetUsd || 1), u.calls / (u.callBudget || 1)) * 100));
  const paused = u.todayUsd >= u.budgetUsd || u.calls >= u.callBudget || u.monthUsd >= u.monthBudgetUsd;
  return { label: `$${u.todayUsd.toFixed(2)} of $${u.budgetUsd} today`, pct, paused };
}

const findEl = (doc: ReportDoc, id: string): { page: FreeformPage; el: Element } | null => {
  for (const p of doc.pages) {
    if (p.kind !== "freeform") continue;
    const el = p.elements.find((e) => e.id === id);
    if (el) return { page: p, el };
  }
  return null;
};

export interface Applied {
  doc: ReportDoc;
  pageId: string;
  ids: string[];
}

/**
 * The doc after accepting a suggestion (null when there is nothing to apply,
 * e.g. findings). Elements the server returned replace theirs by id; new ones
 * go on the target page (or the page in view) on top. A text suggestion
 * without elements replaces the target text box's text. Everything applied is
 * marked `source: 'ai'`, `reviewed: false` (AI_UNREVIEWED until ticked).
 */
export function applySuggestion(doc: ReportDoc, s: Suggestion, target: AiTarget | null, fallbackPageId: string | null): Applied | null {
  const mark = <E extends Element>(e: E): E => ({ ...e, source: "ai", reviewed: false });
  let next = doc;
  const ids: string[] = [];
  let pageId: string | null = null;
  const els = s.payload.elements ?? [];
  if (els.length) {
    for (const incoming of els) {
      const found = findEl(next, incoming.id);
      if (found) {
        const pid = found.page.id;
        next = { ...next, pages: next.pages.map((p) => (p.id !== pid || p.kind !== "freeform" ? p : { ...p, elements: p.elements.map((e) => (e.id === incoming.id ? mark(incoming) : e)) })) };
        pageId = pageId ?? pid;
      } else {
        const pid = target?.pageId ?? fallbackPageId;
        const page = next.pages.find((p) => p.id === pid);
        if (!page || page.kind !== "freeform") return null;
        const z = Math.max(0, ...page.elements.map((e) => e.z)) + 1;
        next = { ...next, pages: next.pages.map((p) => (p.id !== pid || p.kind !== "freeform" ? p : { ...p, elements: [...p.elements, mark({ ...incoming, z })] })) };
        pageId = pageId ?? pid!;
      }
      ids.push(incoming.id);
    }
    return { doc: next, pageId: pageId!, ids };
  }
  if (s.kind === "text" && s.payload.text && target?.elementId) {
    const found = findEl(doc, target.elementId);
    if (!found || (found.el.type !== "text" && found.el.type !== "callout")) return null;
    const el = mark({ ...found.el, props: { ...found.el.props, doc: s.payload.text } } as Element);
    next = { ...doc, pages: doc.pages.map((p) => (p.id !== found.page.id || p.kind !== "freeform" ? p : { ...p, elements: p.elements.map((e) => (e.id === el.id ? el : e)) })) };
    return { doc: next, pageId: found.page.id, ids: [el.id] };
  }
  return null;
}

/** The element a suggestion changes (for the diff and the ghost preview), as it is now in the doc. */
export function currentOf(doc: ReportDoc, s: Suggestion, target: AiTarget | null): Element | null {
  const id = s.payload.elements?.[0]?.id ?? target?.elementId;
  return id ? (findEl(doc, id)?.el ?? null) : null;
}

/** API error codes → what the panel says (05-ux: "Your report is unchanged"). */
export function aiErrorText(code: string | undefined): string {
  switch (code) {
    case "DS_AI_BUDGET_EXCEEDED":
      return "AI is paused: this design has used today's AI budget. Your report is unchanged.";
    case "DS_AI_UNAVAILABLE":
      return "AI suggestions aren't available right now. Your report is unchanged. Try again.";
    case "DS_AI_OUTPUT_INVALID":
      return "The suggestion couldn't be used (it typed a number instead of linking it). Your report is unchanged. Try again.";
    case "DS_VALIDATION":
      return "That can't be done with what's selected. Your report is unchanged.";
    default:
      return "Something went wrong. Your report is unchanged.";
  }
}
