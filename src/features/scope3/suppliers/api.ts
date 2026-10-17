import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  type FacilityBody,
  type FigureBody,
  type NameMatchDecision,
  type SupplierBody,
  createSupplier,
  createSupplierFigure,
  decideNameMatch,
  getNameMatches,
  getSupplier,
  getSupplierCoverage,
  getSuppliers,
  saveFacilityData,
  updateSupplier,
} from "../../../services/scope3SuppliersService";

export { errorMessage, isBoundaryRefusal } from "../../../services/scope3SuppliersService";

/** companyId: the Superadmin's selected client; null for everyone else (their own company). */
export const keys = {
  all: ["scope3-suppliers"] as const,
  list: (companyId: number | null, year: number) => [...keys.all, "list", companyId, year] as const,
  detail: (companyId: number | null, id: number) => [...keys.all, "detail", companyId, id] as const,
  matches: (companyId: number | null) => [...keys.all, "matches", companyId] as const,
  coverage: (companyId: number | null, year: number) => [...keys.all, "coverage", companyId, year] as const,
};

export const useSuppliers = (companyId: number | null, year: number, enabled = true) =>
  useQuery({ queryKey: keys.list(companyId, year), queryFn: () => getSuppliers(companyId, year), enabled });

export const useSupplier = (companyId: number | null, id: number | null) =>
  useQuery({ queryKey: keys.detail(companyId, id ?? 0), queryFn: () => getSupplier(companyId, id as number), enabled: id !== null });

export const useNameMatches = (companyId: number | null, enabled = true) =>
  useQuery({ queryKey: keys.matches(companyId), queryFn: () => getNameMatches(companyId), enabled });

export const useCoverage = (companyId: number | null, year: number, enabled = true) =>
  useQuery({ queryKey: keys.coverage(companyId, year), queryFn: () => getSupplierCoverage(companyId, year, "all"), enabled });

/** Every supplier query of the company: a change anywhere can move the list, a drawer and the review list. */
const useInvalidate = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: keys.all });
};

export function useSaveSupplier(companyId: number | null) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, body }: { id: number | null; body: SupplierBody }) =>
      id === null ? createSupplier(companyId, { ...body, name: body.name ?? "" }) : updateSupplier(companyId, id, body),
    onSettled: invalidate,
  });
}

export function useAddFigure(companyId: number | null, supplierId: number) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (body: FigureBody) => createSupplierFigure(companyId, supplierId, body), onSettled: invalidate });
}

export function useSaveFacility(companyId: number | null, supplierId: number) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (body: FacilityBody) => saveFacilityData(companyId, supplierId, body), onSettled: invalidate });
}

export function useDecideMatch(companyId: number | null) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (body: NameMatchDecision) => decideNameMatch(companyId, body), onSettled: invalidate });
}
