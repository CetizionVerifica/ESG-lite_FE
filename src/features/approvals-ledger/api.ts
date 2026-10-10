import { type QueryClient, keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { getUserColumnConfigsBySiteAndCategory } from "../../services/columnConfigService";
import { type EmissionDocument, getDocumentsByEmission } from "../../services/documentService";
import { getUserEmissionFactorsBySiteAndCategory } from "../../services/emissionFactorService";
import { type UnitData, getUserUnitsBySiteAndCategory } from "../../services/unitService";
import { invalidateEmissionQueries } from "../../lib/emissionQueries";
import {
  type EmissionUploadBatch,
  approveEmission,
  approveEmissionsByBatch,
  getEmissionBatches,
  rejectEmissionsByBatch,
  bulkApproveEmissions,
  bulkDeleteEmissions,
  bulkRejectEmissions,
  getEmissionFactorForEmission,
  getEmissionsPaginated,
  managerUpdateEmission,
  rejectEmission,
} from "../../services/emissionService";
import type { ColumnConfig, LedgerRow, listParams } from "./logic";

export const keys = {
  all: ["approvals-ledger"] as const,
  list: (params: ReturnType<typeof listParams>) => [...keys.all, "list", params] as const,
  counts: (siteIds: number[]) => [...keys.all, "counts", siteIds] as const,
  documents: (id: number) => [...keys.all, "documents", id] as const,
  factor: (id: number) => [...keys.all, "factor", id] as const,
  batches: (siteIds: number[], categoryId: number | null) => [...keys.all, "batches", siteIds, categoryId] as const,
  units: (siteId: number, categoryId: number) => ["units", siteId, categoryId] as const,
  factorNames: (siteId: number, categoryId: number, year: number) => [...keys.all, "factor-names", siteId, categoryId, year] as const,
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

/** Column configs for every site × category among `rows` (cached ones are reused), as a lookup. */
export async function loadConfigs(qc: QueryClient, rows: LedgerRow[]) {
  const pairs = new Map<string, [number, number]>();
  for (const r of rows) if (r.site && r.category) pairs.set(`${r.site.site_id}:${r.category.category_id}`, [r.site.site_id, r.category.category_id]);
  const loaded = await Promise.all(
    [...pairs].map(async ([key, [s, c]]) => [key, (await qc.fetchQuery({ queryKey: keys.config(s, c), queryFn: () => fetchConfig(s, c), staleTime: CONFIG_STALE })) ?? undefined] as const),
  );
  const byPair = new Map(loaded);
  return (siteId: number, categoryId: number) => byPair.get(`${siteId}:${categoryId}`);
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
  const refresh = () => invalidateEmissionQueries(qc);
  const reject = useMutation({
    mutationFn: ({ ids, reason }: { ids: number[]; reason: string }) =>
      ids.length === 1 ? rejectEmission(ids[0], reason) : bulkRejectEmissions(ids, reason),
    onSettled: refresh,
  });
  const approveMany = useMutation({ mutationFn: (ids: number[]) => bulkApproveEmissions(ids), onSettled: refresh });
  const remove = useMutation({ mutationFn: (ids: number[]) => bulkDeleteEmissions(ids), onSettled: refresh });
  return { reject, approveMany, remove, refresh };
}

export function useUnits(siteId: number | undefined, categoryId: number | undefined) {
  return useQuery({
    queryKey: keys.units(siteId ?? 0, categoryId ?? 0),
    queryFn: async () => (await getUserUnitsBySiteAndCategory(siteId as number, categoryId as number)) as UnitData[],
    enabled: !!siteId && !!categoryId,
    staleTime: CONFIG_STALE,
  });
}

/** Factor names a manager may pick when the form has no category mapping (the year before the entry, as before). */
export function useFactorNames(siteId: number | undefined, categoryId: number | undefined, year: number, enabled: boolean) {
  return useQuery({
    queryKey: keys.factorNames(siteId ?? 0, categoryId ?? 0, year),
    queryFn: async () => {
      const factors = (await getUserEmissionFactorsBySiteAndCategory(siteId as number, categoryId as number, year)) as Array<{ emission_category_name?: string }>;
      return [...new Set(factors.map((f) => f.emission_category_name).filter((n): n is string => !!n))];
    },
    enabled: enabled && !!siteId && !!categoryId,
    staleTime: CONFIG_STALE,
  });
}

export function useManagerEdit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Parameters<typeof managerUpdateEmission>[1] }) => managerUpdateEmission(id, body),
    onSettled: (_d, _e, v) => {
      void invalidateEmissionQueries(qc);
      void qc.invalidateQueries({ queryKey: ["audit-logs", "emission", v.id] });
    },
  });
}

/**
 * Upload batches for these sites. Always pass the manager's sites when no site
 * is picked: `/user/emissions/batches` doesn't limit itself to the user's sites.
 */
export function useBatches(siteIds: number[], categoryId: number | null) {
  return useQuery({
    queryKey: keys.batches(siteIds, categoryId),
    queryFn: (): Promise<EmissionUploadBatch[]> => getEmissionBatches(siteIds, categoryId),
    enabled: siteIds.length > 0,
  });
}

export function useBatchMutations() {
  const qc = useQueryClient();
  const refresh = () => invalidateEmissionQueries(qc);
  const approve = useMutation({ mutationFn: (batchId: string) => approveEmissionsByBatch(batchId), onSettled: refresh });
  const reject = useMutation({
    mutationFn: ({ batchId, reason }: { batchId: string; reason: string }) => rejectEmissionsByBatch(batchId, reason),
    onSettled: refresh,
  });
  return { approve, reject };
}

/** The most rows "Export" fetches for the current filter in one go. */
export const EXPORT_CAP = 10000;

/** Every row matching the list filter (not just this page), up to EXPORT_CAP. */
export async function fetchAllForExport(params: ReturnType<typeof listParams>, total: number) {
  const limit = Math.min(Math.max(total, 1), EXPORT_CAP);
  const res = await getEmissionsPaginated({ ...params, page: 1, limit });
  return { rows: res.data as LedgerRow[], capped: res.total > limit };
}
