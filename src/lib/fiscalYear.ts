import { useQuery } from "@tanstack/react-query";
import { getReportingCalendar } from "../services/companyService";
import { DEFAULT_FY_START_MONTH } from "../ui/period";

/*
 * One FY convention for the whole FE. In the URL and on screen an FY is named
 * by the year it starts in ("FY2025" = Apr 2025 – Mar 2026 with an April
 * start). The start month comes from the backend's reporting calendar, which is
 * the single source for every company. Endpoints that name an FY differently
 * get it translated here, not in each page.
 */

export const reportingCalendarKey = ["reporting-calendar"] as const;

/** Whether `m` is a usable FY start month (1–12). */
function validMonth(m: unknown): m is number {
  return typeof m === "number" && Number.isInteger(m) && m >= 1 && m <= 12;
}

/** The FY start month from a reporting-calendar reply; April when missing or invalid. */
export function fyStartMonthOf(calendar: { fiscalYearStartMonth?: unknown } | null | undefined): number {
  const m = Number(calendar?.fiscalYearStartMonth);
  return validMonth(m) ? m : DEFAULT_FY_START_MONTH;
}

/** The company's FY start month (backend-owned); April until it arrives or if it can't be read. */
export function useFyStartMonth(): number {
  const q = useQuery({
    queryKey: reportingCalendarKey,
    queryFn: getReportingCalendar,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
  return fyStartMonthOf(q.data);
}

/** Start year of the FY holding `date`. */
export function fyStartYearOf(date: Date, fyStartMonth = DEFAULT_FY_START_MONTH): number {
  return date.getMonth() + 1 >= fyStartMonth ? date.getFullYear() : date.getFullYear() - 1;
}

/** The calendar year an FY ends in (the year-export and GHG endpoints name an FY by it). */
export function fyEndYear(startYear: number, fyStartMonth = DEFAULT_FY_START_MONTH): number {
  return fyStartMonth === 1 ? startYear : startYear + 1;
}

/** B4's name for an FY: both years, "FY2025-26" (or "FY2025" for a January start). */
export function fyBothYears(startYear: number, fyStartMonth = DEFAULT_FY_START_MONTH): string {
  const end = fyEndYear(startYear, fyStartMonth);
  return end === startYear ? `FY${startYear}` : `FY${startYear}-${String(end % 100).padStart(2, "0")}`;
}
