import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createCategory, deleteCategory, getCategories, updateCategory } from "../../services/categoryService";
import { createCountry, deleteCountry, getCountries, updateCountry } from "../../services/countryService";
import { getSites } from "../../services/siteService";
import { createUnit, deleteUnit, getUnits, getUnitsBySiteAndCategory, updateUnit } from "../../services/unitService";
import {
  type Category,
  type CategoryDraft,
  type Country,
  type CountryDraft,
  type Site,
  type Unit,
  type UnitDraft,
  categoryPayload,
  countryPayload,
  unitPayload,
} from "./logic";

export const keys = {
  all: ["reference-data"] as const,
  countries: () => [...keys.all, "countries"] as const,
  categories: () => [...keys.all, "categories"] as const,
  sites: () => [...keys.all, "sites"] as const,
  units: () => [...keys.all, "units"] as const,
  unitsFor: (siteId: number, categoryId: number) => [...keys.units(), siteId, categoryId] as const,
};

/** Server message from an axios error, or the fallback. */
export function errorMessage(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof msg === "string" && msg ? msg : fallback;
}

/** Lists arrive bare or wrapped (`{ categories: [...] }`); always hand back an array. */
function asList<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  const inner = (data as Record<string, unknown> | null)?.[key];
  return Array.isArray(inner) ? (inner as T[]) : [];
}

export const useCountries = () => useQuery<Country[]>({ queryKey: keys.countries(), queryFn: async () => asList<Country>(await getCountries(), "countries") });
export const useCategories = () => useQuery<Category[]>({ queryKey: keys.categories(), queryFn: async () => asList<Category>(await getCategories(), "categories") });
export const useSites = () => useQuery<Site[]>({ queryKey: keys.sites(), queryFn: async () => asList<Site>(await getSites(), "sites") });

/** One site and one category ask the server for just that pair; anything else loads every unit. */
export function useUnits(siteIds: number[], categoryId: number | null) {
  const pair = siteIds.length === 1 && categoryId ? ([siteIds[0], categoryId] as const) : null;
  return useQuery<Unit[]>({
    queryKey: pair ? keys.unitsFor(pair[0], pair[1]) : keys.units(),
    queryFn: async () => asList<Unit>(pair ? await getUnitsBySiteAndCategory(pair[0], pair[1]) : await getUnits(), "units"),
  });
}

export function useSaveCountry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, draft }: { id: number | null; draft: CountryDraft }) => {
      const body = countryPayload(draft);
      return id === null ? createCountry(body.name, body.code) : updateCountry(id, body);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.countries() }),
  });
}

export function useDeleteCountry() {
  const qc = useQueryClient();
  return useMutation({
    // data-loss-reviewed: removes one country; the server refuses (409) while any site uses it.
    mutationFn: (id: number) => deleteCountry(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.countries() }),
  });
}

export function useSaveCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, draft, allSiteIds }: { id: number | null; draft: CategoryDraft; allSiteIds: number[] }) => {
      const body = categoryPayload(draft, allSiteIds);
      return id === null
        ? createCategory(body)
        : updateCategory(id, { category_name: body.category_name, scope: body.scope, site_ids: body.site_ids });
    },
    // Sites carry their categories, so both lists change.
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    // data-loss-reviewed: only offered for unused categories; without force the server refuses (409) while anything uses it.
    mutationFn: (id: number) => deleteCategory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useSaveUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, draft }: { id: number | null; draft: UnitDraft }) => (id === null ? createUnit(unitPayload(draft)) : updateUnit(id, unitPayload(draft))),
    // Categories count their units.
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useDeleteUnit() {
  const qc = useQueryClient();
  return useMutation({
    // data-loss-reviewed: removes one unit option; entries store their unit as text and keep it.
    mutationFn: (id: number) => deleteUnit(id),
    // Categories count their units.
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}
