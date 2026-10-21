import { canConvert, getConversionFactor, unitsMatchExact } from "../utils/unitConversions";

// Unit rules for features (they import from src/ui, never from src/utils).
export { canConvert, getConversionFactor, unitsMatchExact };

export type UnitMatch =
  | { state: "ok" }
  | { state: "convertible"; factor: number }
  | { state: "mismatch" };

/** A unit the factor takes: its own, or one that converts to it. */
export const unitFitsFactor = (factorUnit: string, unit: string): boolean => unitsMatchExact(factorUnit, unit) || canConvert(unit, factorUnit);

/**
 * The Unit select's options. With the factor's unit known, only that unit and the ones that convert
 * to it (a User never sees kg for electricity); else `first` (when given), then every unit. `current`
 * stays listed so the select still shows it. No repeats, ignoring case.
 */
export function unitChoices(units: readonly string[], factorUnit: string | null, current?: string | null, first?: string | null): string[] {
  const offered = factorUnit ? [factorUnit, ...units.filter((u) => unitFitsFactor(factorUnit, u))] : [...(first ? [first] : []), ...units];
  const seen = new Set<string>();
  return [...offered, ...(current ? [current] : [])].filter((u) => {
    const key = u.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * How the chosen unit relates to the unit the emission factor expects
 * (same rules as UserDataEntry's UnitSelector, via utils/unitConversions).
 */
export function matchUnit(unit: string | null | undefined, expected: string | null | undefined): UnitMatch {
  if (!expected || !unit || unitsMatchExact(expected, unit)) return { state: "ok" };
  const factor = canConvert(unit, expected) ? getConversionFactor(unit, expected) : null;
  return factor ? { state: "convertible", factor } : { state: "mismatch" };
}
