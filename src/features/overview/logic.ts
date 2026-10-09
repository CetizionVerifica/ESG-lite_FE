import type { OverviewCategory, OverviewLastYear, OverviewMonth, OverviewSite, SubmissionUser } from "../../services/overviewService";
import { DEFAULT_FY_START_MONTH, MONTH_SHORT, type Period, type PeriodKind, periodContaining, periodLabel, serializePeriod } from "../../ui";

/** Period kinds the overview offers; B4 has no custom ranges. */
export const PERIOD_KINDS: PeriodKind[] = ["month", "quarter", "cy", "fy"];

/** B4 reads FY as April–March. */
export const FY_START_MONTH = DEFAULT_FY_START_MONTH;

const pad = (n: number) => String(n).padStart(2, "0");

/** The month data was last due for: the previous calendar month. */
export function lastDueMonth(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth() - 1, 1);
}

/** Opening period: the calendar year holding the last month that was due. */
export function defaultPeriod(now: Date): Period {
  return periodContaining("cy", lastDueMonth(now), FY_START_MONTH);
}

/** Custom ranges (a pasted URL) fall back to the default; B4 can't serve them. */
export function supportedPeriod(p: Period | null, now: Date): Period {
  return p && p.kind !== "custom" ? p : defaultPeriod(now);
}

/**
 * The `period` B4 expects. Month and quarter read the same; CY is the bare
 * year; FY is named by both years ("FY2025-26" for the FE's FY2025).
 */
export function toOverviewPeriod(p: Period): string {
  switch (p.kind) {
    case "month":
    case "quarter":
      return serializePeriod(p);
    case "cy":
      return String(p.year);
    case "fy":
      return `FY${p.startYear}-${pad((p.startYear + 1) % 100)}`;
    case "custom":
      throw new Error("B4 has no custom periods");
  }
}

/** "Sep 25" for chart axes. */
export function shortMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_SHORT[m - 1]} ${String(y).slice(2)}`;
}

/** "Sep 2025". */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTH_SHORT[m - 1]} ${y}`;
}

/** Caption after the net delta, or null when last year can't be compared yet. */
export function lastYearCaption(ly: OverviewLastYear | null | undefined): string | null {
  if (!ly || ly.status === "not_due") return null;
  return ly.status === "year_to_date" ? "vs same months last year" : "vs last year";
}

export type CategoryBar = { id: number | "other"; name: string; total: number };

/** Top `n` categories by tCO₂e, the rest summed as "Other". */
export function categoryBars(rows: OverviewCategory[], n = 8): CategoryBar[] {
  const sorted = [...rows].filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
  const top: CategoryBar[] = sorted.slice(0, n).map((r) => ({ id: r.category_id, name: r.category_name, total: r.total }));
  const rest = sorted.slice(n).reduce((s, r) => s + r.total, 0);
  if (rest > 0) top.push({ id: "other", name: `Other (${sorted.length - n})`, total: round3(rest) });
  return top;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Rule-based insight: the largest source's share of gross emissions. */
export function insightText(rows: OverviewCategory[], gross: number): string | null {
  const top = [...rows].sort((a, b) => b.total - a.total)[0];
  if (!top || !(gross > 0) || !(top.total > 0)) return null;
  const share = Math.round((top.total / gross) * 100);
  if (rows.length === 1 || share >= 100) return `${top.category_name} is all of the gross footprint.`;
  return `${top.category_name} is ${share < 1 ? "under 1" : share}% of the gross footprint.`;
}

export type SiteStatus = { status: "approved" | "pending" | "missing" | "rejected"; label: string };

/** Status pill for a site row: pending first, then people missing, then rejections. */
export function siteStatus(site: OverviewSite, missingPeople: number): SiteStatus {
  if (site.pending > 0) return { status: "pending", label: `${site.pending} pending` };
  if (missingPeople > 0) return { status: "missing", label: `${missingPeople} missing` };
  if (site.entries === 0) return { status: "missing", label: "No entries" };
  if (site.rejected > 0 && site.approved === 0) return { status: "rejected", label: `${site.rejected} rejected` };
  return { status: "approved", label: "Approved" };
}

/** People missing per site name, from a submission list. */
export function missingBySite(users: SubmissionUser[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const u of users) if (u.status === "missing") out.set(u.site_name, (out.get(u.site_name) ?? 0) + 1);
  return out;
}

/** Keeps the people on the chosen sites (the submission endpoint covers every managed site). */
export function usersOnSites(users: SubmissionUser[], siteNames: string[] | null): SubmissionUser[] {
  if (!siteNames) return users;
  const names = new Set(siteNames);
  return users.filter((u) => names.has(u.site_name));
}

/** Last `n` months before the current one, newest first, as YYYY-MM. */
export function submissionMonths(now: Date, n = 6): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1 - i, 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  });
}

