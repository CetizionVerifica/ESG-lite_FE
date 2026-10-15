import api from "../api/axios";
import { categoryLabel } from "../lib/scope3/contracts";
import type { InvestmentsImportPlan } from "./scope3AssetsService";

/** S3-9 commuting survey (ESG-lite src/scope3/commuting). */

export interface CommutingSite {
  site_id: number;
  name: string;
  /** The site's Category 7 category. */
  category_id: number;
}

export interface CommutingSites {
  company_id: number;
  sites: CommutingSite[];
}

export interface SurveyResponse {
  /** The client's own code for the person, never a name. */
  ref: string;
  mode: string;
  one_way_km: number;
  days_per_week: number;
  weeks_per_year: number;
}

export interface SurveyBody {
  site_id: number;
  year: number;
  year_type: "CY" | "FY";
  total_employees: number;
  responses: SurveyResponse[];
}

export interface SurveySummary {
  respondents: number;
  total_employees: number;
  scale: number;
  coverage_pct: number;
  modes: { mode: string; matched: boolean; respondents: number; total_km: number; unit: string | null }[];
  skipped: { mode: string; reason: "zero_emission" | "no_distance"; respondents: number }[];
}

/** The import plan (ESG-lite ImportPlanWithRows); same shape as the investments plan. */
export type CommutingImportPlan = InvestmentsImportPlan;

export interface SurveyPlan {
  plan: CommutingImportPlan | null;
  summary: SurveySummary;
}

export { commitInvestmentsPlan as commitImportPlan } from "./scope3AssetsService";

const withCompany = (companyId: number | null) => (companyId ? { company_id: companyId } : {});

export const getCommutingSites = async (companyId: number | null): Promise<CommutingSites> =>
  (await api.get("/scope3/commuting/sites", { params: withCompany(companyId) })).data;

export const planCommutingSurvey = async (companyId: number | null, body: SurveyBody): Promise<SurveyPlan> =>
  (await api.post("/scope3/commuting/surveys", { ...body, ...withCompany(companyId) })).data;

const REASONS: Record<string, string> = {
  CATEGORY_7_NOT_ASSIGNED: `This site has no ${categoryLabel(7)} category. Assign one to the site, or pick another site.`,
  FEWER_EMPLOYEES_THAN_RESPONDENTS: "Total employees is lower than the number of people in the survey.",
  COMMUTING_FORM_CUSTOMISED: "This site's commuting form was customised, so the survey can't fill it. Ask a Superadmin to restore the standard form.",
};

/** Server message from an axios error, or the fallback; known reasons get their own words. */
export function errorMessage(e: unknown, fallback: string): string {
  const data = (e as { response?: { data?: { message?: unknown; details?: { reason?: unknown } } } })?.response?.data;
  const reason = typeof data?.details?.reason === "string" ? REASONS[data.details.reason] : undefined;
  if (reason) return reason;
  return typeof data?.message === "string" && data.message ? data.message : fallback;
}
