import type { Recipe } from "./types";

/** The supplier's own cradle-to-gate figure (S3-6). The Supplier field comes with the method. */
export const supplierSpecific: Recipe = {
  method: "supplier_specific",
  summary: "The quantity bought from a supplier, times that supplier's own figure.",
  fields: [{ name: "Quantity", type: "number" }],
  formula: null,
  units: ["kg", "tonne", "unit"],
  factor: "The supplier's cradle-to-gate figure (Suppliers page).",
};
