// DS-6 · the editor's server calls (01-contracts §4) and TanStack Query hooks:
// the doc (GET/PATCH /studio/docs/:id, autosave with rev), the company's
// assets (image URLs for sheets and the frame picker) and page layouts (the
// "+" between pages, Layout ▾, Reset to layout).
//
// DS-5 owns the docs endpoints; until its FE api lands these calls are the
// editor's own, written against the contract and the DS-0 mocks.
import { useMutation, useQuery } from "@tanstack/react-query";
import api from "../../../api/axios";
import type { PageFormat, ReportDoc, ReportKind, ReportLayout, StudioAsset, StudioDocResponse } from "../../../lib/studio/contracts";
import { useStudioCompanyId } from "../../../lib/studio/switch";

const params = (companyId: number | null, extra: Record<string, unknown> = {}) => ({ ...extra, ...(companyId ? { company_id: companyId } : {}) });

export async function getStudioDoc(id: number, companyId: number | null): Promise<StudioDocResponse> {
  const { data } = await api.get<StudioDocResponse>(`/studio/docs/${id}`, { params: params(companyId) });
  return data;
}

/** PATCH /studio/docs/:id: 409 DS_VERSION_CONFLICT (details.rev) when `rev` is stale. */
export async function patchStudioDoc(id: number, rev: number, doc: ReportDoc, companyId: number | null): Promise<StudioDocResponse> {
  const { data } = await api.patch<StudioDocResponse>(`/studio/docs/${id}`, companyId ? { rev, doc, company_id: companyId } : { rev, doc }, { params: params(companyId) });
  return data;
}

export async function listStudioAssets(companyId: number | null): Promise<StudioAsset[]> {
  const { data } = await api.get<StudioAsset[]>("/studio/assets", { params: params(companyId) });
  return Array.isArray(data) ? data : [];
}

export async function listStudioLayouts(kind: ReportKind, format: PageFormat, companyId: number | null): Promise<ReportLayout[]> {
  const { data } = await api.get<ReportLayout[]>("/studio/layouts", { params: params(companyId, { kind, format }) });
  return Array.isArray(data) ? data : [];
}

export const editorKeys = {
  doc: (companyId: number | null, id: number) => ["studio", "docs", id, "editor", companyId] as const,
  assets: (companyId: number | null) => ["studio", "assets", companyId] as const,
  layouts: (companyId: number | null, kind: ReportKind, format: PageFormat) => ["studio", "layouts", companyId, kind, format] as const,
};

export function useStudioDoc(id: number) {
  const companyId = useStudioCompanyId();
  return useQuery({
    queryKey: editorKeys.doc(companyId, id),
    queryFn: () => getStudioDoc(id, companyId),
    // The editor owns the doc once open: never refetch it under the user.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: false,
  });
}

export function useSaveStudioDoc(id: number) {
  const companyId = useStudioCompanyId();
  return useMutation({ mutationFn: (v: { rev: number; doc: ReportDoc }) => patchStudioDoc(id, v.rev, v.doc, companyId) });
}

export function useStudioAssets() {
  const companyId = useStudioCompanyId();
  return useQuery({ queryKey: editorKeys.assets(companyId), queryFn: () => listStudioAssets(companyId), staleTime: 60_000 });
}

export function useStudioLayouts(kind: ReportKind, format: PageFormat, enabled = true) {
  const companyId = useStudioCompanyId();
  return useQuery({ queryKey: editorKeys.layouts(companyId, kind, format), queryFn: () => listStudioLayouts(kind, format, companyId), staleTime: 300_000, enabled });
}

type AxiosLike = { response?: { status?: number; data?: { code?: unknown; message?: unknown; details?: unknown } } };

export const dsCode = (e: unknown): string | null => {
  const c = (e as AxiosLike)?.response?.data?.code;
  return typeof c === "string" ? c : null;
};

/** The server's rev from a DS_VERSION_CONFLICT answer. */
export const conflictRev = (e: unknown): number | null => {
  const d = (e as AxiosLike)?.response?.data?.details as { rev?: unknown } | undefined;
  return typeof d?.rev === "number" ? d.rev : null;
};

/** Plain words for an editor load or save error. */
export function editorErrorMessage(e: unknown): string {
  switch (dsCode(e)) {
    case "DS_DOC_NOT_FOUND":
      return "This design doesn't exist, or it belongs to another company.";
    case "DS_STUDIO_OFF":
      return "Design Studio isn't turned on for your company.";
    case "DS_KIND_OFF":
      return "Sustainability designs need KPI tracking, which is off for your company.";
    case "DS_ROLE":
      return "Only Admins and Managers can open designs.";
    case "DS_FINAL_IMMUTABLE":
      return "This design is final and can't be changed. Make a new version to correct it.";
    case "DS_DOC_TOO_LARGE":
      return "This design is too large to save. Remove some images or pages.";
    case "DS_DOC_INVALID":
      return "The design couldn't be saved because part of it isn't valid.";
    default: {
      const m = (e as AxiosLike)?.response?.data?.message;
      return typeof m === "string" && m ? m : "Something went wrong. Try again in a moment.";
    }
  }
}
