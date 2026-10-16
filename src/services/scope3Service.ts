import api from "../api/axios";
import type { BoundaryStatus, ConsolidationApproach } from "../lib/scope3/boundary";
import type { Direction, GhgCategoryNumber } from "../lib/scope3/contracts";
import type { LeaseSite } from "./scope3AssetsService"; // S3-11
import type { BaseYearPreview, BaseYearResponse, CompanyBaseYear, RecalcEvent, RecalcReason, RecalcStatus } from "../lib/scope3/baseYear"; // S3-14

/** S3-1 Scope 3 boundary and category map (ESG-lite src/scope3/boundary). */

export interface BoundaryCategory {
  n: GhgCategoryNumber;
  key: string;
  name: string;
  direction: Direction;
  methods: string[];
  status: BoundaryStatus;
  reason: string | null;
  method_note: string | null;
  relevance: Record<string, boolean> | null;
  updated_at: string | null;
  updated_by: { user_id: number; name: string | null } | null;
  mapped_categories: { category_id: number; category_name: string }[];
}

export interface Boundary {
  company_id: number;
  consolidation_approach: ConsolidationApproach;
  summary: Record<BoundaryStatus, number>;
  unmapped_count: number;
  categories: BoundaryCategory[];
  can_edit: boolean;
  can_confirm_map: boolean;
  /** S3-11: sites with a lease or franchise role, each with its boundary note. */
  lease_sites?: LeaseSite[];
}

export interface MapProposal {
  category_id: number;
  category_name: string;
  /** Confirmed number; null while Unmapped. */
  ghg_category: number | null;
  proposed: number | null;
  confidence: number;
  basis: "exact" | "legacy_map" | "keyword" | "none" | "confirmed";
  confirmed: boolean;
}

export interface CategoryMap {
  company_id: number;
  unmapped: MapProposal[];
  mapped: MapProposal[];
}

const withCompany = (companyId: number | null) => (companyId ? { company_id: companyId } : {});

export const getBoundary = async (companyId: number | null): Promise<Boundary> =>
  (await api.get("/scope3/categories", { params: withCompany(companyId) })).data;

export const updateBoundaryCategory = async (
  companyId: number | null,
  n: number,
  body: { status: BoundaryStatus; reason: string | null; method_note: string | null },
) => (await api.put(`/scope3/categories/${n}`, { ...body, ...withCompany(companyId) })).data;

export const getCategoryMap = async (companyId: number | null): Promise<CategoryMap> =>
  (await api.get("/scope3/category-map", { params: withCompany(companyId) })).data;

export const confirmCategoryMap = async (companyId: number | null, confirm: { category_id: number; ghg_category: number }[]) =>
  (await api.post("/scope3/category-map", { confirm, ...withCompany(companyId) })).data;

export const setConsolidationApproach = async (companyId: number, consolidation_approach: ConsolidationApproach) =>
  (await api.put(`/company/${companyId}/consolidation-approach`, { consolidation_approach })).data;

// S3-14 · Scope 3 base year and recalculations (ESG-lite src/scope3/baseYear).
export const getBaseYear = async (companyId: number | null): Promise<BaseYearResponse> =>
  (await api.get("/scope3/base-year", { params: withCompany(companyId) })).data;

export const previewBaseYear = async (companyId: number | null, base_year: number, year_type: "CY" | "FY"): Promise<BaseYearPreview> =>
  (await api.get("/scope3/base-year/preview", { params: { base_year, year_type, ...withCompany(companyId) } })).data;

export const putBaseYear = async (
  companyId: number | null,
  body: { base_year: number; year_type: "CY" | "FY"; significance_pct: number; rationale: string | null; policy_note: string | null; note?: string },
): Promise<CompanyBaseYear> => (await api.put("/scope3/base-year", { ...body, ...withCompany(companyId) })).data;

export const getRecalculations = async (companyId: number | null, status?: RecalcStatus): Promise<{ events: RecalcEvent[]; can_edit: boolean }> =>
  (await api.get("/scope3/recalculations", { params: { ...(status ? { status } : {}), ...withCompany(companyId) } })).data;

export const approveRecalculation = async (companyId: number | null, body: { reason: RecalcReason; note: string }) =>
  (await api.post("/scope3/recalculations", { ...body, ...withCompany(companyId) })).data;

export const dismissRecalculation = async (companyId: number | null, id: number, note: string) =>
  (await api.post(`/scope3/recalculations/${id}/dismiss`, { note, ...withCompany(companyId) })).data;
