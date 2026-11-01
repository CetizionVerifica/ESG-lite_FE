/**
 * KPI units (KPI-4 mirror, D10): the FE copy of ESG-lite
 * `src/kpi/values/units.ts`. Each KPI stores a canonical unit; a contributor
 * may type any allowed unit and sees the conversion as they type. Only units
 * of one family convert (tCO₂e never converts to tonnes of waste, INR never
 * to USD). This is a preview: the server converts and its number wins.
 */
import { TONNES_DP, formatNumber } from "../../ui/format";

export interface KpiUnit {
  /** The spelling shown. */
  label: string;
  family: string;
  /** Multiply by this to get the family's base unit. */
  toBase: number;
}

const u = (label: string, family: string, toBase: number): KpiUnit => ({ label, family, toBase });

/** Keyed by the normalised spelling (lower case, after ALIASES). Same table as the server's KPI_UNITS. */
export const KPI_UNITS: Record<string, KpiUnit> = {
  kwh: u("kWh", "energy", 1),
  mwh: u("MWh", "energy", 1_000),
  gwh: u("GWh", "energy", 1_000_000),
  mj: u("MJ", "energy", 1 / 3.6),
  gj: u("GJ", "energy", 1_000 / 3.6),
  tj: u("TJ", "energy", 1_000_000 / 3.6),
  g: u("g", "mass", 0.001),
  kg: u("kg", "mass", 1),
  tonne: u("t", "mass", 1_000),
  lb: u("lb", "mass", 0.45359237),
  kgco2e: u("kgCO₂e", "co2e", 1),
  tco2e: u("tCO₂e", "co2e", 1_000),
  ml: u("mL", "volume", 0.000001),
  litre: u("litres", "volume", 0.001),
  "cubic meter": u("m³", "volume", 1),
  kl: u("kL", "volume", 1),
  megalitre: u("ML", "volume", 1_000),
  gallon: u("gallon", "volume", 0.003785411784),
  count: u("count", "count", 1),
  days: u("days", "days", 1),
  "%": u("%", "percent", 1),
  fraction: u("fraction", "percent", 100),
  "per million hours": u("per million hours", "injury_rate", 1),
  "per 200000 hours": u("per 200000 hours", "injury_rate", 5),
  ratio: u("ratio", "times", 1),
  hours: u("hours", "time", 1),
  minutes: u("minutes", "time", 1 / 60),
  inr: u("INR", "INR", 1),
  "inr lakh": u("INR lakh", "INR", 100_000),
  "inr million": u("INR million", "INR", 1_000_000),
  "inr crore": u("INR crore", "INR", 10_000_000),
  usd: u("USD", "USD", 1),
  "usd million": u("USD million", "USD", 1_000_000),
  eur: u("EUR", "EUR", 1),
  "eur million": u("EUR million", "EUR", 1_000_000),
};

/** Spellings people and the library use (the server reads these through the emission engine's aliases plus its own). */
const ALIASES: Record<string, string> = {
  t: "tonne",
  ton: "tonne",
  tons: "tonne",
  tonnes: "tonne",
  mt: "tonne",
  "m³": "cubic meter",
  m3: "cubic meter",
  "cubic metre": "cubic meter",
  "cubic metres": "cubic meter",
  "cubic meters": "cubic meter",
  l: "litre",
  litres: "litre",
  liter: "litre",
  liters: "litre",
  ltr: "litre",
  "kilo litre": "kl",
  kilolitre: "kl",
  kilolitres: "kl",
  kiloliter: "kl",
  kiloliters: "kl",
  megalitres: "megalitre",
  megaliter: "megalitre",
  megaliters: "megalitre",
  "mega litre": "megalitre",
  millilitre: "ml",
  "tco₂e": "tco2e",
  "kgco₂e": "kgco2e",
  "t co2e": "tco2e",
  "tonnes co2e": "tco2e",
  "kg co2e": "kgco2e",
  percent: "%",
  pct: "%",
  "#": "count",
  number: "count",
  nos: "count",
  people: "count",
  persons: "count",
  day: "days",
  hour: "hours",
  hrs: "hours",
  hr: "hours",
  h: "hours",
  minute: "minutes",
  min: "minutes",
  mins: "minutes",
  "₹": "inr",
  rs: "inr",
  "rs lakh": "inr lakh",
  "rs crore": "inr crore",
  times: "ratio",
};

/** The registry key of a unit, or null when unknown. "ML" (megalitre) is read before lower-casing: "ml" is millilitre. */
export function normaliseUnit(unit: string | null | undefined): string | null {
  const raw = (unit ?? "").trim();
  if (!raw) return null;
  if (raw === "ML" || raw === "Ml") return "megalitre";
  const lower = raw.toLowerCase().replace(/\s+/g, " ");
  const key = ALIASES[lower] ?? lower;
  return KPI_UNITS[key] ? key : null;
}

export const unitInfo = (unit: string | null | undefined): KpiUnit | null => {
  const key = normaliseUnit(unit);
  return key ? KPI_UNITS[key] : null;
};

