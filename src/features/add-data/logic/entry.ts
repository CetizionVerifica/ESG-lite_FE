// Period context, row validation and the save payload for Add data.
import { canConvert, unitsMatchExact } from "../../../ui/unitMatch";
import { factorYearForDate, yearlyPeriodEndDate, type PeriodMode, type YearType } from "../hooks/reportingPeriod";
import type { EmissionCalculator } from "../hooks/emissionCalc";
import { isSupportedCurrency } from "../../../lib/scope3/spend";
import type { ModalRow } from "../types";
import { SUPPLIER_ROW_KEYS, supplierMethodOf, supplierPayload } from "./supplier";
import { ROW_METHOD_COLUMN } from "../../../lib/emissions/emissionCalc";
import { isRowMethod } from "../../../lib/scope3/dq";
import { offeredUnits, type FormModel } from "../../../lib/emissions/form";
import { sameUnit, unitNotOfferedMessage } from "../../../lib/emissions/unitOptions";

export { unitNotOfferedMessage };

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

/** The field an issue shows under; "values" is the quantity (or, on the spend form, the amount spent). */
export type RowIssue = { field: "emission_category" | "activity_data_unit" | "currency" | "values"; message: string };

/**
 * Why a row can't be saved yet, or null when it can. Same checks and order as
 * the legacy page's validateRows, reported per field instead of one block.
 * With the form model, a unit the emission category doesn't offer (#183) is
 * an issue too, before the server refuses it.
 */
export function rowIssue(row: ModalRow, calc: EmissionCalculator, model?: FormModel | null): RowIssue | null {
  if (!row.emission_category) return { field: "emission_category", message: "Choose what this row is" };
  // S3-5: a spend row needs its amount and currency; the server looks the rate up, so a rate still loading doesn't block.
  const spend = calc.spendDetail(row);
  if (spend) {
    if (spend.outcome.ok || spend.outcome.pending) return null;
    // Same order as spendOutcome: the currency first, then the amount.
    const currencyIssue = !isSupportedCurrency(spend.spend.currency);
    // On the spend form the currency has its own field; a quantity row's currency is its unit.
    const field = !currencyIssue ? "values" : spend.spend.amount_from === "spent_value" ? "currency" : "activity_data_unit";
    return { field, message: spend.outcome.status };
  }
  // The spend form hides the unit, so a spend row with nothing entered yet asks for the amount, not a unit.
  if (calc.usesSpendForm(row)) return { field: "values", message: "Enter the amount spent" };
  if (!row.activity_data_unit) return { field: "activity_data_unit", message: "Choose a unit" };
  // S3-6: a supplier's figure (or the hybrid lines) sets the unit, not the activity's factor.
  if (supplierMethodOf(row)) {
    const r = calc.calculateEmission(row);
    return r.value === null ? { field: "values", message: r.status } : null;
  }
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
  // #183: what the emission category offers, beyond the factor check above (a fixed unit, the method's units).
  const offered = model ? offeredUnits(model, row) : null;
  if (offered && !offered.some((u) => sameUnit(u, row.activity_data_unit))) {
    // A User reads the plain unit message instead (plainProblem).
    return { field: "activity_data_unit", message: unitNotOfferedMessage(row.activity_data_unit, row.emission_category, offered) };
  }
  const result = calc.calculateEmission(row);
  if (result.value !== null) return null;
  // The engine's "Enter activity data" also stands for 0, a negative number or text typed in (F-11).
  return { field: "values", message: result.status === MISSING_ACTIVITY ? AMOUNT_NEEDED : result.status };
}

const MISSING_ACTIVITY = "Enter activity data";
/** What a row with no usable amount asks for: empty, 0, negative and text alike. */
export const AMOUNT_NEEDED = "Enter the amount (a number above 0)";

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
  /** S3-6: the supplier the goods came from, and for "Supplier's own figure" the figure chosen. */
  supplier_id?: number;
  supplier_factor_id?: number;
  /** S3-3: how the row was calculated (the row's method), when it has one; S3-6's supplier methods included. */
  method?: string;
  /** S3-3: sent (true) only when a value came from an estimate, such as the distance helper's rail or sea estimate. */
  is_estimate?: boolean;
}

/**
 * The createEmission body for a row. Same shape as the legacy page: the
 * backend computes the total; composite-unit helpers and private row state
 * stay out of activity_data. Yearly rows are always filed on the period end;
 * a monthly row keeps its own date_of_reporting when it has one.
 */
export function buildPayload(
  row: ModalRow,
  ctx: {
    siteId: number;
    categoryId: number;
    period: EntryPeriod;
  },
): EmissionPayload {
  const { activity_data_unit, date_of_reporting: rowDate, _extra_data, _estimates, ...rest } = row;
  const activity: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (key === "id") continue;
    if (key.endsWith("__multiplier") || key.endsWith("__distance")) continue;
    // Private row state: FERA flag, mapping key, the bill a row came from, the saved entry it edits.
    if (key === "_isFeraRow" || key === "_ecmKey" || key === "_bill" || key === "_editOf" || key === "_editSaved" || key === "_defaults") continue;
    if ((SUPPLIER_ROW_KEYS as readonly string[]).includes(key)) continue;
    // The supplier methods go in `method`; "@method" only matters to a spec that reads it (S3-9).
    if (key === ROW_METHOD_COLUMN && supplierMethodOf(row)) continue;
    activity[key] = value;
  }
  const supplier = supplierPayload(row);
  const method = row[ROW_METHOD_COLUMN];
  const estimated = Array.isArray(_estimates) && _estimates.length > 0;
  const date = entryDate(ctx.period);
  return {
    site_id: ctx.siteId,
    category_id: ctx.categoryId,
    activity_data: activity,
    extra_data: supplier.extra ? { ...(_extra_data ?? {}), ...supplier.extra } : (_extra_data ?? {}),
    total_emission: 0,
    unit: "tCO2e",
    date_of_reporting: ctx.period.mode === "yearly" ? date : (rowDate as string | undefined) || date,
    activity_data_unit: activity_data_unit || undefined,
    reporting_period: ctx.period.mode,
    year_type: ctx.period.mode === "yearly" ? ctx.period.yearType : undefined,
    ...(supplier.supplier_id ? { supplier_id: supplier.supplier_id } : {}),
    ...(supplier.supplier_factor_id ? { supplier_factor_id: supplier.supplier_factor_id } : {}),
    ...(supplier.method ? { method: supplier.method } : isRowMethod(method) ? { method } : {}),
    ...(estimated ? { is_estimate: true } : {}),
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
