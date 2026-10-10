// Emission calculation for Add data, as pure functions.
//
// Moved unchanged from pages/UserDataEntry/useEmissionCalculation.ts; the
// golden snapshots in emissionCalc.golden.test.ts pin the outputs. Mirrors the
// backend (services/calculationSpec.ts) so the preview matches the saved total.
import { getConversionFactor, unitsMatchExact } from "../../ui/unitMatch";
import type {
  CalculationSpec,
  ColumnEntity,
  EmissionCalculationResult,
  EmissionFactor,
  MethodCalculation,
  ModalRow,
} from "./types";

// "tonne.km", "Tonne KM", "tonne-km", "tonne_km", "tkm" → "tonne.km"
// (mirrors backend services/calculationSpec.ts normalizeUnitKey)
export const normalizeUnitKey = (unit: unknown): string => {
  let u = String(unit ?? "").trim().toLowerCase().replace(/[\s_-]+/g, ".");
  if (u === "tkm" || u === "t.km" || u === "tonnes.km" || u === "tonne.kms") u = "tonne.km";
  if (u === "kms") u = "km";
  return u;
};

// Which of the spec's methods applies to this row — by dropdown value
// (per_method) or by the row's unit (per_unit). null = not decidable yet.
export const resolveSpecMethod = (
  spec: CalculationSpec,
  row: ModalRow,
): { method: MethodCalculation; key: string } | null => {
  if (spec.mode === "per_unit") {
    const key = normalizeUnitKey(row.activity_data_unit);
    const method = key ? spec.methods[key] : undefined;
    return method?.multiply?.length ? { method, key } : null;
  }
  // Trimmed to match services/calculationSpec.ts and the Python engine — all
  // three must agree on the key or the preview and the saved total disagree
  // for a value that arrived with surrounding whitespace.
  const value = spec.method_column ? String(row[spec.method_column] ?? "").trim() : "";
  if (!value) return null;
  const method = spec.methods[value];
  return method?.multiply?.length ? { method, key: value } : null;
};

// Every numeric column any method of the spec can use (to show them before a
// method/unit is chosen).
export const specNumericColumns = (spec: CalculationSpec): Set<string> => {
  const all = new Set<string>();
  Object.values(spec.methods).forEach((m) => m.multiply?.forEach((f) => all.add(f)));
  return all;
};

export interface EmissionCalcInput {
  emissionFactors: EmissionFactor[];
  // Factor year: the reporting year minus one (see factorYearForDate).
  // undefined = any year.
  targetYear?: number;
  columns?: ColumnEntity[];
  selectColumnNames?: string[];
  // Use the raw activity value when no unit conversion exists (FERA factors
  // already account for the fuel's energy content).
  fallbackToRaw?: boolean;
  calculationSpec?: CalculationSpec | null;
}

// Find the factor for an emission category in the target year: by
// emission_category_name, then global_category_name, then a trim +
// case-insensitive match. This follows the backend's save-time matcher
// (findEmissionFactorForCategory in ESG-lite src/utils/findEmissionFactor.ts),
// which never looks up the client's own category name, so neither does the
// preview: a factor named that way would show a figure the entry never gets.
export const findEmissionFactor = (
  { emissionFactors, targetYear }: EmissionCalcInput,
  emissionCategory: string,
): EmissionFactor | undefined => {
  // No category yet (dropdowns not all chosen): there is nothing to match.
  // Without this guard the normalized fallback matched "" against factors
  // whose global_category_name is empty and reported a random factor's unit.
  if (!emissionCategory || !emissionCategory.trim()) return undefined;

  const yearMatch = (f: EmissionFactor) => targetYear === undefined || f.year === targetYear;

  const byName = emissionFactors.find((f) => f.emission_category_name === emissionCategory && yearMatch(f));
  if (byName) return byName;

  const byGlobal = emissionFactors.find((f) => f.global_category_name === emissionCategory && yearMatch(f));
  if (byGlobal) return byGlobal;

  // Normalized match guards against whitespace/casing drift between factor
  // names and the submitted value.
  const target = emissionCategory.trim().toLowerCase();
  const norm = (s?: string) => (s ?? "").trim().toLowerCase();
  return (
    emissionFactors.find((f) => norm(f.emission_category_name) === target && yearMatch(f)) ||
    emissionFactors.find((f) => norm(f.global_category_name) === target && yearMatch(f))
  );
};

export const expectedUnitFor = (input: EmissionCalcInput, emissionCategory: string): string | null =>
  findEmissionFactor(input, emissionCategory)?.denominator_unit || null;

// A row's own bookkeeping fields: a saved row carries its date, ids and
// totals, which must never be mistaken for the activity value
// ("2026-03-31" parses as 2026).
const BOOKKEEPING_FIELDS = [
  "id", "emission_category", "activity_data_unit", "date_of_reporting",
  "pk_id", "total_emission", "site_id", "category_id", "created_by",
  "reviewed_by", "fera_linked_id", "reporting_period", "year_type",
  "activity_value",
];

