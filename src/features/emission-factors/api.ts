import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCategories } from "../../services/categoryService";
import { getCompanies } from "../../services/companyService";
import { getEmissionFactorUploads, parseEmissionFactorExcel, reAnalyzeEmissionFactors, updateUploadResults } from "../../services/emissionFactorParseService";
import {
  bulkCreateEmissionFactors,
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
import type { JobResult, ParseResult, Schema, UploadPlan } from "./importLogic";
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
    mutationFn: ({ id, body }: { id: number | null; body: FactorPayload }) => (id === null ? createEmissionFactor(body) : updateEmissionFactor(id, body)),
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

/**
 * Saves an import plan: one bulk call per site and category, one after the
 * other so a failure names its site and the rest still go through.
 */
export function useImportFactors() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      plan,
      categoryName,
      uploadId,
      siteId,
    }: {
      plan: UploadPlan;
      categoryName: (id: number) => string;
      /** AI path: the upload record to stamp with the outcome. */
      uploadId?: number | null;
      siteId?: number | null;
    }): Promise<JobResult[]> => {
      const results: JobResult[] = [];
      for (const job of plan.jobs) {
        const base = { site: job.site.name, siteId: job.site.site_id, category: categoryName(job.categoryId), categoryId: job.categoryId };
        try {
          const res = (await bulkCreateEmissionFactors(job.factors)) as { created?: number; skipped?: number };
          results.push({ ...base, created: res.created ?? 0, skipped: res.skipped ?? 0, error: null });
        } catch (e) {
          results.push({ ...base, created: 0, skipped: 0, error: errorMessage(e, "The server didn't save these.") });
        }
      }
      if (uploadId) {
        const created = results.reduce((n, r) => n + r.created, 0);
        const skipped = results.reduce((n, r) => n + r.skipped, 0);
        const categoryIds = [...new Set(plan.jobs.map((j) => j.categoryId))];
        // Only feeds the Imports tab, so a failure here doesn't fail the import.
        await updateUploadResults(uploadId, {
          records_created: created,
          records_skipped: skipped,
          status: results.some((r) => r.error) ? "completed_with_errors" : "completed",
          site_id: siteId ?? undefined,
          category_ids: categoryIds.length ? categoryIds : undefined,
        }).catch(() => undefined);
      }
      return results;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

type DbCategory = { id: number; name: string };

/** AI read of a workbook: layout, columns, factors and category suggestions. */
export function useReadSheet() {
  return useMutation({
    mutationFn: async ({ file, categories }: { file: File; categories: DbCategory[] }) =>
      (await parseEmissionFactorExcel(file, categories)) as unknown as ParseResult,
  });
}

/** Re-reads an uploaded workbook with another sheet or corrected columns. */
export function useReAnalyze() {
  return useMutation({
    mutationFn: async ({ uploadId, sheet, override, categories }: { uploadId: number; sheet?: string; override?: Schema | null; categories: DbCategory[] }) =>
      (await reAnalyzeEmissionFactors(uploadId, {
        sheet_name: sheet,
        schema_override: override ?? undefined,
        db_categories: categories,
      })) as unknown as ParseResult,
  });
}
