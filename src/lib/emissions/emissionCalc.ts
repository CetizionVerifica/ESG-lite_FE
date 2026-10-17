// Emission calculation for Add data, as pure functions.
//
// Moved unchanged from pages/UserDataEntry/useEmissionCalculation.ts; the
// golden snapshots in emissionCalc.golden.test.ts pin the outputs. Mirrors the
// backend (services/calculationSpec.ts) so the preview matches the saved total.
import { getConversionFactor, unitsMatchExact } from "../../ui/unitMatch";
import type { SpendRate } from "../../services/fxRateService";
import { isSpendRow, spendInputOf, spendOutcome } from "../scope3/spend";
import type {
  CalculationSpec,
  ColumnEntity,
  EmissionCalculationResult,
  EmissionFactor,
  MethodCalculation,
  ModalRow,
} from "./types";

// "tonne.km", "Tonne KM", "tonne-km", "tonne_km", "tkm" → "tonne.km"
// S3-8: "m³.day", "m3 day" → "m3.day"; "pallet day", "teu day"; "kWh" → "kwh"; "litres" → "litre"
// (mirrors backend services/calculationSpec.ts normalizeUnitKey)
export const normalizeUnitKey = (unit: unknown): string => {
  let u = String(unit ?? "").trim().toLowerCase().replace(/[\s_-]+/g, ".").replace(/³/g, "3");
  if (u === "tkm" || u === "t.km" || u === "tonnes.km" || u === "tonne.kms") u = "tonne.km";
  if (u === "kms") u = "km";
  if (u === "litres" || u === "liters" || u === "liter") u = "litre";
  if (u === "pallets.day") u = "pallet.day";
  return u;
};

/**
 * `method_column` value meaning "the row's calculation method picks the
 * fields" (S3-9; backend calculationSpec.ts ROW_METHOD_COLUMN). Until rows
 * carry a `method` (S3-3) the method is stored in `row["@method"]`, which the
 * add-data method picker writes, so the lookup below needs no special case.
 */
export const ROW_METHOD_COLUMN = "@method";

// Which of the spec's methods applies to this row — by dropdown value
// (per_method, or the row's method with "@method") or by the row's unit
// (per_unit). null = not decidable yet.
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
  Object.values(spec.methods).forEach((m) => [...(m.multiply ?? []), ...(m.divide ?? [])].forEach((f) => all.add(f)));
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
  // S3-5: rates for spend rows (useSpendRates), the rate keys whose lookup
  // failed, and the date rows are filed on (the purchase date when a row has
  // no invoice date; in a yearly period always that date, never the row's own).
  spendRates?: ReadonlyMap<string, SpendRate>;
  spendRateErrors?: ReadonlySet<string>;
  reportingDate?: string | null;
  reportingPeriod?: "monthly" | "yearly";
}

