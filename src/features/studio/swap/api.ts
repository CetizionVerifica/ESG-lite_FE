// PRO-0 · AT-2 "Try another template" (editor AI drawer):
//   POST /studio/docs/:id/template-swap/preview   {templateId, rev} → TemplateSwapPreview (nothing saved)
//   POST /studio/docs/:id/template-swap/apply     {templateId, rev, previewHash} → StudioDocResponse
// "Suggest layouts" is the DS-9 action `suggest_layouts` (ai/api.ts postAiAction): a Suggestion of
// kind 'pages' with payload.layoutOptions. Both keep every text, chart and data chip.
import { useMutation } from "@tanstack/react-query";
import api from "../../../api/axios";
import type { DsErrorCode, StudioDocResponse, TemplateSwapApplyBody, TemplateSwapBody, TemplateSwapPreview } from "../../../lib/studio/contracts";
import { useStudioCompanyId } from "../../../lib/studio/switch";

const params = (companyId: number | null) => (companyId ? { company_id: companyId } : {});
const withCompany = <T extends object>(b: T, companyId: number | null) => (companyId ? { ...b, company_id: companyId } : b);

export async function previewTemplateSwap(docId: number, req: TemplateSwapBody, companyId: number | null): Promise<TemplateSwapPreview> {
  const { data } = await api.post<TemplateSwapPreview>(`/studio/docs/${docId}/template-swap/preview`, withCompany(req, companyId), { params: params(companyId) });
  return data;
}
export async function applyTemplateSwap(docId: number, req: TemplateSwapApplyBody, companyId: number | null): Promise<StudioDocResponse> {
  const { data } = await api.post<StudioDocResponse>(`/studio/docs/${docId}/template-swap/apply`, withCompany(req, companyId), { params: params(companyId) });
  return data;
}

export function useTemplateSwap(docId: number) {
  const companyId = useStudioCompanyId();
  const preview = useMutation({ mutationFn: (req: TemplateSwapBody) => previewTemplateSwap(docId, req, companyId) });
  const apply = useMutation({ mutationFn: (req: TemplateSwapApplyBody) => applyTemplateSwap(docId, req, companyId) });
  return { preview, apply };
}

const MESSAGES: Partial<Record<DsErrorCode, string>> = {
  DS_VERSION_CONFLICT: "The design changed since the preview. Preview again.",
  DS_LAYOUT_NOT_FOUND: "That template isn't available any more.",
  DS_FINAL_IMMUTABLE: "A final version can't be changed.",
  DS_NOT_BUILT: "Trying another template isn't available yet.",
};
export function templateSwapErrorMessage(e: unknown, fallback = "The template couldn't be applied. Try again."): string {
  const code = (e as { response?: { data?: { code?: DsErrorCode } } })?.response?.data?.code;
  return (code && MESSAGES[code]) || fallback;
}
