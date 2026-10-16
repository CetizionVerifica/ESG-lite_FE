import { type QueryClient, keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { getUserColumnConfigsBySiteAndCategory } from "../../services/columnConfigService";
import { type EmissionDocument, getDocumentsByEmission } from "../../services/documentService";
import { getUserEmissionFactorsBySiteAndCategory } from "../../services/emissionFactorService";
import { type UnitData, getUserUnitsBySiteAndCategory } from "../../services/unitService";
import { getThresholdByCompany } from "../../services/thresholdService";
import { invalidateEmissionQueries } from "../../lib/emissionQueries";
import { DEFAULT_THRESHOLD_PCT } from "../../lib/scope3/checks";
import { type PendingFilter, fetchPendingForApproval } from "../../lib/emissions/pendingCount";
import {
  type EmissionUploadBatch,
  approveEmission,
  approveEmissionsByBatch,
  getEmissionBatches,
  rejectEmissionsByBatch,
  bulkApproveEmissions,
  bulkApproveReady,
  bulkDeleteEmissions,
  bulkRejectEmissions,
  getEmissionFactorForEmission,
  getEmissionsPaginated,
  managerUpdateEmission,
  rejectEmission,
} from "../../services/emissionService";
import type { ColumnConfig, LedgerRow, listParams } from "./logic";
import { attentionOf, historyMonths, isFoldedFeraTwin, monthlyHistory, reviewCounts, rowMonth } from "./logic";

export const keys = {
  all: ["approvals-ledger"] as const,
  list: (params: ReturnType<typeof listParams>) => [...keys.all, "list", params] as const,
  counts: (siteIds: number[]) => [...keys.all, "counts", siteIds] as const,
  documents: (id: number) => [...keys.all, "documents", id] as const,
  factor: (id: number) => [...keys.all, "factor", id] as const,
  batches: (siteIds: number[], categoryIds: number[]) => [...keys.all, "batches", siteIds, categoryIds] as const,
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

export function useEmissionList(params: ReturnType<typeof listParams>, enabled = true) {
  return useQuery({
    queryKey: keys.list(params),
    enabled,
    queryFn: async () => {
      const res = await getEmissionsPaginated(params);
      return { ...res, data: res.data as LedgerRow[] };
    },
    placeholderData: keepPreviousData,
  });
}

/**
 * Pending / approved / rejected counts for the chosen sites, category, period and search
 * (tab badge), so the badge matches the list. Pending leaves out FERA twins, as
 * the list folds them away.
 */
export function useStatusCounts(siteIds: number[], feraIds: number[], filter: PendingFilter = {}) {
  return useQuery({
    queryKey: [...keys.counts(siteIds), feraIds, filter],
    queryFn: async () => {
      const narrow = Object.fromEntries(Object.entries(filter).filter(([, v]) => v != null));
      const [{ summary }, pending] = await Promise.all([
        getEmissionsPaginated({ siteIds, ...narrow, page: 1, limit: 1 }),
        fetchPendingForApproval(siteIds, feraIds, filter),
      ]);
      return { ...summary, pending_count: pending };
    },
    placeholderData: keepPreviousData,
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
export function useBatches(siteIds: number[], categoryIds: number[]) {
  return useQuery({
    queryKey: keys.batches(siteIds, categoryIds),
    queryFn: (): Promise<EmissionUploadBatch[]> => getEmissionBatches(siteIds, categoryIds),
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

/**
 * How many of a batch's pending rows need attention (XI5): matched by the smart
 * import below 80 % or changed in the plan. Undefined on an API without the count.
 */
export function useBatchAttention(batch: Pick<EmissionUploadBatch, "upload_batch_id" | "site_id"> | null) {
  return useQuery({
    queryKey: [...keys.all, "batch-attention", batch?.upload_batch_id ?? null],
    enabled: batch !== null,
    queryFn: async () => {
      const b = batch as EmissionUploadBatch;
      const { summary } = await getEmissionsPaginated({ siteIds: [b.site_id], batchId: b.upload_batch_id, status: "pending", page: 1, limit: 1 });
      return attentionOf(summary);
    },
  });
}

/**
 * XI5: how many rows of the list the smart import was least sure about. Same
 * filters as the list (pending only on Approvals), without the attention
 * filter, paging or sort, so the chip counts exactly the rows it would show.
 * `null` params turn it off; the count is `null` when the API sends none (older API).
 */
export function useListAttention(params: ReturnType<typeof listParams> | null) {
  const narrow = params ? { ...params, attention: null, sort: null, order: null, page: 1, limit: 1 } : null;
  return useQuery({
    queryKey: [...keys.all, "list-attention", narrow],
    enabled: narrow !== null,
    queryFn: async () => {
      const { summary } = await getEmissionsPaginated(narrow as NonNullable<typeof narrow>);
      return attentionOf(summary);
    },
  });
}

/** The most rows "Export" fetches for the current filter in one go. */
export const EXPORT_CAP = 10000;

/** Every row matching the list filter (not just this page), up to EXPORT_CAP. */
export async function fetchAllForExport(params: ReturnType<typeof listParams>, total: number) {
  const limit = Math.min(Math.max(total, 1), EXPORT_CAP);
  const res = await getEmissionsPaginated({ ...params, page: 1, limit });
  return { rows: res.data as LedgerRow[], capped: res.total > limit };
}

// ─── Review queue (S3-15) ───────────────────────────────────────────────────

/**
 * "Ready (n)" and "Needs attention (n)" for the approvals list: the summary's
 * `ready` and `held` with the list's own filters, without the group filter.
 * `null` on an API without review checks.
 */
export function useReviewCounts(params: ReturnType<typeof listParams> | null) {
  const narrow = params ? { ...params, ready: null, attention: null, sort: null, order: null, page: 1, limit: 1 } : null;
  return useQuery({
    queryKey: [...keys.all, "review-counts", narrow],
    enabled: narrow !== null,
    queryFn: async () => reviewCounts((await getEmissionsPaginated(narrow as NonNullable<typeof narrow>)).summary),
    placeholderData: keepPreviousData,
  });
}

const READY_PAGE = 200;
/** The most ready rows one "Approve all ready" sends. */
export const READY_CAP = 5000;

/**
 * Ids of every pending entry whose checks pass, with the list's filters (not
 * just this page). A FERA twin folded into its pending parent is left out:
 * approving the parent approves it, and the server counts the pair once (a
 * pair is ready only when both rows are), so the ids match the "Ready" count.
 */
export async function fetchReadyIds(params: ReturnType<typeof listParams>): Promise<number[]> {
  const ids: number[] = [];
  const base = { ...params, status: "pending", ready: true, attention: null, sort: null, order: null, limit: READY_PAGE };
  for (let page = 1; ids.length < READY_CAP; page++) {
    const res = await getEmissionsPaginated({ ...base, page });
    for (const r of res.data) if (!isFoldedFeraTwin(r)) ids.push(r.pk_id);
    if (res.data.length < READY_PAGE || ids.length >= res.total) break;
  }
  return [...new Set(ids)].slice(0, READY_CAP);
}

/** Approve the given rows, but only those whose checks pass (the server skips the rest). */
export function commitApproveReady(ids: number[], opts?: { keepalive?: boolean }) {
  return bulkApproveReady(ids, opts);
}

/** Company change limit % for the WITHIN_THRESHOLD copy; the backend default when it can't be read. */
export function useThreshold(companyId: number | null) {
  return useQuery({
    queryKey: ["threshold", companyId ?? 0],
    enabled: !!companyId,
    queryFn: async () => {
      try {
        const pct = Number(await getThresholdByCompany(companyId as number));
        return Number.isFinite(pct) ? pct : DEFAULT_THRESHOLD_PCT;
      } catch {
        return DEFAULT_THRESHOLD_PCT;
      }
    },
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Six months of the same site, category and activity up to the row's month,
 * for the drawer's mini chart. Read through the list endpoint one month at a
 * time (in parallel) and narrowed to the activity here; there's no history endpoint yet.
 */
export function useEntryHistory(row: LedgerRow | null) {
  const anchor = row ? rowMonth(row) : null;
  const siteId = row?.site?.site_id;
  const categoryId = row?.category?.category_id;
  const months = anchor ? historyMonths(anchor) : [];
  return useQuery({
    queryKey: [...keys.all, "history", row?.pk_id ?? 0, siteId ?? 0, categoryId ?? 0, months, row?.activity_data?.emission_category ?? null],
    enabled: !!row && !!anchor && !!siteId && !!categoryId,
    queryFn: async () => {
      const pages = await Promise.all(
        months.map(({ year, month }) => getEmissionsPaginated({ siteIds: [siteId as number], categoryId: categoryId as number, year, month, page: 1, limit: 500 })),
      );
      return monthlyHistory(row as LedgerRow, pages.flatMap((p) => p.data));
    },
  });
}
