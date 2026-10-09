import { canConvert, getConversionFactor, unitsMatchExact } from "../utils/unitConversions";

// Unit rules for features (they import from src/ui, never from src/utils).
export { canConvert, getConversionFactor, unitsMatchExact };

export type UnitMatch =
  | { state: "ok" }
  | { state: "convertible"; factor: number }
  | { state: "mismatch" };

/**
 * How the chosen unit relates to the unit the emission factor expects
 * (same rules as UserDataEntry's UnitSelector, via utils/unitConversions).
 */
export function matchUnit(unit: string | null | undefined, expected: string | null | undefined): UnitMatch {
  if (!expected || !unit || unitsMatchExact(expected, unit)) return { state: "ok" };
  const factor = canConvert(unit, expected) ? getConversionFactor(unit, expected) : null;
  return factor ? { state: "convertible", factor } : { state: "mismatch" };
}
