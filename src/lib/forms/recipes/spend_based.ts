import { SUPPORTED_CURRENCIES } from "../../scope3/spend";
import type { Recipe } from "./types";

/** The amount spent, converted and deflated by the engine (S3-5). Amount, Currency and Invoice date come with the method. */
export const spendBased: Recipe = {
  method: "spend_based",
  summary: "The amount spent and its currency; the exchange rate and deflator are applied on the server.",
  fields: [],
  formula: null,
  units: [...SUPPORTED_CURRENCIES],
  factor: "A spend factor (EEIO, kgCO₂e per USD).",
};
