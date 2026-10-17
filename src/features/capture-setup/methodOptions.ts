/**
 * S3-3 "Methods offered" in the form builder: the methods a Scope 3 form lets
 * contributors pick, most specific first, each with the units it offers
 * (`column_config.method_options`, contracts §6 `[{method, units}]`). The first
 * one is the default on a new row in Add data. Pure edits of the draft.
 */
import { ROW_METHOD_COLUMN } from "../../lib/emissions/emissionCalc";
import { type RowMethod, categoryMethods, methodLabel, orderMethods } from "../../lib/scope3/dq";
import type { BuilderDraft, BuilderIssue } from "./builder";

/** The methods to choose from: the category's own (contract order), then any others the form already offers. */
export function methodCandidates(d: BuilderDraft, n: number | null | undefined): RowMethod[] {
  return orderMethods([...categoryMethods(n).map((m) => m.key), ...d.methodOptions.map((o) => o.method)], n);
}

/** Units to start a newly offered method with: the formula's result unit, or a per-unit spec's units. */
export function suggestedUnits(d: BuilderDraft, method: string): string[] {
  const calc = d.calculation;
  if (!calc) return [];
  if (calc.mode === "per_method" && calc.method_column === ROW_METHOD_COLUMN) {
    const unit = calc.methods[method]?.activity_unit?.trim();
    return unit ? [unit] : [];
  }
  return calc.mode === "per_unit" ? Object.keys(calc.methods) : [];
}

/** Offer a method (with suggested units) or stop offering it; the list stays most specific first. */
export function toggleMethodOption(d: BuilderDraft, method: RowMethod, n: number | null | undefined): BuilderDraft {
  if (d.methodOptions.some((o) => o.method === method)) {
    return { ...d, methodOptions: d.methodOptions.filter((o) => o.method !== method) };
  }
  const next = [...d.methodOptions, { method, units: suggestedUnits(d, method) }];
  const order = orderMethods(
    next.map((o) => o.method),
    n,
  );
  return { ...d, methodOptions: order.map((m) => next.find((o) => o.method === m)!) };
}

/** Offer every method of the category ("prefilled from ghgCategory methods"), keeping units already set. */
export function offerCategoryMethods(d: BuilderDraft, n: number | null | undefined): BuilderDraft {
  const all = categoryMethods(n).map((m) => m.key);
  if (all.length === 0) return d;
  const keep = (m: RowMethod) => d.methodOptions.find((o) => o.method === m) ?? { method: m, units: suggestedUnits(d, m) };
  return { ...d, methodOptions: orderMethods([...all, ...d.methodOptions.map((o) => o.method)], n).map(keep) };
}

/** "kg, tonne" → ["kg", "tonne"]; empty pieces stay while typing and are dropped on save. */
export function setMethodUnits(d: BuilderDraft, method: string, text: string): BuilderDraft {
  const units = text.split(",").map((u) => u.trim());
  const cleaned = units.length === 1 && units[0] === "" ? [] : units;
  return { ...d, methodOptions: d.methodOptions.map((o) => (o.method === method ? { ...o, units: cleaned } : o)) };
}

export const unitsText = (units: string[]) => units.join(", ");

/** What blocks saving: a method with no units (contracts §6 needs at least one), or an offered method an "@method" formula lacks. */
export function methodOptionIssues(d: BuilderDraft): BuilderIssue[] {
  const issues: BuilderIssue[] = [];
  const noUnits = d.methodOptions.find((o) => o.units.every((u) => !u.trim()));
  if (noUnits) issues.push({ tab: "calculation", message: `Methods offered: enter the units "${methodLabel(noUnits.method)}" offers.` });
  const calc = d.calculation;
  if (calc?.mode === "per_method" && calc.method_column === ROW_METHOD_COLUMN) {
    const missing = d.methodOptions.find((o) => !calc.methods[o.method]);
    if (missing) issues.push({ tab: "calculation", message: `Calculation: "${methodLabel(missing.method)}" is offered but has no formula. Add it below or stop offering it.` });
  }
  return issues;
}
