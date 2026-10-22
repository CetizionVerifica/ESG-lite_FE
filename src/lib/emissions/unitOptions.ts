/**
 * The units a data-entry row may use for its emission category (ESG-lite #183),
 * as the server lists them: GET /user/units/site/:siteId/category/:categoryId/by-activity.
 * The server decides with the engine's own conversions, so nothing here converts
 * or guesses a unit: the list is used as is, names matched trimmed and case-blind.
 */
export interface UnitOptionsByActivity {
  /** The form's fixed unit (SE-2), else null. */
  fixed_unit: string | null;
  /** Every unit of the form, for a row whose emission category isn't one the server knows. */
  all_units: string[];
  activities: Array<{
    name: string;
    /** An alias → the factor name it points at; its units are that factor's. */
    maps_to?: string;
    factor_unit: string | null;
    /** The units a row may use, the factor unit first. */
    units: string[];
  }>;
}

const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** The response, or null when it isn't one (an older API, or a plain unit list). The form then offers every unit, as before. */
export function readUnitOptions(data: unknown): UnitOptionsByActivity | null {
  const d = data as Partial<UnitOptionsByActivity> | null;
  if (!d || typeof d !== "object" || !Array.isArray(d.activities) || !isStringList(d.all_units)) return null;
  const activities = d.activities.filter((a) => a && typeof a.name === "string" && isStringList(a.units));
  return { fixed_unit: typeof d.fixed_unit === "string" ? d.fixed_unit : null, all_units: d.all_units, activities };
}

const norm = (s: string | null | undefined) => String(s ?? "").trim().toLowerCase();

/** The same unit as written in the list (trimmed, case-blind); the server already folded other spellings. */
export const sameUnit = (a: string | null | undefined, b: string | null | undefined) => norm(a) !== "" && norm(a) === norm(b);

export type RowUnits = {
  /** What the Unit select offers; empty until the row has an emission category. */
  units: string[];
  /** The factor's unit, shown as "(factor unit)" to a Manager. */
  factorUnit: string | null;
  /** The row's unit when the list doesn't hold it (a saved entry or a bill's unit): kept, never silently changed. */
  notOffered: string | null;
};

/** The units for a row's emission category, or null when there are no options (the form keeps its flat list). */
export function unitsForRow(options: UnitOptionsByActivity | null | undefined, emissionCategory: string | null | undefined, currentUnit?: string | null): RowUnits | null {
  if (!options) return null;
  const name = norm(emissionCategory);
  if (!name) return { units: [], factorUnit: null, notOffered: null };
  const activity = options.activities.find((a) => norm(a.name) === name);
  // A name the server doesn't know has no factor: the save refuses it whatever the unit, so the list isn't narrowed.
  const units = activity ? activity.units : options.fixed_unit ? [options.fixed_unit] : options.all_units;
  const current = (currentUnit ?? "").trim();
  return { units, factorUnit: activity?.factor_unit ?? null, notOffered: current && !units.some((u) => sameUnit(u, current)) ? current : null };
}

/**
 * A form whose methods name their units (S3-3 method_options, SE-1's unit picks the method) keeps
 * that list, narrowed to the units the server allows when they share any.
 */
export function withMethodUnits(units: string[], methodUnits: string[] | null | undefined): string[] {
  if (!methodUnits?.length) return units;
  const shared = methodUnits.filter((m) => units.some((u) => sameUnit(u, m)));
  return shared.length ? shared : methodUnits;
}

/**
 * The row's unit once its emission category changed: kept while still offered, the only unit
 * when exactly one is offered, otherwise cleared so the person picks again.
 */
export function unitForCategory(options: UnitOptionsByActivity | null | undefined, emissionCategory: string, unit: string | null | undefined, methodUnits?: string[] | null): string | null | undefined {
  const row = unitsForRow(options, emissionCategory);
  if (!row || !norm(emissionCategory)) return unit;
  const units = withMethodUnits(row.units, methodUnits);
  if (unit && units.some((u) => sameUnit(u, unit))) return unit;
  return units.length === 1 ? units[0] : "";
}

/** "kWh isn't a unit for Diesel. Choose litre, kl or gallon." */
export function unitNotOfferedMessage(unit: string, emissionCategory: string, offered: string[]): string {
  const list = offered.length > 1 ? `${offered.slice(0, -1).join(", ")} or ${offered[offered.length - 1]}` : offered[0];
  return `${unit} isn't a unit for ${emissionCategory}.${list ? ` Choose ${list}.` : ""}`;
}
