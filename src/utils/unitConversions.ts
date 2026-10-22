// Unit conversion mappings
export const unitConversions: Record<string, Record<string, number>> = {
  // Volume
  litre: { gallon: 0.264172, ml: 1000, "cubic meter": 0.001, "kilo litre": 0.001, kl: 0.001 },
  kl: { litre: 1000, gallon: 264.172, ml: 1000000, "cubic meter": 1 },
  "kilo litre": { litre: 1000, gallon: 264.172, ml: 1000000, "cubic meter": 1 },
  gallon: { litre: 3.78541, ml: 3785.41, "cubic meter": 0.00378541, kl: 0.00378541 },
  // ml → cubic meter, g → tonne, mj → mwh: the engine's one-way gaps, closed in ESG-lite #183 (mirrored here).
  ml: { litre: 0.001, gallon: 0.000264172, kl: 0.000001, "cubic meter": 0.000001 },
  "cubic meter": { litre: 1000, gallon: 264.172, kl: 1 },
  // Weight
  kg: { lb: 2.20462, tonne: 0.001, g: 1000, ton: 0.001, tonnes : 0.001 },
  lb: { kg: 0.453592, tonne: 0.000453592, g: 453.592, tonnes : 0.000453592, ton: 0.000453592 },
  // "ton" is the metric tonne (1,000 kg), as DEFRA and the factor library use it, not the US short ton.
  ton: { kg: 1000, lb: 2204.62, g: 1000000, tonne: 1, tonnes: 1 },
  tonne: { kg: 1000, lb: 2204.62, g: 1000000 , tonnes : 1, ton: 1 },
  g: { kg: 0.001, lb: 0.00220462, tonne: 0.000001 },
  Tonnes: { kg: 1000, lb: 2204.62, g: 1000000, tonne : 1 },
  tonnes: { kg: 1000, lb: 2204.62, g: 1000000, tonne: 1, ton: 1 }, 
  // Energy
  kwh: { mwh: 0.001, gj: 0.0036, mj: 3.6 },
  mwh: { kwh: 1000, gj: 3.6, mj: 3600 },
  gj: { kwh: 277.778, mwh: 0.277778, mj: 1000 },
  mj: { kwh: 0.277778, gj: 0.001, mwh: 0.000277778 },
  // Currency
  inr: { usd: 0.012 },
  usd: { inr: 83.5, eur: 0.92 },
  eur: { usd: 1.09 },
  // Distance
  m: { km: 0.001, mile: 0.000621371 },
  km: { m: 1000, mile: 0.621371 },
  mile: { km: 1.60934, m: 1609.34 },
  mi: { km: 1.60934, m: 1609.34, mile: 1 },
  miles: { km: 1.60934, m: 1609.34, mile: 1 },
  meter: { km: 0.001, mile: 0.000621371, m: 1 },
  meters: { km: 0.001, mile: 0.000621371, m: 1 },
  metre: { km: 0.001, mile: 0.000621371, m: 1 },
  metres: { km: 0.001, mile: 0.000621371, m: 1 },
  kilometer: { m: 1000, mile: 0.621371, km: 1 },
  kilometers: { m: 1000, mile: 0.621371, km: 1 },
  kilometre: { m: 1000, mile: 0.621371, km: 1 },
  kilometres: { m: 1000, mile: 0.621371, km: 1 },

  "tonne.km": { "kg.km": 1000, "g.km": 1000000 },
"kg.km": { "tonne.km": 0.001, "g.km": 1000 },
"g.km": { "tonne.km": 0.000001, "kg.km": 0.001},
};

/**
 * Other spellings of the same unit, copied from ESG-lite `src/services/emissionWrite/units.ts`
 * (#183): the server reads them as the canonical unit, so the preview must too, or a row the
 * server accepts ("litre" for an SCM factor, "kg" for an MT one) would be blocked here.
 */
export const UNIT_ALIASES: Record<string, string> = {
  mt: "tonne",
  "m.t.": "tonne",
  "metric ton": "tonne",
  "metric tons": "tonne",
  "metric tonne": "tonne",
  "metric tonnes": "tonne",
  scm: "cubic meter",
  sm3: "cubic meter",
  "sm³": "cubic meter",
  m3: "cubic meter",
  "m³": "cubic meter",
  "cubic metre": "cubic meter",
  "cubic meters": "cubic meter",
  "cubic metres": "cubic meter",
  ltr: "litre",
  ltrs: "litre",
  lt: "litre",
  lts: "litre",
  l: "litre",
  litres: "litre",
  liter: "litre",
  liters: "litre",
  kgs: "kg",
  kilogram: "kg",
  kilograms: "kg",
  // A kilolitre written out (#183): converts exactly as KL already did; saved "Kilo Litre" rows now match a KL form.
  "kilo litre": "kl",
  "kilo litres": "kl",
  "kilo liter": "kl",
  "kilo liters": "kl",
  kilolitre: "kl",
  kilolitres: "kl",
  kiloliter: "kl",
  kiloliters: "kl",
  // Distance spellings (#183).
  kms: "km",
  kilometre: "km",
  kilometres: "km",
  kilometer: "km",
  kilometers: "km",
  mi: "mile",
  miles: "mile",
  metre: "m",
  metres: "m",
  meter: "m",
  meters: "m",
};

/** The unit as the engine reads it: lower-cased, trimmed, aliases folded ("Ltr" → litre, "MT" → tonne). */
export const canonicalUnit = (unit: string | null | undefined): string => {
  const u = (unit ?? "").toLowerCase().trim();
  return UNIT_ALIASES[u] ?? u;
};

export const canConvert = (fromUnit: string, toUnit: string): boolean => {
  const from = canonicalUnit(fromUnit);
  const to = canonicalUnit(toUnit);
  if (from && from === to) return true;
  return unitConversions[from]?.[to] !== undefined;
};

export const getConversionFactor = (fromUnit: string, toUnit: string): number | null => {
  const from = canonicalUnit(fromUnit);
  const to = canonicalUnit(toUnit);
  if (from && from === to) return 1;
  return unitConversions[from]?.[to] || null;
};

export const unitsMatchExact = (unit1: string, unit2: string): boolean => {
  if (!unit1 || !unit2) return true;
  return canonicalUnit(unit1) === canonicalUnit(unit2);
};
