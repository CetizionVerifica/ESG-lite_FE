// DS-13 · review calls (ESG-lite src/studio/collab/router.ts) and their
// TanStack Query hooks. A Superadmin works on the chosen client (company_id).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../../api/axios";
import type {
  ApprovalDecision,
  ApprovalsResponse,
  CreateCommentBody,
  DriftResponse,
  LayoutFromPageBody,
  ReportApproval,
  ReportComment,
  ReportLayout,
  ReportVersion,
  StudioDocResponse,
  ReportTemplateDetail,
  RequestApprovalBody,
  ReviewSettings,
  StudioPerson,
  TemplateFromDocBody,
} from "../../../lib/studio/contracts";
import { useStudioCompanyId } from "../../../lib/studio/switch";

const params = (companyId: number | null, extra: Record<string, unknown> = {}) => ({ params: { ...extra, ...(companyId ? { company_id: companyId } : {}) } });
const withCompany = <T extends object>(body: T, companyId: number | null): T => (companyId ? { ...body, company_id: companyId } : body);

export const reviewKeys = {
  all: (docId: number) => ["studio", "review", docId] as const,
  people: (docId: number) => ["studio", "review", docId, "people"] as const,
  comments: (docId: number, resolved: boolean) => ["studio", "review", docId, "comments", resolved] as const,
  myTasks: (docId: number) => ["studio", "review", docId, "my-tasks"] as const,
  approvals: (docId: number) => ["studio", "review", docId, "approvals"] as const,
  drift: (docId: number) => ["studio", "review", docId, "drift"] as const,
  settings: () => ["studio", "review-settings"] as const,
};

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

