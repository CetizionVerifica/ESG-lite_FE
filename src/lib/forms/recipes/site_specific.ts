import type { Recipe } from "./types";

/** A site's own energy use × the client's share (GHG Protocol 4.5, 8). */
export const siteSpecific: Recipe = {
  method: "site_specific",
  summary: "The site's energy use times the client's share of it.",
  fields: [
    { name: "Energy used (kWh)", type: "number" },
    { name: "Your share (%)", type: "number" },
  ],
  formula: { multiply: ["Energy used (kWh)", "Your share (%)"], percent: ["Your share (%)"], activity_unit: "kWh" },
  units: ["kWh"],
  factor: "An electricity or fuel factor per kWh.",
};
