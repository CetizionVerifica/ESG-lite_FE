/**
 * KPI-7 · My KPIs logic (pure): grouping, progress, the order "Save and
 * next" walks, what "Submit all" sends, and the draft ↔ value mapping.
 */
import type { KpiValue, KpiValueInput, MyKpiItem } from "../../../lib/kpi/contracts";
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

/** "7 of 12 done": auto and calculated items need nothing from the contributor, so they count as done. */
export function progressOf(items: MyKpiItem[]): { done: number; total: number; pct: number } {
  const total = items.length;
  const done = items.filter((i) => isReadOnlySource(i) || i.group === "done").length;
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

/** What "Save and next" walks through: sent back first, then due. */
export const workOrder = (items: MyKpiItem[]): MyKpiItem[] => {
  const g = groupItems(items);
  return [...g.sentBack, ...g.due];
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
