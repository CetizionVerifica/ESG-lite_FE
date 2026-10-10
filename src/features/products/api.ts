import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getCompanies } from "../../services/companyService";
import { createProduct, deleteProduct, getProductProduction, getProducts, updateProduct } from "../../services/productService";
import { getSites } from "../../services/siteService";
import { getUnits } from "../../services/unitService";
import type { AdminUnit, Company, Product, ProductDraft, ProductionPage, SiteRef } from "./logic";
import { toPayload } from "./logic";

export const keys = {
  all: ["products-setup"] as const,
  products: () => [...keys.all, "products"] as const,
  production: (id: number) => [...keys.all, "production", id] as const,
  sites: () => [...keys.all, "sites"] as const,
  companies: () => [...keys.all, "companies"] as const,
  units: () => [...keys.all, "units"] as const,
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

export const useProducts = () => useQuery<Product[]>({ queryKey: keys.products(), queryFn: async () => asList<Product>(await getProducts(), "products") });
export const useSites = () =>
  useQuery<SiteRef[]>({ queryKey: keys.sites(), queryFn: async () => asList<SiteRef>(await getSites(), "sites"), staleTime: 5 * 60_000 });
export const useCompanies = () =>
  useQuery<Company[]>({ queryKey: keys.companies(), queryFn: async () => asList<Company>(await getCompanies(), "companies"), staleTime: 5 * 60_000 });
/** Only feeds the unit suggestions, so a failure just leaves fewer of them. */
export const useUnits = () =>
  useQuery<AdminUnit[]>({ queryKey: keys.units(), queryFn: async () => asList<AdminUnit>(await getUnits(), "units"), staleTime: 5 * 60_000, retry: 1 });

/** The product's newest production records (ESG-lite #76), fetched when its Production tab opens. */
export const useProductProduction = (id: number | null, enabled: boolean) =>
  useQuery<ProductionPage>({
    queryKey: keys.production(id ?? 0),
    queryFn: () => getProductProduction(id as number, 12),
    enabled: enabled && id !== null,
  });

export function useSaveProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ product, draft }: { product: Product | null; draft: ProductDraft }) => {
      const payload = toPayload(draft, product);
      return product
        ? (updateProduct(product.product_id, payload) as Promise<{ moved_production_count?: number }>)
        : (createProduct(payload as Required<typeof payload>) as Promise<{ moved_production_count?: number }>);
    },
    // A site move changes the product's records too.
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteProduct(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}
