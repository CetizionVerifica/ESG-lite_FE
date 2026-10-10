import { DEFAULT_FY_START_MONTH } from "./period";
import { type ReportFrequency, type ReportPeriod, type ReportYearType, reportYearContaining, reportYearLabel, reportingMonths } from "./reportPeriod";

/**
 * The report header's filter model, shared by P10 (GHG) and P11 (EDE):
 * sites, categories and the period, kept in the URL as
 * `?site=&category=&cal=&freq=&year=&quarter=&month=`.
 */

// ─── Sites and categories ───────────────────────────────────────────────────

export interface SiteOption {
  site_id: number;
  name: string;
  company?: { company_id: number; name: string } | null;
  categories?: { category_id: number; category_name: string }[] | null;
}

/** Categories offered by the chosen sites (every site when none is chosen). */
export function categoryOptions(sites: SiteOption[], siteIds: number[]): { value: number; label: string }[] {
  const map = new Map<number, string>();
  for (const s of sites) if (!siteIds.length || siteIds.includes(s.site_id)) s.categories?.forEach((c) => map.set(c.category_id, c.category_name));
  return [...map].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}

/** Sites a Superadmin reports on: the picked client's. */
export function clientSites(sites: SiteOption[], clientId: number | null): SiteOption[] {
  if (clientId === null) return [];
  return sites.filter((s) => s.company?.company_id === clientId).sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Period in the URL ──────────────────────────────────────────────────────

export const PERIOD_KEYS = ["cal", "freq", "year", "quarter", "month"] as const;

const FREQ_PARAM: Record<string, ReportFrequency> = {
  year: "yearly",
  quarter: "quarterly",
  month: "monthly",
};
const PARAM_FREQ: Record<ReportFrequency, string> = {
  yearly: "year",
  quarterly: "quarter",
  monthly: "month",
};

const intIn = (v: string | null, min: number, max: number): number | null => {
  if (v === null || !/^\d+$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
};

/** First month of the reporting year (FY: the company's start month). */
export function firstReportingMonth(yearType: ReportYearType, fyStartMonth = DEFAULT_FY_START_MONTH): number {
  return reportingMonths(yearType, 2000, fyStartMonth)[0].month;
}

/**
 * The period in `?cal=&freq=&year=&quarter=&month=`. Defaults match today's
 * page: calendar year, whole year, the year that contains today. The month
 * defaults to the first of the reporting year.
 */
export function readPeriod(params: URLSearchParams, now: Date, fyStartMonth = DEFAULT_FY_START_MONTH): ReportPeriod {
  const yearType: ReportYearType = params.get("cal") === "FY" ? "FY" : "CY";
  const frequency = FREQ_PARAM[params.get("freq") ?? ""] ?? "yearly";
  const year = intIn(params.get("year"), 2000, 2100) ?? reportYearContaining(yearType, now, fyStartMonth);
  const p: ReportPeriod = { yearType, year, frequency };
  if (frequency === "quarterly") p.quarter = intIn(params.get("quarter"), 1, 4) ?? 1;
  if (frequency === "monthly") p.month = intIn(params.get("month"), 1, 12) ?? firstReportingMonth(yearType, fyStartMonth);
  return p;
}

/** A copy of `params` without `keys`. */
export function withoutKeys(params: URLSearchParams, keys: readonly string[]): URLSearchParams {
  return new URLSearchParams([...params].filter(([k]) => !keys.includes(k)));
}

/** Writes a period back into the URL params; unused keys are removed so links stay short. */
export function writePeriod(params: URLSearchParams, p: ReportPeriod): URLSearchParams {
  const next = withoutKeys(params, PERIOD_KEYS);
  next.set("cal", p.yearType);
  next.set("freq", PARAM_FREQ[p.frequency]);
  next.set("year", String(p.year));
  if (p.frequency === "quarterly" && p.quarter) next.set("quarter", String(p.quarter));
  if (p.frequency === "monthly" && p.month) next.set("month", String(p.month));
  return next;
}

/**
 * The period after a calendar switch. The year keeps pointing at the same
 * time (FY ending in the CY year), and month/quarter go back to the start,
 * as on today's page.
 */
export function switchCalendar(p: ReportPeriod, yearType: ReportYearType, fyStartMonth = DEFAULT_FY_START_MONTH): ReportPeriod {
  if (yearType === p.yearType) return p;
  return withFrequency({ yearType, year: p.year, frequency: p.frequency }, p.frequency, fyStartMonth);
}

export function withFrequency(p: ReportPeriod, frequency: ReportFrequency, fyStartMonth = DEFAULT_FY_START_MONTH): ReportPeriod {
  const next: ReportPeriod = { yearType: p.yearType, year: p.year, frequency };
  if (frequency === "quarterly") next.quarter = p.quarter ?? 1;
  if (frequency === "monthly") next.month = p.month ?? firstReportingMonth(p.yearType, fyStartMonth);
  return next;
}

/** Year picker: the current reporting year and the nine before it, plus `keep` if it's older. */
export function yearOptions(yearType: ReportYearType, now: Date, fyStartMonth = DEFAULT_FY_START_MONTH, keep?: number) {
  const current = reportYearContaining(yearType, now, fyStartMonth);
  const years = Array.from({ length: 10 }, (_, i) => current - i);
  if (keep !== undefined && !years.includes(keep)) years.push(keep);
  return years
    .sort((a, b) => b - a)
    .map((y) => ({
      value: y,
      label: reportYearLabel(yearType, y, fyStartMonth),
    }));
}

export type PeriodSupport = { fy: boolean; quarterly: boolean };

/** A period the report can't ask for yet, moved to the nearest one it can: CY instead of FY, year instead of quarter. */
export function supportedPeriod(p: ReportPeriod, supports: PeriodSupport, fyStartMonth = DEFAULT_FY_START_MONTH): ReportPeriod {
  let next = p;
  if (!supports.fy && next.yearType === "FY") next = switchCalendar(next, "CY", fyStartMonth);
  if (!supports.quarterly && next.frequency === "quarterly") next = withFrequency(next, "yearly", fyStartMonth);
  return next;
}
