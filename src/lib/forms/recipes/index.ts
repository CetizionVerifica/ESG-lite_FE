/**
 * SE-3 · Recipes by method (one file each). A method without a recipe is set
 * up by hand on the Fields and Calculation tabs.
 */
import { averageData } from "./average_data";
import { distanceBased } from "./distance_based";
import { fuelBased } from "./fuel_based";
import { siteSpecific } from "./site_specific";
import { spendBased } from "./spend_based";
import { supplierSpecific } from "./supplier_specific";
import type { Recipe } from "./types";
import { wasteTypeSpecific } from "./waste_type_specific";

export type { Recipe, RecipeField } from "./types";

export const RECIPES: readonly Recipe[] = [supplierSpecific, averageData, spendBased, fuelBased, distanceBased, siteSpecific, wasteTypeSpecific];

/** The recipe for a method, if there is one. */
export const recipeFor = (method: string | null | undefined): Recipe | undefined => RECIPES.find((r) => r.method === method);