/** Factor from `from` to `to` (same family only), else null. */
export function conversionFactor(from: string, to: string): number | null {
  const a = unitInfo(from);
  const b = unitInfo(to);
  if (!a || !b || a.family !== b.family) return null;
  return a.toBase / b.toBase;
}

/** Rounds away binary noise (12 significant digits, as the server). */
const tidy = (n: number) => Number(n.toPrecision(12));

export function convertUnit(value: number, from: string, to: string): number | null {
  const f = conversionFactor(from, to);
  return f === null ? null : tidy(value * f);
}

export const sameUnit = (a: string | null | undefined, b: string | null | undefined): boolean => {
  if (!a || !b) return false;
  const ka = normaliseUnit(a);
  return ka !== null ? ka === normaliseUnit(b) : a.trim().toLowerCase() === b.trim().toLowerCase();
};

/** Decimals that keep a figure readable: none from 100 up, else the places it has (up to 2, or 3 below 1). */
export function displayDecimals(value: number): number {
  const abs = Math.abs(value);
  if (abs === 0 || abs >= 100) return 0;
  const text = String(Number(abs.toFixed(3)));
  const places = text.includes(".") ? text.length - text.indexOf(".") - 1 : 0;
  return Math.min(places, abs >= 1 ? 2 : 3);
}

/**
 * #209: whether a unit is tonnes of CO₂e ("tCO₂e", "tCO2e", "t CO2e", "tonnes CO2e"), read through the
 * registry above. kgCO₂e, other masses and intensities ("tCO₂e / M USD") are not.
 */
export const isTonnesCo2e = (unit: string | null | undefined): boolean => normaliseUnit(unit) === "tco2e";

/**
 * Decimals a figure in `unit` shows. A tCO₂e figure always shows `TONNES_DP` (3), as every emission
 * figure in the app does (#209), whatever the KPI's own `decimals` say. Any other unit keeps `decimals`
 * when given, else the size rule (`displayDecimals`).
 */
export function figureDecimals(value: number, unit: string | null | undefined, decimals?: number): number {
  if (isTonnesCo2e(unit)) return TONNES_DP;
  return decimals ?? displayDecimals(value);
}

/** Decimals for a column of figures in `unit` (chart table views): `TONNES_DP` for tCO₂e (#209), else `fallback`. */
export const columnDecimals = (unit: string | null | undefined, fallback: number): number => (isTonnesCo2e(unit) ? TONNES_DP : fallback);

/**
 * "1,200 m³": a value with its unit in the locale format; decimals follow the size unless given.
 * A tCO₂e figure always has 3 decimals ("4,650.200 tCO₂e", #209).
 */
export function formatWithUnit(value: number | null | undefined, unit: string | null | undefined, decimals?: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const text = formatNumber(value, figureDecimals(value, unit, decimals));
  return unit ? `${text} ${unit}` : text;
}

/** Another unit of the same family to show beside the canonical one (05-ux: "1,200 m³ = 1.2 ML"). */
const COMPANION: Record<string, string> = { "cubic meter": "megalitre", mwh: "gj", gj: "mwh", kwh: "mwh", tonne: "kg", kg: "tonne", kl: "megalitre", litre: "cubic meter" };

/**
 * The live conversion line under the entry input. In the canonical unit it
 * shows a companion ("1,200 m³ = 1.2 ML"); in another unit it shows the
 * canonical figure the server will store ("1,200 kL = 1,200 m³"). Null when
 * there's nothing to say.
 */
export function conversionLine(value: number | null, unit: string | null, canonicalUnit: string | null): string | null {
  if (value === null || !unit || !canonicalUnit) return null;
  if (sameUnit(unit, canonicalUnit)) {
    const key = normaliseUnit(unit);
    const other = key ? COMPANION[key] : undefined;
    if (!other) return null;
    const converted = convertUnit(value, unit, KPI_UNITS[other].label);
    if (converted === null) return null;
    return `${formatWithUnit(value, unit)} = ${formatWithUnit(converted, KPI_UNITS[other].label)}`;
  }
  const canonical = convertUnit(value, unit, canonicalUnit);
  if (canonical === null) return null;
  return `${formatWithUnit(value, unit)} = ${formatWithUnit(canonical, canonicalUnit)}`;
}

/** The value in the canonical unit, for comparisons (last year, breakdown sums). Null when it can't convert. */
export function toCanonicalPreview(value: number | null, unit: string | null, canonicalUnit: string | null): number | null {
  if (value === null) return null;
  if (!unit || !canonicalUnit || sameUnit(unit, canonicalUnit)) return value;
  return convertUnit(value, unit, canonicalUnit);
}

/** Units a custom KPI can be measured in, grouped as the server allows (same family as the canonical unit). */
export function familyUnits(canonicalUnit: string): string[] {
  const info = unitInfo(canonicalUnit);
  if (!info) return [canonicalUnit];
  const labels = Object.values(KPI_UNITS)
    .filter((x) => x.family === info.family)
    .map((x) => x.label);
  return [info.label, ...labels.filter((l) => l !== info.label)];
}
