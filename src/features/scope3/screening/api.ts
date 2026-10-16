import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BoundaryStatus } from "../../../lib/scope3/boundary";
import type { ExtrapolateBody, ScreeningInput, YearType } from "../../../lib/scope3/contracts";
import {
  type Screening,
  extrapolate,
  getScreening,
  putCategoryStatus,
  putScreeningInputs,
  searchSectors,
  suggestSectors,
} from "../../../services/scope3ScreeningService";

/** companyId: the Superadmin's selected client; null for everyone else (their own company). */
export const keys = {
  all: ["scope3-screening"] as const,
  screening: (companyId: number | null, year: number, yearType: YearType) => [...keys.all, companyId, year, yearType] as const,
  sectors: (q: string) => [...keys.all, "sectors", q] as const,
};

/** The server's `{code, message}` (Scope 3 and boundary errors), or the fallback. */
export function errorMessage(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof msg === "string" && msg ? msg : fallback;
}

export function errorCode(e: unknown): string | null {
  const code = (e as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === "string" ? code : null;
}

export const useScreening = (companyId: number | null, year: number, yearType: YearType, enabled = true) =>
  useQuery<Screening>({ queryKey: keys.screening(companyId, year, yearType), queryFn: () => getScreening(companyId, year, yearType), enabled });

/**
 * Every change refreshes the screening (sizes, shares and suggestions move
 * together) and the boundary page. Returned as a promise, so the mutation
 * settles only once the fresh screening is in.
 */
const useRefresh = () => {
  const qc = useQueryClient();
  return () => Promise.all([qc.invalidateQueries({ queryKey: keys.all }), qc.invalidateQueries({ queryKey: ["scope3-boundary"] })]);
};

export function useSaveInputs(companyId: number | null, year: number, yearType: YearType) {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (inputs: ScreeningInput[]) => putScreeningInputs(companyId, year, yearType, inputs), onSettled: refresh });
}

export function useSetStatus(companyId: number | null) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (v: { n: number; status: BoundaryStatus; reason: string | null; relevance: Record<string, boolean> }) =>
      putCategoryStatus(companyId, v.n, { status: v.status, reason: v.reason, relevance: v.relevance }),
    onSettled: refresh,
  });
}

export function useSuggestSectors(companyId: number | null) {
  return useMutation({ mutationFn: (line: { description: string; amount: number; currency: string }) => suggestSectors(companyId, line) });
}

export const useSectorSearch = (q: string, enabled: boolean) =>
  useQuery({ queryKey: keys.sectors(q), queryFn: () => searchSectors(q), enabled: enabled && q.trim().length >= 2, staleTime: 5 * 60_000 });

export function usePreviewExtrapolation(companyId: number | null) {
  return useMutation({ mutationFn: (body: ExtrapolateBody) => extrapolate(companyId, body, true) });
}

export function useExtrapolate(companyId: number | null) {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (body: ExtrapolateBody) => extrapolate(companyId, body, false), onSettled: refresh });
}
