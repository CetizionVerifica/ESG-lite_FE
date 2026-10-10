/**
 * P24 builder Test tab: sample values through the same calculator Add data
 * uses, against the site's real factors for one year.
 */
import type { EmissionCalculationResult, EmissionFactor } from "../../lib/emissions/types";

/** Factor years on file, newest first. */
export function factorYears(factors: EmissionFactor[]): number[] {
  return [...new Set(factors.map((f) => f.year).filter((y) => Number.isFinite(y)))].sort((a, b) => b - a);
}

export const factorsFor = (factors: EmissionFactor[], year: number | null) =>
  year === null ? factors : factors.filter((f) => f.year === year);

export type TestOutcome = { tone: "good" | "warn" | "neutral"; headline: string; detail: string | null };

/** What the result panel says for one calculation. */
export function describeResult(result: EmissionCalculationResult, factor: EmissionFactor | undefined): TestOutcome {
  const used = factor ? `${factor.emission_category_name}: ${factor.factor_value} kgCO₂e per ${factor.denominator_unit} (${factor.year})` : null;
  if (result.value !== null) {
    return {
      tone: "good",
      headline: `${result.value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} tCO₂e`,
      detail: used ? `${used}${result.status === "converted" ? ", unit converted" : ""}` : null,
    };
  }
  const waiting = /^(Select|Enter)\b/.test(result.status);
  return { tone: waiting ? "neutral" : "warn", headline: result.status, detail: used };
}