// Find the factor for an emission category, in the backend's save-time order
// (findEmissionFactorForCategory in ESG-lite src/utils/findEmissionFactor.ts):
//   1. exact emission_category_name in the target year
//   2. exact global_category_name in the target year
//   3. exact emission_category_name, any year (newest first)
//   4. exact global_category_name, any year (newest first)
//   5. trim + case-insensitive match on either name: the target year, else
//      the newest
// The backend never looks up the client's own category name, so neither
// does the preview: a factor named that way would show a figure the entry
// never gets. Without a target year, every year counts for steps 1-2.
export const findEmissionFactor = (
  { emissionFactors, targetYear }: EmissionCalcInput,
  emissionCategory: string,
): EmissionFactor | undefined => {
  // No category yet (dropdowns not all chosen): there is nothing to match.
  // Without this guard the normalized fallback matched "" against factors
  // whose global_category_name is empty and reported a random factor's unit.
  if (!emissionCategory || !emissionCategory.trim()) return undefined;

  const yearMatch = (f: EmissionFactor) => targetYear === undefined || f.year === targetYear;
  const newest = (matches: EmissionFactor[]) =>
    matches.reduce<EmissionFactor | undefined>((best, f) => (!best || f.year > best.year ? f : best), undefined);

  const byName = (f: EmissionFactor) => f.emission_category_name === emissionCategory;
  const byGlobal = (f: EmissionFactor) => f.global_category_name === emissionCategory;
  const exact =
    emissionFactors.find((f) => byName(f) && yearMatch(f)) ||
    emissionFactors.find((f) => byGlobal(f) && yearMatch(f)) ||
    newest(emissionFactors.filter(byName)) ||
    newest(emissionFactors.filter(byGlobal));
  if (exact) return exact;

  // Normalized match guards against whitespace/casing drift between factor
  // names and the submitted value.
  const target = emissionCategory.trim().toLowerCase();
  const norm = (s?: string) => (s ?? "").trim().toLowerCase();
  const loose = emissionFactors.filter((f) => norm(f.emission_category_name) === target || norm(f.global_category_name) === target);
  return loose.find(yearMatch) ?? newest(loose);
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
  // S3-5 spend fields: the purchase date ("2026-09-03" parses as 2026) and the amount spent.
  "invoice_date", "spent_value",
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
// fields (percent fields divided by 100), divided by its `divide` fields. Returns a status message instead
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
          : spec.method_column === ROW_METHOD_COLUMN
            ? "Choose a calculation method"
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
  // divide (S3-9; first used by S3-11): occupancy, survey scaling and leased-space shares.
  for (const fieldName of method.divide ?? []) {
    const value = parseFloat(String(row[fieldName] ?? "").replace(/,/g, ""));
    if (isNaN(value) || value <= 0) return { status: `Enter ${fieldName} (a number greater than 0)` };
    if (method.percent?.includes(fieldName)) {
      if (value > 100) return { status: `${fieldName} cannot be more than 100` };
      product /= value / 100;
    } else {
      product /= value;
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

  // S3-5: a spend row is the amount × rate × deflator × factor (engine methods/spend.ts).
  if (isSpendRow(row, factor)) {
    const spend = spendRow(input, row);
    if (spend) return spend;
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
  // A per-unit spec compares the factor with the normalised unit key, as the
  // backend does (computeSpecActivityValue's unitKey): "m³.day" is "m3.day" (S3-8).
  const currentUnit = input.calculationSpec?.mode === "per_unit" ? normalizeUnitKey(row.activity_data_unit) : row.activity_data_unit;
  // A factor with no unit can't be checked against the quantity: the engine
  // refuses the row (UNIT_REQUIRED, S3-4), so the preview shows no total.
  if (!String(expectedUnit ?? "").trim()) {
    return { value: null, status: "This emission factor has no unit - ask an admin to set it" };
  }
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

export { SPEND_RATE_PENDING } from "../scope3/spend";

/** A spend row's inputs and outcome for the preview line, or null when the row isn't calculated from spend. */
export const spendDetail = (input: EmissionCalcInput, row: ModalRow) => {
  const factor = row.emission_category ? findEmissionFactor(input, row.emission_category) : undefined;
  if (!factor || !isSpendRow(row, factor)) return null;
  let quantity: number | null = null;
  if (input.calculationSpec) {
    const fromSpec = specActivityValue(input.calculationSpec, row);
    quantity = typeof fromSpec === "number" ? fromSpec : null;
  } else {
    quantity = findActivityValue(input, row);
  }
  const spend = spendInputOf(row, input.reportingDate ?? String(row.date_of_reporting ?? ""), quantity, input.reportingPeriod === "yearly");
  if (!spend) return null;
  return { factor, spend, outcome: spendOutcome(spend, factor, input.spendRates, input.spendRateErrors) };
};

/**
 * Whether Add data shows the spend form (Amount, Currency, Invoice date) for
 * a row instead of its quantity and unit: its factor or method is spend, its
 * method doesn't multiply fields into the amount (Category 15), and its amount
 * isn't a quantity already in a currency unit.
 */
export const usesSpendForm = (input: EmissionCalcInput, row: ModalRow): boolean => {
  const factor = row.emission_category ? findEmissionFactor(input, row.emission_category) : undefined;
  if (!isSpendRow(row, factor)) return false;
  if (input.calculationSpec && resolveSpecMethod(input.calculationSpec, row)) return false;
  return spendDetail(input, row)?.spend.amount_from !== "quantity";
};

// A spend row's result, or null when the row has no amount in a currency (then
// the factor decides as for any row, as the engine does).
const spendRow = (input: EmissionCalcInput, row: ModalRow): EmissionCalculationResult | null => {
  const detail = spendDetail(input, row);
  if (!detail) return null;
  const { outcome } = detail;
  return outcome.ok ? { value: outcome.tonnes, status: "ok" } : { value: null, status: outcome.status };
};

// One calculator bound to a context (site × category × period).
export const createEmissionCalculator = (input: EmissionCalcInput) => ({
  getExpectedUnit: (emissionCategory: string) => expectedUnitFor(input, emissionCategory),
  getEmissionFactor: (emissionCategory: string) => findEmissionFactor(input, emissionCategory),
  findActivityValue: (row: ModalRow) => findActivityValue(input, row),
  calculateEmission: (row: ModalRow) => calculateEmission(input, row),
  spendDetail: (row: ModalRow) => spendDetail(input, row),
  usesSpendForm: (row: ModalRow) => usesSpendForm(input, row),
});

export type EmissionCalculator = ReturnType<typeof createEmissionCalculator>;

// ---------------------------------------------------------------------------
// S3-6: supplier-specific and hybrid previews. Mirrors ESG-lite
// emissionWrite/methods/supplier.ts and hybrid.ts, the figure choice in
// src/scope3/suppliers/engineInput.ts and the allocation in allocate.ts, so
// the preview shows what the engine will save. Never sent to the server.
// ---------------------------------------------------------------------------

/** A supplier's own figure, as GET /suppliers/:id/factors returns it. */
export interface SupplierFigureInput {
  supplier_factor_id: number;
  item: string;
  unit: string;
  kgco2e_per_unit: number;
  reference_year: number;
}

export type FigurePick<F extends SupplierFigureInput> =
  | { ok: true; figure: F }
  | { ok: false; reason: "none_for_year" | "not_found" | "ambiguous" | "future_year" };

const fold = (s: unknown) => String(s ?? "").trim().toLowerCase();

/**
 * The figure a row uses: the chosen one (if the supplier's and not from after
 * the reporting year); else the newest up to the reporting year whose item
 * matches the activity; else the supplier's only item; else ambiguous.
 */
export function pickSupplierFigure<F extends SupplierFigureInput>(figures: F[], reportingYear: number, activityName: string | null | undefined, chosenId?: number | null): FigurePick<F> {
  if (chosenId) {
    const chosen = figures.find((f) => f.supplier_factor_id === chosenId);
    if (!chosen) return { ok: false, reason: "not_found" };
    return chosen.reference_year > reportingYear ? { ok: false, reason: "future_year" } : { ok: true, figure: chosen };
  }
  const usable = figures.filter((f) => f.reference_year <= reportingYear);
  if (!usable.length) return { ok: false, reason: figures.length ? "none_for_year" : "not_found" };
  const newest = (list: F[]) => [...list].sort((a, b) => b.reference_year - a.reference_year || b.supplier_factor_id - a.supplier_factor_id)[0];
  const byName = usable.filter((f) => fold(f.item) === fold(activityName));
  if (byName.length) return { ok: true, figure: newest(byName) };
  return new Set(usable.map((f) => fold(f.item))).size === 1 ? { ok: true, figure: newest(usable) } : { ok: false, reason: "ambiguous" };
}

export interface FacilityInput {
  supplier_facility_data_id: number;
  year: number;
  scope12_tco2e: number;
  output_qty: number;
  output_unit: string;
  allocation_key: "mass" | "economic";
}

/** The facility data a hybrid row allocates: the newest year up to the reporting year. */
export const pickFacility = <F extends FacilityInput>(facilities: F[], reportingYear: number): F | null =>
  [...facilities].filter((f) => f.year <= reportingYear).sort((a, b) => b.year - a.year || b.supplier_facility_data_id - a.supplier_facility_data_id)[0] ?? null;

/** The PCF allocation rule (ESG-lite src/scope3/suppliers/allocate.ts). */
export const allocationShare = (part: number, whole: number): number => part / whole;
export const allocatedKg = (totalTco2e: number, share: number): number => totalTco2e * 1000 * share;

/** `value` in `unit` in `target`: as is when the units match, converted when they can be, else null. */
export const toUnit = (value: number, unit: string, target: string): number | null => {
  if (unitsMatchExact(unit, target)) return value;
  const k = getConversionFactor(unit, target);
  return k ? value * k : null;
};

const round4 = (kg: number) => Math.round(kg * 10000) / 10000;

export interface SupplierCalcResult extends EmissionCalculationResult {
  /** kgCO₂e at 4 dp, as total_kgco2e will store it. */
  kg: number | null;
}

/** Supplier's own figure: the row's quantity in the figure's unit × the figure. */
export function supplierEmission(activityValue: number | null, unit: string | undefined, figure: SupplierFigureInput | null): SupplierCalcResult {
  if (!figure) return { value: null, kg: null, status: "No figure from this supplier yet. Request one or use an average." };
  if (activityValue === null) return { value: null, kg: null, status: "Enter activity data" };
  if (!unit) return { value: null, kg: null, status: "Select unit" };
  const quantity = toUnit(activityValue, unit, figure.unit);
  if (quantity === null) return { value: null, kg: null, status: `Unit mismatch - the supplier's figure is per ${figure.unit}` };
  // Rounded once, from the unrounded product, as the engine does.
  const kg = quantity * figure.kgco2e_per_unit;
  return { value: Math.round((kg / 1000) * 100) / 100, kg: round4(kg), status: unitsMatchExact(unit, figure.unit) ? "ok" : "converted" };
}

export type HybridLineKind = "energy" | "material" | "transport" | "waste";

export interface HybridLineInput {
  kind: HybridLineKind;
  name: string;
  quantity: number;
  unit: string;
}

export interface HybridComponentPreview {
  kind: HybridLineKind | "supplier_scope12";
  label: string;
  kg: number;
}

export interface HybridCalcResult extends SupplierCalcResult {
  components: HybridComponentPreview[];
  /** FACTOR_FALLBACK_YEAR, as the engine words it: a line's factor is from another year than the target year. */
  notes: string[];
}

/**
 * Supplier's energy and materials: the supplier's Scope 1+2 (its energy lines
 * when the row has any, else its facility data allocated by mass or by what
 * was paid) plus every input line × its factor from this site × category.
 */
export function hybridEmission(
  input: EmissionCalcInput,
  args: { activityValue: number | null; unit: string | undefined; facility: FacilityInput | null; lines: HybridLineInput[]; purchasedValue?: number | null },
): HybridCalcResult {
  const none = (status: string): HybridCalcResult => ({ value: null, kg: null, status, components: [], notes: [] });
  const notes: string[] = [];
  const components: HybridComponentPreview[] = [];
  if (!args.lines.some((l) => l.kind === "energy")) {
    const f = args.facility;
    if (!f) return none("No facility data from this supplier for this year. Add it on the Suppliers page, or add its energy use as lines.");
    if (!(f.output_qty > 0)) return none("The supplier's facility output must be greater than 0.");
    let purchased: number | null;
    if (f.allocation_key === "economic") {
      purchased = args.purchasedValue ?? (args.unit && unitsMatchExact(args.unit, f.output_unit) ? args.activityValue : null);
      if (purchased === null || !(purchased > 0)) return none(`Enter what was paid, in ${f.output_unit}`);
    } else {
      if (args.activityValue === null) return none("Enter activity data");
      if (!args.unit) return none("Select unit");
      purchased = toUnit(args.activityValue, args.unit, f.output_unit);
      if (purchased === null) return none(`Unit mismatch - the supplier's output is in ${f.output_unit}`);
    }
    if (purchased > f.output_qty) return none("More was bought than the supplier's facility made that year");
    components.push({ kind: "supplier_scope12", label: "Supplier's Scope 1 and 2, allocated", kg: allocatedKg(f.scope12_tco2e, allocationShare(purchased, f.output_qty)) });
  }
  for (const [i, line] of args.lines.entries()) {
    // The engine's lookup (FactorIndex.find): the target year, else the newest year, with a note.
    const factor = findEmissionFactor(input, line.name);
    if (!factor) return none(`Line ${i + 1}: no emission factor named ${line.name}`);
    if (input.targetYear !== undefined && factor.year !== input.targetYear) {
      const note = `No ${input.targetYear} factor for "${factor.emission_category_name}"; the ${factor.year} factor was used.`;
      if (!notes.includes(note)) notes.push(note);
    }
    const q = toUnit(line.quantity, line.unit, factor.denominator_unit);
    if (q === null) return none(`Line ${i + 1}: unit mismatch - the factor is per ${factor.denominator_unit}`);
    components.push({ kind: line.kind, label: line.name, kg: round4(q * factor.factor_value) });
  }
  const kg = components.reduce((s, c) => s + c.kg, 0);
  return { value: Math.round((kg / 1000) * 100) / 100, kg: round4(kg), status: "ok", components, notes };
}
