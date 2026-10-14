import { useMutation, useQuery } from "@tanstack/react-query";
import type { MutableRefObject } from "react";
import { getColumnConfigsBySiteAndCategory, getUserColumnConfigsBySiteAndCategory } from "../../services/columnConfigService";
import { type PlanSummary, type SheetArgs, fetchPreviewRows, fetchUniqueCategories, importAllRows, uploadExcelGetHeaders } from "../../services/excelService";
export type { PlanSummary } from "../../services/excelService";
import { type HistoricalArgs, previewHistoricalImport, runHistoricalImport } from "../../services/historicalImportService";

export type { HistoricalPlanRow, HistoricalResult } from "../../services/historicalImportService";
import { getSites } from "../../services/siteService";
import type { ColumnConfig } from "../../lib/emissions";
import type { ImportResult, PreviewRow } from "./logic";

export type Site = {
  site_id: number;
  name: string;
  /** `ai_import_enabled` is the client's Smart import switch (XI0); absent on older servers = off. */
  company?: { company_id: number; name: string; ai_import_enabled?: boolean | null } | null;
  categories?: { category_id: number; category_name: string; scope?: string | null }[] | null;
};

export const keys = {
  all: ["bulk-upload"] as const,
  sites: () => [...keys.all, "sites"] as const,
  form: (siteId: number | null, categoryId: number | null) => [...keys.all, "form", siteId, categoryId] as const,
  categories: (documentId: number | null, column: string | null) => [...keys.all, "categories", documentId, column] as const,
  preview: (args: PreviewArgs | null) => [...keys.all, "preview", args] as const,
};

/** Message from a thrown Error or an axios error, or the fallback. */
export function errorMessage(e: unknown, fallback: string): string {
  const data = (e as { response?: { data?: { message?: unknown; detail?: unknown } } })?.response?.data;
  const msg = data?.message ?? data?.detail ?? (e instanceof Error ? e.message : null);
  return typeof msg === "string" && msg ? msg : fallback;
}

function asList<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  const inner = (data as Record<string, unknown> | null)?.[key];
  return Array.isArray(inner) ? (inner as T[]) : [];
}

/** Every site, for a Superadmin. Contributors use their own sites from the signed-in user instead. */
export const useSites = (enabled = true) =>
  useQuery<Site[]>({ queryKey: keys.sites(), enabled, queryFn: async () => asList<Site>(await getSites(), "sites"), staleTime: 5 * 60_000 });

/**
 * The entry form for site × category; its columns decide what the sheet maps
 * onto. Null when none is set up. Contributors read it through the /user
 * endpoint, which checks the site is theirs.
 */
export function useFormConfig(siteId: number | null, categoryId: number | null, contributor = false) {
  return useQuery<ColumnConfig | null>({
    queryKey: [...keys.form(siteId, categoryId), contributor],
    enabled: siteId !== null && categoryId !== null,
    queryFn: async () => {
      const load = contributor ? getUserColumnConfigsBySiteAndCategory : getColumnConfigsBySiteAndCategory;
      return asList<ColumnConfig>(await load(siteId as number, categoryId as number), "columnConfigs")[0] ?? null;
    },
  });
}

/** Sends the file to the AI service, which keeps it and returns its header row. */
export const useUploadFile = () => useMutation({ mutationFn: (file: File) => uploadExcelGetHeaders(file) });

/**
 * The emission categories in the sheet's mapped category column. Loads as soon
 * as that column is mapped; the legacy modal needed a separate click.
 */
export function useSheetCategories(documentId: number | null, mappings: Record<string, string>) {
  const column = mappings.emission_category ?? null;
  return useQuery({
    queryKey: keys.categories(documentId, column),
    enabled: documentId !== null && column !== null,
    staleTime: Infinity,
    // Only the category column matters to this call.
    queryFn: () => fetchUniqueCategories(documentId as number, { emission_category: column as string }),
  });
}

export interface PreviewArgs {
  documentId: number;
  mappings: Record<string, string>;
  categories: string[];
  siteId: number;
  categoryId: number;
  date: string;
}

const sheetArgs = (a: PreviewArgs): SheetArgs => ({ documentId: a.documentId, mappings: a.mappings, selectedCategories: a.categories, siteId: a.siteId, categoryId: a.categoryId, dateOfReporting: a.date });

export interface PreviewData {
  /** The plan ESG-lite made (null when every row was refused before planning). */
  plan: PlanSummary;
  rows: PreviewRow[];
  /** Rows planned plus rows refused before planning, the number the Import step reports. */
  total: number;
  notSelected: number;
}

/**
 * Plans the sheet on ESG-lite and returns the plan with its first 100 rows,
 * calculated the way the import will. `lastPlan` holds the plan of the
 * previous preview of this upload: it is cancelled when a new one is made,
 * so re-mapping doesn't pile up drafts (ESG-lite allows ten per user).
 */
export function usePreview(args: PreviewArgs | null, lastPlan: MutableRefObject<string | null>) {
  return useQuery<PreviewData>({
    queryKey: keys.preview(args),
    enabled: args !== null,
    staleTime: Infinity,
    queryFn: async () => {
      const a = args as PreviewArgs;
      const res = await fetchPreviewRows(sheetArgs(a), { page: 1, pageSize: 100, cancelPlanId: lastPlan.current });
      lastPlan.current = res.plan?.plan_id ?? null;
      return { plan: res.plan, rows: (res.rows ?? []) as PreviewRow[], total: res.total_rows ?? 0, notSelected: res.not_selected ?? 0 };
    },
  });
}

/**
 * Commits the previewed plan: every ready row becomes a pending entry in one
 * upload batch. Callbacks given here still run when the page has been left
 * ("Continue in background"); ones passed to mutate don't.
 */
export function useImportRows(onDone: (result: ImportResult) => void, onFail: (message: string) => void) {
  return useMutation({
    mutationFn: async ({ args, plan }: { args: PreviewArgs; plan: { plan_id: string; version: number } }): Promise<ImportResult> => importAllRows(sheetArgs(args), plan),
    onSuccess: onDone,
    onError: (e) => onFail(errorMessage(e, "The import didn't finish. Nothing was saved, so you can try again.")),
  });
}

/** Historical import: what it would do, without saving. */
export const useHistoricalPreview = () => useMutation({ mutationFn: (a: HistoricalArgs) => previewHistoricalImport(a) });

/** Historical import: saves the rows and invites new people. */
export const useHistoricalImport = () => useMutation({ mutationFn: (a: HistoricalArgs) => runHistoricalImport(a) });
