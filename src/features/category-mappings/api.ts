import { useCallback } from "react";
import { type UseQueryResult, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  bulkCreateMappings,
  bulkDeleteMappings,
  createMapping,
  deleteMapping,
  getMappings,
  parseMappingExcel,
  updateMapping,
} from "../../services/categoryMappingService";
import { getCategories } from "../../services/categoryService";
import { getCompanies } from "../../services/companyService";
import { getEmissionFactorsByCategory } from "../../services/emissionFactorService";
import { getSites } from "../../services/siteService";
import type { Category, Company, CreatePayload, Factor, FactorIndex, Mapping, Site, UpdatePayload } from "./logic";

export const keys = {
  all: ["category-mappings"] as const,
  mappings: () => [...keys.all, "mappings"] as const,
  factors: (categoryId: number) => [...keys.all, "factors", categoryId] as const,
  sites: () => [...keys.all, "sites"] as const,
  companies: () => [...keys.all, "companies"] as const,
  categories: () => [...keys.all, "categories"] as const,
};

/** Server message from an axios error (Node `message` or FastAPI `detail`), or the fallback. */
export function errorMessage(e: unknown, fallback: string): string {
  const data = (e as { response?: { data?: { message?: unknown; detail?: unknown } } })?.response?.data;
  const msg = data?.message ?? data?.detail;
  return typeof msg === "string" && msg ? msg : fallback;
}

/** Lists arrive bare or wrapped (`{ sites: [...] }`); always hand back an array. */
function asList<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  const inner = (data as Record<string, unknown> | null)?.[key];
  return Array.isArray(inner) ? (inner as T[]) : [];
}

/** Every mapping; the page filters client-side (a few hundred rows at most per client). */
export const useMappings = () => useQuery<Mapping[]>({ queryKey: keys.mappings(), queryFn: async () => asList<Mapping>(await getMappings(), "mappings") });
export const useSites = () => useQuery<Site[]>({ queryKey: keys.sites(), queryFn: async () => asList<Site>(await getSites(), "sites"), staleTime: 60_000 });
export const useCompanies = () =>
  useQuery<Company[]>({ queryKey: keys.companies(), queryFn: async () => asList<Company>(await getCompanies(), "companies"), staleTime: 5 * 60_000 });
export const useCategories = () =>
  useQuery<Category[]>({ queryKey: keys.categories(), queryFn: async () => asList<Category>(await getCategories(), "categories"), staleTime: 5 * 60_000 });

/**
 * Factors of each category in use, so rows can show ✓ matched / ⚠ no factor.
 * A category that fails stays out of the index and its rows read "unknown".
 */
export function useFactorIndex(categoryIds: number[]): { index: FactorIndex; loading: boolean; failed: boolean } {
  const idsKey = categoryIds.join(",");
  // Stable combine: re-runs only when a result changes, so the index keeps its identity.
  const combine = useCallback(
    (results: UseQueryResult<Factor[]>[]) => {
      const ids = idsKey ? idsKey.split(",").map(Number) : [];
      const index: FactorIndex = new Map();
      results.forEach((r, i) => {
        if (r.data) index.set(ids[i], r.data);
      });
      return { index, loading: results.some((r) => r.isPending), failed: results.some((r) => r.isError) };
    },
    [idsKey],
  );
  return useQueries({
    queries: categoryIds.map((id) => ({
      queryKey: keys.factors(id),
      queryFn: async () => asList<Factor>(await getEmissionFactorsByCategory(id), "factors"),
      staleTime: 5 * 60_000,
    })),
    combine,
  });
}

export function useSaveMapping() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: null; payload: CreatePayload } | { id: number; payload: UpdatePayload }) =>
      args.id === null ? createMapping(args.payload) : updateMapping(args.id, args.payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.mappings() }),
  });
}

/** One id goes to the single delete, several to the bulk one. */
export function useRemoveMappings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number[]) => {
      if (ids.length === 1) await deleteMapping(ids[0]);
      else await bulkDeleteMappings(ids);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.mappings() }),
  });
}

export const useParseSheet = () => useMutation({ mutationFn: (file: File) => parseMappingExcel(file) });

export function useImportMappings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payloads: CreatePayload[]) => bulkCreateMappings(payloads),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.mappings() }),
  });
}
