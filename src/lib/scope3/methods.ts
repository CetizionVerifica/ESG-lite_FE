/**
 * Plain method labels (ESG-lite docs/scope3/01-contracts.md §1), for the
 * add-data method picker and the capture-setup "Row's method" choice.
 *
 * STAND-IN written by S3-9 ahead of S3-0's FE labels (`methodLabel` in
 * S3-0's src/lib/scope3/labels.ts). When S3-0 merges, import from there and
 * delete this file.
 */
import type { GhgCategoryNumber } from "./contracts";

export const METHOD_KEYS = [
  "supplier_specific",
  "hybrid",
  "average_data",
  "spend_based",
  "fuel_based",
  "distance_based",
  "site_specific",
  "waste_type_specific",
  "asset_specific",
  "lessor_specific",
  "lessee_specific",
  "investment_specific",
] as const;

const LABEL: Record<string, string> = {
  supplier_specific: "Supplier's own figure",
  hybrid: "Supplier's energy and materials",
  average_data: "Average data",
  spend_based: "From the amount spent",
  fuel_based: "From fuel used",
  distance_based: "Distance travelled",
  site_specific: "Site-specific",
  waste_type_specific: "By waste type and treatment",
  asset_specific: "Asset-specific",
  lessor_specific: "Lessor's own figure",
  lessee_specific: "Lessee's own figure",
  investment_specific: "Investee's own figure",
};

/** Labels that change with the category (contracts §1). */
const BY_CATEGORY: Partial<Record<GhgCategoryNumber, Record<string, string>>> = {
  1: { average_data: "Average for the material" },
  4: { distance_based: "Weight × distance", site_specific: "Warehouse energy" },
  7: { average_data: "Headcount × national average" },
};

/** "distance_based" → "Distance travelled"; an unknown key is shown as written. */
export const methodLabel = (key: string, category?: GhgCategoryNumber | null): string =>
  (category ? BY_CATEGORY[category]?.[key] : undefined) ?? LABEL[key] ?? key;
