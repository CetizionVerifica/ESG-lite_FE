import type { Recipe } from "./types";

/** A quantity times a published average factor. */
export const averageData: Recipe = {
  method: "average_data",
  summary: "A quantity times a published average factor.",
  fields: [{ name: "Quantity", type: "number" }],
  formula: null,
  units: ["kg", "tonne"],
  factor: "An average factor per kg or tonne (cradle-to-gate).",
};
