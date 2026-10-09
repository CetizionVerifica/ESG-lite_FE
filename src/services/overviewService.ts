import api from "../api/axios";

/** Monthly gross / saved (scope = null) / net, tCO₂e. */
export interface OverviewMonth {
  /** YYYY-MM */
  month: string;
  gross: number;
  saved: number;
  net: number;
}

export interface OverviewKpis {
  gross: number;
  net: number;
  saved: number;
  scope_1: number;
  scope_2: number;
  scope_3: number;
  entries: number;
  approved_count: number;
  pending_count: number;
  rejected_count: number;
  pending_emission: number;
  net_vs_last_year_pct: number | null;
}

export interface OverviewSite {
  site_id: number;
  name: string;
  total: number;
  gross: number;
  saved: number;
  net: number;
  entries: number;
  approved: number;
  pending: number;
  rejected: number;
  net_vs_last_year_pct: number | null;
}

export interface OverviewCategory {
  category_id: number;
  category_name: string;
  scope: string;
  total: number;
}

export interface SubmissionUser {
  user_id: number;
  name: string;
  email: string;
  site_name: string;
  submission_count: number;
  status: "submitted" | "missing";
}

export interface OverviewSubmission {
  /** YYYY-MM */
  month: string;
  submitted: number;
  missing: number;
  users: SubmissionUser[];
}

export interface OverviewLastYear {
  period: unknown;
  /** year_to_date: last year cut to the months due so far this year; not_due: nothing to compare yet. */
  status: "complete" | "year_to_date" | "not_due";
  kpis: Pick<OverviewKpis, "gross" | "net" | "saved" | "scope_1" | "scope_2" | "scope_3">;
  by_site: { site_id: number; gross: number; saved: number; net: number }[];
}

/** B4 `GET /manager/overview`. Figures are approved entries only; counts cover every status. */
export interface OverviewResponse {
  period: unknown;
  site_ids: number[];
  category_id: number | null;
  kpis: OverviewKpis;
  by_scope: { scope: string | null; total: number }[];
  by_site: OverviewSite[];
  by_month: OverviewMonth[];
  /** Approved yearly filings overlapping the period; left out of the monthly series. */
  yearly_total: number;
  /** Scoped categories only, largest first. */
  by_category: OverviewCategory[];
  submission: OverviewSubmission;
  /** 12 months for CY/FY, else the 6 months ending with the period. */
  trend: OverviewMonth[];
  last_year: OverviewLastYear | null;
}

export interface OverviewParams {
  /** Backend form: 2025-09, 2025-Q3, 2025 (CY), FY2025-26; leave out for all time. */
  period?: string;
  siteIds?: number[];
  categoryId?: number | null;
}

export const getManagerOverview = async ({ period, siteIds, categoryId }: OverviewParams): Promise<OverviewResponse> => {
  const response = await api.get("/manager/overview", {
    params: {
      period: period || undefined,
      siteIds: siteIds?.length ? siteIds.join(",") : undefined,
      categoryId: categoryId ?? undefined,
    },
  });
  return response.data;
};

/** `GET /manager/submission-status?month=YYYY-MM`: every contributor on the manager's sites. */
export const getSubmissionStatus = async (month: string): Promise<SubmissionUser[]> => {
  const response = await api.get("/manager/submission-status", { params: { month } });
  return response.data?.users ?? [];
};
