// Period context, row validation and the save payload for Add data.
import { canConvert, unitsMatchExact } from "../../../ui/unitMatch";
import { factorYearForDate, yearlyPeriodEndDate, type PeriodMode, type YearType } from "../hooks/reportingPeriod";
import type { EmissionCalculator } from "../hooks/emissionCalc";
import type { ModalRow } from "../types";

/** What is being reported: a month, or a CY/FY year (yearly batches). */
export type EntryPeriod =
  | { mode: "monthly"; year: number; month: number }
  | { mode: "yearly"; yearType: YearType; year: number };

/** `?period=` value (src/ui period convention): "2025-09", "CY2025", "FY2025" (FY start year). */
export function parseEntryPeriod(value: string | null | undefined): EntryPeriod | null {
  if (!value) return null;
  const month = /^(\d{4})-(\d{2})$/.exec(value);
  if (month) {
    const m = Number(month[2]);
    return m >= 1 && m <= 12 ? { mode: "monthly", year: Number(month[1]), month: m } : null;
  }
  const year = /^(CY|FY)(\d{4})$/.exec(value);
  return year ? { mode: "yearly", yearType: year[1] as YearType, year: Number(year[2]) } : null;
}

export const formatEntryPeriodParam = (p: EntryPeriod): string =>
  p.mode === "monthly" ? `${p.year}-${String(p.month).padStart(2, "0")}` : `${p.yearType}${p.year}`;

/**
 * The date rows are filed on: the last day of the month, or the yearly
 * period end (Dec 31 for CY, Mar 31 after an FY's start year).
 */
export function entryDate(p: EntryPeriod): string {
  if (p.mode === "yearly") return yearlyPeriodEndDate(p.yearType, p.year);
  const last = new Date(p.year, p.month, 0).getDate();
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

/** Factor year for the period (the reporting year minus one). */
export const entryFactorYear = (p: EntryPeriod): number => factorYearForDate(entryDate(p)) as number;

export const periodMode = (p: EntryPeriod): PeriodMode => p.mode;

/** The period before: last month, or the same calendar's previous year. */
export function previousPeriod(p: EntryPeriod): EntryPeriod {
  if (p.mode === "yearly") return { ...p, year: p.year - 1 };
  return p.month === 1 ? { mode: "monthly", year: p.year - 1, month: 12 } : { ...p, month: p.month - 1 };
}

/**
 * getPeriodTotal query for a period, as the legacy page sends it: the year of
 * the filed date (so FY 2025-26 asks for 2026), month only when monthly.
 */
export function periodTotalQuery(p: EntryPeriod) {
  const date = entryDate(p);
  return {
    year: Number(date.slice(0, 4)),
    month: p.mode === "monthly" ? p.month : undefined,
    reportingPeriod: p.mode,
    yearType: p.mode === "yearly" ? p.yearType : undefined,
  } as const;
}

export type RowIssue = { field: "emission_category" | "activity_data_unit" | "values"; message: string };

/**
 * Why a row can't be saved yet, or null when it can. Same checks and order as
 * the legacy page's validateRows, reported per field instead of one block.
 */
export function rowIssue(row: ModalRow, calc: EmissionCalculator): RowIssue | null {
  if (!row.emission_category) return { field: "emission_category", message: "Choose what this row is" };
  if (!row.activity_data_unit) return { field: "activity_data_unit", message: "Choose a unit" };
  const expected = calc.getExpectedUnit(row.emission_category);
  if (expected && !unitsMatchExact(expected, row.activity_data_unit) && !canConvert(row.activity_data_unit, expected)) {
    const bracket = row.emission_category.match(/\[([^\]]+)\]/)?.[1];
    return {
      field: "activity_data_unit",
      message: bracket
        ? `This option is per ${bracket}. Choose the [${row.activity_data_unit}] version of it, or switch the unit to ${bracket}.`
        : `The factor is per ${expected} and ${row.activity_data_unit} can't be converted to it.`,
    };
  }
  const result = calc.calculateEmission(row);
  return result.value === null ? { field: "values", message: result.status } : null;
}

export interface EmissionPayload {
  site_id: number;
  category_id: number;
  activity_data: Record<string, unknown>;
  extra_data: Record<string, unknown>;
  total_emission: number;
  unit: string;
  date_of_reporting: string;
  activity_data_unit?: string;
  reporting_period: PeriodMode;
  year_type?: YearType;
}

/**
 * The createEmission body for a row. Same shape as the legacy page: the
 * backend computes the total; composite-unit helpers and private row state
 * stay out of activity_data. Yearly rows are always filed on the period end;
 * a monthly row keeps its own date_of_reporting when it has one.
 */
export function buildPayload(row: ModalRow, ctx: { siteId: number; categoryId: number; period: EntryPeriod }): EmissionPayload {
  const { activity_data_unit, date_of_reporting: rowDate, _extra_data, ...rest } = row;
  const activity: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (key === "id") continue;
    if (key.endsWith("__multiplier") || key.endsWith("__distance")) continue;
    // Private row state: FERA flag, mapping key, and the bill a row came from.
    if (key === "_isFeraRow" || key === "_ecmKey" || key === "_bill") continue;
    activity[key] = value;
  }
  const date = entryDate(ctx.period);
  return {
    site_id: ctx.siteId,
    category_id: ctx.categoryId,
    activity_data: activity,
    extra_data: _extra_data ?? {},
    total_emission: 0,
    unit: "kg CO2e",
    date_of_reporting: ctx.period.mode === "yearly" ? date : (rowDate as string | undefined) || date,
    activity_data_unit: activity_data_unit || undefined,
    reporting_period: ctx.period.mode,
    year_type: ctx.period.mode === "yearly" ? ctx.period.yearType : undefined,
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Sep 2025", "CY 2025", "FY 2025-26". */
export const entryPeriodLabel = (p: EntryPeriod): string =>
  p.mode === "monthly"
    ? `${MONTHS[p.month - 1]} ${p.year}`
    : p.yearType === "CY"
      ? `CY ${p.year}`
      : `FY ${p.year}-${String((p.year + 1) % 100).padStart(2, "0")}`;

/** Comparison with the previous period, once per emission category. */
export function comparison(current: number | null, previous: number | null, thresholdPct: number) {
  if (current === null || previous === null || previous === 0) return null;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  return { pct, overThreshold: Math.abs(pct) > thresholdPct };
}
