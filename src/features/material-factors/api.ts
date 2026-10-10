import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCompanies } from "../../services/companyService";
import {
  type MaterialFactorBody,
  createMaterialFactor,
  deleteMaterialFactor,
  getMaterialFactor,
  getMaterialFactors,
  checkMaterialFactorImport,
  importMaterialFactors,
  updateMaterialFactor,
} from "../../services/materialFactorService";
import type { Company, FactorDetail, MaterialFactor } from "./logic";

export const keys = {
  all: ["material-factors"] as const,
  list: () => [...keys.all, "list"] as const,
  one: (id: number) => [...keys.all, "one", id] as const,
  companies: () => [...keys.all, "companies"] as const,
};

type AxiosLike = { response?: { status?: number; data?: Record<string, unknown> } };

/** Server message from an axios error, or the fallback. */
export function errorMessage(e: unknown, fallback: string): string {
  const msg = (e as AxiosLike)?.response?.data?.message;
  return typeof msg === "string" && msg ? msg : fallback;
}

/** The existing row a 409 duplicate points at. */
export function duplicateOf(e: unknown): number | null {
  const r = (e as AxiosLike)?.response;
  const id = r?.status === 409 ? r.data?.existing_id : undefined;
  return typeof id === "number" ? id : null;
}

export type ImportError = { index: number; message: string; existing_id?: number; duplicate_of_row?: number };

/** Per-row errors from a refused import (400 invalid, 409 already in the library). */
export function importErrors(e: unknown): ImportError[] {
  const list = (e as AxiosLike)?.response?.data?.errors;
  return Array.isArray(list) ? (list as ImportError[]) : [];
}

export const useFactors = () => useQuery<MaterialFactor[]>({ queryKey: keys.list(), queryFn: getMaterialFactors });

export const useFactor = (id: number | null) =>
  useQuery<FactorDetail>({ queryKey: keys.one(id ?? 0), queryFn: () => getMaterialFactor(id!), enabled: id !== null });

/** Superadmin only: names the company that owns a client row. */
export const useCompanies = (enabled: boolean) =>
  useQuery<Company[]>({
    queryKey: keys.companies(),
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const data = await getCompanies();
      return Array.isArray(data) ? data : Array.isArray(data?.companies) ? data.companies : [];
    },
  });

export function useSaveFactor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number | null; body: MaterialFactorBody }) =>
      id === null ? createMaterialFactor(body) : updateMaterialFactor(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useDeleteFactor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteMaterialFactor(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useImportFactors() {
  const qc = useQueryClient();
  return useMutation<{ created: number }, unknown, { company_id?: number | null; rows: MaterialFactorBody[] }>({
    mutationFn: importMaterialFactors,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

type ImportBody = { company_id?: number | null; rows: MaterialFactorBody[] };

/** Dry run of an import, re-run whenever the mapped rows change. Kept out of `keys.all` so a finished import doesn't re-check. */
export const useImportCheck = (body: ImportBody, enabled: boolean) =>
  useQuery<{ valid: boolean; errors: ImportError[] }>({
    queryKey: ["material-factors-import-check", body],
    queryFn: () => checkMaterialFactorImport(body),
    enabled,
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });
