import type { Recipe } from "./types";

/** Mass of each waste type by its treatment (GHG Protocol 5, 12). */
export const wasteTypeSpecific: Recipe = {
  method: "waste_type_specific",
  summary: "The mass of each waste type and how it was treated.",
  fields: [{ name: "Mass (kg)", type: "number" }],
  formula: { multiply: ["Mass (kg)"], activity_unit: "kg" },
  units: ["kg", "tonne"],
  factor: "A waste-treatment factor per kg or tonne.",
};
