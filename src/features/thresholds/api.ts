import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCompanies } from "../../services/companyService";
import { createThreshold, deleteThreshold, getThresholds, updateThreshold } from "../../services/thresholdService";
import type { Company, Threshold, ThresholdRow } from "./logic";

export const keys = {
  all: ["thresholds-setup"] as const,
  thresholds: () => [...keys.all, "thresholds"] as const,
  companies: () => [...keys.all, "companies"] as const,
};

/** Server message from an axios error, or the fallback. */
export function errorMessage(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof msg === "string" && msg ? msg : fallback;
}

/** Lists arrive bare or wrapped (`{ companies: [...] }`); always hand back an array. */
function asList<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  const inner = (data as Record<string, unknown> | null)?.[key];
  return Array.isArray(inner) ? (inner as T[]) : [];
}

export const useThresholds = () =>
  useQuery<Threshold[]>({ queryKey: keys.thresholds(), queryFn: async () => asList<Threshold>(await getThresholds(), "thresholds") });
export const useCompanies = () =>
  useQuery<Company[]>({ queryKey: keys.companies(), queryFn: async () => asList<Company>(await getCompanies(), "companies"), staleTime: 5 * 60_000 });

/** Creates the client's threshold the first time, updates it after. */
export function useSaveThreshold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ row, value }: { row: ThresholdRow; value: number }) =>
      row.threshold
        ? updateThreshold(row.threshold.id, { threshold_percentage: value })
        : createThreshold({ company_id: row.company_id, threshold_percentage: value }),
    // Refetch on failure too: a 409 means another admin set it meanwhile.
    onSettled: () => qc.invalidateQueries({ queryKey: keys.thresholds() }),
  });
}

/** Deleting the row puts the client back on the default. */
export function useResetThreshold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteThreshold(id),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.thresholds() }),
  });
}
