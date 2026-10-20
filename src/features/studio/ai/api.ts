// DS-9 · the AI endpoints (01-contracts §4) and their TanStack Query hooks:
//   POST /studio/docs/:id/ai        one action → Suggestion
//   POST /studio/docs/:id/ai/chat   {messages, selection?} → {reply, suggestions}
//   GET  /studio/docs/:id/ai/usage  the budget meter
//   POST /studio/ai/brief           design from a brief → proposals
//   POST /studio/docs               (DS-5) Accept on a proposal builds the design
// A Superadmin works on the chosen client (company_id). Nothing here changes a
// doc: suggestions are applied by the editor on Accept.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../../api/axios";
import type { AiRequest, AiUsage, BriefReply, BriefRequest, ChatReply, ChatRequest, CreateDocBody, DsErrorCode, StudioDocResponse, Suggestion } from "../../../lib/studio/contracts";
import { useStudioCompanyId } from "../../../lib/studio/switch";

const params = (companyId: number | null) => (companyId ? { company_id: companyId } : {});
const body = <T extends object>(b: T, companyId: number | null): T => (companyId ? { ...b, company_id: companyId } : b);

export async function postAiAction(docId: number, req: AiRequest, companyId: number | null): Promise<Suggestion> {
  const { data } = await api.post<Suggestion>(`/studio/docs/${docId}/ai`, body(req, companyId), { params: params(companyId) });
  return data;
}
export async function postAiChat(docId: number, req: ChatRequest, companyId: number | null): Promise<ChatReply> {
  const { data } = await api.post<ChatReply>(`/studio/docs/${docId}/ai/chat`, body(req, companyId), { params: params(companyId) });
  return data;
}
export async function getAiUsage(docId: number, companyId: number | null): Promise<AiUsage> {
  const { data } = await api.get<AiUsage>(`/studio/docs/${docId}/ai/usage`, { params: params(companyId) });
  return data;
}
export async function postBrief(req: BriefRequest, companyId: number | null): Promise<BriefReply> {
  const { data } = await api.post<BriefReply>("/studio/ai/brief", body(req, companyId), { params: params(companyId) });
  return data;
}
/** POST /studio/docs and wait for the build (DS-5 answers 201 with the built doc). */
export async function buildDesign(req: CreateDocBody, companyId: number | null): Promise<StudioDocResponse> {
  const { data } = await api.post<StudioDocResponse>("/studio/docs", body(req, companyId), { params: params(companyId) });
  return data;
}

export const aiKeys = { usage: (companyId: number | null, docId: number) => ["studio", "docs", docId, "ai-usage", companyId] as const };

export function useAiUsage(docId: number) {
  const companyId = useStudioCompanyId();
  return useQuery({ queryKey: aiKeys.usage(companyId, docId), queryFn: () => getAiUsage(docId, companyId), staleTime: 30_000 });
}

/** Every call refreshes the budget meter. */
export function useAiCalls(docId: number) {
  const companyId = useStudioCompanyId();
  const qc = useQueryClient();
  const settle = () => void qc.invalidateQueries({ queryKey: aiKeys.usage(companyId, docId) });
  const action = useMutation({ mutationFn: (req: AiRequest) => postAiAction(docId, req, companyId), onSettled: settle });
  const chat = useMutation({ mutationFn: (req: ChatRequest) => postAiChat(docId, req, companyId), onSettled: settle });
  return { action, chat };
}

export function useBrief() {
  const companyId = useStudioCompanyId();
  const brief = useMutation({ mutationFn: (req: BriefRequest) => postBrief(req, companyId) });
  const build = useMutation({ mutationFn: (req: CreateDocBody) => buildDesign(req, companyId) });
  return { brief, build };
}

/** The `code` of an API error (DS_*), if any. */
export function errorCode(err: unknown): DsErrorCode | undefined {
  const data = (err as { response?: { data?: { code?: string } } } | null)?.response?.data;
  return (data?.code as DsErrorCode | undefined) ?? undefined;
}
