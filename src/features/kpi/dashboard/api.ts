import { useMutation, useQuery } from "@tanstack/react-query";
import type { FrameworkCode } from "../../../lib/kpi/contracts";
import { useKpiCompanyId } from "../../../lib/kpi/switch";
import { getKpiDashboard, getKpiTargets, remindKpiOwner } from "../../../services/kpiService";

export { kpiErrorMessage } from "../../../services/kpiService";

export const dashboardKeys = {
  one: (companyId: number | null, year: number, site: number | null, topic: string | null) => ["kpi", "dashboard", companyId, year, site, topic] as const,
};

/**
 * `GET /kpi/dashboard?year=&site=&topic=`: coverage per framework, gaps,
 * cards and what's pending. The ring filter works on the answer (each gap
 * says which frameworks it feeds), so it doesn't ask again.
 */
export function useDashboard(year: number, site: number | null, topic: string | null) {
  const companyId = useKpiCompanyId();
  return useQuery({ queryKey: dashboardKeys.one(companyId, year, site, topic), queryFn: () => getKpiDashboard({ year, site, topic }, companyId), placeholderData: (prev) => prev, staleTime: 30_000 });
}

/** Targets, for the words of a card's target when the dashboard doesn't send them. */
export function useTargetsList() {
  const companyId = useKpiCompanyId();
  return useQuery({ queryKey: ["kpi", "targets", companyId], queryFn: () => getKpiTargets(companyId), staleTime: 60_000, retry: false });
}

export function useRemind() {
  const companyId = useKpiCompanyId();
  return useMutation({ mutationFn: ({ kpi, site }: { kpi: number; site: number | null; framework?: FrameworkCode | null }) => remindKpiOwner(kpi, site, companyId) });
}
