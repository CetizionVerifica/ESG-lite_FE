import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMaterialFactors } from "../../services/materialFactorService";
import {
  type KeyValues,
  calculatePcfStudy,
  createPcfStudy,
  getPcfAllocationPreview,
  getPcfStudies,
  getPcfStudy,
  replacePcfInputs,
  submitPcfStudy,
  updatePcfStudy,
} from "../../services/pcfService";
import { getProductsBySite } from "../../services/productService";
import type { AllocationPreview, InputRow, ScopeFields, Study } from "./logic";

export const keys = {
  all: ["footprint-builder"] as const,
  study: (id: number) => [...keys.all, "study", id] as const,
  preview: (id: number, kv: KeyValues) => [...keys.all, "preview", id, kv.key_value_product ?? null, kv.key_value_site_total ?? null] as const,
  factors: () => ["material-factors", "list"] as const,
  studies: (siteId: number, productId: number) => [...keys.all, "studies", siteId, productId] as const,
  products: (siteId: number) => ["products", "site", siteId] as const,
};

/** Server message from an axios error, or the fallback. */
export function errorMessage(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof msg === "string" && msg ? msg : fallback;
}

const asList = <T,>(data: unknown): T[] => (Array.isArray(data) ? (data as T[]) : []);

export type MaterialFactor = {
  material_factor_id: number;
  name: string;
  material_group: string | null;
  geography: string | null;
  unit: string;
  value_kgco2e: number | null;
  value_hidden: boolean;
  source: string | null;
  source_year: number | null;
  licence: "open" | "ecoinvent" | "supplier" | null;
  recycled_variant: boolean;
};

export type SiteProduct = { product_id: number; name: string; unit?: string };

export const useStudy = (id: number) =>
  useQuery<Study>({ queryKey: keys.study(id), queryFn: () => getPcfStudy(id), enabled: id > 0 });

/** Shares the C04 library cache, so the picker and the library page agree. */
export const useMaterialFactors = () =>
  useQuery<MaterialFactor[]>({ queryKey: keys.factors(), queryFn: async () => asList<MaterialFactor>(await getMaterialFactors()) });

/** Plant Scope 1+2 for the study's site and period, allocated by its key. */
export const useAllocationPreview = (id: number, kv: KeyValues, enabled = true) =>
  useQuery<AllocationPreview>({
    queryKey: keys.preview(id, kv),
    queryFn: () => getPcfAllocationPreview(id, kv),
    enabled: enabled && id > 0,
    placeholderData: keepPreviousData,
  });

export const useSiteProducts = (siteId: number | null) =>
  useQuery<SiteProduct[]>({
    queryKey: keys.products(siteId ?? 0),
    queryFn: async () => asList<SiteProduct>(await getProductsBySite(siteId!)),
    enabled: !!siteId,
  });

/** Earlier versions of one product at one site, newest first (for "Copy from previous version"). */
export const useVersions = (siteId: number | null, productId: number | null) =>
  useQuery<Study[]>({
    queryKey: keys.studies(siteId ?? 0, productId ?? 0),
    queryFn: async () => asList<Study>(await getPcfStudies({ siteId: siteId!, productId: productId! })).sort((a, b) => b.version - a.version),
    enabled: !!siteId && !!productId,
  });

export function useCreateStudy() {
  return useMutation<Study, unknown, Record<string, unknown>>({ mutationFn: (body) => createPcfStudy(body) });
}

/** Autosave of the Scope fields; the caller keeps its own copy, so the cache is patched, not refetched. */
export function useSaveScope(id: number) {
  const qc = useQueryClient();
  return useMutation<Study, unknown, Partial<ScopeFields>>({
    mutationFn: (fields) => updatePcfStudy(id, fields),
    onSuccess: (s) => {
      qc.setQueryData<Study>(keys.study(id), (old) => (old ? { ...old, ...s, inputs: old.inputs } : old));
      void qc.invalidateQueries({ queryKey: [...keys.all, "preview", id] });
    },
  });
}

export function useSaveInputs(id: number) {
  const qc = useQueryClient();
  return useMutation<{ inputs: InputRow[] }, unknown, InputRow[]>({
    mutationFn: (rows) => replacePcfInputs(id, rows),
    onSuccess: (r) => qc.setQueryData<Study>(keys.study(id), (old) => (old ? { ...old, inputs: r.inputs } : old)),
  });
}

export function useCalculate(id: number) {
  const qc = useQueryClient();
  return useMutation<unknown, unknown, KeyValues>({
    mutationFn: (kv) => calculatePcfStudy(id, kv),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.study(id) }),
  });
}

export function useSubmit(id: number) {
  const qc = useQueryClient();
  return useMutation<Study, unknown, void>({
    mutationFn: () => submitPcfStudy(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.study(id) });
      void qc.invalidateQueries({ queryKey: ["product-footprints"] });
    },
  });
}
