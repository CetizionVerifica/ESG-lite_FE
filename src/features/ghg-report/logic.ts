import type { GhgDetailsRow, GhgReportTablesRequest, GhgReportTablesResponse, OverviewRow } from "../../services/ghgreportService";
import {
  DEFAULT_FY_START_MONTH,
  type ReportFrequency,
  type ReportPeriod,
  type ReportYearType,
  reportPeriodLabel,
  reportYearContaining,
  reportYearLabel,
  reportingMonths,
} from "../../ui";

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

const FREQ_PARAM: Record<string, ReportFrequency> = { year: "yearly", quarter: "quarterly", month: "monthly" };
const PARAM_FREQ: Record<ReportFrequency, string> = { yearly: "year", quarterly: "quarter", monthly: "month" };

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
  return years.sort((a, b) => b - a).map((y) => ({ value: y, label: reportYearLabel(yearType, y, fyStartMonth) }));
}

// ─── Request ────────────────────────────────────────────────────────────────

export type ReportQuery = { siteIds: number[]; categoryIds: number[]; period: ReportPeriod };

/** Body for POST /user/ghg/tables and /details. */
export function requestPayload(q: ReportQuery): GhgReportTablesRequest {
  const { period: p } = q;
  return {
    siteIds: q.siteIds,
    yearType: p.yearType,
    year: p.year,
    frequency: p.frequency,
    ...(p.frequency === "monthly" && p.month ? { month: p.month } : {}),
    ...(p.frequency === "quarterly" && p.quarter ? { quarter: p.quarter } : {}),
    ...(q.categoryIds.length ? { categoryIds: q.categoryIds } : {}),
  };
}

// ─── Figures (mirror the branded PDF's "Emissions at a glance") ─────────────

export const SCOPES = ["Scope 1", "Scope 2", "Scope 3"] as const;
export type ScopeName = (typeof SCOPES)[number];
const isCore = (scope: string): scope is ScopeName => (SCOPES as readonly string[]).includes(scope);

// Same test as the backend report (src/reporting/ghg.ts).
const RENEW_RE = /renew|solar|wind|hydro|geotherm/i;

export type ScopeSplit = Record<ScopeName, number> & { total: number };

export interface ReportFigures {
  year: number;
  compareYear: number;
  selected: ScopeSplit;
  previous: ScopeSplit;
  /** % change of the total; null when last year had nothing. */
  yoy: number | null;
  /** Renewable tCO₂e this period from scope-less rows, outside the scope totals. */
  renewable: number;
  coverage: { percent: number; withData: number; selected: number; missing: string[] };
  largestSource: { name: string; value: number; share: number } | null;
  /** True when the selected period has no rows at all. */
  empty: boolean;
}

const split = (t: { scope1: number; scope2: number; scope3: number; total: number } | undefined): ScopeSplit => ({
  "Scope 1": t?.scope1 ?? 0,
  "Scope 2": t?.scope2 ?? 0,
  "Scope 3": t?.scope3 ?? 0,
  total: t?.total ?? 0,
});

export const share = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

/** Categories match whatever their case ("Natural Gas" = "natural gas"); the first spelling seen is shown. */
const catKey = (name: string) => name.trim().toLowerCase();

function categoryTotals(rows: OverviewRow[]): Map<string, { name: string; total: number }> {
  const map = new Map<string, { name: string; total: number }>();
  for (const r of rows) {
    if (!isCore(r.scope)) continue;
    const c = map.get(catKey(r.category)) ?? { name: r.category, total: 0 };
    c.total += r.total;
    map.set(catKey(r.category), c);
  }
  return map;
}

/**
 * KPI figures for the page. `sites` are the sites asked for: coverage counts
 * how many of them have any Scope 1–3 row, as the PDF does.
 */
