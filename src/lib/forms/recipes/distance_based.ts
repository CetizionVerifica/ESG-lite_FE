import type { Recipe } from "./types";

/** Weight × distance for freight, one row per leg (GHG Protocol 4.2, 9.1). */
export const distanceBased: Recipe = {
  method: "distance_based",
  summary: "Weight carried times distance, one row per leg.",
  fields: [
    { name: "Weight (tonne)", type: "number" },
    { name: "Distance travelled", type: "number" },
  ],
  formula: { multiply: ["Weight (tonne)", "Distance travelled"], activity_unit: "tonne.km" },
  units: ["tonne.km", "km"],
  factor: "A freight factor per tonne.km (or per km for a whole vehicle).",
};
