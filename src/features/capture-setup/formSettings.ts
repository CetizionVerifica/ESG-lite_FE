/**
 * SE-3 · What the form fixes for the person entering data, as pure edits of
 * the builder draft: how the category is calculated (one method, or "it
 * depends on the record" with a choice mapped to methods), per-field settings,
 * a fixed unit and currency, and applying a method's recipe. Saved by SE-2 as
 * `method_options`, `method_by_choice`, `field_settings`, `units`, `currency`.
 */
import { isRowMethod, orderMethods, type RowMethod } from "../../lib/scope3/dq";
import { methodLabel } from "../../lib/scope3/labels";
import { normalizeUnitKey } from "../../lib/emissions/emissionCalc";
import { recipeFor, type Recipe } from "../../lib/forms/recipes";
import type { FieldSetting } from "../../lib/forms/settings";
import { type BuilderDraft, type BuilderIssue, type ColumnEntity, addField, fieldTitle, isSelect } from "./builder";
import { suggestedUnits } from "./methodOptions";

/**
 * How the form's method is decided:
 * - `none`: the form doesn't set one (no `method_options`);
 * - `one`: one method for every record;
 * - `choice`: a select field's answers pick the method ("It depends on the record");
 * - `several`: several methods and no question (S3-8 transport forms, until SE-5 gives them one).
 */
export type MethodMode = "none" | "one" | "choice" | "several";

export function methodMode(d: BuilderDraft): MethodMode {
  if (d.methodByChoice) return "choice";
  if (d.methodOptions.length === 0) return "none";
  return d.methodOptions.length === 1 ? "one" : "several";
}

/** The units a method starts with: what the form already has, else its recipe's, else the formula's. */
function unitsFor(d: BuilderDraft, method: string): string[] {
  const kept = d.methodOptions.find((o) => o.method === method)?.units.filter((u) => u.trim());
  if (kept?.length) return kept;
  const recipe = recipeFor(method)?.units;
  if (recipe?.length) return [...recipe];
  return suggestedUnits(d, method);
}

/** One method for every record. */
export function setOneMethod(d: BuilderDraft, method: RowMethod): BuilderDraft {
  return { ...d, methodByChoice: null, methodOptions: [{ method, units: unitsFor(d, method) }] };
}

/** The form doesn't set a method. */
export const clearMethod = (d: BuilderDraft): BuilderDraft => ({ ...d, methodByChoice: null, methodOptions: [] });

/** "It depends on the record": the select field whose answers pick the method (its map starts empty). */
export function setChoiceColumn(d: BuilderDraft, column: string, n: number | null | undefined): BuilderDraft {
  const map = d.methodByChoice?.column === column ? d.methodByChoice.map : {};
  return syncOffered({ ...d, methodByChoice: { column, map } }, n);
}

/** Map one answer of the choice field to a method (null: unmap it). */
export function setChoiceMethod(d: BuilderDraft, choiceId: string, method: RowMethod | null, n: number | null | undefined): BuilderDraft {
  if (!d.methodByChoice) return d;
  const map = { ...d.methodByChoice.map };
  if (method) map[choiceId] = method;
  else delete map[choiceId];
  return syncOffered({ ...d, methodByChoice: { ...d.methodByChoice, map } }, n);
}

/**
 * The offered methods take in every mapped method, most specific first, keeping
 * units already set. Methods already offered stay: an answer the map doesn't
 * name still takes its method from its unit (S3-8 storage classes in m³·day),
 * so dropping one would refuse those rows. `stopOffering` removes one on purpose.
 */
function syncOffered(d: BuilderDraft, n: number | null | undefined): BuilderDraft {
  const mapped = [...new Set(Object.values(d.methodByChoice?.map ?? {}))].filter(isRowMethod);
  const order = orderMethods([...new Set([...mapped, ...d.methodOptions.map((o) => o.method)])], n);
  return { ...d, methodOptions: order.map((method) => ({ method, units: unitsFor(d, method) })) };
}

