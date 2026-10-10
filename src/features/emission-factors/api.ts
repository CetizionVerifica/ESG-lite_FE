import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCategories } from "../../services/categoryService";
import { getCompanies } from "../../services/companyService";
import { getEmissionFactorUploads } from "../../services/emissionFactorParseService";
import {
  bulkDeleteEmissionFactors,
  createEmissionFactor,
  deleteEmissionFactor,
  deleteEmissionFactorsByBatch,
  getEmissionFactorBatches,
  getEmissionFactors,
  updateEmissionFactor,
} from "../../services/emissionFactorService";
import { getSites } from "../../services/siteService";
import { getUsers } from "../../services/userService";
import type { Batch, Category, Company, FactorPage, FactorPayload, ListParams, Site, UploadRecord } from "./logic";

export const keys = {
  all: ["emission-factors"] as const,
  list: (p: ListParams) => [...keys.all, "list", p] as const,
  batches: (clientId: number | null) => [...keys.all, "batches", clientId] as const,
  uploads: () => [...keys.all, "uploads"] as const,
  sites: () => [...keys.all, "sites"] as const,
  companies: () => [...keys.all, "companies"] as const,
  categories: () => [...keys.all, "categories"] as const,
  users: () => [...keys.all, "users"] as const,
};

/** Server message from an axios (or FastAPI `detail`) error, or the fallback. 5xx bodies are never shown. */
export function errorMessage(e: unknown, fallback: string): string {
  const res = (e as { response?: { status?: number; data?: { message?: unknown; detail?: unknown } } })?.response;
  if (!res || (res.status ?? 0) >= 500) return fallback;
  const msg = res.data?.message ?? res.data?.detail;
  return typeof msg === "string" && msg ? msg : fallback;
}

/** Lists arrive bare or wrapped (`{ sites: [...] }`); always hand back an array. */
function asList<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  const inner = (data as Record<string, unknown> | null)?.[key];
  return Array.isArray(inner) ? (inner as T[]) : [];
}

const LONG = 5 * 60_000;

export const useFactors = (p: ListParams) =>
  useQuery<FactorPage>({
    queryKey: keys.list(p),
    queryFn: async () => (await getEmissionFactors(p)) as FactorPage,
    placeholderData: keepPreviousData,
  });

export const useBatches = (clientId: number | null) =>
  useQuery<Batch[]>({
    queryKey: keys.batches(clientId),
    queryFn: async () => asList<Batch>(await getEmissionFactorBatches(null, null, clientId), "batches"),
  });

/** Upload history lives in the AI service; the Imports tab still works without it. */
export const useUploads = (enabled: boolean) =>
  useQuery<UploadRecord[]>({
    queryKey: keys.uploads(),
    queryFn: async () => asList<UploadRecord>(await getEmissionFactorUploads(), "uploads"),
    enabled,
    retry: 1,
  });

export const useSites = () => useQuery<Site[]>({ queryKey: keys.sites(), queryFn: async () => asList<Site>(await getSites(), "sites"), staleTime: LONG });
export const useCompanies = () =>
  useQuery<Company[]>({ queryKey: keys.companies(), queryFn: async () => asList<Company>(await getCompanies(), "companies"), staleTime: LONG });
export const useCategories = () =>
  useQuery<Category[]>({ queryKey: keys.categories(), queryFn: async () => asList<Category>(await getCategories(), "categories"), staleTime: LONG });

export type UserName = { user_id: number; name?: string | null; last_name?: string | null; email?: string | null };
/** Only names the uploader; a failure shows "User #id". */
export const useUserNames = (enabled: boolean) =>
  useQuery<UserName[]>({ queryKey: keys.users(), queryFn: async () => asList<UserName>(await getUsers(), "users"), enabled, retry: 1, staleTime: LONG });

export function useSaveFactor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number | null; body: FactorPayload | Partial<FactorPayload> }) =>
      id === null ? createEmissionFactor(body as FactorPayload) : updateEmissionFactor(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...keys.all, "list"] }),
  });
}

/** One factor, after the confirm dialog that names it. Entries already calculated keep their totals. */
export function useRemoveFactor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteEmissionFactor(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

/** The selected factors, after the confirm dialog that states how many. */
export function useRemoveFactors() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => bulkDeleteEmissionFactors(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

/** Every factor from one import, after the confirm dialog that states the count. */
export function useRemoveBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (batchId: string) => deleteEmissionFactorsByBatch(batchId),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}
