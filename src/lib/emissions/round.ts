// #209 · how a tCO₂e total is rounded: 3 decimals, as the engine stores it
// (ESG-lite src/services/emissionWrite/round.ts). Previews use this so the
// figure on screen is the figure saved. kgCO₂e stays at 4 decimals.

/** Decimal places of every stored tCO₂e total. */
export const TONNES_DP = 3;

/** A tCO₂e figure rounded as the engine stores it. */
export const roundTonnes = (t: number): number => Math.round(t * 1000) / 1000;
