/**
 * Scope 3 factor metadata: types, plain labels and GWP sets
 * (ESG-lite docs/scope3/01-contracts.md §2, the backend's
 * src/scope3/contracts/factor.ts). Pages read labels from here, never their
 * own strings.
 *
 * S3-0 owns src/lib/scope3/; S3-2 wrote this file before S3-0 merged. If
 * S3-0's contracts.ts carries the same lists, this file re-exports them.
 */
export const FACTOR_TYPES = ["combustion", "wtt", "td_loss", "life_cycle", "cradle_to_gate", "eeio_spend", "supplier", "process", "other"] as const;
export type FactorType = (typeof FACTOR_TYPES)[number];

export const FACTOR_TYPE_LABEL: Record<FactorType, string> = {
  combustion: "Combustion (direct)",
  wtt: "Well-to-tank (WTT)",
  td_loss: "Transmission and distribution losses",
  life_cycle: "Life cycle",
  cradle_to_gate: "Cradle to gate",
  eeio_spend: "Spend-based (EEIO)",
  supplier: "Supplier-specific",
  process: "Process",
  other: "Other",
};

export const isFactorType = (v: unknown): v is FactorType => typeof v === "string" && (FACTOR_TYPES as readonly string[]).includes(v);

export function factorTypeLabel(t: string | null | undefined): string {
  if (!t) return "Not set";
  return isFactorType(t) ? FACTOR_TYPE_LABEL[t] : t;
}

export const GWP_SETS = ["AR6", "AR5", "AR4"] as const;
export type GwpSet = (typeof GWP_SETS)[number];
/** D7: new factors default to AR6. */
export const DEFAULT_GWP_SET: GwpSet = "AR6";

export const GWP_SET_LABEL: Record<GwpSet, string> = {
  AR6: "IPCC AR6 (100-year)",
  AR5: "IPCC AR5 (100-year)",
  AR4: "IPCC AR4 (100-year)",
};

/**
 * 100-year GWPs used only to check that a factor's gas parts add up to its
 * total (a hint, never a calculation). Fossil CH₄, as combustion factors use.
 */
export const GWP100: Record<GwpSet, { CH4: number; N2O: number }> = {
  AR6: { CH4: 29.8, N2O: 273 },
  AR5: { CH4: 30, N2O: 265 },
  AR4: { CH4: 25, N2O: 298 },
};

/** Geography code for "applies everywhere". */
export const GLOBAL_GEOGRAPHY = "GLO";
