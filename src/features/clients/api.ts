import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Brand, getBrand, saveBrand, uploadBrandDarkLogo, uploadBrandGuideline } from "../../services/brandService";
import { getMappings } from "../../services/categoryMappingService";
import { deleteCompany, getCompanies, getReportingCalendar, onboardCompany, updateCompany } from "../../services/companyService";
import { getSites } from "../../services/siteService";
import { type EmissionThreshold, createThreshold, getThresholds, updateThreshold } from "../../services/thresholdService";
import { getUsers } from "../../services/userService";
import type { AdminUser, Company, Site } from "./logic";
import { type OnboardDraft, toBrandUpdate, toOnboardForm } from "./onboarding";

export const keys = {
  all: ["clients"] as const,
  companies: () => [...keys.all, "companies"] as const,
  sites: () => [...keys.all, "sites"] as const,
  users: () => [...keys.all, "users"] as const,
  brand: (id: number) => [...keys.all, "brand", id] as const,
  thresholds: () => [...keys.all, "thresholds"] as const,
  mappings: (id: number) => [...keys.all, "mappings", id] as const,
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

export const useCompanies = () => useQuery<Company[]>({ queryKey: keys.companies(), queryFn: async () => asList<Company>(await getCompanies(), "companies") });
/** Feeds the Sites column and tab; a failure just blanks them. */
export const useSites = () => useQuery<Site[]>({ queryKey: keys.sites(), queryFn: async () => asList<Site>(await getSites(), "sites"), retry: 1 });
/** Feeds the Users column and People tab; a failure just blanks them. */
export const useAdminUsers = () => useQuery<AdminUser[]>({ queryKey: keys.users(), queryFn: async () => asList<AdminUser>(await getUsers(), "users"), retry: 1 });

/** True when the company has saved a brand (GET returns defaults otherwise). */
export const hasBrand = (b: Brand | undefined): b is Brand => !!b?.updatedAt;

export const useBrand = (companyId: number | null) =>
  useQuery<Brand>({ queryKey: keys.brand(companyId ?? 0), queryFn: () => getBrand(companyId!), enabled: !!companyId, staleTime: 5 * 60_000, retry: 1 });

/**
 * One brand per listed client (there is no list endpoint). Cached for five
 * minutes, so paging and filtering don't refetch.
 */
export function useBrands(companyIds: number[]): Map<number, Brand> {
  const results = useQueries({
    queries: companyIds.map((id) => ({ queryKey: keys.brand(id), queryFn: () => getBrand(id), staleTime: 5 * 60_000, retry: 0 })),
  });
  const out = new Map<number, Brand>();
  results.forEach((r, i) => {
    if (r.data) out.set(companyIds[i], r.data);
  });
  return out;
}

export const useThreshold = (companyId: number) =>
  useQuery<EmissionThreshold[], Error, EmissionThreshold | null>({
    queryKey: keys.thresholds(),
    queryFn: getThresholds,
    select: (all) => (Array.isArray(all) ? all : []).find((t) => t.company?.company_id === companyId) ?? null,
    retry: 1,
  });

export const useMappingCount = (companyId: number) =>
  useQuery({ queryKey: keys.mappings(companyId), queryFn: () => getMappings(companyId), select: (m) => (Array.isArray(m) ? m.length : 0), retry: 1 });

export function useUpdateCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, unknown> }) => updateCompany(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.companies() }),
  });
}

export function useDeleteCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteCompany(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useSaveThreshold(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ existing, value }: { existing: EmissionThreshold | null; value: number }) =>
      existing ? updateThreshold(existing.threshold_id, { threshold_percentage: value }) : createThreshold({ company_id: companyId, threshold_percentage: value }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.thresholds() }),
  });
}

/** Upload (or replace) the client's colour-guideline file; null removes it. */
export function useSaveGuideline(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File | null) => (file ? uploadBrandGuideline(companyId, file) : saveBrand(companyId, { guidelineUrl: null })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.brand(companyId) }),
  });
}

export const useReportingCalendar = () => useQuery({ queryKey: [...keys.all, "calendar"], queryFn: getReportingCalendar, staleTime: Infinity, retry: 1 });

export type OnboardResult = { companyId: number; companyName: string; warnings: string[] };

/**
 * Creates the company, its main site and admin (one request, with the light
 * logo), then saves the brand colours and the dark logo. The company exists
 * once the first request succeeds, so later failures come back as warnings.
 */
export function useOnboard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (d: OnboardDraft): Promise<OnboardResult> => {
      const res = (await onboardCompany(toOnboardForm(d))) as { company?: { company_id: number; name: string }; warnings?: string[] };
      const company = res.company;
      if (!company) throw new Error("The server didn't return the new company.");
      const warnings = [...(res.warnings ?? [])];
      const brand = toBrandUpdate(d);
      if (brand) {
        try {
          await saveBrand(company.company_id, brand);
        } catch (e) {
          warnings.push(`Brand colours were not saved: ${errorMessage(e, "the request failed")}. Set them in Brand theme.`);
        }
      }
      // Saved with or without colours: the upload creates the brand row when there isn't one.
      if (d.brandOn && d.logoDark) {
        try {
          await uploadBrandDarkLogo(company.company_id, d.logoDark);
        } catch (e) {
          warnings.push(`Dark logo was not saved: ${errorMessage(e, "the upload failed")}. Upload it in Brand theme.`);
        }
      }
      return { companyId: company.company_id, companyName: company.name, warnings };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}
