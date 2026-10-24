/**
 * KPI-7 · The words and checks of one entry (05-ux S3, principle 8): the
 * plain question with its site and period filled in, last period's value with
 * the change, the gentle "Is that right?" nudge, and whether a breakdown adds
 * up. Pure; the entry card and the review drawer read it.
 */
import type { KpiFrequency, YearType } from "./contracts";
import { breakdownLabel } from "./labels";
import { formatWithUnit, toCanonicalPreview } from "./units";
import { formatNumber } from "../../ui/format";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const ymd = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { y, m, d };
};

/** "September 2026", "Q3 2026" (July–September), "2026" or "FY 2026-27". */
export function periodText(periodStart: string, frequency: KpiFrequency, yearType: YearType = "CY"): string {
  const { y, m } = ymd(periodStart);
  if (frequency === "monthly") return `${MONTHS[m - 1]} ${y}`;
  if (frequency === "quarterly") {
    if (yearType === "CY") return `Q${Math.floor((m - 1) / 3) + 1} ${y}`;
    return `${MONTH_SHORT[m - 1]}–${MONTH_SHORT[(m + 1) % 12]} ${y}`;
  }
  if (yearType === "FY" && m !== 1) return `FY ${y}-${String((y + 1) % 100).padStart(2, "0")}`;
  return String(y);
}

/** "Last September", "Q3 last year", "Last year": the label of last year's same period. */
export function lastPeriodText(periodStart: string, frequency: KpiFrequency): string {
  const { m } = ymd(periodStart);
  if (frequency === "monthly") return `Last ${MONTHS[m - 1]}`;
  if (frequency === "quarterly") return `Q${Math.floor((m - 1) / 3) + 1} last year`;
  return "Last year";
}

/** The plain question with `{site}` and `{period}` filled in. A company-level KPI says "the company". */
export function fillQuestion(question: string, site: string | null, period: string): string {
  return question.replace(/\{site\}/g, site ?? "the company").replace(/\{period\}/g, period);
}

/** "Due 15 Oct" or "Overdue · due 15 Oct" (D16). `today` is YYYY-MM-DD. */
export function dueText(dueDate: string, today: string): string {
  const { m, d } = ymd(dueDate);
  const label = `${d} ${MONTH_SHORT[m - 1]}`;
  return today > dueDate.slice(0, 10) ? `Overdue · due ${label}` : `Due ${label}`;
}

export const isOverdue = (dueDate: string, today: string) => today > dueDate.slice(0, 10);

export interface Comparison {
  /** "+14 %" or "−20 %"; null when last year was zero or isn't known. */
  changeText: string | null;
  changePct: number | null;
  /** Current divided by last, both in the canonical unit. */
  ratio: number | null;
  /** The non-blocking question for a big jump (2× or more, or less than half), else null. */
  nudge: string | null;
}

/** Ratio at which the nudge asks "Is that right?" (05-ux principle 8). */
export const NUDGE_RATIO = 2;

/**
 * This period against last year's, in the canonical unit: the change and the
 * nudge "This is 3× last September. Is that right?". Never blocks.
 */
export function compareToLast(
  current: { value: number | null; unit: string | null },
  last: { value: number | null; unit: string | null } | null,
  canonicalUnit: string | null,
  lastLabel: string,
): Comparison {
  const none: Comparison = { changeText: null, changePct: null, ratio: null, nudge: null };
  if (!last || last.value === null || current.value === null) return none;
  const a = toCanonicalPreview(current.value, current.unit ?? canonicalUnit, canonicalUnit);
  const b = toCanonicalPreview(last.value, last.unit ?? canonicalUnit, canonicalUnit);
  if (a === null || b === null || b === 0) return none;
  const ratio = a / b;
  const pct = Math.round((ratio - 1) * 100);
  const changeText = `${pct >= 0 ? "+" : "−"}${Math.abs(pct)} %`;
  let nudge: string | null = null;
  const lower = lastLabel.charAt(0).toLowerCase() + lastLabel.slice(1);
  if (ratio >= NUDGE_RATIO) nudge = `This is ${formatNumber(ratio, ratio % 1 < 0.05 ? 0 : 1)}× ${lower}. Is that right?`;
  else if (ratio > 0 && ratio <= 1 / NUDGE_RATIO) nudge = `This is less than half of ${lower}. Is that right?`;
  return { changeText, changePct: pct, ratio, nudge };
}

/** How close a breakdown must be to the total (01-contracts §5 KPI_BREAKDOWN_SUM: ±0.5 %). */
export const BREAKDOWN_TOLERANCE = 0.005;

export type BreakdownCheck =
  | { state: "empty" }
  | { state: "ok"; sum: number; text: string }
  | { state: "short" | "over"; sum: number; diff: number; text: string };

/** Whether the parts add up to the total, and by how much they don't. Parts are in the total's unit. */
export function checkBreakdown(total: number | null, parts: Record<string, number | null | undefined>, unit: string | null): BreakdownCheck {
  const values = Object.values(parts).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!values.length) return { state: "empty" };
  const sum = Number(values.reduce((s, v) => s + v, 0).toPrecision(12));
  if (total === null) return { state: "ok", sum, text: `The parts add up to ${formatWithUnit(sum, unit)}.` };
  const diff = Number((total - sum).toPrecision(12));
  if (Math.abs(diff) <= Math.abs(total) * BREAKDOWN_TOLERANCE) return { state: "ok", sum, text: `Adds up to ${formatWithUnit(total, unit)}.` };
  const state = diff > 0 ? "short" : "over";
  return { state, sum, diff: Math.abs(diff), text: `The split is ${formatWithUnit(Math.abs(diff), unit)} ${state === "short" ? "short of" : "over"} the total.` };
}

/** Parts as the server takes them: numbers only, null when nothing is filled in. */
export function breakdownPayload(parts: Record<string, number | null | undefined>): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(parts)) if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  return Object.keys(out).length ? out : null;
}

/** "Split by source", "Split by type": the breakdown section's title. */
export const breakdownTitle = (by: string[] | undefined): string => (by?.length ? `Split by ${by.map((b) => breakdownLabel(b).toLowerCase()).join(" and ")}` : "Split");

/** Parses typed text to a number: thousands separators allowed; empty or junk is null. */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[,\s]/g, "").trim();
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
