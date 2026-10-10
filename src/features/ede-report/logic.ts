import type { EdeReportRequest, EdeReportResponse, IntensityMonthlyRow } from "../../services/reportService";
import { type PeriodSupport, type ReportPeriod, type ReportYearType, MONTH_SHORT, reportPeriodLabel, reportingMonths } from "../../ui";

/**
 * Pure logic for P11 EDE report. Every figure on the page comes straight from
 * POST /user/reports/ede, so the numbers match the old page by construction;
 * this file only reshapes them (KPIs, month × site grids, site colours).
 */

// ─── Request ────────────────────────────────────────────────────────────────

/** The EDE endpoint only takes a calendar year or one calendar month (backend getEdeReport). */
export const EDE_SUPPORTS: PeriodSupport = { fy: false, quarterly: false };
export const EDE_UNSUPPORTED_HINT = "FY and quarters will come once the EDE report API supports them; it covers calendar years and months today.";

export type EdeQuery = {
  siteIds: number[];
  categoryIds: number[];
  period: ReportPeriod;
};

/** Body for POST /user/reports/ede. A quarterly or FY period never reaches here (see supportedPeriod). */
export function requestPayload(q: EdeQuery): EdeReportRequest {
  const { period: p } = q;
  const monthly = p.frequency === "monthly" && !!p.month;
  return {
    siteIds: q.siteIds,
    frequency: monthly ? "monthly" : "yearly",
    year: p.year,
    ...(monthly ? { month: p.month } : {}),
    ...(q.categoryIds.length ? { categoryIds: q.categoryIds } : {}),
  };
}

/** Missing arrays become empty ones, as the old page did. */
export function normalize(data: Partial<EdeReportResponse> | null | undefined): EdeReportResponse {
  return {
    totals: data?.totals ?? { scope1: 0, scope2: 0, scope3: 0, total: 0 },
    bySite: data?.bySite ?? [],
    siteDonut: data?.siteDonut ?? [],
    monthlyBySite: data?.monthlyBySite ?? [],
    savedBySite: data?.savedBySite ?? [],
    renewableKwhBySite: data?.renewableKwhBySite ?? [],
    intensityMonthly: data?.intensityMonthly ?? [],
  };
}

// ─── Figures ────────────────────────────────────────────────────────────────

export interface EdeFigures {
  total: number;
  scope1: number;
  scope2: number;
  scope3: number;
  /** Renewable electricity produced (kWh of activity data, scope-less rows). */
  renewableKwh: number;
  /** tCO₂e avoided by renewables (scope-less rows), outside the scope totals. */
  saved: number;
  /** True when the period has no approved rows at all. */
  empty: boolean;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0);

export function edeFigures(d: EdeReportResponse): EdeFigures {
  const renewableKwh = sum(d.renewableKwhBySite.map((r) => Number(r.kwh)));
  const saved = sum(d.savedBySite.map((r) => Number(r.saved)));
  return {
    total: d.totals.total,
    scope1: d.totals.scope1,
    scope2: d.totals.scope2,
    scope3: d.totals.scope3,
    renewableKwh,
    saved,
    empty: d.bySite.length === 0 && d.totals.total === 0 && renewableKwh === 0 && saved === 0,
  };
}

/** The PDF's "Overall totals" table, now also on screen. */
export function overallTotals(f: EdeFigures): { metric: string; value: number; unit: string }[] {
  return [
    { metric: "Scope 1", value: f.scope1, unit: "tCO₂e" },
    { metric: "Scope 2", value: f.scope2, unit: "tCO₂e" },
    { metric: "Scope 3", value: f.scope3, unit: "tCO₂e" },
    { metric: "Total (Scope 1 + 2 + 3)", value: f.total, unit: "tCO₂e" },
    {
      metric: "Renewable electricity produced",
      value: f.renewableKwh,
      unit: "kWh",
    },
    { metric: "Emissions saved by renewables", value: f.saved, unit: "tCO₂e" },
  ];
}

// ─── Sites and colours ──────────────────────────────────────────────────────

export type SiteRef = { siteId: number; siteName: string };

/**
 * Every site that appears anywhere in the report, in one fixed order (by name),
 * so a site keeps the same --t-series-* colour across all charts.
 */