export function reportFigures(data: GhgReportTablesResponse, sites: { site_id: number; name: string }[]): ReportFigures {
  const { year, compareYear } = data.filters;
  const selected = split(data.totals[String(year)]);
  const previous = split(data.totals[String(compareYear)]);
  const rows = data.tables.table_overviewByLocations_selectedYear.rows;

  const withData = new Set<number>();
  for (const r of rows) if (isCore(r.scope)) r.bySite.forEach((b) => withData.add(b.siteId));
  const missing = sites.filter((s) => !withData.has(s.site_id)).map((s) => s.name);
  const asked = sites.length || withData.size;

  const cats = [...categoryTotals(rows).values()].sort((a, b) => b.total - a.total);
  const top = cats[0];

  return {
    year,
    compareYear,
    selected,
    previous,
    yoy: previous.total > 0 ? ((selected.total - previous.total) / previous.total) * 100 : null,
    // Only scope-less rows: a renewable-sounding Scope 3 purchase is already in the totals.
    renewable: rows.filter((r) => !isCore(r.scope) && RENEW_RE.test(r.category)).reduce((a, r) => a + r.total, 0),
    coverage: {
      percent: asked ? Math.round((Math.min(withData.size, asked) / asked) * 100) : 100,
      withData: Math.min(withData.size, asked),
      selected: asked,
      missing,
    },
    largestSource: top ? { name: top.name, value: top.total, share: share(top.total, selected.total) } : null,
    empty: rows.length === 0 && selected.total === 0,
  };
}

// ─── Summary tab ────────────────────────────────────────────────────────────

/** Table 1: emissions by scope, both years, with each year's share of its total. */
export function scopeTable(f: ReportFigures) {
  return SCOPES.map((scope) => ({
    scope,
    previous: f.previous[scope],
    previousPct: share(f.previous[scope], f.previous.total),
    selected: f.selected[scope],
    selectedPct: share(f.selected[scope], f.selected.total),
    change: changePct(f.selected[scope], f.previous[scope]),
  }));
}

/** % change, null when there was nothing to compare with. */
export function changePct(now: number, before: number): number | null {
  return before > 0 ? ((now - before) / before) * 100 : null;
}

export type CategoryRow = { category: string; scope: string; previous: number; selected: number; change: number | null };

/** Scope 1–3 categories by this period's emissions, largest first. */
export function topCategories(data: GhgReportTablesResponse, limit = 10): CategoryRow[] {
  const key = (r: OverviewRow) => `${r.scope}||${catKey(r.category)}`;
  const map = new Map<string, CategoryRow>();
  const add = (rows: OverviewRow[], field: "previous" | "selected") => {
    for (const r of rows) {
      if (!isCore(r.scope)) continue;
      const row = map.get(key(r)) ?? { category: r.category, scope: r.scope, previous: 0, selected: 0, change: null };
      row[field] += r.total;
      map.set(key(r), row);
    }
  };
  // This period first, so its spelling of a category is the one shown.
  add(data.tables.table_overviewByLocations_selectedYear.rows, "selected");
  add(data.tables.table_overviewByLocations_compareYear.rows, "previous");
  return [...map.values()]
    .map((r) => ({ ...r, change: changePct(r.selected, r.previous) }))
    .sort((a, b) => b.selected - a.selected || b.previous - a.previous || a.category.localeCompare(b.category))
    .slice(0, limit);
}

// ─── By location tab ────────────────────────────────────────────────────────

export type LocationRow = { siteId: number; site: string; previous: ScopeSplit; selected: ScopeSplit };

const zero = (): ScopeSplit => ({ "Scope 1": 0, "Scope 2": 0, "Scope 3": 0, total: 0 });

/** Site × scope for both years. Sites asked for but without data still get a row of zeros. */
export function locationRows(data: GhgReportTablesResponse, sites: { site_id: number; name: string }[]): LocationRow[] {
  const map = new Map<number, LocationRow>();
  for (const s of sites) map.set(s.site_id, { siteId: s.site_id, site: s.name, previous: zero(), selected: zero() });
  const add = (rows: OverviewRow[], field: "previous" | "selected") => {
    for (const r of rows) {
      if (!isCore(r.scope)) continue;
      for (const b of r.bySite) {
        const row = map.get(b.siteId) ?? { siteId: b.siteId, site: b.siteName, previous: zero(), selected: zero() };
        row[field][r.scope] += b.value;
        row[field].total += b.value;
        map.set(b.siteId, row);
      }
    }
  };
  add(data.tables.table_overviewByLocations_compareYear.rows, "previous");
  add(data.tables.table_overviewByLocations_selectedYear.rows, "selected");
  return [...map.values()].sort((a, b) => b.selected.total - a.selected.total || a.site.localeCompare(b.site));
}

// ─── Errors ─────────────────────────────────────────────────────────────────

