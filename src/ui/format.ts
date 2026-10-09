/**
 * The one place figures, deltas and dates are turned into text.
 * Spec: src/ui/CLAUDE.md "Number formatting".
 */
import { MONTH_SHORT, fyLabel, DEFAULT_FY_START_MONTH } from "./period";

export { periodLabel, fyLabel } from "./period";

/** Shown for missing values. */
export const EMPTY_VALUE = "—";

const nf = (min: number, max: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: min, maximumFractionDigits: max });

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Plain number with thousands separators. */
export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (!isNum(value)) return EMPTY_VALUE;
  return nf(decimals, decimals).format(value);
}

export type FormattedFigure = { value: string; unit: string };

/**
 * Emissions given in tonnes CO₂e, split into value and unit so the unit can be
 * set in smaller type. ≥ 1,000 t: no decimals; 1–1,000 t: 1 decimal;
 * below 1 t: switches to kgCO₂e with no decimals.
 */
export function emissionsParts(tonnes: number | null | undefined): FormattedFigure {
  if (!isNum(tonnes)) return { value: EMPTY_VALUE, unit: "tCO₂e" };
  const abs = Math.abs(tonnes);
  if (abs > 0 && abs < 1) return { value: nf(0, 0).format(tonnes * 1000), unit: "kgCO₂e" };
  return { value: abs >= 1000 ? nf(0, 0).format(tonnes) : nf(0, 1).format(tonnes), unit: "tCO₂e" };
}

/** "1,234 tCO₂e", "12.5 tCO₂e", "420 kgCO₂e". */
export function formatEmissions(tonnes: number | null | undefined): string {
  const { value, unit } = emissionsParts(tonnes);
  return value === EMPTY_VALUE ? value : `${value} ${unit}`;
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
  return {
    text: `${direction === "up" ? "▲" : "▼"} ${nf(decimals, decimals).format(Math.abs(rounded))}%`,
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
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, m[3] ? Number(m[3]) : 1);
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
