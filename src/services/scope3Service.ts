import api from "../api/axios";
import type { BoundaryStatus, ConsolidationApproach } from "../lib/scope3/boundary";
import type { Direction, GhgCategoryNumber } from "../lib/scope3/contracts";

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