export type ThresholdAlert = { category_id: number; category_name: string; pct: number };

/** Categories that grew more than `threshold`% against the previous period, largest rise first. */
export function thresholdAlerts(current: OverviewCategory[], previous: OverviewCategory[], threshold: number): ThresholdAlert[] {
  const before = new Map(previous.map((c) => [c.category_id, c.total]));
  const out: ThresholdAlert[] = [];
  for (const c of current) {
    const prev = before.get(c.category_id);
    if (!prev || prev <= 0) continue;
    const pct = Math.round(((c.total - prev) / prev) * 1000) / 10;
    if (pct > threshold) out.push({ category_id: c.category_id, category_name: c.category_name, pct });
  }
  return out.sort((a, b) => b.pct - a.pct);
}

/** Trend rows for the chart and its table, with the yearly filing as its own row. */
export function trendTable(trend: OverviewMonth[], yearlyTotal: number) {
  const rows: Array<Record<string, string | number | null>> = trend.map((t) => ({ month: monthLabel(t.month), gross: t.gross, saved: t.saved, net: t.net }));
  if (yearlyTotal > 0) rows.push({ month: "Yearly filing", gross: yearlyTotal, saved: null, net: yearlyTotal });
  return rows;
}

export type Intensity = { value: number; unit: string; combined: boolean } | null;

/**
 * One intensity figure: total emissions over total production. A single
 * product unit reads "tCO₂e/{unit}"; several units are summed into a
 * "Combined" figure, as today's page does for several sites.
 */
export function combineIntensity(emissions: number, parts: { production: number; unit: string }[]): Intensity {
  const withOutput = parts.filter((p) => p.production > 0);
  if (!withOutput.length) return null;
  const units = new Set(withOutput.map((p) => p.unit));
  const production = withOutput.reduce((s, p) => s + p.production, 0);
  const combined = units.size > 1;
  return { value: emissions / production, unit: combined ? "Combined" : [...units][0], combined };
}

/** Query string for a P07 list, keeping only what's set. */
export function listLink(path: string, q: { siteIds?: number[]; categoryId?: number | null; period?: Period | null; status?: string }): string {
  const p = new URLSearchParams();
  if (q.siteIds?.length) p.set("site", [...q.siteIds].sort((a, b) => a - b).join(","));
  if (q.categoryId) p.set("category", String(q.categoryId));
  p.set("period", q.period ? serializePeriod(q.period) : "all");
  if (q.status) p.set("status", q.status);
  return `${path}?${p.toString()}`;
}

export type AttentionItem = { id: string; count: number; text: string; to: string; tone: "warn" | "bad" | "info" };

