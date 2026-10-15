/**
 * Scope 3 words for the screen (S3-0). Pages take category names, method
 * labels and data-quality words from here, never their own strings
 * (src/features/scope3/CLAUDE.md rule 2). Review check labels come with
 * S3-15 (`checks.ts`), factor type labels with S3-2 (`factor.ts`), boundary
 * status labels with S3-1 (`boundary.ts`).
 */
import { type DataType, type DqScore, type Method, METHOD_LABELS, ghgCategory } from "./contracts";

/** "Category 1 · Purchased goods and services"; "Purchased goods"; "Upstream" / "Downstream". */
export { DIRECTION_LABEL, categoryLabel, categoryShortName } from "./contracts";

/** A method's plain label, in a category's own wording when it has one (e.g. Category 7 average data). */
export function methodLabel(key: Method, n?: number): string {
  const own = n === undefined ? undefined : ghgCategory(n)?.methods.find((o) => o.key === key)?.label;
  return own ?? METHOD_LABELS[key];
}

export const DQ_LABELS: Record<DqScore, string> = { 1: "Good", 2: "Fair", 3: "Poor" };

/** "Good", "Fair" or "Poor"; "Not scored" when the row has no score yet. */
export function dqLabel(score: DqScore | null | undefined): string {
  return score ? DQ_LABELS[score] : "Not scored";
}

export const DATA_TYPE_LABELS: Record<DataType, string> = { primary: "Primary", secondary: "Secondary" };
