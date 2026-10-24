/**
 * SE-3 · A recipe: what a calculation method needs on a form, as config only
 * (fields, formula, units, the factor it expects). The Superadmin applies one
 * in Capture setup, then renames or hides fields. Recipes never calculate;
 * the engine (ESG-lite emissionWrite) does.
 */
import type { Method } from "../../scope3/contracts";

export type RecipeField = { name: string; type: "number" | "text" | "select" };

export type Recipe = {
  method: Exclude<Method, "unknown">;
  /** For the Superadmin: what a row of this method needs from the client. */
  summary: string;
  /** Fields the method needs; applying the recipe adds the ones the form lacks. */
  fields: RecipeField[];
  /** The numbers multiplied (and which are percentages) and the result unit; null: the entry's own amount × the factor. */
  formula: { multiply: string[]; percent?: string[]; divide?: string[]; activity_unit: string } | null;
  /** The units the method offers (its `method_options` entry). */
  units: string[];
  /** The factor the rows need, in the Superadmin's words. */
  factor: string;
};
