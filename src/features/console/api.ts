import { useCallback } from "react";
import { type UseQueryResult, useQueries, useQuery } from "@tanstack/react-query";
import { type Brand, getBrand } from "../../services/brandService";
import { getColumnConfigs } from "../../services/columnConfigService";
import { getCompanies } from "../../services/companyService";
import { getEmissionFactorBatches, getEmissionFactors } from "../../services/emissionFactorService";
import { getSites } from "../../services/siteService";
import { getThresholds } from "../../services/thresholdService";
import { getUnits } from "../../services/unitService";
import { getUsers } from "../../services/userService";
import type { ConsoleCompany, ConsoleSite, ConsoleThreshold, ConsoleUser, FactorBatch, SiteCategoryRef } from "./logic";

// No /admin/console summary exists yet, so the Console aggregates the
// existing Superadmin list endpoints client-side (spec: "Data").
export const keys = {
  all: ["console"] as const,
  list: (name: string) => [...keys.all, name] as const,
  factorYear: (siteId: number) => [...keys.all, "factor-year", siteId] as const,
  brand: (companyId: number) => [...keys.all, "brand", companyId] as const,
};

/** Server message from an axios error, or the fallback. */
export function errorMessage(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof msg === "string" && msg ? msg : fallback;
}

const list = <T,>(name: string, fn: () => Promise<unknown>) => ({
  queryKey: keys.list(name),
  queryFn: async () => {
    const data = (await fn()) as unknown;
    // Some list endpoints answer { companies: [...] } rather than a bare array.
    const rows = Array.isArray(data) ? data : (data as Record<string, unknown> | null)?.[name];
    return (Array.isArray(rows) ? rows : []) as T[];
  },
});

export const useCompanies = () => useQuery(list<ConsoleCompany>("companies", getCompanies));
export const useSites = () => useQuery(list<ConsoleSite>("sites", getSites));
export const useUsers = () => useQuery(list<ConsoleUser>("users", getUsers));
export const useColumnConfigs = () => useQuery(list<SiteCategoryRef>("column-configs", getColumnConfigs));
export const useUnits = () => useQuery(list<SiteCategoryRef>("units", getUnits));
export const useThresholds = () => useQuery(list<ConsoleThreshold>("thresholds", getThresholds));
/** Feeds the activity list only; a failure just blanks it. */
export const useFactorBatches = () => useQuery({ ...list<FactorBatch>("factor-batches", () => getEmissionFactorBatches()), retry: 1 });

/** Total emission factors: the paged list's `total`, asking for one row. */
export function useFactorTotal() {
  return useQuery({
    queryKey: keys.list("factor-total"),
    queryFn: async () => (await getEmissionFactors({ limit: 1 })).total ?? null,
    retry: 1,
  });
}

/**
 * Latest factor year per site. The list is ordered by year descending, so the
 * first row of a one-row page is the newest; no rows means no factors.
 */
export function useFactorYears(siteIds: number[]) {
  return useQueries({
    queries: siteIds.map((siteId) => ({
      queryKey: keys.factorYear(siteId),
      queryFn: async (): Promise<number | null> => {
        const page = await getEmissionFactors({ site_id: siteId, limit: 1 });
        const year = Number(page.data?.[0]?.year);
        return Number.isFinite(year) && year > 0 ? year : null;
      },
      retry: 1,
      staleTime: 5 * 60_000,
    })),
    // Stable so the combined Map only changes when a result does.
    combine: useCallback(
      (results: UseQueryResult<number | null>[]) => {
        const years = new Map<number, number | null>();
        results.forEach((r, i) => {
          if (r.isSuccess) years.set(siteIds[i], r.data);
        });
        return { years, pending: results.some((r) => r.isPending), failed: results.filter((r) => r.isError).length };
      },
      [siteIds],
    ),
  });
}

/** Saved brand per client (the endpoint returns defaults, without updatedAt, for a client with none). */
export function useBrands(companyIds: number[]) {
  return useQueries({
    queries: companyIds.map((id) => ({
      queryKey: keys.brand(id),
      queryFn: (): Promise<Brand> => getBrand(id),
      retry: 1,
      staleTime: 5 * 60_000,
    })),
    combine: useCallback(
      (results: UseQueryResult<Brand>[]) => {
        const brands = new Map<number, Brand>();
        results.forEach((r, i) => {
          if (r.isSuccess && r.data) brands.set(companyIds[i], r.data);
        });
        return { brands, pending: results.some((r) => r.isPending), failed: results.filter((r) => r.isError).length };
      },
      [companyIds],
    ),
  });
}
