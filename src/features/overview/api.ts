import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { fetchPendingForApproval } from "../../lib/emissions/pendingCount";
import { getEmissionsPaginated } from "../../services/emissionService";
import { type OverviewResponse, type SubmissionUser, getManagerOverview, getSubmissionStatus } from "../../services/overviewService";
import { getEmissionIntensity, getEmissionIntensityComparison, getProductionDataForManager } from "../../services/productionDataService";
import { getThresholdByCompany } from "../../services/thresholdService";
import { type Intensity, combinedIntensity, siteIntensity } from "./logic";

export const keys = {
  all: ["overview"] as const,
  overview: (period: string, siteIds: number[], categoryId: number | null) => [...keys.all, "b4", period, siteIds, categoryId] as const,
  submission: (month: string) => [...keys.all, "submission", month] as const,
  intensity: (siteIds: number[], from: string, to: string) => [...keys.all, "intensity", siteIds, from, to] as const,
  pending: (siteIds: number[]) => [...keys.all, "pending", siteIds] as const,
  production: (siteIds: number[]) => [...keys.all, "production-pending", siteIds] as const,
  threshold: (companyId: number) => ["threshold", companyId] as const,
  siteIntensity: (siteId: number, from: string, to: string) => [...keys.all, "site-intensity", siteId, from, to] as const,
  scope2: (siteIds: number[], categoryId: number | null, year: number) => [...keys.all, "scope2", siteIds, categoryId, year] as const,
};

/** B4 for one period (backend form) and site/category context. */
export function useOverview(period: string | null, siteIds: number[], categoryId: number | null) {
  return useQuery<OverviewResponse>({
    queryKey: keys.overview(period ?? "", siteIds, categoryId),
    queryFn: () => getManagerOverview({ period: period ?? undefined, siteIds, categoryId }),
    enabled: period !== null && siteIds.length > 0,
    placeholderData: keepPreviousData,
  });
}

/** Every contributor on the manager's sites for a month (the page narrows it to the chosen sites). */
export function useSubmission(month: string | null) {
  return useQuery<SubmissionUser[]>({
    queryKey: keys.submission(month ?? ""),
    queryFn: () => getSubmissionStatus(month!),
    enabled: !!month,
    placeholderData: keepPreviousData,
  });
}

/** Intensity for the chosen sites and dates; several sites are combined. */
export function useIntensity(siteIds: number[], from: string, to: string) {
  return useQuery<Intensity>({
    queryKey: keys.intensity(siteIds, from, to),
    enabled: siteIds.length > 0,
    queryFn: async () => {
      const params = { startDate: from, endDate: to };
      if (siteIds.length === 1) {
        const d = await getEmissionIntensity(siteIds[0], params);
        return siteIntensity(d.totalEmissions, d.productionByUnit.map((u) => ({ production: u.totalProduction, unit: u.unit })));
      }
      // Several sites: one combined figure, whatever their units.
      const d = await getEmissionIntensityComparison(siteIds, params);
      return combinedIntensity(d.comparison.filter((s) => siteIds.includes(s.siteId)).map((s) => ({ emissions: s.totalEmissions, production: s.totalProduction || 0 })));
    },
    placeholderData: keepPreviousData,
  });
}

/** Pending entries on the chosen sites, whatever the period, counted as the approvals queue shows them. */
export function usePendingEntries(siteIds: number[], feraIds: number[]) {
  return useQuery({
    queryKey: [...keys.pending(siteIds), feraIds],
    enabled: siteIds.length > 0,
    queryFn: () => fetchPendingForApproval(siteIds, feraIds),
  });
}

/**
 * Pending production records on the chosen sites. Asked per site: without a
 * `siteId` the endpoint isn't limited to the manager's company.
 */
export function usePendingProduction(siteIds: number[]) {
  return useQuery({
    queryKey: keys.production(siteIds),
    enabled: siteIds.length > 0,
    queryFn: async () => {
      const counts = await Promise.all(
        siteIds.map(async (siteId) => (await getProductionDataForManager({ siteId, status: "pending" })).filter((r) => r.site?.site_id === siteId).length),
      );
      return counts.reduce((a, b) => a + b, 0);
    },
  });
}

/** Company threshold %; 5 when it can't be read, as data entry does today. */
export function useThreshold(companyId: number | null) {
  return useQuery({
    queryKey: keys.threshold(companyId ?? 0),
    enabled: !!companyId,
    queryFn: async () => {
      try {
        const pct = Number(await getThresholdByCompany(companyId!));
        return Number.isFinite(pct) ? pct : 5;
      } catch {
        return 5;
      }
    },
    staleTime: 10 * 60 * 1000,
  });
}

/** Combines a list of queries into one loading/error/data view. */
function combine<T>(results: { data?: T; isPending: boolean; isError: boolean; refetch: () => unknown }[]) {
  return {
    data: results.every((r) => r.data !== undefined) ? (results.map((r) => r.data) as T[]) : undefined,
    isPending: results.some((r) => r.isPending),
    isError: results.some((r) => r.isError),
    refetch: () => results.forEach((r) => r.isError && r.refetch()),
  };
}

/** Monthly gross emissions and production per site (one request per site, in parallel). */
export function useSiteIntensityMonthly(siteIds: number[], from: string, to: string) {
  return useQueries({
    queries: siteIds.map((siteId) => ({
      queryKey: keys.siteIntensity(siteId, from, to),
      queryFn: async () => (await getEmissionIntensity(siteId, { startDate: from, endDate: to })).monthlyData,
    })),
    combine,
  });
}

/** Approved Scope 2 entries for the given calendar years (activity amounts aren't in B4). */
export function useScope2Entries(siteIds: number[], categoryId: number | null, years: number[]) {
  return useQueries({
    queries: years.map((year) => ({
      queryKey: keys.scope2(siteIds, categoryId, year),
      queryFn: async () => {
        const res = await getEmissionsPaginated({ siteIds, categoryId, scope: "Scope 2", status: "approved", year, page: 1, limit: SCOPE2_CAP });
        return { rows: res.data, truncated: (res.total ?? 0) > res.data.length };
      },
    })),
    combine,
  });
}

export const SCOPE2_CAP = 5000;

/** B4 for whole calendar years: their 12-month trend feeds the year-over-year lines. */
export function useYearTrends(years: number[], siteIds: number[], categoryId: number | null) {
  return useQueries({
    queries: years.map((year) => ({
      queryKey: keys.overview(String(year), siteIds, categoryId),
      queryFn: () => getManagerOverview({ period: String(year), siteIds, categoryId }),
    })),
    combine,
  });
}
