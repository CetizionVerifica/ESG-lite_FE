import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CustomKpiBody, KpiSetup, PutKpiSetupBody } from "../../../lib/kpi/contracts";
import { useKpiCompanyId } from "../../../lib/kpi/switch";
import { type MappingSuggestions, readMappingSuggestions } from "../../../lib/kpi/ai";
import { createCustomKpi, getKpiCatalogue, getKpiSetup, getSetupPeople, inviteKpiOwners, isAiDown, putKpiSetup, suggestKpiMapping } from "../../../services/kpiService";

export { kpiErrorMessage, recommendedIds } from "../../../services/kpiService";

export const keys = {
  setup: (companyId: number | null) => ["kpi", "setup", companyId] as const,
  catalogue: (companyId: number | null) => ["kpi", "catalogue", companyId] as const,
  people: (companyId: number | null) => ["kpi", "setup", companyId, "people"] as const,
};

/** `GET /kpi/setup` and the catalogue the wizard picks from. */
export function useSetup() {
  const companyId = useKpiCompanyId();
  const setup = useQuery({ queryKey: keys.setup(companyId), queryFn: () => getKpiSetup(companyId) });
  const catalogue = useQuery({ queryKey: keys.catalogue(companyId), queryFn: () => getKpiCatalogue(companyId), staleTime: 5 * 60_000 });
  return { setup, catalogue, companyId };
}

/** Sites and people for "Who enters what". */
export function useSetupPeople(setup: KpiSetup | undefined) {
  const companyId = useKpiCompanyId();
  return useQuery({ queryKey: keys.people(companyId), queryFn: () => getSetupPeople(setup as KpiSetup), enabled: !!setup, staleTime: 5 * 60_000 });
}

/** `PUT /kpi/setup`: one step's part; the answer replaces the cached setup. */
export function useSaveSetup() {
  const qc = useQueryClient();
  const companyId = useKpiCompanyId();
  return useMutation({
    mutationFn: (body: PutKpiSetupBody) => putKpiSetup(body, companyId),
    onSuccess: (setup) => {
      qc.setQueryData(keys.setup(companyId), setup);
      // The switch's status carries `setup_completed`; My KPIs depends on the assignments.
      void qc.invalidateQueries({ queryKey: ["kpi", "status"] });
      void qc.invalidateQueries({ queryKey: ["kpi", "my"] });
    },
  });
}

export function useCreateCustomKpi() {
  const qc = useQueryClient();
  const companyId = useKpiCompanyId();
  return useMutation({
    mutationFn: (body: CustomKpiBody) => createCustomKpi(body, companyId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.catalogue(companyId) });
    },
  });
}

export function useInviteOwners() {
  const companyId = useKpiCompanyId();
  return useMutation({ mutationFn: () => inviteKpiOwners(companyId) });
}

/**
 * KPI-12 `POST /kpi/ai/suggest-mapping`: disclosures from the company's
 * catalogue, found back by framework and code. AI down (an answer
 * `{available:false}`, a timeout or a 5xx) reads as unavailable, not an error.
 */
export function useSuggestMapping() {
  const companyId = useKpiCompanyId();
  const catalogue = useQuery({ queryKey: keys.catalogue(companyId), queryFn: () => getKpiCatalogue(companyId), staleTime: 5 * 60_000 });
  return useMutation({
    mutationFn: async (body: { name: string; question?: string; unit?: string | null; topic?: string | null }): Promise<MappingSuggestions> => {
      const cat = catalogue.data ?? (await catalogue.refetch()).data;
      const find = (framework: string, code: string) => {
        const ids = new Set((cat?.frameworks ?? []).filter((f) => f.code === framework).map((f) => f.id));
        return cat?.disclosures.find((d) => ids.has(d.framework_id) && d.code === code)?.id;
      };
      try {
        return readMappingSuggestions(await suggestKpiMapping(body, companyId), find);
      } catch (e) {
        if (isAiDown(e)) return { available: false, message: null, suggestions: [] };
        throw e;
      }
    },
  });
}
