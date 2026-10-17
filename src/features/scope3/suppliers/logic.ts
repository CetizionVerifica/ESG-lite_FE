// S3-6 Suppliers page: pure helpers (drafts, validation, labels), tested in logic.test.ts.
import type { AllocationKey, FacilityBody, FigureBody, SupplierBoundary, SupplierFigure, SupplierListItem } from "../../../services/scope3SuppliersService";

export const BOUNDARY_LABEL: Record<SupplierBoundary, string> = {
  cradle_to_gate: "Cradle to gate",
  cradle_to_grave: "Cradle to grave",
  gate_to_gate: "Gate to gate",
};

export const ALLOCATION_LABEL: Record<AllocationKey, string> = { mass: "By mass", economic: "By value" };

export const SOURCE_LABEL: Record<SupplierFigure["source"], string> = { manual: "Entered by hand", supplier_request: "Supplier request" };

/** Request statuses as the C06 page words them. */
export const REQUEST_STATUS_LABEL: Record<string, string> = {
  sent: "Sent",
  opened: "Opened",
  received: "Received",
  accepted: "Accepted",
  rejected: "Rejected",
  expired: "Expired",
};

export const COUNTRY = /^[A-Za-z]{2}$/;
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SupplierDraft = { name: string; country: string; email: string };

export const supplierDraftErrors = (d: SupplierDraft): Partial<Record<keyof SupplierDraft, string>> => {
  const e: Partial<Record<keyof SupplierDraft, string>> = {};
  if (!d.name.trim()) e.name = "Give the supplier's name.";
  if (d.country.trim() && !COUNTRY.test(d.country.trim())) e.country = "Use the two-letter country code, such as AE.";
  if (d.email.trim() && !EMAIL.test(d.email.trim())) e.email = "Enter a valid email address.";
  return e;
};

export const supplierBody = (d: SupplierDraft) => ({
  name: d.name.trim(),
  country: d.country.trim() ? d.country.trim().toUpperCase() : null,
  email: d.email.trim() || null,
});

export type FigureDraft = { item: string; unit: string; kgco2e_per_unit: number | null; reference_year: number | null; boundary: SupplierBoundary };

export const emptyFigure = (year: number): FigureDraft => ({ item: "", unit: "kg", kgco2e_per_unit: null, reference_year: year, boundary: "cradle_to_gate" });

export const figureErrors = (d: FigureDraft): Partial<Record<keyof FigureDraft, string>> => {
  const e: Partial<Record<keyof FigureDraft, string>> = {};
  if (!d.item.trim()) e.item = "Say what the figure is for.";
  if (!d.unit.trim()) e.unit = "Give the unit the figure is per.";
  if (d.kgco2e_per_unit === null || !(d.kgco2e_per_unit >= 0)) e.kgco2e_per_unit = "Enter the figure in kgCO₂e per unit.";
  if (d.reference_year === null || d.reference_year < 1990 || d.reference_year > 2100) e.reference_year = "Enter the year the figure is for.";
  return e;
};

export const figureBody = (d: FigureDraft, confirmBoundary = false): FigureBody => ({
  item: d.item.trim(),
  unit: d.unit.trim(),
  kgco2e_per_unit: d.kgco2e_per_unit as number,
  reference_year: d.reference_year as number,
  boundary: d.boundary,
  gwp_set: "AR6",
  ...(confirmBoundary ? { confirm_boundary: true } : {}),
});

export type FacilityDraft = { year: number | null; scope12_tco2e: number | null; output_qty: number | null; output_unit: string; allocation_key: AllocationKey };

export const emptyFacility = (year: number): FacilityDraft => ({ year, scope12_tco2e: null, output_qty: null, output_unit: "kg", allocation_key: "mass" });

export const facilityErrors = (d: FacilityDraft): Partial<Record<keyof FacilityDraft, string>> => {
  const e: Partial<Record<keyof FacilityDraft, string>> = {};
  if (d.year === null || d.year < 1990 || d.year > 2100) e.year = "Enter the year.";
  if (d.scope12_tco2e === null || d.scope12_tco2e < 0) e.scope12_tco2e = "Enter the facility's Scope 1 and 2.";
  if (d.output_qty === null || !(d.output_qty > 0)) e.output_qty = "Enter what the facility made, more than 0.";
  if (!d.output_unit.trim()) e.output_unit = d.allocation_key === "economic" ? "Give the currency." : "Give the unit.";
  return e;
};

export const facilityBody = (d: FacilityDraft): FacilityBody => ({
  year: d.year as number,
  scope12_tco2e: d.scope12_tco2e as number,
  output_qty: d.output_qty as number,
  output_unit: d.output_unit.trim(),
  allocation_key: d.allocation_key,
});

/** "Gulf Smelter Co., P1020 ingot, 8.6 kgCO₂e/kg, 2025" — the add-data match line (spec §Frontend 2). */
export const figureLine = (supplierName: string, f: Pick<SupplierFigure, "item" | "kgco2e_per_unit" | "unit" | "reference_year">, fmt: (n: number) => string = String) =>
  `${supplierName}, ${f.item}, ${fmt(f.kgco2e_per_unit)} kgCO₂e/${f.unit}, ${f.reference_year}`;

/** The list's "Supplier figure" cell. */
export const figureState = (s: Pick<SupplierListItem, "has_factor" | "has_facility_data">): string =>
  s.has_factor ? "Yes" : s.has_facility_data ? "Facility data" : "Missing";

/** "Accepted · P1020 ingot" or "None". */
export const lastRequestText = (s: Pick<SupplierListItem, "last_request">): string =>
  s.last_request ? `${REQUEST_STATUS_LABEL[s.last_request.status] ?? s.last_request.status} · ${s.last_request.material}` : "None";

/**
 * The C06 "Ask supplier" flow with this supplier filled in. A request belongs
 * to a product footprint, which the person still picks there.
 */
export const requestDataLink = (s: { name: string; email: string | null }) => {
  const p = new URLSearchParams({ new: "1", supplier: s.name });
  if (s.email) p.set("email", s.email);
  return `/products/suppliers?${p.toString()}`;
};