/** "Needs your attention" rows with a count above zero, in a fixed order. */
export function attentionItems(input: {
  pendingEntries: number | null;
  pendingProduction: number | null;
  missingPeople: number | null;
  missingMonth: string | null;
  overThreshold: ThresholdAlert[];
  threshold: number | null;
  previousLabel: string | null;
  links: { approvals: string; production: string; team: string; category: (id: number) => string };
}): AttentionItem[] {
  const items: AttentionItem[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (input.pendingEntries)
    items.push({ id: "pending", count: input.pendingEntries, text: `${plural(input.pendingEntries, "entry", "entries")} waiting for approval`, to: input.links.approvals, tone: "warn" });
  if (input.missingPeople && input.missingMonth)
    items.push({
      id: "missing",
      count: input.missingPeople,
      text: `${plural(input.missingPeople, "person", "people")} missing ${monthLabel(input.missingMonth)}`,
      to: input.links.team,
      tone: "bad",
    });
  for (const a of input.overThreshold)
    items.push({
      id: `threshold-${a.category_id}`,
      count: 1,
      text: `${a.category_name} up ${a.pct}%${input.previousLabel ? ` vs ${input.previousLabel}` : ""}${input.threshold !== null ? `, threshold ${input.threshold}%` : ""}`,
      to: input.links.category(a.category_id),
      tone: "warn",
    });
  if (input.pendingProduction)
    items.push({
      id: "production",
      count: input.pendingProduction,
      text: `${plural(input.pendingProduction, "production record", "production records")} pending`,
      to: input.links.production,
      tone: "info",
    });
  return items;
}

/** Page title and crumb pieces. */
export function headerText(company: string | null, siteCount: number, totalSites: number, period: Period) {
  const sites = siteCount === 0 || siteCount === totalSites ? (totalSites === 1 ? "1 site" : "All sites") : siteCount === 1 ? "1 site" : `${siteCount} sites`;
  return { title: periodLabel(period, FY_START_MONTH), crumb: [company, sites].filter(Boolean).join(" · ") };
}

// ── Lower tabs ──────────────────────────────────────────────────────────────

const ACTIVITY_KEYS = ["activity_value", "activity", "Activity Data", "value", "quantity"];

/** The activity amount in an entry's activity data, by the keys today's dashboard reads. */
export function activityValue(data: Record<string, unknown> | null | undefined): number | null {
  if (!data) return null;
  for (const key of ACTIVITY_KEYS) {
    const v = Number(data[key]);
    if (data[key] !== undefined && data[key] !== null && Number.isFinite(v) && v > 0) return v;
  }
  return null;
}

type Scope2Entry = {
  date_of_reporting: string;
  total_emission: number | string;
  activity_data?: Record<string, unknown> | null;
  activity_data_unit?: string | null;
  reporting_period?: string | null;
};

/**
 * Scope 2 emissions and activity (e.g. kWh) per month. Yearly filings are
 * left out, as in the trend. The unit is the most common activity unit.
 */
export function scope2Monthly(rows: Scope2Entry[], months: string[]) {
  const by = new Map(months.map((m) => [m, { month: m, emissions: 0, activity: 0 }]));
  const units = new Map<string, number>();
  for (const r of rows) {
    if (r.reporting_period === "yearly") continue;
    const b = by.get(r.date_of_reporting.slice(0, 7));
    if (!b) continue;
    b.emissions += Number(r.total_emission) || 0;
    b.activity += activityValue(r.activity_data) ?? 0;
    if (r.activity_data_unit) units.set(r.activity_data_unit, (units.get(r.activity_data_unit) ?? 0) + 1);
  }
  const unit = [...units].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "kWh";
  return { unit, rows: [...by.values()].map((b) => ({ ...b, emissions: round3(b.emissions), activity: round3(b.activity) })) };
}

/** Calendar years a set of YYYY-MM months touches. */
export function yearsOf(months: string[]): number[] {
  return [...new Set(months.map((m) => Number(m.slice(0, 4))))].sort((a, b) => a - b);
}

/** Monthly gross emissions, production and intensity summed over sites. */
export function intensityMonthly(sites: { month: string; emissions: number; production: number }[][], months: string[]) {
  const by = new Map(months.map((m) => [m, { month: m, emissions: 0, production: 0 }]));
  for (const site of sites)
    for (const r of site) {
      const b = by.get(r.month);
      if (!b) continue;
      b.emissions += r.emissions;
      b.production += r.production;
    }
  return [...by.values()].map((b) => ({
    month: b.month,
    emissions: round3(b.emissions),
    production: round3(b.production),
    intensity: b.production > 0 ? b.emissions / b.production : null,
  }));
}

/** Years offered for the year-over-year chart: the last `n`, newest first. */
export function recentYears(now: Date, n = 5): number[] {
  const last = lastDueMonth(now).getFullYear();
  return Array.from({ length: n }, (_, i) => last - i);
}
