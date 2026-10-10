import { useCallback } from "react";
import { type QueryObserverResult, useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { type Product, getProductsBySite } from "../../services/productService";
import {
  type ProductionData,
  bulkCreateProductionData,
  createProductionData,
  deleteProductionData,
  getProductionDataBySite,
  updateProductionData,
} from "../../services/productionDataService";
import { type SiteOption, byPeriod } from "./logic";

export const keys = {
  all: ["production"] as const,
  site: (siteId: number) => [...keys.all, "site", siteId] as const,
  products: (siteId: number) => ["products", "site", siteId] as const,
};

/** Server message from an axios error, or the fallback. */
export function errorMessage(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof msg === "string" && msg ? msg : fallback;
}

/**
 * Every production record of the chosen sites (one request per site, all
 * dates). The period and product filters apply on the page, so the product
 * cards and the overlap warnings always see the whole history.
 */
export function useSiteProduction(siteIds: number[]) {
  const combine = useCallback((results: QueryObserverResult<ProductionData[]>[]) => {
    const failed = results.find((r) => r.isError);
    return {
      rows: results.every((r) => r.data !== undefined) ? results.flatMap((r) => r.data as ProductionData[]).sort(byPeriod) : undefined,
      isPending: results.some((r) => r.isPending),
      isFetching: results.some((r) => r.isFetching),
      error: failed?.error ?? null,
      refetch: () => results.forEach((r) => void r.refetch()),
    };
  }, []);
  return useQueries({
    queries: siteIds.map((siteId) => ({ queryKey: keys.site(siteId), queryFn: () => getProductionDataBySite(siteId) })),
    combine,
  });
}

/** Products of the chosen sites; each carries its site even if the API leaves it out. */
export function useSiteProducts(sites: SiteOption[]) {
  const combine = useCallback((results: QueryObserverResult<Product[]>[]) => {
    const failed = results.find((r) => r.isError);
    return {
      products: results.every((r) => r.data !== undefined) ? results.flatMap((r) => r.data as Product[]) : undefined,
      isPending: results.some((r) => r.isPending),
      error: failed?.error ?? null,
      refetch: () => results.forEach((r) => void r.refetch()),
    };
  }, []);
  return useQueries({
    queries: sites.map((site) => ({
      queryKey: keys.products(site.site_id),
      queryFn: async () => (await getProductsBySite(site.site_id)).map((p) => ({ ...p, site: p.site?.site_id ? p.site : site })),
      staleTime: 5 * 60 * 1000,
    })),
    combine,
  });
}

export function useProductionMutations() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: keys.all });
    // P08's queue and P02's production card read the same records.
    void qc.invalidateQueries({ queryKey: ["production-review"] });
    void qc.invalidateQueries({ queryKey: ["my-month"] });
  };
  const create = useMutation({ mutationFn: createProductionData, onSettled: refresh });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Parameters<typeof updateProductionData>[1] }) => updateProductionData(id, body),
    onSettled: (_d, _e, v) => {
      refresh();
      void qc.invalidateQueries({ queryKey: ["audit-logs", "production_data", v.id] });
    },
  });
  const remove = useMutation({ mutationFn: (id: number) => deleteProductionData(id), onSettled: refresh });
  const bulk = useMutation({ mutationFn: bulkCreateProductionData, onSettled: refresh });
  return { create, update, remove, bulk };
}
