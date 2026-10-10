import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { forgotPassword } from "../../services/authService";
import {
  type CompanyUserPayload,
  createCompanyUser,
  deleteCompanyUser,
  getCompanySites,
  getCompanyUsers,
  updateCompanyUser,
} from "../../services/companyAdminService";
import type { CompanySite, CompanyUser } from "./logic";

export const keys = {
  all: ["company-users"] as const,
  users: () => [...keys.all, "users"] as const,
  sites: () => [...keys.all, "sites"] as const,
};

/** Server message from an axios error, or the fallback. */
export function errorMessage(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof msg === "string" && msg ? msg : fallback;
}

export function useCompanyUsers() {
  return useQuery<CompanyUser[]>({ queryKey: keys.users(), queryFn: getCompanyUsers });
}

export function useCompanySites() {
  return useQuery<CompanySite[]>({ queryKey: keys.sites(), queryFn: getCompanySites, staleTime: 5 * 60 * 1000 });
}

export function usePeopleMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: keys.users() });
  return {
    create: useMutation({ mutationFn: (body: CompanyUserPayload) => createCompanyUser(body), onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: number; body: Partial<CompanyUserPayload> }) => updateCompanyUser(id, body),
      onSuccess: refresh,
    }),
    // data-loss-reviewed: removes one person's account only after the Remove dialog naming them is confirmed; their entries are not deleted.
    remove: useMutation({ mutationFn: (id: number) => deleteCompanyUser(id), onSuccess: refresh }),
    resetLink: useMutation({ mutationFn: (email: string) => forgotPassword(email) }),
  };
}
