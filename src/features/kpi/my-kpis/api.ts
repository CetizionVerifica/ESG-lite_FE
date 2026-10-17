import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { KpiTargetWithProgress, KpiValueInput, MyKpiItem, MyKpis } from "../../../lib/kpi/contracts";
import { ERROR_MESSAGE } from "../../../lib/kpi/labels";
import { isKpiErrorCode } from "../../../lib/kpi/contracts";
import { useKpiCompanyId } from "../../../lib/kpi/switch";
import { getKpiTargets, getMyKpis, removeKpiEvidence, saveKpiValues, submitKpiValues, uploadKpiEvidence } from "../../../services/kpiService";
import { withValue } from "./logic";

export { kpiErrorMessage } from "../../../services/kpiService";

export const keys = {
  all: ["kpi", "my"] as const,
  list: (companyId: number | null, period: string, siteId: number | null) => [...keys.all, companyId, period, siteId] as const,
};

/** `GET /kpi/my?period=&site=`: what the caller owes for the month. */
export function useMyKpis(period: string, siteId: number | null) {
  const companyId = useKpiCompanyId();
  return useQuery({ queryKey: keys.list(companyId, period, siteId), queryFn: () => getMyKpis(period, siteId, companyId), staleTime: 30_000 });
}

/** A plain message for a per-item refusal code; never the code itself. */
export const codeMessage = (code: unknown, fallback: string) => (isKpiErrorCode(code) ? ERROR_MESSAGE[code] : fallback);

/**
 * Saves one draft (`PUT /kpi/values`) and puts the saved value into the list
 * straight away, so the row and the progress follow without a refetch.
 */
export function useSaveDraft(listKey: readonly unknown[]) {
  const qc = useQueryClient();
  const companyId = useKpiCompanyId();
  return useMutation({
    mutationFn: async ({ input }: { input: KpiValueInput; key: string }) => {
      const res = await saveKpiValues([input], companyId);
      const r = res.results[0];
      if (!r) throw new Error("The server didn't answer for this value.");
      return r;
    },
    onSuccess: (r, { key }) => {
      if (r.ok) qc.setQueryData<MyKpis>(listKey, (old) => (old ? { ...old, items: withValue(old.items, key, r.value) } : old));
    },
  });
}

export function useSubmitValues() {
  const qc = useQueryClient();
  const companyId = useKpiCompanyId();
  return useMutation({
    mutationFn: (ids: number[]) => submitKpiValues(ids, companyId),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useEvidence() {
  const qc = useQueryClient();
  const companyId = useKpiCompanyId();
  const refresh = () => qc.invalidateQueries({ queryKey: keys.all });
  return {
    upload: useMutation({ mutationFn: ({ valueId, file }: { valueId: number; file: File }) => uploadKpiEvidence(valueId, file, companyId), onSuccess: refresh }),
    remove: useMutation({ mutationFn: ({ valueId, evidenceId }: { valueId: number; evidenceId: number }) => removeKpiEvidence(valueId, evidenceId, companyId), onSuccess: refresh }),
  };
}

/**
 * KPI-9: a read-only row's target, if any: the site's own, else the
 * company's. Targets are optional here; a failed load just shows none.
 */
export function useTargetsFor(): (item: Pick<MyKpiItem, "kpi_definition_id" | "site_id">) => KpiTargetWithProgress | null {
  const companyId = useKpiCompanyId();
  const q = useQuery({ queryKey: ["kpi", "targets", companyId], queryFn: () => getKpiTargets(companyId), staleTime: 60_000, retry: false });
  return (item) => {
    const mine = (q.data ?? []).filter((t) => t.kpi_definition_id === item.kpi_definition_id);
    return mine.find((t) => t.site_id === item.site_id) ?? mine.find((t) => t.site_id === null) ?? null;
  };
}
