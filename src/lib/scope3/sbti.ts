/**
 * SBTi Scope 3 coverage (S3-13; S3-14 reuses it on the targets page).
 * Near-term targets must cover at least 67 % of Scope 3 when Scope 3 is 40 %
 * or more of Scope 1 + 2 + 3.
 */
import type { GhgCategoryNumber } from "./contracts";

export const SBTI_SCOPE3_TRIGGER_PCT = 40;
export const SBTI_SCOPE3_COVERAGE_PCT = 67;

export interface CoverageSet {
  /** Fewest categories, largest first, whose emissions reach the target share. */
  categories: GhgCategoryNumber[];
  /** Share of Scope 3 those categories cover, %, one decimal. */
  coverage_pct: number;
  /** false when every category together stays under the target (e.g. much Unmapped). */
  reached: boolean;
}

/**
 * The smallest set of GHG categories (largest first) covering `targetPct` of
 * Scope 3. Unmapped emissions count in the total but can't be picked.
 */
export function scope3CoverageSet(
  rows: { n: GhgCategoryNumber | null; tco2e: number }[],
  targetPct = SBTI_SCOPE3_COVERAGE_PCT,
): CoverageSet {
  const total = rows.reduce((a, r) => a + Math.max(0, r.tco2e), 0);
  const ranked = rows
    .filter((r): r is { n: GhgCategoryNumber; tco2e: number } => r.n !== null && r.tco2e > 0)
    .sort((a, b) => b.tco2e - a.tco2e || a.n - b.n);
  const picked: GhgCategoryNumber[] = [];
  let sum = 0;
  for (const r of ranked) {
    if (total > 0 && (sum / total) * 100 >= targetPct) break;
    picked.push(r.n);
    sum += r.tco2e;
  }
  const coverage = total > 0 ? Math.round((sum / total) * 1000) / 10 : 0;
  return { categories: picked.sort((a, b) => a - b), coverage_pct: coverage, reached: total > 0 && coverage >= targetPct };
}

/** Whether the SBTi Scope 3 rule applies: Scope 3 is at least 40 % of the total. */
export const sbtiScope3Applies = (scope3: number, total: number) =>
  total > 0 && (scope3 / total) * 100 >= SBTI_SCOPE3_TRIGGER_PCT;

/** "Categories 1, 4 and 11 cover 71 %." */
export function coverageSentence(set: CoverageSet): string {
  const ns = set.categories;
  const list = ns.length <= 1 ? String(ns[0] ?? "") : `${ns.slice(0, -1).join(", ")} and ${ns[ns.length - 1]}`;
  const pct = `${Math.round(set.coverage_pct)} %`;
  if (!ns.length) return "No mapped category has emissions yet.";
  return set.reached
    ? `${ns.length === 1 ? "Category" : "Categories"} ${list} cover${ns.length === 1 ? "s" : ""} ${pct}.`
    : `All mapped categories together cover ${pct}; map the Unmapped entries to reach ${SBTI_SCOPE3_COVERAGE_PCT} %.`;
}

export const SBTI_HINT_LEAD = `SBTi near-term targets must cover at least ${SBTI_SCOPE3_COVERAGE_PCT} % of Scope 3.`;
