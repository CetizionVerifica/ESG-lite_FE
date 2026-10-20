// DS-10 · Resize calls (01-contracts §4): POST /studio/docs/:id/resize makes a
// linked copy; GET /studio/docs/:id/source says where a copy came from and
// whether the source's data moved. A Superadmin works on the chosen client.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../../api/axios";
import type { LinkedSourceResponse, ResizeBody, ResizeResponse } from "../../../lib/studio/contracts";
import { useStudioCompanyId } from "../../../lib/studio/switch";
import { docKeys } from "../docs/api";

const withCompany = (companyId: number | null) => (companyId ? { company_id: companyId } : {});

export async function resizeDesign(id: number, body: ResizeBody, companyId: number | null): Promise<ResizeResponse> {
  const { data } = await api.post<ResizeResponse>(`/studio/docs/${id}/resize`, { ...body, ...withCompany(companyId) }, { params: withCompany(companyId) });
  return data;
}

export async function getLinkedSource(id: number, companyId: number | null): Promise<LinkedSourceResponse> {
  const { data } = await api.get<LinkedSourceResponse>(`/studio/docs/${id}/source`, { params: withCompany(companyId) });
  return data;
}

export const resizeKeys = { source: (id: number, companyId: number | null) => [...docKeys.all, id, "source", companyId] as const };

/** "Made from …" for a resized copy (no call for a design that isn't one). */
export function useLinkedSource(docId: number, isCopy: boolean) {
  const companyId = useStudioCompanyId();
  return useQuery({ queryKey: resizeKeys.source(docId, companyId), queryFn: () => getLinkedSource(docId, companyId), enabled: isCopy && docId > 0, staleTime: 60_000 });
}

/** One copy per call; the dialog runs one per checked target. */
export function useResize(docId: number) {
  const companyId = useStudioCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ResizeBody) => resizeDesign(docId, body, companyId),
    // Only the home list: the open design itself is unchanged.
    onSuccess: () => qc.invalidateQueries({ queryKey: ["studio", "docs", "list"] }),
  });
}

/** `{code, message}` of a failed call. */
export function resizeError(err: unknown): { code?: string; message?: string } {
  const res = (err as { response?: { data?: { code?: string; message?: string } } } | null)?.response;
  return { code: res?.data?.code, message: res?.data?.message };
}
