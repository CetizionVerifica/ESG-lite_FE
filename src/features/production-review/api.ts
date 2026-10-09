import { useCallback } from "react";
import { type QueryObserverResult, keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Product, getProductsBySite } from "../../services/productService";
import {
  type ProductionData,
  approveProductionData,
  bulkApproveProductionData,
  bulkRejectProductionData,
  getEmissionIntensity,
  getProductionDataForManager,
  managerUpdateProductionData,
  rejectProductionData,
} from "../../services/productionDataService";
import { type ProductionRow, byNewest, editPayload, type EditDraft } from "./logic";

export const keys = {
  all: ["production-review"] as const,
  list: (siteId: number, productId: number | null, from: string | null, to: string | null) => [...keys.all, "list", siteId, productId, from, to] as const,
  products: (siteId: number) => ["products", "site", siteId] as const,
  impact: (siteId: number, from: string, to: string) => [...keys.all, "impact", siteId, from, to] as const,
};

/** Server message from an axios error, or the fallback. */
export function errorMessage(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof msg === "string" && msg ? msg : fallback;
}

/**
 * Production records for the chosen sites, every status (status is filtered
 * on the page, so overlaps are found across statuses). One request per site:
 * `/user/production-data/manager` must always get a `siteId`, because without
 * one it isn't limited to the manager's company.
 */
export function useProductionList(siteIds: number[], productId: number | null, range: { from: string; to: string } | null) {
  const sites = siteIds.join(",");
  // Stable, so the merged rows keep their identity until a result changes.
  const combine = useCallback(
    (results: QueryObserverResult<ProductionData[]>[]) => {
      const asked = sites.split(",").map(Number);
      const failed = results.find((r) => r.isError);
      return {
        rows: results.every((r) => r.data !== undefined)
          ? results
              .flatMap((r) => r.data as ProductionData[])
              // Belt and braces: keep only the sites asked for.
              .filter((r) => asked.includes(r.site?.site_id))
              .sort(byNewest)
          : undefined,
        isPending: results.some((r) => r.isPending),
        isFetching: results.some((r) => r.isFetching),
        error: failed?.error ?? null,
        refetch: () => results.forEach((r) => r.isError && void r.refetch()),
      };
    },
    [sites],
  );
  return useQueries({
    queries: siteIds.map((siteId) => ({
      queryKey: keys.list(siteId, productId, range?.from ?? null, range?.to ?? null),
      queryFn: () =>
        getProductionDataForManager({
          siteId,
          ...(productId ? { productId } : {}),
          ...(range ? { startDate: range.from, endDate: range.to } : {}),
        }),
      placeholderData: keepPreviousData,
    })),
    combine,
  });
}

/** Products on the chosen sites (the product filter and the "no products" state). */
export function useSiteProducts(siteIds: number[]) {
  const combine = useCallback(
    (results: QueryObserverResult<Product[]>[]) => ({
      products: results.every((r) => r.data !== undefined) ? results.flatMap((r) => r.data as Product[]) : undefined,
      isError: results.some((r) => r.isError),
    }),
    [],
  );
  return useQueries({
    queries: siteIds.map((siteId) => ({
      queryKey: keys.products(siteId),
      queryFn: () => getProductsBySite(siteId),
      staleTime: 5 * 60 * 1000,
    })),
    combine,
  });
}

/** Approved emissions and production for the record's site and dates. */
export function useImpactBase(row: ProductionRow | null) {
  const siteId = row?.site?.site_id ?? 0;
  const from = row?.start_date.slice(0, 10) ?? "";
  const to = row?.end_date.slice(0, 10) ?? "";
  return useQuery({
    queryKey: keys.impact(siteId, from, to),
    queryFn: async () => {
      const d = await getEmissionIntensity(siteId, { startDate: from, endDate: to });
      return { emissions: d.totalEmissions, byUnit: d.productionByUnit };
    },
    enabled: !!row && siteId > 0,
  });
}

/** Approve one record now (the page delays it for the undo window). */
export function commitApprove(id: number, opts?: { keepalive?: boolean }) {
  return approveProductionData(id, opts);
}

export function useReviewMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: keys.all });
    // Overview's "production records pending" count.
    void qc.invalidateQueries({ queryKey: ["overview", "production-pending"] });
  };
  const reject = useMutation({
    mutationFn: ({ ids, reason }: { ids: number[]; reason: string }) =>
      ids.length === 1 ? rejectProductionData(ids[0], reason) : bulkRejectProductionData(ids, reason),
    onSettled: refresh,
  });
  const approveMany = useMutation({ mutationFn: (ids: number[]) => bulkApproveProductionData(ids), onSettled: refresh });
  const edit = useMutation({
    mutationFn: ({ id, draft }: { id: number; draft: EditDraft }) => managerUpdateProductionData(id, editPayload(draft)),
    onSettled: (_d, _e, v) => {
      refresh();
      void qc.invalidateQueries({ queryKey: ["audit-logs", "production_data", v.id] });
    },
  });
  return { reject, approveMany, edit, refresh };
}
