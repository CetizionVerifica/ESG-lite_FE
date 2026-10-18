/**
 * KPI-7 · My KPIs logic (pure): grouping, progress, the order "Save and
 * next" walks, what "Submit all" sends, and the draft ↔ value mapping.
 */
import { KPI_TOPICS, type KpiTopic, type KpiValue, type KpiValueInput, type KpiValueSuggestion, type MyKpiItem } from "../../../lib/kpi/contracts";
import { checkValue, sourceLine } from "../../../lib/kpi/ai";
import { TOPIC_LABEL, breakdownLabel } from "../../../lib/kpi/labels";
import { formatWithUnit } from "../../../lib/kpi/units";
import { dueText, fillQuestion, lastPeriodText, periodText } from "../../../lib/kpi/entry";
import type { EntryDraft, QuestionCardItem } from "../components/KpiQuestionCard";

/** Stable id of an item in the URL (`?entry=`): KPI, site (or "c" for company) and period. */
export const itemKey = (i: Pick<MyKpiItem, "kpi_definition_id" | "site_id" | "period_start">) => `${i.kpi_definition_id}:${i.site_id ?? "c"}:${i.period_start}`;

/** Auto and calculated items are read-only rows, never a card (KPI-7 build 3). */
export const isReadOnlySource = (i: Pick<MyKpiItem, "source">) => i.source !== "manual";

export const hasAnswer = (v: Pick<KpiValue, "value_numeric" | "value_text"> | null | undefined): boolean =>
  !!v && (v.value_numeric !== null && v.value_numeric !== undefined ? true : !!v.value_text?.trim());

export interface Groups {
  due: MyKpiItem[];
  sentBack: MyKpiItem[];
  done: MyKpiItem[];
  /** Auto and calculated: filled in for the contributor. */
  filled: MyKpiItem[];
}

/** Due / Sent back / Done for entered KPIs; auto and calculated ones apart. Each list by due date, then name. */
export function groupItems(items: MyKpiItem[]): Groups {
  const sorted = [...items].sort((a, b) => a.due_date.localeCompare(b.due_date) || a.name.localeCompare(b.name));
  const manual = sorted.filter((i) => !isReadOnlySource(i));
  return {
    due: manual.filter((i) => i.group === "due"),
    sentBack: manual.filter((i) => i.group === "sent_back"),
    done: manual.filter((i) => i.group === "done"),
    filled: sorted.filter(isReadOnlySource),
  };
}

/**
 * "7 of 12 done". Auto and calculated items need nothing from the contributor:
 * they count (as done) only once they have a value. One with no data yet for
 * the period is left out, so it never reads as done when it's empty.
 */
