import type { Recipe } from "./types";

/** Fuel used, × your share when the vehicle or plant also served others (GHG Protocol 4.1, 6, 7). */
export const fuelBased: Recipe = {
  method: "fuel_based",
  summary: "Litres of fuel used, times the client's share of the load.",
  fields: [
    { name: "Fuel used (litres)", type: "number" },
    { name: "Your share of the load (%)", type: "number" },
  ],
  formula: { multiply: ["Fuel used (litres)", "Your share of the load (%)"], percent: ["Your share of the load (%)"], activity_unit: "litre" },
  units: ["litre"],
  factor: "A fuel factor per litre (combustion and well-to-tank).",
};