/** Methods offered that no answer maps to (rows whose answer isn't mapped can still use them). */
export const unmappedOffered = (d: BuilderDraft): string[] =>
  d.methodByChoice ? d.methodOptions.map((o) => o.method).filter((m) => !Object.values(d.methodByChoice!.map).includes(m)) : [];

/** Stop offering a method no answer maps to. */
export const stopOffering = (d: BuilderDraft, method: string): BuilderDraft =>
  Object.values(d.methodByChoice?.map ?? {}).includes(method) ? d : { ...d, methodOptions: d.methodOptions.filter((o) => o.method !== method) };

/** The answers of the choice field: the field's own choices and every dependent list, once each. */
export function choiceAnswers(d: BuilderDraft, column: string): { id: string; label: string }[] {
  const lists = [...(d.options[column] ?? []), ...Object.values(d.dependentOptions[column] ?? {}).flat()];
  const seen = new Set<string>();
  return lists
    .map((o) => ({ id: String(o.id), label: o.label || String(o.id) }))
    .filter((o) => o.id && !seen.has(o.id) && seen.add(o.id));
}

/** Select fields that can carry the question. */
export const choiceFields = (d: BuilderDraft) => d.fields.filter(isSelect);

// ── Field settings ──────────────────────────────────────────────────────────

const clean = (s: FieldSetting): FieldSetting => {
  const out: FieldSetting = {};
  if (s.label?.trim()) out.label = s.label;
  if (s.help?.trim()) out.help = s.help;
  if (s.default !== undefined && String(s.default).trim() !== "") out.default = s.default;
  if (s.hidden) out.hidden = true;
  if (s.readonly) out.readonly = true;
  if (s.required) out.required = true;
  return out;
};

/** Change a field's settings; a field with nothing set is dropped from the map. */
export function setFieldSetting(d: BuilderDraft, key: string, patch: Partial<FieldSetting>): BuilderDraft {
  const next = clean({ ...(d.fieldSettings[key] ?? {}), ...patch });
  const fieldSettings = { ...d.fieldSettings };
  if (Object.keys(next).length) fieldSettings[key] = next;
  else delete fieldSettings[key];
  return { ...d, fieldSettings };
}

// ── Unit and currency ───────────────────────────────────────────────────────

export const setFixedUnit = (d: BuilderDraft, unit: string | null): BuilderDraft => ({ ...d, fixedUnit: unit?.trim() || null });
export const setFixedCurrency = (d: BuilderDraft, code: string | null): BuilderDraft => ({ ...d, fixedCurrency: code || null });

/** Units the fixed unit can be: those every method a row can take offers (the server checks the same). */
export function fixableUnits(d: BuilderDraft): string[] {
  const methods = d.methodByChoice ? [...new Set(Object.values(d.methodByChoice.map))] : d.methodOptions.slice(0, 1).map((o) => o.method);
  const lists = methods.map((m) => d.methodOptions.find((o) => o.method === m)?.units.filter((u) => u.trim()) ?? []).filter((l) => l.length);
  if (!lists.length) return [];
  return lists[0].filter((u) => lists.every((l) => l.some((v) => normalizeUnitKey(v) === normalizeUnitKey(u))));
}

// ── Recipes ─────────────────────────────────────────────────────────────────

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The recipe fields the form lacks and the library has no column for (the page creates them first). */
export function missingRecipeColumns(d: BuilderDraft, recipe: Recipe, library: ColumnEntity[]): Recipe["fields"] {
  return recipe.fields.filter((f) => !d.fields.some((c) => sameName(c.column_name, f.name)) && !library.some((c) => sameName(c.column_name, f.name)));
}

/**
 * Apply a method's recipe: add the fields the form lacks (from the library) and
 * its formula, keyed by its result unit (one method) or by each answer that
 * picks the method ("It depends on the record"). Existing fields and formulas
 * are kept. Config only; nothing is calculated here.
 */
