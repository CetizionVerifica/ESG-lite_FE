import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PutKpiTargetBody } from "../../../lib/kpi/contracts";
import { useKpiCompanyId } from "../../../lib/kpi/switch";
import { deleteKpiTarget, getKpiDashboard, getKpiTargets, saveKpiTarget } from "../../../services/kpiService";

export { kpiErrorMessage } from "../../../services/kpiService";

export const targetKeys = {
  all: (companyId: number | null) => ["kpi", "targets", companyId] as const,
  baseline: (companyId: number | null, year: number | null, site: number | null) => ["kpi", "dashboard", companyId, "baseline", year, site] as const,
};

/** `GET /kpi/targets`: every target with its progress (the server's). */
export function useTargets() {
  const companyId = useKpiCompanyId();
  return useQuery({ queryKey: targetKeys.all(companyId), queryFn: () => getKpiTargets(companyId), staleTime: 30_000 });
}

/**
 * The approved value of each KPI for a baseline year, as the dashboard
 * aggregates it (`GET /kpi/dashboard?year=&site=` cards). The form prefills
 * the baseline from it, so the FE never adds values up.
 */
export function useBaselineValues(year: number | null, site: number | null, enabled: boolean) {
  const companyId = useKpiCompanyId();
  return useQuery({
    queryKey: targetKeys.baseline(companyId, year, site),
    queryFn: () => getKpiDashboard({ year: year as number, site }, companyId),
    enabled: enabled && !!year,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useTargetActions() {
  const qc = useQueryClient();
  const companyId = useKpiCompanyId();
  const done = () => Promise.all([qc.invalidateQueries({ queryKey: targetKeys.all(companyId) }), qc.invalidateQueries({ queryKey: ["kpi", "dashboard"] })]);
  return {
    save: useMutation({ mutationFn: (body: PutKpiTargetBody) => saveKpiTarget(body, companyId), onSuccess: done }),
    remove: useMutation({ mutationFn: (id: number) => deleteKpiTarget(id, companyId), onSuccess: done }),
  };
}
