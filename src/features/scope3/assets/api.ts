import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type InvestmentBody,
  type Investments,
  type LeaseSites,
  type PlanBody,
  commitInvestmentsPlan,
  createInvestment,
  getInvestments,
  getLeaseSites,
  planInvestments,
  updateInvestment,
} from "../../../services/scope3AssetsService";

export { errorMessage } from "../../../services/scope3AssetsService";

/** companyId: the Superadmin's selected client; null for everyone else (their own company). */
export const keys = {
  all: ["scope3-assets"] as const,
  investments: (companyId: number | null) => [...keys.all, "investments", companyId] as const,
  sites: (companyId: number | null) => [...keys.all, "sites", companyId] as const,
};

export const useInvestments = (companyId: number | null, enabled = true) =>
  useQuery<Investments>({ queryKey: keys.investments(companyId), queryFn: () => getInvestments(companyId), enabled });

/** The company's sites (for the plan's home site). */
export const useAssetSites = (companyId: number | null, enabled = true) =>
  useQuery<LeaseSites>({ queryKey: keys.sites(companyId), queryFn: () => getLeaseSites(companyId), enabled });

export function useSaveInvestment(companyId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number | null; body: InvestmentBody }) =>
      id === null ? createInvestment(companyId, body) : updateInvestment(companyId, id, body),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.investments(companyId) }),
  });
}

/** Makes the Category 15 import plan; nothing is saved until it is committed. */
export const usePlanInvestments = (companyId: number | null) =>
  useMutation({ mutationFn: (body: PlanBody) => planInvestments(companyId, body) });

export const useCommitPlan = () =>
  useMutation({
    mutationFn: ({ planId, version, key }: { planId: string; version: number; key: string }) => commitInvestmentsPlan(planId, version, key),
  });