export async function getPeople(docId: number, companyId: number | null): Promise<StudioPerson[]> {
  const { data } = await api.get<StudioPerson[]>(`/studio/docs/${docId}/people`, params(companyId));
  return Array.isArray(data) ? data : [];
}
export async function getComments(docId: number, opts: { resolved?: boolean; tasks?: "mine" | "open" }, companyId: number | null): Promise<ReportComment[]> {
  const { data } = await api.get<ReportComment[]>(`/studio/docs/${docId}/comments`, params(companyId, { ...(opts.resolved ? { resolved: "1" } : {}), ...(opts.tasks ? { tasks: opts.tasks } : {}) }));
  return Array.isArray(data) ? data : [];
}
export async function postComment(docId: number, body: CreateCommentBody, companyId: number | null): Promise<ReportComment> {
  const { data } = await api.post<ReportComment>(`/studio/docs/${docId}/comments`, withCompany(body, companyId), params(companyId));
  return data;
}
export async function patchComment(id: number, body: { body?: string; resolved?: boolean }, companyId: number | null): Promise<ReportComment> {
  const { data } = await api.patch<ReportComment>(`/studio/comments/${id}`, withCompany(body, companyId), params(companyId));
  return data;
}
export async function deleteComment(id: number, companyId: number | null): Promise<void> {
  // data-loss-reviewed: deletes one comment; the Comments panel asks "Delete this comment?" inline (Delete / Keep) first.
  await api.delete(`/studio/comments/${id}`, params(companyId));
}
export async function assignTask(id: number, assigneeId: number | null, companyId: number | null): Promise<ReportComment> {
  const { data } = await api.post<ReportComment>(`/studio/comments/${id}/task`, withCompany({ assigneeId }, companyId), params(companyId));
  return data;
}
export async function setTaskDone(id: number, done: boolean, companyId: number | null): Promise<ReportComment> {
  const { data } = await api.patch<ReportComment>(`/studio/comments/${id}/task`, withCompany({ done }, companyId), params(companyId));
  return data;
}
export async function getApprovals(docId: number, companyId: number | null): Promise<ApprovalsResponse> {
  const { data } = await api.get<ApprovalsResponse>(`/studio/docs/${docId}/approvals`, params(companyId));
  return data;
}
export async function requestApproval(docId: number, body: RequestApprovalBody, companyId: number | null): Promise<ReportApproval> {
  const { data } = await api.post<ReportApproval>(`/studio/docs/${docId}/approvals`, withCompany(body, companyId), params(companyId));
  return data;
}
export async function decideApproval(id: number, decision: ApprovalDecision, note: string | null, companyId: number | null): Promise<ReportApproval> {
  const { data } = await api.post<ReportApproval>(`/studio/approvals/${id}/decide`, withCompany({ decision, ...(note ? { note } : {}) }, companyId), params(companyId));
  return data;
}
export async function withdrawApproval(id: number, companyId: number | null): Promise<void> {
  // data-loss-reviewed: withdraws a pending approval request; the approval bar asks "Withdraw the request?" inline (Withdraw / Keep) first.
  await api.delete(`/studio/approvals/${id}`, params(companyId));
}
export async function getDrift(docId: number, companyId: number | null): Promise<DriftResponse> {
  const { data } = await api.get<DriftResponse>(`/studio/docs/${docId}/drift`, params(companyId));
  return { dataHash: data?.dataHash ?? "", changed: Array.isArray(data?.changed) ? data.changed : [] };
}
export async function getReviewSettings(companyId: number | null): Promise<ReviewSettings> {
  const { data } = await api.get<ReviewSettings>(`/studio/review-settings`, params(companyId));
  return data;
}
export async function putReviewSettings(body: Partial<Pick<ReviewSettings, "requireReview" | "brandControls">>, companyId: number | null): Promise<ReviewSettings> {
  const { data } = await api.put<ReviewSettings>(`/studio/review-settings`, withCompany(body, companyId), params(companyId));
  return data;
}
export async function saveTemplateFromDoc(body: TemplateFromDocBody, companyId: number | null): Promise<ReportTemplateDetail> {
  const { data } = await api.post<ReportTemplateDetail>(`/studio/templates/from-doc`, withCompany(body, companyId), params(companyId));
  return data;
}
export async function saveLayoutFromPage(body: LayoutFromPageBody, companyId: number | null): Promise<ReportLayout> {
  const { data } = await api.post<ReportLayout>(`/studio/layouts/from-page`, withCompany(body, companyId), params(companyId));
  return data;
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function usePeople(docId: number) {
  const companyId = useStudioCompanyId();
  return useQuery({ queryKey: [...reviewKeys.people(docId), companyId], queryFn: () => getPeople(docId, companyId), staleTime: 5 * 60_000, enabled: docId > 0 });
}

export function useComments(docId: number, resolved = false) {
  const companyId = useStudioCompanyId();
  return useQuery({ queryKey: [...reviewKeys.comments(docId, resolved), companyId], queryFn: () => getComments(docId, { resolved }, companyId), enabled: docId > 0, refetchInterval: 60_000 });
}

export function useMyTasks(docId: number, enabled = true) {
  const companyId = useStudioCompanyId();
  return useQuery({ queryKey: [...reviewKeys.myTasks(docId), companyId], queryFn: () => getComments(docId, { tasks: "mine" }, companyId), enabled: enabled && docId > 0 });
}

export function useApprovals(docId: number) {
  const companyId = useStudioCompanyId();
  return useQuery({ queryKey: [...reviewKeys.approvals(docId), companyId], queryFn: () => getApprovals(docId, companyId), enabled: docId > 0, refetchInterval: 60_000 });
}

export function useDrift(docId: number, enabled = true) {
  const companyId = useStudioCompanyId();
  return useQuery({ queryKey: [...reviewKeys.drift(docId), companyId], queryFn: () => getDrift(docId, companyId), enabled: enabled && docId > 0, staleTime: 60_000 });
}

export function useReviewSettings() {
  const companyId = useStudioCompanyId();
  return useQuery({ queryKey: [...reviewKeys.settings(), companyId], queryFn: () => getReviewSettings(companyId) });
}

/** Any review change: refetch the doc's comments, tasks and approvals. */
export function useReviewInvalidate(docId: number) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: reviewKeys.all(docId) });
}

export function useReviewMutation<A, R>(docId: number, fn: (args: A, companyId: number | null) => Promise<R>) {
  const companyId = useStudioCompanyId();
  const invalidate = useReviewInvalidate(docId);
  return useMutation({ mutationFn: (args: A) => fn(args, companyId), onSuccess: () => void invalidate() });
}

export function useSaveReviewSettings() {
  const companyId = useStudioCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Pick<ReviewSettings, "requireReview" | "brandControls">>) => putReviewSettings(body, companyId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: reviewKeys.settings() });
      void qc.invalidateQueries({ queryKey: ["studio", "brand-kit"] });
      void qc.invalidateQueries({ queryKey: ["studio", "review"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Version history (DS-11 endpoints, DS-13 screen)
// ---------------------------------------------------------------------------

export async function createSnapshot(docId: number, note: string, companyId: number | null): Promise<ReportVersion> {
  const { data } = await api.post<ReportVersion>(`/studio/docs/${docId}/versions`, withCompany({ note }, companyId), params(companyId));
  return data;
}
export async function restoreVersion(docId: number, n: number, rev: number, companyId: number | null): Promise<StudioDocResponse> {
  const { data } = await api.post<StudioDocResponse>(`/studio/docs/${docId}/versions/${n}/restore`, withCompany({ rev }, companyId), params(companyId));
  return data;
}
