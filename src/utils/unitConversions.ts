// Unit conversion mappings
export const unitConversions: Record<string, Record<string, number>> = {
  // Volume
  litre: { gallon: 0.264172, ml: 1000, "cubic meter": 0.001 },
  gallon: { litre: 3.78541, ml: 3785.41, "cubic meter": 0.00378541 },
  ml: { litre: 0.001, gallon: 0.000264172 },
  "cubic meter": { litre: 1000, gallon: 264.172 },
  // Weight
  kg: { lb: 2.20462, tonne: 0.001, g: 1000 },
  lb: { kg: 0.453592, tonne: 0.000453592, g: 453.592 },
  tonne: { kg: 1000, lb: 2204.62, g: 1000000 },
  g: { kg: 0.001, lb: 0.00220462 },
  // Energy
  kwh: { mwh: 0.001, gj: 0.0036, mj: 3.6 },
  mwh: { kwh: 1000, gj: 3.6, mj: 3600 },
  gj: { kwh: 277.778, mwh: 0.277778, mj: 1000 },
  mj: { kwh: 0.277778, gj: 0.001 },
  // Currency
  inr: { usd: 0.012 },
  usd: { inr: 83.5 },
};

export const canConvert = (fromUnit: string, toUnit: string): boolean => {
  const from = fromUnit?.toLowerCase().trim();
  const to = toUnit?.toLowerCase().trim();
  return unitConversions[from]?.[to] !== undefined;
};

export const getConversionFactor = (fromUnit: string, toUnit: string): number | null => {
  const from = fromUnit?.toLowerCase().trim();
  const to = toUnit?.toLowerCase().trim();
  return unitConversions[from]?.[to] || null;
};

export const unitsMatchExact = (unit1: string, unit2: string): boolean => {
  if (!unit1 || !unit2) return true;
  return unit1.toLowerCase().trim() === unit2.toLowerCase().trim();
};
