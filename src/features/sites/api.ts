import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCategories } from "../../services/categoryService";
import { getColumnConfigs } from "../../services/columnConfigService";
import { getCompanies } from "../../services/companyService";
import { getCountries } from "../../services/countryService";
import { createSite, deleteSite, getSites, updateSite } from "../../services/siteService";
import { getUsers } from "../../services/userService";
import { type AdminUser, type Category, type ColumnConfig, type Company, type Country, type Site, type SiteDraft, toPayload } from "./logic";

export const keys = {
  all: ["sites-setup"] as const,
  sites: () => [...keys.all, "sites"] as const,
  companies: () => [...keys.all, "companies"] as const,
  countries: () => [...keys.all, "countries"] as const,
  categories: () => [...keys.all, "categories"] as const,
  users: () => [...keys.all, "users"] as const,
  configs: () => [...keys.all, "configs"] as const,
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

export const useSites = () => useQuery<Site[]>({ queryKey: keys.sites(), queryFn: async () => asList<Site>(await getSites(), "sites") });
export const useCompanies = () =>
  useQuery<Company[]>({ queryKey: keys.companies(), queryFn: async () => asList<Company>(await getCompanies(), "companies"), staleTime: 5 * 60_000 });
export const useCountries = () => useQuery<Country[]>({ queryKey: keys.countries(), queryFn: async () => asList<Country>(await getCountries(), "countries"), staleTime: 5 * 60_000 });
export const useCategories = () => useQuery<Category[]>({ queryKey: keys.categories(), queryFn: async () => asList<Category>(await getCategories(), "categories"), staleTime: 5 * 60_000 });
/** Only feeds the Users / Managers counts and the People tab, so a failure just blanks them. */
export const useAdminUsers = () => useQuery<AdminUser[]>({ queryKey: keys.users(), queryFn: async () => asList<AdminUser>(await getUsers(), "users"), retry: 1 });
/** Only feeds Config coverage and the Capture tab. */
export const useColumnConfigs = () => useQuery<ColumnConfig[]>({ queryKey: keys.configs(), queryFn: async () => asList<ColumnConfig>(await getColumnConfigs(), "columnConfigs"), retry: 1 });

export function useSaveSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, draft }: { id: number | null; draft: SiteDraft }) =>
      id === null ? createSite(toPayload(draft)) : updateSite(id, toPayload(draft)),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.sites() }),
  });
}

export function useDeleteSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteSite(id),
    // Users and configs on the site go with it.
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}
