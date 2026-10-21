// PRO-0 · AT-1 template suggestions ("Help me choose" on /studio/new, step 1):
//   POST /studio/templates/suggest   brief → shortlist with readiness badges and AI reasons
// The answer is ordered; aiUsed false = the rule order without reasons (AI down or over budget).
// A Superadmin works on the chosen client (company_id). AT-1 builds the panel on these.
import { useMutation } from "@tanstack/react-query";
import api from "../../../api/axios";
import type { DsErrorCode, TemplateSuggestBody, TemplateSuggestResponse } from "../../../lib/studio/contracts";
import { useStudioCompanyId } from "../../../lib/studio/switch";

const params = (companyId: number | null) => (companyId ? { company_id: companyId } : {});

export async function postTemplateSuggest(req: TemplateSuggestBody, companyId: number | null): Promise<TemplateSuggestResponse> {
  const { data } = await api.post<TemplateSuggestResponse>("/studio/templates/suggest", companyId ? { ...req, company_id: companyId } : req, { params: params(companyId) });
  return data;
}

export function useTemplateSuggest() {
  const companyId = useStudioCompanyId();
  return useMutation({ mutationFn: (req: TemplateSuggestBody) => postTemplateSuggest(req, companyId) });
}

const MESSAGES: Partial<Record<DsErrorCode, string>> = {
  DS_KIND_OFF: "Sustainability reports need KPI tracking, which isn't turned on for your company.",
  DS_VALIDATION: "Answer the questions above, then ask again.",
  DS_NOT_BUILT: "Template suggestions aren't available yet. Browse all templates instead.",
};
export function templateSuggestErrorMessage(e: unknown, fallback = "Suggestions couldn't be loaded. Browse all templates instead."): string {
  const code = (e as { response?: { data?: { code?: DsErrorCode } } })?.response?.data?.code;
  return (code && MESSAGES[code]) || fallback;
}