/** The server's message when it sent one, else `fallback`. */
export function serverMessage(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof msg === "string" && msg ? msg : fallback;
}

// ─── Labels ─────────────────────────────────────────────────────────────────

/** Column-sized label: "CY 2025", "June 2024", "Q2 FY 2024-25". */
export function shortPeriodLabel(p: ReportPeriod, fyStartMonth = DEFAULT_FY_START_MONTH): string {
  if (p.frequency === "quarterly" && p.quarter) return `Q${p.quarter} ${reportYearLabel(p.yearType, p.year, fyStartMonth)}`;
  return reportPeriodLabel(p, fyStartMonth);
}

// ─── Scope tabs (details) ───────────────────────────────────────────────────

export type DetailRow = GhgDetailsRow & { key: string };

/** One scope's detail rows (category × site × fuel), largest this period first. */
export function scopeDetails(rows: GhgDetailsRow[], scope: ScopeName): DetailRow[] {
  return rows
    .filter((r) => r.scope === scope)
    .map((r) => ({ ...r, key: `${r.categoryId}|${r.siteId}|${r.fuelType}` }))
    .sort((a, b) => b.selected.emissions - a.selected.emissions || b.compare.emissions - a.compare.emissions || a.categoryName.localeCompare(b.categoryName));
}

export type Distribution = { category: string; previous: number; selected: number; previousPct: number; selectedPct: number };

/** Each category's share of the scope, both periods. */
export function scopeDistribution(rows: GhgDetailsRow[], scope: ScopeName): Distribution[] {
  const map = new Map<string, { previous: number; selected: number }>();
  for (const r of rows) {
    if (r.scope !== scope) continue;
    const d = map.get(r.categoryName) ?? { previous: 0, selected: 0 };
    d.previous += r.compare.emissions;
    d.selected += r.selected.emissions;
    map.set(r.categoryName, d);
  }
  const prevTotal = [...map.values()].reduce((a, d) => a + d.previous, 0);
  const selTotal = [...map.values()].reduce((a, d) => a + d.selected, 0);
  return [...map]
    .map(([category, d]) => ({ category, ...d, previousPct: share(d.previous, prevTotal), selectedPct: share(d.selected, selTotal) }))
    .sort((a, b) => b.selected - a.selected || b.previous - a.previous);
}

// ─── Findings (same rules as the branded PDF, backend src/reporting/ghg.ts) ─

const fmt0 = (n: number) => Math.round(n).toLocaleString("en-US");
const fmt1 = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 1 });
const pctText = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—");

export function findings(f: ReportFigures, locations: LocationRow[], selLabel: string, prevLabel: string): string[] {
  const total = f.selected.total;
  const s1 = f.selected["Scope 1"];
  const s2 = f.selected["Scope 2"];
  const topSite = locations.filter((l) => l.selected.total > 0).sort((a, b) => b.selected.total - a.selected.total)[0];
  const top = f.largestSource;
  return [
    `Total ${selLabel} emissions were ${fmt1(total)} tCO₂e${f.yoy !== null ? ` (${f.yoy >= 0 ? "up" : "down"} ${Math.abs(f.yoy).toFixed(1)}% vs ${prevLabel})` : ""}.`,
    topSite ? `${topSite.site} is the largest contributing site at ${fmt0(topSite.selected.total)} tCO₂e (${pctText(topSite.selected.total, total)} of total).` : "",
    `${s2 >= s1 ? "Scope 2 (purchased energy)" : "Scope 1 (direct)"} dominates the footprint at ${pctText(Math.max(s1, s2), total)}, indicating the highest-leverage reduction pathway.`,
    top ? `${top.name} is the single largest emission source (${pctText(top.value, total)}).` : "",
  ].filter(Boolean);
}

/**
 * The PDF's default recommended actions, minus the ones the data already
 * meets (full coverage, renewables recorded).
 */
export function recommendedActions(f: ReportFigures): string[] {
  return [
    f.coverage.missing.length > 0 ? "Close data gaps at non-reporting sites to reach full coverage before the next cycle." : "",
    "Prioritise Scope 2 reduction through renewable electricity procurement or on-site generation.",
    "Set a validated, science-based reduction target aligned to a 1.5 °C pathway.",
    f.renewable > 0 ? "" : "Begin capturing renewable-energy consumption to quantify avoided emissions.",
  ].filter(Boolean);
}
