import api from "../api/axios";
import { categoryLabel } from "../lib/scope3/contracts";
import type { InvestmentsImportPlan } from "./scope3AssetsService";

/** S3-10 sold products: sales, use profile and the Category 10 / 11 / 12 plans (ESG-lite src/scope3/soldProducts). */

export type SoldProductCategory = 10 | 11 | 12;
export type YearType = "CY" | "FY";
export type EolTreatment = "landfill" | "incineration" | "recycling" | "composting";
export type UseType = "energy" | "fuel" | "gas" | "intermediate";

export interface SoldSite {
  site_id: number;
  name: string;
  /** The site's Category 10, 11 and 12 categories (null when not assigned). */
  categories: Record<SoldProductCategory, number | null>;
}

export interface UseProfile {
  packaging_kg_per_unit?: number | null;
  use_type?: UseType | null;
  use_option?: string | null;
  energy_per_use_kwh?: number | null;
  gas_per_product_kg?: number | null;
  gas_released_pct?: number | null;
  final_product_share_pct?: number | null;
}

export interface EolShare {
  treatment: EolTreatment;
  /** 0 to 1; the shares add up to 1. */
  share: number;
}

export interface SoldProduct {
  product_id: number;
  name: string;
  unit: string;
  declared_unit: string | null;
  site_id: number;
  site_name: string;
  mass_per_unit_kg: number | null;
  lifetime_uses: number | null;
  eol_mix: EolShare[] | null;
  use_profile: UseProfile | null;
}

export interface Sale {
  id: number;
  product_id: number;
  product: string;
  site_id: number;
  /** First day of the month, YYYY-MM-DD. */
  period: string;
  quantity: number;
  unit: string;
  region: string | null;
  /** kg sold (packaging excluded); null when the product has no mass per unit. */
  mass_kg: number | null;
}

export interface SalesList {
  company_id: number;
  year: number;
  year_type: YearType;
  sites: SoldSite[];
  products: SoldProduct[];
  sales: Sale[];
}

export interface SaleInput {
  product_id: number;
  /** YYYY-MM or YYYY-MM-DD. */
  period: string;
  quantity: number;
  unit: string;
  region?: string | null;
}

export interface SalesResult {
  created: number;
  updated: number;
  unchanged: number;
}

export interface UseProfileBody {
  lifetime_uses?: number | null;
  eol_mix?: EolShare[] | null;
  use_profile?: UseProfile | null;
}

export interface PlanBody {
  site_id: number;
  year: number;
  year_type: YearType;
  ghg_category: SoldProductCategory;
}

export type SkipReason = "missing_mass" | "missing_units" | "missing_use_profile" | "missing_lifetime_uses" | "already_imported";

/** The import plan (ESG-lite ImportPlanWithRows); same shape as the investments plan. */
export type SoldProductsImportPlan = InvestmentsImportPlan;

export interface SoldProductsPlan {
  plan: SoldProductsImportPlan | null;
  planned: { product_id: number; row_refs: string[]; method: string }[];
  skipped: { product_id: number; product: string; reason: SkipReason }[];
  products_sold: number;
}

export { commitInvestmentsPlan as commitImportPlan } from "./scope3AssetsService";

const withCompany = (companyId: number | null) => (companyId ? { company_id: companyId } : {});

export const getSales = async (companyId: number | null, year: number, yearType: YearType): Promise<SalesList> =>
  (await api.get("/scope3/product-sales", { params: { year, year_type: yearType, ...withCompany(companyId) } })).data;

export const postSales = async (companyId: number | null, sales: SaleInput[]): Promise<SalesResult> =>
  (await api.post("/scope3/product-sales", { sales, ...withCompany(companyId) })).data;

export const putSale = async (companyId: number | null, id: number, body: Partial<Omit<SaleInput, "product_id">>): Promise<Sale> =>
  (await api.put(`/scope3/product-sales/${id}`, { ...body, ...withCompany(companyId) })).data;

export const putUseProfile = async (companyId: number | null, productId: number, body: UseProfileBody): Promise<SoldProduct> =>
  (await api.put(`/scope3/products/${productId}/use-profile`, { ...body, ...withCompany(companyId) })).data;

export const planSoldProducts = async (companyId: number | null, body: PlanBody): Promise<SoldProductsPlan> =>
  (await api.post("/scope3/sold-products/plan", { ...body, ...withCompany(companyId) })).data;

const REASONS: Record<string, string> = {
  CATEGORY_10_NOT_ASSIGNED: `This site has no ${categoryLabel(10)} category. Assign one to the site, or pick another site.`,
  CATEGORY_11_NOT_ASSIGNED: `This site has no ${categoryLabel(11)} category. Assign one to the site, or pick another site.`,
  CATEGORY_12_NOT_ASSIGNED: `This site has no ${categoryLabel(12)} category. Assign one to the site, or pick another site.`,
  SOLD_PRODUCTS_HAS_ENTRIES: "This site already has entries on its own form for this category, so the plan can't add rows there. Enter them on Add data, or ask a Superadmin to set up the standard form.",
  SOLD_PRODUCTS_FORM_CUSTOMISED: "This site's form for this category was customised, so the plan can't fill it. Ask a Superadmin to restore the standard form.",
};

/** Server message from an axios error, or the fallback; known reasons get their own words. */
export function errorMessage(e: unknown, fallback: string): string {
  const data = (e as { response?: { data?: { message?: unknown; details?: { reason?: unknown; issues?: Array<{ message?: unknown }> } } } })?.response?.data;
  const reason = typeof data?.details?.reason === "string" ? REASONS[data.details.reason] : undefined;
  if (reason) return reason;
  const issue = data?.details?.issues?.[0]?.message;
  if (typeof issue === "string" && issue) return issue;
  return typeof data?.message === "string" && data.message ? data.message : fallback;
}
