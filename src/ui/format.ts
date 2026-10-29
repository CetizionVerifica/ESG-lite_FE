/**
 * The one place figures, deltas and dates are turned into text.
 * Spec: src/ui/CLAUDE.md "Number formatting".
 */
import { MONTH_SHORT, fyLabel, DEFAULT_FY_START_MONTH } from "./period";

export { periodLabel, fyLabel } from "./period";

/** Shown for missing values. */
export const EMPTY_VALUE = "—";

const formatters = (min: number, max: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: min, maximumFractionDigits: max });

/** Like Intl.NumberFormat, but a value that rounds to zero never prints as "-0". */
const nf = (min: number, max: number) => {
  const f = formatters(min, max);
  return { format: (n: number) => f.format(n).replace(/^-(?=[0.,]*$)/, "") };
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Plain number with thousands separators. */
export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (!isNum(value)) return EMPTY_VALUE;
  return nf(decimals, decimals).format(value);
}

export type FormattedFigure = { value: string; unit: string };

/** #209: every tCO₂e figure is calculated, stored and shown to 3 decimals. */
export const TONNES_DP = 3;

/** A tCO₂e figure as the server stores it: "1,234.567", "0.050", "-12.000" (no unit). */
export function formatTonnes(tonnes: number | null | undefined): string {
  return isNum(tonnes) ? nf(TONNES_DP, TONNES_DP).format(tonnes) : EMPTY_VALUE;
}

/** A signed change in tCO₂e: "+600.000 tCO₂e", "−12.500 tCO₂e", "0.000 tCO₂e". */
export function formatTonnesChange(tonnes: number | null | undefined): string {
  if (!isNum(tonnes)) return EMPTY_VALUE;
  const body = formatTonnes(Math.abs(tonnes));
  const sign = /[1-9]/.test(body) ? (tonnes > 0 ? "+" : tonnes < 0 ? "−" : "") : "";
  return `${sign}${body} tCO₂e`;
}

/**
 * Emissions given in tonnes CO₂e, split into value and unit so the unit can be
 * set in smaller type. Always tCO₂e, never converted to kg, always 3 decimals
 * (#209): "1,234.567", "12.500", "0.042".
 */
export function emissionsParts(tonnes: number | null | undefined): FormattedFigure {
  if (!isNum(tonnes)) return { value: EMPTY_VALUE, unit: "tCO₂e" };
  return { value: formatTonnes(tonnes), unit: "tCO₂e" };
}

/** "1,234.567 tCO₂e", "12.500 tCO₂e", "0.420 tCO₂e". */
export function formatEmissions(tonnes: number | null | undefined): string {
  const { value, unit } = emissionsParts(tonnes);
  return value === EMPTY_VALUE ? value : `${value} ${unit}`;
}

/**
 * One entry's tCO₂e as the server stores it, 3 decimals (#209): "4.022", "4.000", "0.071" — the
 * figure Add data shows before saving. Lists of single entries (Add data, My entries, Approvals) use
 * it so one entry reads the same everywhere (F-12, F-17). Same digits as `formatTonnes`.
 */
export function formatEntryTonnes(tonnes: number | null | undefined): string {
  return formatTonnes(tonnes);
}

/** `formatEntryTonnes` with its unit: "4.022 tCO₂e". */
export function formatEntryEmissions(tonnes: number | null | undefined): string {
  const value = formatEntryTonnes(tonnes);
  return value === EMPTY_VALUE ? value : `${value} tCO₂e`;
}

/** An entry's quantity: whole numbers without decimals, else 2: "286,520", "1.50" (F-17). */
export function formatQuantity(quantity: number | null | undefined): string {
  if (!isNum(quantity)) return EMPTY_VALUE;
  return formatNumber(quantity, Number.isInteger(Math.round(quantity * 100) / 100) ? 0 : 2);
}

/** Intensity, always 1 decimal: "12.3 tCO₂e/t". */
export function formatIntensity(value: number | null | undefined, unit = "tCO₂e/t"): string {
  if (!isNum(value)) return EMPTY_VALUE;
  return `${nf(1, 1).format(value)} ${unit}`;
}

export function formatPercent(value: number | null | undefined, decimals = 1): string {
  if (!isNum(value)) return EMPTY_VALUE;
  return `${nf(decimals, decimals).format(value)}%`;
}

export type DeltaTone = "good" | "bad" | "neutral";

export type Delta = {
  /** "▼ 4.8%", "▲ 2.0%" or "0.0%" */
  text: string;
  pct: number;
  direction: "up" | "down" | "flat";
  tone: DeltaTone;
};

/**
 * Change from `previous` to `current`. The arrow always carries the direction,
 * so colour is never the only signal. For emissions lower is better.
 * Returns null when there is no usable baseline (missing or zero).
 */
export function formatDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
  { lowerIsBetter = true, decimals = 1 }: { lowerIsBetter?: boolean; decimals?: number } = {},
): Delta | null {
  if (!isNum(current) || !isNum(previous) || previous === 0) return null;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const rounded = Number(pct.toFixed(decimals));
  if (rounded === 0) return { text: `${nf(decimals, decimals).format(0)}%`, pct, direction: "flat", tone: "neutral" };
  const direction = rounded > 0 ? "up" : "down";
  const better = lowerIsBetter ? direction === "down" : direction === "up";
  // A fall that rounds to 100% while something is left reads as "> 99.9%", never as zero (F-20).
  const nearlyAll = direction === "down" && Math.abs(rounded) >= 100 && current !== 0;
  const step = 10 ** -decimals;
  const amount = nearlyAll ? `>${nf(decimals, decimals).format(100 - step)}` : nf(decimals, decimals).format(Math.abs(rounded));
  return {
    text: `${direction === "up" ? "▲" : "▼"} ${amount}%`,
    pct,
    direction,
    tone: better ? "good" : "bad",
  };
}

type DateInput = Date | string | null | undefined;

function toDate(value: DateInput): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  // Bare dates and months are read as local calendar dates, not UTC midnight.
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(value);
  if (m) {
    const [year, month, day] = [Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : 1];
    const d = new Date(year, month, day);
    // Reject dates the calendar doesn't have (2025-02-30 would roll over to 2 Mar).
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day ? d : null;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "Sep 2025" from a Date, "2025-09" or "2025-09-14". */
export function formatMonth(value: DateInput): string {
  const d = toDate(value);
  return d ? `${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}` : EMPTY_VALUE;
}

/** "14 Sep 2025". */
export function formatDate(value: DateInput): string {
  const d = toDate(value);
  return d ? `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}` : EMPTY_VALUE;
}

/** "14 Sep 2025, 09:05". */
export function formatDateTime(value: DateInput): string {
  const d = toDate(value);
  if (!d) return EMPTY_VALUE;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatDate(d)}, ${hh}:${mm}`;
}

/**
 * A reporting year label that respects `year_type`: "CY 2025" or "FY 2025-26".
 * For FY, `year` is the FY start year (as in data entry).
 */
export function formatReportingYear(
  year: number,
  yearType: "CY" | "FY",
  fyStartMonth = DEFAULT_FY_START_MONTH,
): string {
  return yearType === "CY" ? `CY ${year}` : fyLabel(year, fyStartMonth);
}
