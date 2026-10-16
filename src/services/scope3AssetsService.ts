import api from "../api/axios";
import type { ConsolidationApproach } from "../lib/scope3/boundary";
import { categoryLabel } from "../lib/scope3/contracts";
import type { InvestmentType, LeaseBoundary, LeaseRole, LeaseType, PlanSkipReason } from "../lib/scope3/assets";

/** S3-11 leased sites and the investments register (ESG-lite src/scope3/assets). */

export interface LeaseSite {
  site_id: number;
  name: string;
  lease_role: LeaseRole | null;
  lease_type: LeaseType | null;
  floor_area_m2: number | null;
  boundary: LeaseBoundary | null;
  note: string | null;
}

export interface LeaseSites {
  company_id: number;
  consolidation_approach: ConsolidationApproach;
  sites: LeaseSite[];
  can_edit: boolean;
}

export interface LeaseBody {
  lease_role?: LeaseRole | null;
  lease_type?: LeaseType | null;
  floor_area_m2?: number | null;
}

export interface Investment {
  id: number;
  company_id: number;
  investee: string;
  type: InvestmentType;
  share_pct: number;
  investee_scope12_tco2e: number | null;
  year: number;
  source: string | null;
  revenue: number | null;
  currency: string | null;
  eeio_sector: string | null;
  sector_split: Record<string, number> | null;
  updated_at: string | null;
}

export type InvestmentBody = Omit<Investment, "id" | "company_id" | "updated_at">;

export interface Investments {
  company_id: number;
  can_edit: boolean;
  investments: Investment[];
}

export interface PlanRowView {
  row_ref: string;
  state: "ready" | "issue" | "skipped";
  issues: { code: string; severity: string; message: string }[];
  input: { activity_name: string; activity_unit: string; fields?: Record<string, unknown> };
  result?: { total_tco2e: number };
}

/** The import plan the server made (ESG-lite ImportPlanWithRows); totals come from the engine. */
export interface InvestmentsImportPlan {
  plan_id: string;
  version: number;
  status: "draft" | "committed" | "cancelled" | "expired";
  counts: { rows: number; ready: number; issue: number; skipped: number; warnings: number };
  totals: { tco2e: number };
  rows: PlanRowView[];
  total_rows?: number;
}

export interface InvestmentsPlan {
  plan: InvestmentsImportPlan | null;
  planned: { investment_id: number; row_refs: string[]; method: "investment_specific" | "average_data" }[];
  skipped: { investment_id: number; investee: string; reason: PlanSkipReason }[];
  threshold_pct: number;
}

export interface PlanBody {
  site_id: number;
  year: number;
  year_type: "CY" | "FY";
  threshold_pct?: number;
}

const withCompany = (companyId: number | null) => (companyId ? { company_id: companyId } : {});

export const getLeaseSites = async (companyId: number | null): Promise<LeaseSites> =>
  (await api.get("/scope3/assets/sites", { params: withCompany(companyId) })).data;

export const updateSiteLease = async (companyId: number | null, siteId: number, body: LeaseBody): Promise<LeaseSite> =>
  (await api.put(`/scope3/assets/sites/${siteId}`, { ...body, ...withCompany(companyId) })).data;

export const getInvestments = async (companyId: number | null, year?: number): Promise<Investments> =>
  (await api.get("/scope3/investments", { params: { ...withCompany(companyId), ...(year ? { year } : {}) } })).data;

export const createInvestment = async (companyId: number | null, body: InvestmentBody): Promise<Investment> =>
  (await api.post("/scope3/investments", { ...body, ...withCompany(companyId) })).data;

export const updateInvestment = async (companyId: number | null, id: number, body: Partial<InvestmentBody>): Promise<Investment> =>
  (await api.put(`/scope3/investments/${id}`, { ...body, ...withCompany(companyId) })).data;

export const planInvestments = async (companyId: number | null, body: PlanBody): Promise<InvestmentsPlan> =>
  (await api.post("/scope3/investments/plan", { ...body, ...withCompany(companyId) })).data;

export interface CommittedPlan {
  plan_id: string;
  status: string;
  committed?: { upload_batch_id: string; inserted: number; committed_at: string };
}

/** Imports the plan's ready rows as Pending entries (`POST /imports/plans/:id/commit`). */
export const commitInvestmentsPlan = async (planId: string, version: number, idempotencyKey: string): Promise<CommittedPlan> =>
  (await api.post(`/imports/plans/${planId}/commit`, { version, skip_rows_with_issues: true, idempotency_key: idempotencyKey })).data;

/** Server message from an axios error, or the fallback; a site without Category 15 gets its own words. */
export function errorMessage(e: unknown, fallback: string): string {
  const data = (e as { response?: { data?: { message?: unknown; details?: { reason?: unknown } } } })?.response?.data;
  if (data?.details?.reason === "CATEGORY_15_NOT_ASSIGNED")
    return `This site has no ${categoryLabel(15)} category. Assign one to the site, or pick another site.`;
  return typeof data?.message === "string" && data.message ? data.message : fallback;
}