// The first positive number in a non-select, non-bookkeeping field (for
// categories without a calculation spec).
export const findActivityValue = (
  { columns, selectColumnNames }: EmissionCalcInput,
  row: ModalRow,
): number | null => {
  const skipColumns = new Set<string>(BOOKKEEPING_FIELDS);
  selectColumnNames?.forEach((name) => skipColumns.add(name));
  columns?.forEach((col) => {
    if (col.column_type === "select") skipColumns.add(col.column_name);
  });

  for (const [key, value] of Object.entries(row)) {
    // Composite-unit helper fields (quantity__multiplier, quantity__distance)
    // and private row state (_ocrUnit, _extra_data …) are never the activity.
    if (key.endsWith("__multiplier") || key.endsWith("__distance")) continue;
    if (key.startsWith("_")) continue;
    if (!skipColumns.has(key)) {
      const numVal = parseFloat(value as string);
      if (!isNaN(numVal) && numVal > 0) return numVal;
    }
  }
  return null;
};

// Activity value for a spec category: the PRODUCT of the chosen method's
// fields (percent fields divided by 100). Returns a status message instead
// when the row isn't complete.
const specActivityValue = (spec: CalculationSpec, row: ModalRow): number | { status: string } => {
  const resolved = resolveSpecMethod(spec, row);
  if (!resolved) {
    return {
      status:
        spec.mode === "per_unit"
          ? row.activity_data_unit
            ? "This unit is not configured for this category"
            : "Select unit"
          : `Select ${spec.method_column ?? "method"}`,
    };
  }
  const { method } = resolved;
  // Legacy rows (saved before the spec) hold the product in legacy_field and
  // don't carry the other fields at all.
  const legacy = spec.legacy_field;
  const others = legacy ? method.multiply.filter((f) => f !== legacy) : [];
  if (legacy && method.multiply.includes(legacy) && others.length > 0 && others.every((f) => !(f in row))) {
    const legacyValue = parseFloat(String(row[legacy] ?? ""));
    if (isNaN(legacyValue) || legacyValue <= 0) return { status: `Enter ${legacy}` };
    return legacyValue;
  }
  let product = 1;
  for (const fieldName of method.multiply) {
    const value = parseFloat(String(row[fieldName] ?? "").replace(/,/g, ""));
    if (isNaN(value) || value <= 0) return { status: `Enter ${fieldName} (a number greater than 0)` };
    if (method.percent?.includes(fieldName)) {
      if (value > 100) return { status: `${fieldName} cannot be more than 100` };
      product *= value / 100;
    } else {
      product *= value;
    }
  }
  return product;
};

// tCO₂e rounded to 2 decimals (factor_value is kg per unit).
const toTonnes = (activity: number, factorValue: number) => Math.round(((activity * factorValue) / 1000) * 100) / 100;

export const calculateEmission = (input: EmissionCalcInput, row: ModalRow): EmissionCalculationResult => {
  if (!row.emission_category) return { value: null, status: "Select emission category" };

  const factor = findEmissionFactor(input, row.emission_category);
  if (!factor) {
    const yearMsg = input.targetYear !== undefined ? ` for year ${input.targetYear}` : "";
    return { value: null, status: `No emission factor found${yearMsg}` };
  }

  let activityValue: number | null;
  if (input.calculationSpec) {
    const fromSpec = specActivityValue(input.calculationSpec, row);
    if (typeof fromSpec !== "number") return { value: null, status: fromSpec.status };
    activityValue = fromSpec;
  } else {
    activityValue = findActivityValue(input, row);
  }
  if (activityValue === null) return { value: null, status: "Enter activity data" };

  if (!row.activity_data_unit) return { value: null, status: "Select unit" };

  const expectedUnit = factor.denominator_unit;
  const currentUnit = row.activity_data_unit;
  if (unitsMatchExact(expectedUnit, currentUnit)) {
    return { value: toTonnes(activityValue, factor.factor_value), status: "ok" };
  }

  const conversionFactor = getConversionFactor(currentUnit, expectedUnit);
  if (conversionFactor) {
    return { value: toTonnes(activityValue * conversionFactor, factor.factor_value), status: "converted" };
  }

  if (input.fallbackToRaw) {
    return { value: toTonnes(activityValue, factor.factor_value), status: "ok" };
  }

  // Say WHY when the factor itself names its unit in brackets (transport's
  // "[km]" / "[tonne.km]" twins) — the fix is a different option or unit.
  const bracket = row.emission_category.match(/\[([^\]]+)\]/)?.[1];
  if (bracket) {
    return {
      value: null,
      status: `Unit mismatch - this option is per ${bracket}; choose the [${currentUnit}] option or switch the unit to ${bracket}`,
    };
  }
  return { value: null, status: "Unit mismatch - no conversion available" };
};

// One calculator bound to a context (site × category × period).
export const createEmissionCalculator = (input: EmissionCalcInput) => ({
  getExpectedUnit: (emissionCategory: string) => expectedUnitFor(input, emissionCategory),
  getEmissionFactor: (emissionCategory: string) => findEmissionFactor(input, emissionCategory),
  findActivityValue: (row: ModalRow) => findActivityValue(input, row),
  calculateEmission: (row: ModalRow) => calculateEmission(input, row),
});

export type EmissionCalculator = ReturnType<typeof createEmissionCalculator>;
