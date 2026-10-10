import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { forgotPassword } from "../../services/authService";
import { getCompanies } from "../../services/companyService";
import { getSites } from "../../services/siteService";
import { createUser, deleteUser, getUsers, updateUser } from "../../services/userService";
import type { Company, Site, User, UserPayload } from "./logic";

export const keys = {
  all: ["users-global"] as const,
  users: () => [...keys.all, "users"] as const,
  sites: () => [...keys.all, "sites"] as const,
  companies: () => [...keys.all, "companies"] as const,
};

/** Server message from an axios error, or the fallback. */
export function errorMessage(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof msg === "string" && msg ? msg : fallback;
}

/** Lists arrive bare or wrapped (`{ sites: [...] }`); always hand back an array. */
function asList<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  const inner = (data as Record<string, unknown> | null)?.[key];
  return Array.isArray(inner) ? (inner as T[]) : [];
}

export const useUsers = () => useQuery<User[]>({ queryKey: keys.users(), queryFn: async () => asList<User>(await getUsers(), "users") });
export const useSites = () => useQuery<Site[]>({ queryKey: keys.sites(), queryFn: async () => asList<Site>(await getSites(), "sites"), staleTime: 60_000 });
export const useCompanies = () =>
  useQuery<Company[]>({ queryKey: keys.companies(), queryFn: async () => asList<Company>(await getCompanies(), "companies"), staleTime: 5 * 60_000 });

export type SaveResult = { user?: User; temporary_password?: string };

export function useSaveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number | null; payload: UserPayload }): Promise<SaveResult> =>
      id === null ? createUser(payload as Parameters<typeof createUser>[0]) : updateUser(id, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.users() }),
  });
}

export function useRemoveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteUser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.users() }),
  });
}

/** Emails the person a reset link (the public forgot-password flow). */
export const useSendResetLink = () => useMutation({ mutationFn: (email: string) => forgotPassword(email) });
