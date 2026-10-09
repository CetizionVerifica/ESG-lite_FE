// Reporting period rules for Add data, moved from pages/UserDataEntry.

export type PeriodMode = "monthly" | "yearly";
export type YearType = "CY" | "FY";

// Yearly entries are stored on the period-end date the backend expects:
// Dec 31 for a calendar year, Mar 31 of the following year for a financial
// year (year = FY start year, so FY 2025-26 → 2026-03-31).
export const yearlyPeriodEndDate = (yearType: YearType, year: number): string =>
  yearType === "CY" ? `${year}-12-31` : `${year + 1}-03-31`;

// Factors are taken from the year before the reporting date's year
// (2025 data uses 2024 factors).
export const factorYearForDate = (date: string | null | undefined): number | undefined =>
  date ? parseInt(date.substring(0, 4)) - 1 : undefined;
