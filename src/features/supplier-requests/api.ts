import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getPcfStudies, getPcfStudy } from "../../services/pcfService";
import {
  type AcceptBody,
  type ListResponse,
  type NewRequest,
  type PreviewParams,
  type SupplierRequestStatus,
  acceptSupplierRequest,
  createSupplierRequest,
  deleteSupplierRequest,
  getSupplierRequest,
  getSupplierRequestFile,
  getSupplierRequests,
  previewSupplierMessage,
  rejectSupplierRequest,
  resendSupplierRequest,
} from "../../services/supplierRequestService";
import { type DeclarationResponse, parseDeclaration } from "../../services/pcfAiService";

export { getSupplierRequestFile, parseDeclaration };
export type { DeclarationResponse };

export const keys = {
  all: ["supplier-requests"] as const,
  list: (filters: { study?: number; status?: SupplierRequestStatus }) => [...keys.all, "list", filters] as const,
  one: (id: number) => [...keys.all, "one", id] as const,
  preview: (p: PreviewParams) => [...keys.all, "preview", p] as const,
  studies: () => ["pcf", "studies", "for-supplier-requests"] as const,
  study: (id: number) => ["pcf", "study", id] as const,
};

export const useRequests = (filters: { study?: number; status?: SupplierRequestStatus }) =>
  useQuery<ListResponse>({ queryKey: keys.list(filters), queryFn: () => getSupplierRequests(filters) });

export const useRequest = (id: number | null) =>
  useQuery({ queryKey: keys.one(id ?? 0), queryFn: () => getSupplierRequest(id!), enabled: id !== null });

/** Footprints the manager can ask about (every status; the figure lands on a draft line or waits for the next version). */
export type StudyOption = {
  pcf_study_id: number;
  version: number;
  status: string;
  boundary: "cradle_to_gate" | "cradle_to_grave";
  product: { product_id: number; name: string } | null;
  site: { site_id: number; name: string } | null;
};

export const useStudyOptions = (enabled: boolean) =>
  useQuery<StudyOption[]>({
    queryKey: keys.studies(),
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const data = await getPcfStudies();
      return Array.isArray(data) ? (data as StudyOption[]) : [];
    },
  });

export type StudyInput = { pcf_input_id: number; stage: string; name: string; unit: string; supplier_name: string | null; supplier_pcf_kgco2e: number | null };

export const useStudyInputs = (studyId: number | null) =>
  useQuery<{ boundary: "cradle_to_gate" | "cradle_to_grave"; inputs: StudyInput[] }>({
    queryKey: keys.study(studyId ?? 0),
    enabled: studyId !== null,
    queryFn: async () => {
      const s = await getPcfStudy(studyId!);
      return { boundary: s.boundary, inputs: Array.isArray(s.inputs) ? s.inputs : [] };
    },
  });

/** The exact message the supplier will get; refetched as the form changes. */
export const usePreview = (p: PreviewParams | null) =>
  useQuery({ queryKey: keys.preview(p ?? { study_id: 0 }), queryFn: () => previewSupplierMessage(p!), enabled: p !== null, staleTime: 30_000 });

export function useSendRequest() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (body: NewRequest) => createSupplierRequest(body), onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }) });
}

export function useResend() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, due_date }: { id: number; due_date?: string | null }) => resendSupplierRequest(id, { due_date }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

export function useDeleteRequest() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => deleteSupplierRequest(id), onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }) });
}

export function useAccept() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: AcceptBody }) => acceptSupplierRequest(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.all });
      qc.invalidateQueries({ queryKey: ["pcf"] });
      qc.invalidateQueries({ queryKey: ["material-factors"] });
    },
  });
}

export function useReject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, comment }: { id: number; comment: string }) => rejectSupplierRequest(id, comment),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.all }),
  });
}

/** Reads the supplier's file with the AI service (download from ESG-lite, then parse). */
export function useReadDeclaration() {
  return useMutation({
    mutationFn: async ({ id, fileName, boundary, unit, studyId }: { id: number; fileName: string; boundary: string; unit: string; studyId?: number }) => {
      const { blob } = await getSupplierRequestFile(id);
      const file = new File([blob], fileName, { type: blob.type || (fileName.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/json") });
      return parseDeclaration(file, { expectedBoundary: boundary, expectedUnit: unit, studyId });
    },
  });
}