export function applyRecipe(d: BuilderDraft, recipe: Recipe, library: ColumnEntity[]): BuilderDraft {
  let next = d;
  for (const f of recipe.fields) {
    if (next.fields.some((c) => sameName(c.column_name, f.name))) continue;
    const col = library.find((c) => sameName(c.column_name, f.name));
    if (col) next = addField(next, col);
  }
  const formula = recipe.formula;
  if (!formula) return next;
  const nameOf = (field: string) => next.fields.find((c) => sameName(c.column_name, field))?.column_name ?? field;
  const method = {
    multiply: formula.multiply.map(nameOf),
    ...(formula.percent ? { percent: formula.percent.map(nameOf) } : {}),
    ...(formula.divide ? { divide: formula.divide.map(nameOf) } : {}),
    activity_unit: formula.activity_unit,
  };
  const choice = next.methodByChoice;
  if (choice) {
    const answers = Object.entries(choice.map).filter(([, m]) => m === recipe.method).map(([id]) => id);
    const calc = next.calculation?.mode === "per_method" && next.calculation.method_column === choice.column ? next.calculation : { mode: "per_method" as const, method_column: choice.column, methods: {} };
    const methods = { ...calc.methods };
    for (const id of answers) if (!methods[id]) methods[id] = { ...method };
    return { ...next, calculation: { ...calc, methods } };
  }
  const calc = next.calculation?.mode === "per_unit" ? next.calculation : next.calculation ? null : { mode: "per_unit" as const, methods: {} };
  if (!calc) return next; // A form with its own per-method formula keeps it.
  if (calc.methods[formula.activity_unit]) return next;
  return { ...next, calculation: { ...calc, methods: { ...calc.methods, [formula.activity_unit]: { ...method } } } };
}

// ── What blocks saving ──────────────────────────────────────────────────────

export function formSettingsIssues(d: BuilderDraft): BuilderIssue[] {
  const issues: BuilderIssue[] = [];
  const choice = d.methodByChoice;
  if (choice) {
    const field = d.fields.find((f) => f.column_name === choice.column);
    if (!field || !isSelect(field)) issues.push({ tab: "calculation", message: `Method: "${fieldTitle(choice.column)}" is no longer a choice field on this form. Choose another field.` });
    else if (!Object.keys(choice.map).length) issues.push({ tab: "calculation", message: `Method: map at least one answer of "${fieldTitle(choice.column)}" to a method.` });
    const known = new Set(choiceAnswers(d, choice.column).map((o) => o.id));
    const stale = Object.keys(choice.map).find((id) => !known.has(id));
    if (field && stale) issues.push({ tab: "calculation", message: `Method: "${stale}" is no longer one of ${fieldTitle(choice.column)}'s choices. Remove it from the map.` });
  }
  if (d.fixedUnit) {
    const allowed = fixableUnits(d);
    if (d.methodOptions.length && !allowed.some((u) => normalizeUnitKey(u) === normalizeUnitKey(d.fixedUnit))) {
      issues.push({ tab: "calculation", message: `Unit: "${d.fixedUnit}" isn't a unit ${d.methodOptions.map((o) => methodLabel(o.method)).join(" and ")} offers.` });
    }
  }
  for (const [key, s] of Object.entries(d.fieldSettings)) {
    const exists = d.fields.some((f) => f.column_name === key) || d.extraFields.some((f) => f.key === key);
    if (!exists) issues.push({ tab: "fields", message: `"${fieldTitle(key)}" has settings but is no longer on the form. Its settings are dropped on save.` });
    else if (s.hidden && s.required && (s.default === undefined || String(s.default).trim() === ""))
      issues.push({ tab: "fields", message: `"${s.label ?? fieldTitle(key)}" is hidden and required: give it a default, or show it.` });
  }
  return issues;
}
