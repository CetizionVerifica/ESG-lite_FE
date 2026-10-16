import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConsolidationApproach } from "../../../lib/scope3/boundary";
import {
  type Boundary,
  type CategoryMap,
  confirmCategoryMap,
  getBoundary,
  getCategoryMap,
  setConsolidationApproach,
  updateBoundaryCategory,
} from "../../../services/scope3Service";
import { type RowDraft, toBody } from "./logic";

/** companyId: the Superadmin's selected client; null for everyone else (their own company). */
export const keys = {
  all: ["scope3-boundary"] as const,
  boundary: (companyId: number | null) => [...keys.all, "boundary", companyId] as const,
  map: (companyId: number | null) => [...keys.all, "map", companyId] as const,
};

/** Server message from an axios error, or the fallback. */
export function errorMessage(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof msg === "string" && msg ? msg : fallback;
}

export const useBoundary = (companyId: number | null, enabled = true) =>
  useQuery<Boundary>({ queryKey: keys.boundary(companyId), queryFn: () => getBoundary(companyId), enabled });

export const useCategoryMap = (companyId: number | null, enabled = true) =>
  useQuery<CategoryMap>({ queryKey: keys.map(companyId), queryFn: () => getCategoryMap(companyId), enabled });

/** Saves every changed row at once (in parallel, not one after another). */
export function useSaveBoundary(companyId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rows: { n: number; draft: RowDraft }[]) =>
      Promise.all(rows.map((r) => updateBoundaryCategory(companyId, r.n, toBody(r.draft)))),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.boundary(companyId) }),
  });
}

export function useSaveConsolidation(companyId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, value }: { id: number; value: ConsolidationApproach }) => setConsolidationApproach(id, value),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.boundary(companyId) }),
  });
}

export function useConfirmMap(companyId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (confirm: { category_id: number; ghg_category: number }[]) => confirmCategoryMap(companyId, confirm),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.map(companyId) });
      void qc.invalidateQueries({ queryKey: keys.boundary(companyId) });
    },
  });
}
