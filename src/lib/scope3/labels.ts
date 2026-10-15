/**
 * Scope 3 words for the screen (S3-0). Pages take category names, method
 * labels and data-quality words from here, never their own strings
 * (src/features/scope3/CLAUDE.md rule 2). Review check labels come with
 * S3-15 (`checks.ts`), factor type labels with S3-2 (`factor.ts`).
 */
import {
  type BoundaryStatus,
  type DataType,
  type Direction,
  type DqScore,
  type Method,
  METHOD_LABELS,
  ghgCategory,
} from "./contracts";

/** "Category 1 · Purchased goods and services". */
export function categoryLabel(n: number): string {
  const c = ghgCategory(n);
  return c ? `Category ${c.n} · ${c.name}` : `Category ${n}`;
}

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

export const DIRECTION_LABELS: Record<Direction, string> = { upstream: "Upstream", downstream: "Downstream" };

export const BOUNDARY_STATUS_LABELS: Record<BoundaryStatus, string> = {
  included: "Included",
  excluded: "Excluded",
  not_relevant: "Not relevant",
  screening: "Screening",
};

export const DATA_TYPE_LABELS: Record<DataType, string> = { primary: "Primary", secondary: "Secondary" };
