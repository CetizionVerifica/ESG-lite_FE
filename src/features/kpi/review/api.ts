import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { KpiLockBody, KpiUnlockBody, KpiValueInput } from "../../../lib/kpi/contracts";
import { useKpiCompanyId } from "../../../lib/kpi/switch";
import {
  approveKpiValues,
  getKpiPeriodLock,
  getKpiValues,
  lockKpiPeriod,
  rejectKpiValues,
  saveKpiValues,
  unlockKpiPeriod,
} from "../../../services/kpiService";
import { lastYearRange } from "./logic";
import type { KpiValue } from "../../../lib/kpi/contracts";

export { codeMessage, kpiErrorMessage, incompleteLeft } from "../../../services/kpiService";

/** `["kpi", "review", "pending", companyId]` is also what the Approvals tab counts with. */
export const reviewKeys = {
  all: ["kpi", "review"] as const,
  pending: (companyId: number | null) => ["kpi", "review", "pending", companyId] as const,
  lastYear: (companyId: number | null, range: { from: string; to: string } | null) => ["kpi", "review", "last-year", companyId, range] as const,
  lock: (companyId: number | null, year: number, month: number) => ["kpi", "review", "lock", companyId, year, month] as const,
};

/** Every value waiting for review in the caller's scope (`GET /kpi/values?status=pending`). */
export function usePendingValues() {
  const companyId = useKpiCompanyId();
  return useQuery({ queryKey: reviewKeys.pending(companyId), queryFn: () => getKpiValues({ status: "pending" }, companyId), staleTime: 15_000 });
}

/** Approved values a year before the pending ones, for "vs last year". */
export function useLastYear(values: KpiValue[] | undefined) {
  const companyId = useKpiCompanyId();
  const range = values ? lastYearRange(values) : null;
  return useQuery({
    queryKey: reviewKeys.lastYear(companyId, range),
    queryFn: () => getKpiValues({ status: "approved", from: range!.from, to: range!.to }, companyId),
    enabled: !!range,
    staleTime: 5 * 60_000,
  });
}

/** Anything that changes values: the review list, My KPIs, the dashboard and reports read them again. */
const refreshAll = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: ["kpi"], refetchType: "active" });

export function useReviewActions() {
  const qc = useQueryClient();
  const companyId = useKpiCompanyId();
  return {
    approve: (ids: number[], opts: { onlyReady?: boolean; keepalive?: boolean } = {}) => approveKpiValues(ids, opts, companyId),
    reject: useMutation({ mutationFn: ({ ids, reason }: { ids: number[]; reason: string }) => rejectKpiValues(ids, reason, companyId), onSettled: () => refreshAll(qc) }),
    edit: useMutation({
      mutationFn: async (input: KpiValueInput) => {
        const r = (await saveKpiValues([input], companyId)).results[0];
        if (!r) throw new Error("The server didn't answer for this value.");
        return r;
      },
      onSuccess: (r) => {
        if (r.ok) void refreshAll(qc);
      },
    }),
    refresh: () => refreshAll(qc),
  };
}

/** `GET /kpi/periods/lock?year=&period=`: what's left per site, and the locks. */
export function useKpiLock(year: number, month: number) {
  const companyId = useKpiCompanyId();
  return useQuery({ queryKey: reviewKeys.lock(companyId, year, month), queryFn: () => getKpiPeriodLock(year, month, companyId), placeholderData: (prev) => prev });
}

export function useLockActions() {
  const qc = useQueryClient();
  const companyId = useKpiCompanyId();
  const done = () => qc.invalidateQueries({ queryKey: reviewKeys.all });
  return {
    /** One lock per site, so a Manager locks the sites they run. */
    lock: useMutation({ mutationFn: async (bodies: KpiLockBody[]) => Promise.all(bodies.map((b) => lockKpiPeriod(b, companyId))), onSettled: done }),
    unlock: useMutation({ mutationFn: (body: KpiUnlockBody) => unlockKpiPeriod(body, companyId), onSettled: done }),
  };
}