export function reportSites(d: EdeReportResponse): SiteRef[] {
  const map = new Map<number, string>();
  const add = (rows: { siteId?: number; siteName: string }[]) =>
    rows.forEach((r) => r.siteId !== undefined && !map.has(r.siteId) && map.set(r.siteId, r.siteName));
  add(d.bySite);
  add(d.monthlyBySite);
  add(d.savedBySite);
  add(d.renewableKwhBySite);
  add(d.intensityMonthly);
  return [...map].map(([siteId, siteName]) => ({ siteId, siteName })).sort((a, b) => a.siteName.localeCompare(b.siteName) || a.siteId - b.siteId);
}

/** Palette index per site id: position in reportSites, wrapping after 8. */
export function siteColorIndex(sites: SiteRef[], paletteSize = 8): Map<number, number> {
  return new Map(sites.map((s, i) => [s.siteId, i % paletteSize]));
}

// ─── Months ─────────────────────────────────────────────────────────────────

const ym = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

/** "YYYY-MM" keys the period covers: all 12 months of a year, or the one month. */
export function periodMonths(p: ReportPeriod): string[] {
  const months = reportingMonths(p.yearType as ReportYearType, p.year);
  if (p.frequency === "monthly" && p.month) return months.filter((m) => m.month === p.month).map((m) => ym(m.year, m.month));
  return months.map((m) => ym(m.year, m.month));
}

/** "Jan 2025" from "2025-01". */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return m >= 1 && m <= 12 ? `${MONTH_SHORT[m - 1]} ${y}` : key;
}

/** Month × site grid of total tCO₂e. Months come from the period so gaps show as zero. */
export function monthlyGrid(d: EdeReportResponse, period: ReportPeriod, sites: SiteRef[]) {
  const months = periodMonths(period);
  const cell = new Map<string, number>();
  for (const r of d.monthlyBySite) cell.set(`${r.siteId}|${r.month}`, (cell.get(`${r.siteId}|${r.month}`) ?? 0) + (Number(r.total) || 0));
  // Months outside the period (shouldn't happen) are kept, not dropped.
  for (const r of d.monthlyBySite) if (!months.includes(r.month)) months.push(r.month);
  months.sort();
  return {
    months,
    series: sites.map((s) => ({
      ...s,
      values: months.map((m) => cell.get(`${s.siteId}|${m}`) ?? 0),
    })),
  };
}

/** True when an intensity row belongs to `site`: by id, or by name from a backend that doesn't send one. */
export const isSiteRow = (r: IntensityMonthlyRow, site: SiteRef) => (r.siteId !== undefined ? r.siteId === site.siteId : r.siteName === site.siteName);

/** Sites with intensity rows, those with emissions first (a renewables-only site has nothing to show). */
export function intensitySites(d: EdeReportResponse, sites: SiteRef[]): SiteRef[] {
  const emits = (s: SiteRef) => d.intensityMonthly.some((r) => isSiteRow(r, s) && r.emissions > 0);
  const listed = sites.filter((s) => d.intensityMonthly.some((r) => isSiteRow(r, s)));
  return [...listed.filter(emits), ...listed.filter((s) => !emits(s))];
}

/** One site's monthly emissions, production and intensity across the period. */
export function intensitySeries(d: EdeReportResponse, period: ReportPeriod, site: SiteRef) {
  const months = periodMonths(period);
  const rows = d.intensityMonthly.filter((r) => isSiteRow(r, site));
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  for (const r of rows) if (!months.includes(r.month)) months.push(r.month);
  months.sort();
  const unit = rows.find((r) => r.production > 0)?.unit ?? rows[0]?.unit ?? "unit";
  return {
    unit,
    months,
    emissions: months.map((m) => byMonth.get(m)?.emissions ?? 0),
    // No production that month means no intensity, not zero.
    intensity: months.map((m) => {
      const r = byMonth.get(m);
      return r && r.production > 0 ? r.intensity : null;
    }),
  };
}

// ─── Labels ─────────────────────────────────────────────────────────────────

/** "CY 2025" or "June 2025": the EDE report only has calendar periods. */
export const edePeriodLabel = (p: ReportPeriod) => reportPeriodLabel(p);

/** "EDE_Report_Midal_Cables_CY_2025.pdf" */
export function pdfFileName(company: string | undefined, p: ReportPeriod): string {
  const safe = (s: string) =>
    s
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "_")
      .replace(/^_+|_+$/g, "");
  return `EDE_Report_${safe(company || "Company") || "Company"}_${safe(edePeriodLabel(p))}.pdf`;
}
