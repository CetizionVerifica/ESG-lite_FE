import api from "../api/axios";

/**
 * S3-6 suppliers (ESG-lite src/scope3/suppliers, mounted at /suppliers).
 * Reads: anyone with access to the company's sites. Changes: Manager and above.
 * A Superadmin passes the selected client as `company_id`.
 */

export type AllocationKey = "mass" | "economic";
export type SupplierBoundary = "cradle_to_gate" | "cradle_to_grave" | "gate_to_gate";
export type HybridLineKind = "energy" | "material" | "transport" | "waste";

export interface SupplierRequestRef {
  supplier_request_id: number;
  status: string;
  sent_at: string | null;
  material: string;
}

export interface SupplierListItem {
  supplier_id: number;
  name: string;
  country: string | null;
  email: string | null;
  rows_this_year: number;
  tco2e: number;
  has_factor: boolean;
  factor_count: number;
  has_facility_data: boolean;
  last_request: SupplierRequestRef | null;
}

export interface SupplierList {
  company_id: number;
  year: number;
  year_type: "CY" | "FY";
  can_edit: boolean;
  suppliers: SupplierListItem[];
}

export interface SupplierRecord {
  supplier_id: number;
  name: string;
  country: string | null;
  email: string | null;
}

/** One figure a supplier gave (`supplier_factor`); `id` is the §4 contract's key. */
export interface SupplierFigure {
  id: number;
  supplier_factor_id: number;
  supplier_id: number;
  item: string;
  unit: string;
  kgco2e_per_unit: number;
  boundary: SupplierBoundary;
  reference_year: number;
  gwp_set: string | null;
  source: "supplier_request" | "manual";
  evidence_document_id: number | null;
  material_factor_id: number | null;
  supplier_request_id: number | null;
  has_evidence: boolean;
}

export interface FacilityData {
  id: number;
  supplier_facility_data_id: number;
  supplier_id: number;
  year: number;
  scope12_tco2e: number;
  output_qty: number;
  output_unit: string;
  allocation_key: AllocationKey;
}

export interface SupplierDetail {
  supplier: SupplierRecord;
  factors: SupplierFigure[];
  facility_data: FacilityData[];
  requests: { supplier_request_id: number; status: string; material: string; unit: string; sent_at: string | null; received_at: string | null; decided_at: string | null }[];
  can_edit: boolean;
}

export interface SupplierBody {
  name?: string;
  country?: string | null;
  email?: string | null;
}

export interface FigureBody {
  item: string;
  unit: string;
  kgco2e_per_unit: number;
  reference_year: number;
  boundary?: SupplierBoundary;
  gwp_set?: "AR4" | "AR5" | "AR6" | null;
  confirm_boundary?: boolean;
}

export interface FacilityBody {
  year: number;
  scope12_tco2e: number;
  output_qty: number;
  output_unit: string;
  allocation_key: AllocationKey;
}

export type NameMatch =
  | { type: "similar_suppliers"; a: SupplierRecord & { rows: number }; b: SupplierRecord & { rows: number } }
  | { type: "unlinked_name"; name: string; rows: number; candidate: (SupplierRecord & { rows: number }) | null; exact: boolean };

export type NameMatchDecision =
  | { type: "similar_suppliers"; keep_id: number; other_id: number; decision: "link" | "not_same" }
  | { type: "unlinked_name"; name: string; supplier_id?: number; decision: "link" | "not_same" };

export interface SupplierCoverage {
  from: string;
  to: string;
  cat12_tco2e: number;
  supplier_specific_tco2e: number;
  hybrid_tco2e: number;
  coverage_pct: number | null;
  top_suppliers: { supplier_id: number; name: string; tco2e: number; rows: number; supplier_data_tco2e: number }[];
}

const withCompany = (companyId: number | null) => (companyId ? { company_id: companyId } : {});

export const getSuppliers = async (companyId: number | null, year: number): Promise<SupplierList> =>
  (await api.get("/suppliers", { params: { ...withCompany(companyId), year } })).data;

export const getSupplier = async (companyId: number | null, id: number): Promise<SupplierDetail> =>
  (await api.get(`/suppliers/${id}`, { params: withCompany(companyId) })).data;

export const createSupplier = async (companyId: number | null, body: SupplierBody & { name: string }): Promise<SupplierRecord> =>
  (await api.post("/suppliers", { ...body, ...withCompany(companyId) })).data;

export const updateSupplier = async (companyId: number | null, id: number, body: SupplierBody): Promise<SupplierRecord> =>
  (await api.put(`/suppliers/${id}`, { ...body, ...withCompany(companyId) })).data;

export const getSupplierFigures = async (companyId: number | null, id: number): Promise<{ supplier_id: number; factors: SupplierFigure[] }> =>
  (await api.get(`/suppliers/${id}/factors`, { params: withCompany(companyId) })).data;

export const createSupplierFigure = async (companyId: number | null, id: number, body: FigureBody): Promise<SupplierFigure> =>
  (await api.post(`/suppliers/${id}/factors`, { ...body, ...withCompany(companyId) })).data;

export const getFacilityData = async (companyId: number | null, id: number): Promise<{ supplier_id: number; facility_data: FacilityData[] }> =>
  (await api.get(`/suppliers/${id}/facility-data`, { params: withCompany(companyId) })).data;

export const saveFacilityData = async (companyId: number | null, id: number, body: FacilityBody): Promise<FacilityData & { replaced: boolean }> =>
  (await api.post(`/suppliers/${id}/facility-data`, { ...body, ...withCompany(companyId) })).data;

export const getNameMatches = async (companyId: number | null): Promise<{ company_id: number; matches: NameMatch[] }> =>
  (await api.get("/suppliers/name-matches", { params: withCompany(companyId) })).data;

export const decideNameMatch = async (companyId: number | null, body: NameMatchDecision) =>
  (await api.post("/suppliers/name-matches", { ...body, ...withCompany(companyId) })).data as Record<string, unknown>;

export const getSupplierCoverage = async (companyId: number | null, year: number, status: "approved" | "all" = "approved"): Promise<SupplierCoverage> =>
  (await api.get("/suppliers/coverage", { params: { ...withCompany(companyId), year, status } })).data;

type ApiError = { response?: { status?: number; data?: { code?: unknown; message?: unknown; details?: { message?: unknown } } } };

/** The server's own words for a refusal (`details.message` for a field), or the fallback. */
export function errorMessage(e: unknown, fallback: string): string {
  const data = (e as ApiError)?.response?.data;
  const detail = data?.details?.message;
  if (typeof detail === "string" && detail) return detail;
  return typeof data?.message === "string" && data.message ? data.message : fallback;
}

/** True when the server refused a figure for its boundary (SUPPLIER_FACTOR_BOUNDARY). */
export const isBoundaryRefusal = (e: unknown): boolean => (e as ApiError)?.response?.data?.code === "SUPPLIER_FACTOR_BOUNDARY";
