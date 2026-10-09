import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { getUserColumnConfigsBySiteAndCategory } from "../../services/columnConfigService";
import { type EmissionDocument, getDocumentsByEmission } from "../../services/documentService";
import {
  approveEmission,
  bulkApproveEmissions,
  bulkDeleteEmissions,
  bulkRejectEmissions,
  getEmissionFactorForEmission,
  getEmissionsPaginated,
  rejectEmission,
} from "../../services/emissionService";
import type { ColumnConfig, LedgerRow, listParams } from "./logic";

export const keys = {
  all: ["approvals-ledger"] as const,
  list: (params: ReturnType<typeof listParams>) => [...keys.all, "list", params] as const,
  counts: (siteIds: number[]) => [...keys.all, "counts", siteIds] as const,
  documents: (id: number) => [...keys.all, "documents", id] as const,
  factor: (id: number) => [...keys.all, "factor", id] as const,
  // Shared with other pages that read the same config.
  config: (siteId: number, categoryId: number) => ["column-config", siteId, categoryId] as const,
};

/** Server message from an axios error, or the fallback. */
export function errorMessage(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof msg === "string" && msg ? msg : fallback;
}

export function useEmissionList(params: ReturnType<typeof listParams>) {
  return useQuery({
    queryKey: keys.list(params),
    queryFn: async () => {
      const res = await getEmissionsPaginated(params);
      return { ...res, data: res.data as LedgerRow[] };
    },
    placeholderData: keepPreviousData,
  });
}

/** Pending / approved / rejected counts for the chosen sites, whatever the filters (tab badge). */
export function useStatusCounts(siteIds: number[]) {
  return useQuery({
    queryKey: keys.counts(siteIds),
    queryFn: async () => (await getEmissionsPaginated({ siteIds, page: 1, limit: 1 })).summary,
  });
}

async function fetchConfig(siteId: number, categoryId: number): Promise<ColumnConfig | null> {
  const configs = (await getUserColumnConfigsBySiteAndCategory(siteId, categoryId)) as ColumnConfig[] | null;
  return configs?.[0] ?? null;
}

const CONFIG_STALE = 10 * 60 * 1000;

/**
 * Column configs for the site × category pairs on screen, fetched in parallel
 * once each and cached (replaces the old sequential N×M loop).
 */
export function useColumnConfigs(pairs: Array<[number, number]>) {
  const unique = useMemo(() => {
    const seen = new Map<string, [number, number]>();
    for (const p of pairs) seen.set(p.join(":"), p);
    return [...seen.values()];
  }, [pairs]);
  const combine = useCallback(
    (results: Array<{ data?: ColumnConfig | null }>) => {
      const m = new Map<string, ColumnConfig | undefined>();
      unique.forEach((p, i) => m.set(p.join(":"), results[i]?.data ?? undefined));
      return m;
    },
    [unique],
  );
  const byPair = useQueries({
    queries: unique.map(([s, c]) => ({
      queryKey: keys.config(s, c),
      queryFn: () => fetchConfig(s, c),
      staleTime: CONFIG_STALE,
    })),
    // Stable combine: re-runs only when a result changes, so the map keeps its identity.
    combine,
  });
  return useCallback((siteId: number, categoryId: number) => byPair.get(`${siteId}:${categoryId}`), [byPair]);
}

export function useColumnConfig(siteId: number | undefined, categoryId: number | undefined) {
  return useQuery({
    queryKey: keys.config(siteId ?? 0, categoryId ?? 0),
    queryFn: () => fetchConfig(siteId as number, categoryId as number),
    enabled: !!siteId && !!categoryId,
    staleTime: CONFIG_STALE,
  });
}

export type LedgerDocument = EmissionDocument & { ai_invoice_id?: number | null };

export function useDocuments(emissionId: number | null) {
  return useQuery({
    queryKey: keys.documents(emissionId ?? 0),
    queryFn: async () => (await getDocumentsByEmission(emissionId as number)) as LedgerDocument[],
    enabled: emissionId !== null,
  });
}

/** Only for rows saved before factor snapshots existed. */
export function useFactor(emissionId: number | null) {
  return useQuery({
    queryKey: keys.factor(emissionId ?? 0),
    queryFn: async () => (await getEmissionFactorForEmission(emissionId as number)).emission_factor,
    enabled: emissionId !== null,
  });
}

/** Approve one entry now (the page delays it for the undo window). */
export function commitApprove(id: number, opts?: { keepalive?: boolean }) {
  return approveEmission(id, undefined, opts);
}

export function useReviewMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: keys.all });
  const reject = useMutation({
    mutationFn: ({ ids, reason }: { ids: number[]; reason: string }) =>
      ids.length === 1 ? rejectEmission(ids[0], reason) : bulkRejectEmissions(ids, reason),
    onSettled: refresh,
  });
  const approveMany = useMutation({ mutationFn: (ids: number[]) => bulkApproveEmissions(ids), onSettled: refresh });
  const remove = useMutation({ mutationFn: (ids: number[]) => bulkDeleteEmissions(ids), onSettled: refresh });
  return { reject, approveMany, remove, refresh };
}
