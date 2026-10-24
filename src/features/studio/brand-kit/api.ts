// DS-3 · brand kit and styles calls (01-contracts §4) and their TanStack Query
// hooks. A Superadmin passes the selected client's company_id.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../../api/axios";
import type { BrandKit, BrandKitUpdate, DsErrorCode, ReportKind, StylePreset } from "../../../lib/studio/contracts";
import { useStudioCompanyId } from "../../../lib/studio/switch";

const params = (companyId: number | null, extra: Record<string, unknown> = {}) => ({ ...extra, ...(companyId ? { company_id: companyId } : {}) });

export async function getBrandKit(companyId: number | null): Promise<BrandKit> {
  const { data } = await api.get<BrandKit>("/studio/brand-kit", { params: params(companyId) });
  return data;
}
export async function putBrandKit(body: BrandKitUpdate, companyId: number | null): Promise<BrandKit> {
  const { data } = await api.put<BrandKit>("/studio/brand-kit", companyId ? { ...body, company_id: companyId } : body, { params: params(companyId) });
  return data;
}
export async function getStyles(kind: ReportKind, companyId: number | null): Promise<StylePreset[]> {
  const { data } = await api.get<StylePreset[]>("/studio/styles", { params: params(companyId, { kind }) });
  return data;
}

export const brandKitKeys = {
  kit: (companyId: number | null) => ["studio", "brand-kit", companyId] as const,
  styles: (companyId: number | null, kind: ReportKind) => ["studio", "styles", companyId, kind] as const,
};

export function useBrandKit() {
  const companyId = useStudioCompanyId();
  return useQuery({ queryKey: brandKitKeys.kit(companyId), queryFn: () => getBrandKit(companyId), staleTime: 60_000 });
}

export function useStyles(kind: ReportKind) {
  const companyId = useStudioCompanyId();
  return useQuery({ queryKey: brandKitKeys.styles(companyId, kind), queryFn: () => getStyles(kind, companyId), staleTime: 60_000 });
}

export function useSaveBrandKit() {
  const qc = useQueryClient();
  const companyId = useStudioCompanyId();
  return useMutation({
    mutationFn: (body: BrandKitUpdate) => putBrandKit(body, companyId),
    onSuccess: async (kit) => {
      qc.setQueryData(brandKitKeys.kit(companyId), kit);
      await qc.invalidateQueries({ queryKey: ["studio", "styles", companyId] });
    },
  });
}

const MESSAGES: Partial<Record<DsErrorCode, string>> = {
  DS_ROLE: "Only Managers can change the brand kit.",
  DS_VALIDATION: "Some fields need fixing before the brand kit can be saved.",
  DS_DOC_NOT_FOUND: "A palette was removed elsewhere. Reload the page and try again.",
  DS_STUDIO_OFF: "Design Studio isn't turned on for your company.",
};

/** The message to show for a failed brand kit call. */
export function brandKitErrorMessage(e: unknown, fallback = "The brand kit couldn't be saved. Try again."): string {
  const data = (e as { response?: { data?: { code?: unknown; message?: unknown } } })?.response?.data;
  const code = data?.code as DsErrorCode | undefined;
  if (code && MESSAGES[code]) return MESSAGES[code] as string;
  return typeof data?.message === "string" && data.message ? data.message : fallback;
}
