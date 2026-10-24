/**
 * KPI-8 · Review and close logic (pure): pending values as review rows with
 * their checks, Ready / Needs attention, the change on last year, what a
 * refusal means in plain words, and the close-period summary per site.
 */
import { type KpiDefinition, type KpiPeriodLockStatus, type KpiValue, type KpiValueInput, isKpiErrorCode } from "../../../lib/kpi/contracts";
import { ERROR_MESSAGE } from "../../../lib/kpi/labels";
import type { EntryDraft } from "../components/KpiQuestionCard";
import { type KpiValueItem, lastYearStart } from "../components/valueItems";

export { INFO_CHECKS, readChecks, valueItems as reviewRows, type KpiValueItem as ReviewRow, type ValueCheck as ReviewCheck } from "../components/valueItems";
type ReviewRow = KpiValueItem;

export const splitRows = (rows: ReviewRow[]) => ({ ready: rows.filter((r) => r.ready), attention: rows.filter((r) => !r.ready) });

/** The approved values of the year before the pending ones, as one `GET /kpi/values` range. */
export function lastYearRange(values: Pick<KpiValue, "period_start">[]): { from: string; to: string } | null {
  if (!values.length) return null;
  const starts = values.map((v) => v.period_start).sort();
  return { from: lastYearStart(starts[0]), to: lastYearStart(starts[starts.length - 1]) };
}

/** "Approve all 3 ready", "Approve the ready value". */
export const approveAllLabel = (n: number) => (n === 1 ? "Approve the ready value" : `Approve all ${n} ready`);

/** What a refusal code means, in plain words. */
export function refusalText(code: unknown): string {
  if (isKpiErrorCode(code)) return ERROR_MESSAGE[code];
  if (code === "NOT_READY" || code === "KPI_NOT_READY") return "It needs attention first.";
  if (code === "SELF_APPROVAL" || code === "KPI_SELF_APPROVAL") return "You entered it yourself, so another manager approves it.";
  return "It isn't waiting for review any more.";
}

/** "Water withdrawn at Dammam: It needs attention first." per refused id. */
export function refusalLines(refused: { id: number; code: unknown }[], rows: ReviewRow[]): string[] {
  return refused.map((r) => {
    const row = rows.find((x) => x.id === r.id);
    return `${row ? `${row.kpiName} at ${row.siteName}` : "A value"}: ${refusalText(r.code)}`;
  });
}

// ---------------------------------------------------------------------------
// Edit in the review drawer (KpiQuestionCard)
// ---------------------------------------------------------------------------

export function draftOf(v: KpiValue, def: KpiDefinition | null): EntryDraft {
  const parts: Record<string, number | null> = {};
  for (const key of def?.breakdowns?.values ?? []) parts[key] = v.breakdown?.[key] ?? null;
  return {
    value: v.value_numeric,
    text: v.value_text ?? "",
    unit: v.unit ?? def?.canonical_unit ?? "",
    breakdown: parts,
    isEstimate: v.is_estimate,
    comment: v.comment ?? "",
  };
}

const NUMERIC = new Set(["number", "percent", "integer", "currency"]);

/** The `PUT /kpi/values` item for a reviewer's edit of a pending value (assumed: `id` plus a `reason`; it stays pending). */
export function editInput(v: KpiValue, def: KpiDefinition | null, d: EntryDraft, reason: string): KpiValueInput {
  const numeric = def ? NUMERIC.has(def.value_type) : v.value_numeric !== null;
  const parts: Record<string, number> = {};
  for (const [k, n] of Object.entries(d.breakdown)) if (typeof n === "number" && Number.isFinite(n)) parts[k] = n;
  return {
    id: v.id,
    kpi_definition_id: v.kpi_definition_id,
    site_id: v.site_id,
    period_start: v.period_start,
    frequency: v.frequency,
    year_type: v.year_type,
    value_numeric: numeric ? d.value : null,
    value_text: numeric ? null : d.text.trim() || null,
    unit: numeric ? d.unit || def?.canonical_unit || null : null,
    breakdown: Object.keys(parts).length ? parts : null,
    is_estimate: d.isEstimate,
    comment: d.comment.trim() || null,
    reason: reason.trim(),
  };
}

export const draftChanged = (a: EntryDraft, b: EntryDraft) => JSON.stringify(a) !== JSON.stringify(b);

// ---------------------------------------------------------------------------
// Close period
// ---------------------------------------------------------------------------

export type LockSite = KpiPeriodLockStatus["sites"][number];

/** Values per state for one site: approved of owed, and what's left. */
export function siteSummary(site: LockSite) {
  const out = { approved: 0, draft: 0, pending: 0, rejected: 0, missing: 0, owed: site.kpis.length };
  for (const k of site.kpis) {
    if (k.missing) out.missing += 1;
    else if (k.counts.rejected) out.rejected += 1;
    else if (k.counts.pending) out.pending += 1;
    else if (k.counts.draft) out.draft += 1;
    else out.approved += 1;
  }
  return out;
}

/** The sites a Manager closes: all in the status, or the ones picked with the site chip. */
export const sitesInView = (status: KpiPeriodLockStatus, siteIds: number[]) => (siteIds.length ? status.sites.filter((s) => s.site_id !== null && siteIds.includes(s.site_id)) : status.sites);

/** What's left in the sites shown (not in locked ones). */
export function leftInView(status: KpiPeriodLockStatus, sites: LockSite[]) {
  return status.left.filter((l) => sites.some((s) => s.site_id === l.site_id && !s.locked));
}

/** "Lock September 2026", "Lock September 2026 for Dammam", "Lock September 2026 for 3 sites". */
export function lockLabel(title: string, sites: LockSite[]): string {
  const open = sites.filter((s) => !s.locked);
  if (sites.length === 1 || open.length === 0) return `Lock ${title}`;
  return open.length === 1 ? `Lock ${title} for ${open[0].name}` : `Lock ${title} for ${open.length} sites`;
}

/** Last month: the default period to review and close (values are due the month after). */
export function defaultMonth(today: Date): { year: number; month: number } {
  const d = new Date(Date.UTC(today.getFullYear(), today.getMonth() - 1, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}
