import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getEmissionsPaginated } from "../../services/emissionService";
import { type OverviewResponse, type SubmissionUser, getManagerOverview, getSubmissionStatus } from "../../services/overviewService";
import { getEmissionIntensity, getEmissionIntensityComparison, getProductionDataForManager } from "../../services/productionDataService";
import { getThresholdByCompany } from "../../services/thresholdService";
import { type Intensity, combineIntensity } from "./logic";

export const keys = {
  all: ["overview"] as const,
  overview: (period: string, siteIds: number[], categoryId: number | null) => [...keys.all, "b4", period, siteIds, categoryId] as const,
  submission: (month: string) => [...keys.all, "submission", month] as const,
  intensity: (siteIds: number[], from: string, to: string) => [...keys.all, "intensity", siteIds, from, to] as const,
  pending: (siteIds: number[]) => [...keys.all, "pending", siteIds] as const,
  production: (siteIds: number[]) => [...keys.all, "production-pending", siteIds] as const,
  threshold: (companyId: number) => ["threshold", companyId] as const,
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
        return combineIntensity(d.totalEmissions, d.productionByUnit.map((u) => ({ production: u.totalProduction, unit: u.unit })));
      }
      // Several sites: one combined figure, whatever their units.
      const d = await getEmissionIntensityComparison(siteIds, params);
      const sites = d.comparison.filter((s) => siteIds.includes(s.siteId));
      const emissions = sites.reduce((s, x) => s + x.totalEmissions, 0);
      const intensity = combineIntensity(emissions, sites.map((s) => ({ production: s.totalProduction || 0, unit: "Combined" })));
      return intensity && { ...intensity, combined: true };
    },
    placeholderData: keepPreviousData,
  });
}

/** Pending entries on the chosen sites, whatever the period (the approvals queue). */
export function usePendingEntries(siteIds: number[]) {
  return useQuery({
    queryKey: keys.pending(siteIds),
    enabled: siteIds.length > 0,
    queryFn: async () => (await getEmissionsPaginated({ siteIds, status: "pending", page: 1, limit: 1 })).summary.pending_count,
  });
}

/** Pending production records on the chosen sites. */
export function usePendingProduction(siteIds: number[]) {
  return useQuery({
    queryKey: keys.production(siteIds),
    enabled: siteIds.length > 0,
    queryFn: async () => {
      const rows = await getProductionDataForManager({ status: "pending" });
      return rows.filter((r) => siteIds.includes(r.site?.site_id)).length;
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
        return Number(await getThresholdByCompany(companyId!));
      } catch {
        return 5;
      }
    },
    staleTime: 10 * 60 * 1000,
  });
}
