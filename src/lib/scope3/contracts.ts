/**
 * Scope 3 contracts for the FE: GHG Protocol categories and their labels
 * (ESG-lite docs/scope3/01-contracts.md §1).
 *
 * STAND-IN written by S3-1 ahead of S3-0 (ESG-lite_FE S3-0 PR), which owns
 * this file. When S3-0 merges, take S3-0's version and keep what S3-1 imports
 * (GHG_CATEGORIES, GhgCategoryNumber, isGhgCategoryNumber, categoryLabel,
 * categoryShortName, ghgCategory).
 */
export type GhgCategoryNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;
export type Direction = "upstream" | "downstream";

export interface GhgCategory {
  n: GhgCategoryNumber;
  key: string;
  /** Exact GHG Protocol name. */
  name: string;
  /** A few words for chips and narrow columns. */
  short: string;
  direction: Direction;
}

export const GHG_CATEGORIES: readonly GhgCategory[] = [
  { n: 1, key: "purchased_goods", name: "Purchased goods and services", short: "Purchased goods", direction: "upstream" },
  { n: 2, key: "capital_goods", name: "Capital goods", short: "Capital goods", direction: "upstream" },
  { n: 3, key: "fuel_energy", name: "Fuel- and energy-related activities", short: "Fuel and energy", direction: "upstream" },
  { n: 4, key: "upstream_transport", name: "Upstream transportation and distribution", short: "Upstream transport", direction: "upstream" },
  { n: 5, key: "waste", name: "Waste generated in operations", short: "Waste", direction: "upstream" },
  { n: 6, key: "business_travel", name: "Business travel", short: "Business travel", direction: "upstream" },
  { n: 7, key: "employee_commuting", name: "Employee commuting", short: "Commuting", direction: "upstream" },
  { n: 8, key: "upstream_leased", name: "Upstream leased assets", short: "Upstream leased", direction: "upstream" },
  { n: 9, key: "downstream_transport", name: "Downstream transportation and distribution", short: "Downstream transport", direction: "downstream" },
  { n: 10, key: "processing", name: "Processing of sold products", short: "Processing", direction: "downstream" },
  { n: 11, key: "use_of_sold", name: "Use of sold products", short: "Use of sold products", direction: "downstream" },
  { n: 12, key: "end_of_life", name: "End-of-life treatment of sold products", short: "End of life", direction: "downstream" },
  { n: 13, key: "downstream_leased", name: "Downstream leased assets", short: "Downstream leased", direction: "downstream" },
  { n: 14, key: "franchises", name: "Franchises", short: "Franchises", direction: "downstream" },
  { n: 15, key: "investments", name: "Investments", short: "Investments", direction: "downstream" },
];

export const isGhgCategoryNumber = (value: unknown): value is GhgCategoryNumber =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 15;

export const ghgCategory = (n: GhgCategoryNumber): GhgCategory => GHG_CATEGORIES[n - 1];

/** "Category 1 · Purchased goods and services" */
export const categoryLabel = (n: GhgCategoryNumber): string => `Category ${n} · ${ghgCategory(n).name}`;

/** "Purchased goods" */
export const categoryShortName = (n: GhgCategoryNumber): string => ghgCategory(n).short;

export const DIRECTION_LABEL: Record<Direction, string> = { upstream: "Upstream", downstream: "Downstream" };
