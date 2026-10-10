import { DEFAULT_FY_START_MONTH, MONTH_SHORT, fyLabel } from "./period";

/**
 * The period a report covers (GHG, EDE, targets): a reporting year, optionally
 * narrowed to one month or quarter of it. This is the shape the report APIs
 * take (`/user/ghg/*`, `/reports/ghg`).
 *
 * Unlike data entry, a report's FY `year` is the year the FY ENDS in: with an
 * April start, FY 2025 runs Apr 2024 – Mar 2025 (backend getPeriodRange).
 * Quarters count from the start of the reporting year (FY Q1 = Apr–Jun).
 */
export type ReportYearType = "CY" | "FY";
export type ReportFrequency = "yearly" | "quarterly" | "monthly";

export type ReportPeriod = {
  yearType: ReportYearType;
  year: number;
  frequency: ReportFrequency;
  /** Calendar month 1–12, used when frequency is "monthly". */
  month?: number;
  /** Quarter 1–4 of the reporting year, used when frequency is "quarterly". */
  quarter?: number;
};

const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The 12 months of the reporting year in order, each with its own calendar year. */
export function reportingMonths(yearType: ReportYearType, year: number, fyStartMonth = DEFAULT_FY_START_MONTH): { year: number; month: number }[] {
  if (yearType === "CY" || fyStartMonth === 1) return Array.from({ length: 12 }, (_, i) => ({ year, month: i + 1 }));
  const out: { year: number; month: number }[] = [];
  for (let m = fyStartMonth; m <= 12; m++) out.push({ year: year - 1, month: m });
  for (let m = 1; m < fyStartMonth; m++) out.push({ year, month: m });
  return out;
}

/** "CY 2025", or "FY 2024-25" for the FY ending in 2025. */
export function reportYearLabel(yearType: ReportYearType, year: number, fyStartMonth = DEFAULT_FY_START_MONTH): string {
  if (yearType === "CY") return `CY ${year}`;
  return fyStartMonth === 1 ? `FY ${year}` : fyLabel(year - 1, fyStartMonth);
}

/** "Jul–Sep 2024", or "Jan 2024 – Mar 2025" style when the quarter crosses a year. */
export function quarterSpan(yearType: ReportYearType, year: number, quarter: number, fyStartMonth = DEFAULT_FY_START_MONTH): string {
  const slice = reportingMonths(yearType, year, fyStartMonth).slice((quarter - 1) * 3, quarter * 3);
  const first = slice[0];
  const last = slice[slice.length - 1];
  return first.year === last.year
    ? `${MONTH_SHORT[first.month - 1]}–${MONTH_SHORT[last.month - 1]} ${last.year}`
    : `${MONTH_SHORT[first.month - 1]} ${first.year} – ${MONTH_SHORT[last.month - 1]} ${last.year}`;
}

/** Calendar year of `month` inside the reporting year. */
export function calendarYearOf(yearType: ReportYearType, year: number, month: number, fyStartMonth = DEFAULT_FY_START_MONTH): number {
  return yearType === "FY" && fyStartMonth > 1 && month >= fyStartMonth ? year - 1 : year;
}

/** "CY 2025", "FY 2024-25", "June 2024", "Q2 FY 2024-25 (Jul–Sep 2024)". */
export function reportPeriodLabel(p: ReportPeriod, fyStartMonth = DEFAULT_FY_START_MONTH): string {
  const yearLabel = reportYearLabel(p.yearType, p.year, fyStartMonth);
  if (p.frequency === "monthly" && p.month && p.month >= 1 && p.month <= 12)
    return `${MONTH_LONG[p.month - 1]} ${calendarYearOf(p.yearType, p.year, p.month, fyStartMonth)}`;
  if (p.frequency === "quarterly" && p.quarter && p.quarter >= 1 && p.quarter <= 4)
    return `Q${p.quarter} ${yearLabel} (${quarterSpan(p.yearType, p.year, p.quarter, fyStartMonth)})`;
  return yearLabel;
}

/** The same period one year earlier: what reports compare against. */
export function previousReportPeriod(p: ReportPeriod): ReportPeriod {
  return { ...p, year: p.year - 1 };
}

/** The reporting year `date` falls in (FY: the year it ends in). */
export function reportYearContaining(yearType: ReportYearType, date: Date, fyStartMonth = DEFAULT_FY_START_MONTH): number {
  const y = date.getFullYear();
  if (yearType === "CY" || fyStartMonth === 1) return y;
  return date.getMonth() + 1 >= fyStartMonth ? y + 1 : y;
}

/** Month picker options for the reporting year, in reporting order: "Apr 2024". */
export function reportMonthOptions(yearType: ReportYearType, year: number, fyStartMonth = DEFAULT_FY_START_MONTH) {
  return reportingMonths(yearType, year, fyStartMonth).map((m) => ({ value: m.month, label: `${MONTH_SHORT[m.month - 1]} ${m.year}` }));
}

/** Quarter picker options: "Q1 (Apr–Jun 2024)". */
export function reportQuarterOptions(yearType: ReportYearType, year: number, fyStartMonth = DEFAULT_FY_START_MONTH) {
  return [1, 2, 3, 4].map((q) => ({ value: q, label: `Q${q} (${quarterSpan(yearType, year, q, fyStartMonth)})` }));
}
