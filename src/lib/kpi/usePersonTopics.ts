import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../context/AuthContext";
import { getKpiStatus, getPersonTopics, putPersonTopics } from "../../services/kpiService";
import type { PutKpiPersonTopicsBody } from "./contracts";
import { kpiStatusKey, resolveKpiTracking, useKpiTracking } from "./switch";

export const personTopicsKey = (userId: number | null, companyId: number | null) => ["kpi", "people", userId, "topics", companyId] as const;

/**
 * Whether a company's KPI switch is on, for a drawer that edits someone of
 * that company: the signed-in company for its own people, the person's
 * client (`GET /kpi/status?company_id=`) for a Superadmin.
 */
export function useKpiOnFor(companyId: number | null): boolean {
  const { role } = useAuth();
  const staff = role === "Superadmin";
  const own = useKpiTracking();
  const status = useQuery({ queryKey: kpiStatusKey(companyId), queryFn: () => getKpiStatus(companyId), enabled: staff && companyId !== null, staleTime: 60_000 });
  if (!staff) return own;
  return companyId !== null && resolveKpiTracking(status.data?.enabled, false);
}

/** `GET /kpi/people/:user_id/topics` while the field shows. */
export function usePersonTopics(userId: number | null, companyId: number | null, enabled: boolean) {
  return useQuery({ queryKey: personTopicsKey(userId, companyId), queryFn: () => getPersonTopics(userId as number, companyId), enabled: enabled && userId !== null, staleTime: 30_000 });
}

/** `PUT /kpi/people/:user_id/topics`; setup and My KPIs read the new owners afterwards. */
export function useSavePersonTopics() {
  const qc = useQueryClient();
  return useMutation({
    /** `companyId`: the person's client for a Superadmin; null for a company's own people. */
    mutationFn: ({ userId, body, companyId = null }: { userId: number; body: PutKpiPersonTopicsBody; companyId?: number | null }) => putPersonTopics(userId, body, companyId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["kpi", "people"] });
      void qc.invalidateQueries({ queryKey: ["kpi", "setup"] });
      void qc.invalidateQueries({ queryKey: ["kpi", "my"] });
    },
  });
}
