import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RecalcReason } from "../../../lib/scope3/baseYear";
import {
  approveRecalculation,
  dismissRecalculation,
  getBaseYear,
  getRecalculations,
  previewBaseYear,
  putBaseYear,
} from "../../../services/scope3Service";

/** companyId: the Superadmin's selected client; null for everyone else (their own company). */
export const keys = {
  all: ["scope3-base-year"] as const,
  baseYear: (companyId: number | null) => [...keys.all, "base-year", companyId] as const,
  preview: (companyId: number | null, year: number, yearType: "CY" | "FY") => [...keys.all, "preview", companyId, year, yearType] as const,
  events: (companyId: number | null) => [...keys.all, "events", companyId] as const,
};

/** Server message from an axios error, or the fallback. */
export function errorMessage(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof msg === "string" && msg ? msg : fallback;
}

export const errorCode = (e: unknown): string | null => {
  const code = (e as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === "string" ? code : null;
};

export const useBaseYear = (companyId: number | null, enabled = true) =>
  useQuery({ queryKey: keys.baseYear(companyId), queryFn: () => getBaseYear(companyId), enabled });

/** Every recalculation event, newest first (re-checks the company on the server). */
export const useRecalculations = (companyId: number | null, enabled = true) =>
  useQuery({ queryKey: keys.events(companyId), queryFn: () => getRecalculations(companyId), enabled });

/** The per-category totals a freeze would store; only while the dialog is open. */
export const usePreview = (companyId: number | null, year: number, yearType: "CY" | "FY", enabled: boolean) =>
  useQuery({ queryKey: keys.preview(companyId, year, yearType), queryFn: () => previewBaseYear(companyId, year, yearType), enabled, retry: false });

function useInvalidate(companyId: number | null) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: keys.baseYear(companyId) });
    void qc.invalidateQueries({ queryKey: keys.events(companyId) });
  };
}

export function useSaveBaseYear(companyId: number | null) {
  const invalidate = useInvalidate(companyId);
  return useMutation({ mutationFn: (body: Parameters<typeof putBaseYear>[1]) => putBaseYear(companyId, body), onSettled: invalidate });
}

export function useApproveRecalculation(companyId: number | null) {
  const invalidate = useInvalidate(companyId);
  return useMutation({ mutationFn: (body: { reason: RecalcReason; note: string }) => approveRecalculation(companyId, body), onSettled: invalidate });
}

export function useDismissRecalculation(companyId: number | null) {
  const invalidate = useInvalidate(companyId);
  return useMutation({ mutationFn: ({ id, note }: { id: number; note: string }) => dismissRecalculation(companyId, id, note), onSettled: invalidate });
}
