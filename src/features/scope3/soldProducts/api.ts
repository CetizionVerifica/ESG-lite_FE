import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type PlanBody,
  type SaleInput,
  type SalesList,
  type UseProfileBody,
  type YearType,
  commitImportPlan,
  getSales,
  planSoldProducts,
  postSales,
  putSale,
  putUseProfile,
} from "../../../services/scope3SoldProductsService";

export { errorMessage } from "../../../services/scope3SoldProductsService";

/** companyId: the Superadmin's selected client; null for everyone else (their own company). */
export const keys = {
  all: ["scope3-sold-products"] as const,
  sales: (companyId: number | null, year: number, yearType: YearType) => [...keys.all, "sales", companyId, year, yearType] as const,
};

/** The year's sales, the products they can be entered for, and the caller's sites with their Category 10–12 categories. */
export const useSales = (companyId: number | null, year: number, yearType: YearType, enabled = true) =>
  useQuery<SalesList>({ queryKey: keys.sales(companyId, year, yearType), queryFn: () => getSales(companyId, year, yearType), enabled });

const useInvalidate = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: keys.all });
};

/** Adds sales (one typed, or a whole sheet); the same product, month, unit and region replaces the quantity. */
export const useAddSales = (companyId: number | null) => {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (sales: SaleInput[]) => postSales(companyId, sales), onSuccess: invalidate });
};

export const useEditSale = (companyId: number | null) => {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: ({ id, body }: { id: number; body: Partial<Omit<SaleInput, "product_id">> }) => putSale(companyId, id, body), onSuccess: invalidate });
};

export const useSaveUseProfile = (companyId: number | null) => {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: ({ productId, body }: { productId: number; body: UseProfileBody }) => putUseProfile(companyId, productId, body), onSuccess: invalidate });
};

/** Makes the import plan for one category; nothing is saved until it is committed. */
export const usePlanSoldProducts = (companyId: number | null) => useMutation({ mutationFn: (body: PlanBody) => planSoldProducts(companyId, body) });

export const useCommitPlan = () =>
  useMutation({ mutationFn: ({ planId, version, key }: { planId: string; version: number; key: string }) => commitImportPlan(planId, version, key) });
