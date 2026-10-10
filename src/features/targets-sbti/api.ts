import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import { getManagerOverview } from "../../services/overviewService";
import { getLongTermTargetChart, getNearTermTargetTables } from "../../services/sbtiService";
import { PATHWAYS, type Pathway, type TargetKind, type TargetModel, fromNearTerm, fromNetZero, isNoBaseData } from "./logic";

export const keys = {
  all: ["targets"] as const,
  target: (kind: TargetKind, siteIds: number[], baseYear: number, targetYear: number, pathway: Pathway) =>
    [...keys.all, kind, siteIds, baseYear, targetYear, kind === "near" ? pathway : null] as const,
  yearHasData: (year: number, siteIds: number[]) => [...keys.all, "has-data", year, siteIds] as const,
};

export type TargetQuery = { kind: TargetKind; siteIds: number[]; baseYear: number; targetYear: number; pathway: Pathway };

/** The live pathway for the current setup, as one model for both target kinds. */
export function useTarget(q: TargetQuery) {
  return useQuery<TargetModel>({
    queryKey: keys.target(q.kind, q.siteIds, q.baseYear, q.targetYear, q.pathway),
    queryFn: async () =>
      q.kind === "near"
        ? fromNearTerm(
            await getNearTermTargetTables({ siteIds: q.siteIds, baseYear: q.baseYear, targetYear: q.targetYear, annualRate: PATHWAYS[q.pathway].rate }),
          )
        : fromNetZero(await getLongTermTargetChart({ siteIds: q.siteIds, baseYear: q.baseYear })),
    enabled: q.siteIds.length > 0,
    placeholderData: keepPreviousData,
    // "No data for this base year" is an answer, not a blip.
    retry: (count, error) => !isNoBaseData(error) && count < 2,
  });
}

/**
 * Which of `years` have approved emissions on these sites, from B4 (one CY
 * per year). Only asked when the chosen base year has no data.
 */
export function useYearsWithData(years: number[], siteIds: number[], enabled: boolean) {
  const results = useQueries({
    queries: years.map((year) => ({
      queryKey: keys.yearHasData(year, siteIds),
      queryFn: async () => {
        const o = await getManagerOverview({ period: String(year), siteIds });
        return o.kpis.gross > 0 || (o.yearly_total ?? 0) > 0;
      },
      enabled: enabled && siteIds.length > 0,
      staleTime: 5 * 60_000,
    })),
  });
  return {
    pending: enabled && results.some((r) => r.isPending),
    years: years.filter((_, i) => results[i]?.data === true),
  };
}
