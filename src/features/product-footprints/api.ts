import { type QueryObserverResult, keepPreviousData, useQueries } from "@tanstack/react-query";
import { getPcfReconciliation, getPcfStudies } from "../../services/pcfService";
import { getProductsBySite } from "../../services/productService";
import { getProductionDataForManager } from "../../services/productionDataService";
import type { ApprovedProduction, Reconciliation, SiteProduct, Study } from "./logic";

export const keys = {
  all: ["product-footprints"] as const,
  studies: (siteId: number) => [...keys.all, "studies", siteId] as const,
  recon: (siteId: number, from: string, to: string) => [...keys.all, "reconciliation", siteId, from, to] as const,
  production: (siteId: number, from: string, to: string) => [...keys.all, "production", siteId, from, to] as const,
  products: (siteId: number) => ["products", "site", siteId] as const,
};

/** Server message from an axios error, or the fallback. */
export function errorMessage(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof msg === "string" && msg ? msg : fallback;
}

type Merged<T> = { data: T[] | undefined; isPending: boolean; error: unknown; refetch: () => void };

/** Joins one query per site into a single list; data is undefined until every site has answered. */
function merge<T>(results: QueryObserverResult<T[]>[]): Merged<T> {
  const failed = results.find((r) => r.isError);
  return {
    data: results.every((r) => r.data !== undefined) ? results.flatMap((r) => r.data as T[]) : undefined,
    isPending: results.some((r) => r.isPending),
    error: failed?.error ?? null,
    refetch: () => results.forEach((r) => r.isError && void r.refetch()),
  };
}

// Module-level so `combine` keeps one identity across renders.
const mergeProducts = (r: QueryObserverResult<SiteProduct[]>[]) => merge(r);
const mergeStudies = (r: QueryObserverResult<Study[]>[]) => merge(r);
const mergeProduction = (r: QueryObserverResult<ApprovedProduction[]>[]) => merge(r);
const mergeRecon = (r: QueryObserverResult<Reconciliation>[]) => {
  const failed = r.find((q) => q.isError);
  return {
    data: r.every((q) => q.data !== undefined) ? r.map((q) => q.data as Reconciliation) : undefined,
    isPending: r.some((q) => q.isPending),
    error: failed?.error ?? null,
    refetch: () => r.forEach((q) => q.isError && void q.refetch()),
  };
};

const asList = <T,>(data: unknown): T[] => (Array.isArray(data) ? (data as T[]) : []);

/** Products on the chosen sites. */
export function useSiteProducts(siteIds: number[]) {
  return useQueries({
    queries: siteIds.map((siteId) => ({
      queryKey: keys.products(siteId),
      queryFn: async () => asList<SiteProduct>(await getProductsBySite(siteId)),
    })),
    combine: mergeProducts,
  });
}

/** Every footprint study on the chosen sites, all versions (the page picks one per product). */
export function useStudies(siteIds: number[]) {
  return useQueries({
    queries: siteIds.map((siteId) => ({
      queryKey: keys.studies(siteId),
      queryFn: async () => asList<Study>(await getPcfStudies({ siteId })),
    })),
    combine: mergeStudies,
  });
}

/**
 * Approved production for the year. One request per site: the manager
 * endpoint must always get a `siteId`, or it isn't limited to the company.
 */
export function useApprovedProduction(siteIds: number[], from: string, to: string) {
  return useQueries({
    queries: siteIds.map((siteId) => ({
      queryKey: keys.production(siteId, from, to),
      queryFn: async () => asList<ApprovedProduction>(await getProductionDataForManager({ siteId, status: "approved", startDate: from, endDate: to })),
      placeholderData: keepPreviousData,
    })),
    combine: mergeProduction,
  });
}

/** Plant Scope 1+2 against what approved footprints for exactly this year allocate. */
export function useReconciliation(siteIds: number[], from: string, to: string) {
  return useQueries({
    queries: siteIds.map((siteId) => ({
      queryKey: keys.recon(siteId, from, to),
      queryFn: async () => (await getPcfReconciliation({ siteId, start: from, end: to })) as Reconciliation,
      placeholderData: keepPreviousData,
    })),
    combine: mergeRecon,
  });
}

