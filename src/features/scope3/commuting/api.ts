import { useMutation, useQuery } from "@tanstack/react-query";
import { type CommutingSites, type SurveyBody, commitImportPlan, getCommutingSites, planCommutingSurvey } from "../../../services/scope3CommutingService";

export { errorMessage } from "../../../services/scope3CommutingService";

/** companyId: the Superadmin's selected client; null for everyone else (their own company). */
export const keys = {
  all: ["scope3-commuting"] as const,
  sites: (companyId: number | null) => [...keys.all, "sites", companyId] as const,
};

/** The caller's sites with a Category 7 category. */
export const useCommutingSites = (companyId: number | null, enabled = true) =>
  useQuery<CommutingSites>({ queryKey: keys.sites(companyId), queryFn: () => getCommutingSites(companyId), enabled });

/** Makes the import plan (one yearly row per mode); nothing is saved until it is committed. */
export const usePlanSurvey = (companyId: number | null) => useMutation({ mutationFn: (body: SurveyBody) => planCommutingSurvey(companyId, body) });

export const useCommitPlan = () =>
  useMutation({ mutationFn: ({ planId, version, key }: { planId: string; version: number; key: string }) => commitImportPlan(planId, version, key) });