export function progressOf(items: MyKpiItem[]): { done: number; total: number; pct: number } {
  const counted = items.filter((i) => !isReadOnlySource(i) || hasAnswer(i.value));
  const total = counted.length;
  const done = counted.filter((i) => isReadOnlySource(i) || i.group === "done").length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

const topicRank = (t: string) => {
  const i = (KPI_TOPICS as readonly string[]).indexOf(t);
  return i < 0 ? KPI_TOPICS.length : i;
};

/** The topic's plain name: the server's `topic_label`, else ours. */
export const topicLabelOf = (i: Pick<MyKpiItem, "topic" | "topic_label">) => i.topic_label || TOPIC_LABEL[i.topic] || i.topic;

export interface TopicGroup {
  topic: KpiTopic;
  label: string;
  items: MyKpiItem[];
  /** Over every item of the topic for the period, not only the rows shown. */
  done: number;
  total: number;
}

/**
 * D17: rows under topic headings ("Water", "Waste"…) in topic order, each
 * with a count and progress over all of the topic's items (`all`). Inside a
 * topic: sent back first, then by due date and name.
 */
export function topicGroups(rows: MyKpiItem[], all: MyKpiItem[] = rows): TopicGroup[] {
  const topics = [...new Set(rows.map((i) => i.topic))].sort((a, b) => topicRank(a) - topicRank(b));
  return topics.map((topic) => {
    const mine = all.filter((i) => i.topic === topic);
    const p = progressOf(mine);
    const items = rows
      .filter((i) => i.topic === topic)
      .sort((a, b) => Number(b.group === "sent_back") - Number(a.group === "sent_back") || a.due_date.localeCompare(b.due_date) || a.name.localeCompare(b.name));
    return { topic, label: topicLabelOf(items[0] ?? mine[0]), items, done: p.done, total: p.total };
  });
}

/** Topics on the list, for the chip filter, with how many items each has. */
export const topicChips = (items: MyKpiItem[]) => topicGroups(items).map((g) => ({ topic: g.topic, label: g.label, count: g.items.length }));

/** `?topic=` read safely: a topic that isn't on the list means all topics. */
export const topicFilter = (param: string | null, items: MyKpiItem[]): KpiTopic | null => (param && items.some((i) => i.topic === param) ? (param as KpiTopic) : null);

/** What "Save and next" walks through: the to-do rows in the order shown (by topic, sent back first). */
export const workOrder = (items: MyKpiItem[]): MyKpiItem[] => {
  const g = groupItems(items);
  return topicGroups([...g.sentBack, ...g.due]).flatMap((t) => t.items);
};

/** The next item to enter after `key` in the work order; null at the end of the list. */
export function nextItem(items: MyKpiItem[], key: string): MyKpiItem | null {
  const order = workOrder(items);
  const at = order.findIndex((i) => itemKey(i) === key);
  return order[at + 1] ?? null;
}

/** Drafts with an answer: what "Submit all" sends. */
export const readyToSubmit = (items: MyKpiItem[]): MyKpiItem[] => items.filter((i) => !isReadOnlySource(i) && i.value?.status === "draft" && hasAnswer(i.value));

/** "Send 4 values to Mia Haddad for review?" */
export function submitQuestion(ready: MyKpiItem[]): string {
  const n = ready.length;
  const reviewers = [...new Set(ready.map((i) => i.reviewer_name).filter((r): r is string => !!r))];
  const who = reviewers.length === 1 ? reviewers[0] : reviewers.length > 1 ? `${reviewers.slice(0, -1).join(", ")} and ${reviewers[reviewers.length - 1]}` : "your reviewer";
  return `Send ${n} ${n === 1 ? "value" : "values"} to ${who} for review?`;
}

/** The earliest due date among items still to do, for the progress line. */
export function nextDueDate(items: MyKpiItem[]): string | null {
  const open = items.filter((i) => !isReadOnlySource(i) && i.group !== "done").map((i) => i.due_date).filter(Boolean).sort();
  return open[0] ?? null;
}

export const periodLabelOf = (i: MyKpiItem) => periodText(i.period_start, i.frequency, i.year_type ?? "CY");

/** What the entry card asks. */
export function questionItem(i: MyKpiItem): QuestionCardItem {
  return {
    question: fillQuestion(i.question, i.site_name, periodLabelOf(i)),
    help: i.help,
    valueType: i.value_type,
    canonicalUnit: i.canonical_unit,
    allowedUnits: i.allowed_units,
    decimals: i.decimals,
    breakdowns: i.breakdowns ?? null,
    needsEvidence: !!i.needs_evidence,
    usedIn: i.used_in,
    last: i.last_value ? { label: lastPeriodText(i.period_start, i.frequency), value: i.last_value.value, unit: i.last_value.unit ?? i.canonical_unit } : null,
  };
}

/** The row's sub-line: "Last Sep 840 m³ · Due 15 Oct". */
export const dueLine = (i: MyKpiItem, today: string) => (i.due_date ? dueText(i.due_date, today) : "");

export function draftFromValue(i: MyKpiItem): EntryDraft {
  const v = i.value;
  const parts: Record<string, number | null> = {};
  for (const key of i.breakdowns?.values ?? []) parts[key] = v?.breakdown?.[key] ?? null;
  return {
    value: v?.value_numeric ?? null,
    text: v?.value_text ?? "",
    unit: v?.unit ?? i.canonical_unit ?? "",
    breakdown: parts,
    isEstimate: v?.is_estimate ?? false,
    comment: v?.comment ?? "",
  };
}

const NUMERIC = new Set(["number", "percent", "integer", "currency"]);

/** One `PUT /kpi/values` item for the draft. Everything is sent, so the server's draft matches the card. */
export function toValueInput(i: MyKpiItem, d: EntryDraft): KpiValueInput {
  const numeric = NUMERIC.has(i.value_type);
  const parts: Record<string, number> = {};
  for (const [k, v] of Object.entries(d.breakdown)) if (typeof v === "number" && Number.isFinite(v)) parts[k] = v;
  return {
    kpi_definition_id: i.kpi_definition_id,
    site_id: i.site_id,
    period_start: i.period_start,
    frequency: i.frequency,
    ...(i.year_type ? { year_type: i.year_type } : {}),
    value_numeric: numeric ? d.value : null,
    value_text: numeric ? null : d.text.trim() || null,
    unit: numeric ? d.unit || i.canonical_unit : null,
    breakdown: Object.keys(parts).length ? parts : null,
    is_estimate: d.isEstimate,
    comment: d.comment.trim() || null,
  };
}

/** Last month, YYYY-MM: values are due the month after their period (D16). */
export function defaultPeriod(today: Date): { year: number; month: number } {
  const d = new Date(Date.UTC(today.getFullYear(), today.getMonth() - 1, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}

/** The item with its saved value replaced (after a save, before the list refetches). */
export function withValue(items: MyKpiItem[], key: string, value: KpiValue): MyKpiItem[] {
  return items.map((i) => (itemKey(i) === key ? { ...i, value, group: value.status === "rejected" ? "sent_back" : value.status === "draft" ? "due" : "done" } : i));
}

// ---------------------------------------------------------------------------
// Table view (KPI-7 part 3): one row per to-do item, typed by keyboard
// ---------------------------------------------------------------------------

/** Value types the grid types into; the others ("Yes / No", text) open the card. */
export const isGridNumeric = (i: Pick<MyKpiItem, "value_type">) => NUMERIC.has(i.value_type);

/** What a grid cell shows from the saved value. */
export const cellText = (i: MyKpiItem): string => (i.value?.value_numeric === null || i.value?.value_numeric === undefined ? "" : String(i.value.value_numeric));

/**
 * A typed cell, checked the way the card checks it: a number ("1,200" is
 * fine), a whole number for counts, 0–100 for a percentage. Empty = no value.
 */
export function parseCell(raw: string, i: Pick<MyKpiItem, "value_type">): { value: number | null; error: string | null } {
  const text = raw.trim().replace(/[\s,]/g, "");
  if (!text) return { value: null, error: null };
  const n = Number(text);
  if (!Number.isFinite(n)) return { value: null, error: "Type a number, like 1200." };
  if (i.value_type === "integer" && !Number.isInteger(n)) return { value: null, error: "Type a whole number." };
  if (i.value_type === "percent" && (n < 0 || n > 100)) return { value: null, error: "A percentage is between 0 and 100." };
  return { value: n, error: null };
}

/** The draft a grid cell saves: the item's saved draft with the new value and unit. */
export const gridDraft = (i: MyKpiItem, value: number | null, unit: string): EntryDraft => ({ ...draftFromValue(i), value, unit: unit || i.canonical_unit || "" });

/** "my-kpis-2026-09.xlsx" when the server sends no file name. */
export const templateFileName = (period: string) => `my-kpis-${period}.xlsx`;

// ---------------------------------------------------------------------------
// KPI-12 · AI suggestions on the cards (suggest only)
// ---------------------------------------------------------------------------

/** A suggestion as My KPIs keeps it: with an id and the document it came from. */
export type AiSuggestion = KpiValueSuggestion & { id: string; documentName: string | null };

/** What a card shows for one suggestion. */
export interface SuggestionChip {
  id: string;
  /** "1,200 m³", "Groundwater: 700 m³", "Yes" */
  label: string;
  /** "Suggested from water-bill.pdf, page 2" */
  source: string;
  quote: string | null;
  why: string | null;
  /** Confidence below 0.6: the chip says "Check this". */
  check: boolean;
  /** Why Use is off (a unit this KPI doesn't take, a split it doesn't have); null = Use fills the input. */
  blocked: string | null;
}

const editable = (i: MyKpiItem) => !isReadOnlySource(i) && i.group !== "done";

/**
 * Puts each suggestion on the card it belongs to: same KPI (code or id),
 * same period when the AI read one, and the site the AI read when the person
 * has several. Suggestions for KPIs that aren't theirs to enter are left out.
 */
export function matchSuggestions(items: MyKpiItem[], suggestions: AiSuggestion[]): Map<string, AiSuggestion[]> {
  const out = new Map<string, AiSuggestion[]>();
  for (const s of suggestions) {
    let pool = items.filter((i) => editable(i) && (i.code === s.kpi_code || (s.kpi_definition_id != null && i.kpi_definition_id === s.kpi_definition_id)));
    if (s.period_start) {
      const same = pool.filter((i) => i.period_start === s.period_start || (i.period_start <= s.period_start! && (!i.period_end || s.period_start! <= i.period_end)));
      if (same.length) pool = same;
    }
    if (pool.length > 1 && s.site_hint) {
      const hint = s.site_hint.toLowerCase();
      const site = pool.filter((i) => (i.site_name ?? "").toLowerCase() === hint);
      if (site.length) pool = site;
    }
    const target = pool[0];
    if (target) out.set(itemKey(target), [...(out.get(itemKey(target)) ?? []), s]);
  }
  return out;
}

const NUMERIC_TYPES = new Set(["number", "percent", "integer", "currency"]);

/**
 * What "Use" puts into the card's inputs (never saved here; the draft saves
 * as if typed). A split line goes into that line; the unit is the
 * document's own, so a unit the KPI doesn't take turns Use off.
 */
export function suggestionFill(i: MyKpiItem, s: KpiValueSuggestion, draft: EntryDraft): { patch: Partial<EntryDraft> } | { blocked: string } {
  const units = i.allowed_units.length ? i.allowed_units : i.canonical_unit ? [i.canonical_unit] : [];
  const n = typeof s.value === "number" ? s.value : Number(String(s.value).replace(/,/g, ""));
  if (s.breakdown_key) {
    if (!(i.breakdowns?.values ?? []).includes(s.breakdown_key)) return { blocked: "This KPI isn't split that way. Type the value yourself if it fits." };
    if (!Number.isFinite(n)) return { blocked: "The document's figure isn't a number." };
    if (s.unit && draft.unit && s.unit !== draft.unit) return { blocked: `The document says ${s.unit} and the card is in ${draft.unit}. Type it yourself in ${draft.unit}.` };
    return { patch: { breakdown: { ...draft.breakdown, [s.breakdown_key]: n } } };
  }
  if (NUMERIC_TYPES.has(i.value_type)) {
    if (!Number.isFinite(n)) return { blocked: "The document's figure isn't a number." };
    if (s.unit && units.length && !units.includes(s.unit)) return { blocked: `The document says ${s.unit}, which this KPI doesn't take. Type the value yourself.` };
    return { patch: { value: n, ...(s.unit ? { unit: s.unit } : {}) } };
  }
  const text = String(s.value).trim();
  if (i.value_type === "yes_no") {
    const yn = text.toLowerCase();
    return yn === "yes" || yn === "no" ? { patch: { text: yn } } : { blocked: "The document's answer isn't a yes or a no." };
  }
  return { patch: { text } };
}

/** The chip for one suggestion on its card. */
export function suggestionChip(i: MyKpiItem, s: AiSuggestion, draft: EntryDraft): SuggestionChip {
  const value = typeof s.value === "number" ? formatWithUnit(s.value, s.unit, i.decimals) : String(s.value);
  const fill = suggestionFill(i, s, draft);
  return {
    id: s.id,
    label: s.breakdown_key ? `${breakdownLabel(s.breakdown_key)}: ${value}` : value,
    source: sourceLine(s.documentName, s.source_page),
    quote: s.quote,
    why: s.why,
    check: checkValue(s),
    blocked: "blocked" in fill ? fill.blocked : null,
  };
}
