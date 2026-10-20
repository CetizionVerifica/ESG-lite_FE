// DS-5 · designs, readiness and templates: the calls (01-contracts §4) and
// their TanStack Query hooks. A Superadmin works on the chosen client
// (company_id); everyone else on their own company.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "../../../api/axios";
import type {
  CreateDocBody,
  DsErrorCode,
  PageFormat,
  PatchDocBody,
  Readiness,
  ReportKind,
  ReportTemplate,
  ResolveResponse,
  Sites,
  StudioDocBuild,
  StudioDocResponse,
  StudioDocSummary,
  YearType,
} from "../../../lib/studio/contracts";
import { resolveRequestFor } from "../../../lib/studio/docData";
import { useStudioCompanyId } from "../../../lib/studio/switch";
import type { ReportDoc } from "../../../lib/studio/contracts";

const withCompany = (companyId: number | null, extra: Record<string, unknown> = {}) => ({ ...extra, ...(companyId ? { company_id: companyId } : {}) });
const bodyWithCompany = <T extends object>(body: T, companyId: number | null): T => (companyId ? { ...body, company_id: companyId } : body);

export interface ReadinessScope {
  kind: ReportKind;
  year: number;
  yearType: YearType;
  sites?: Sites;
}

export async function getReadiness(scope: ReadinessScope, companyId: number | null): Promise<Readiness> {
  const sites = !scope.sites || scope.sites === "all" ? "all" : scope.sites.join(",");
  const { data } = await api.get<Readiness>("/studio/readiness", { params: withCompany(companyId, { kind: scope.kind, year: scope.year, yearType: scope.yearType, sites }) });
  return data;
}
export async function listDocs(filters: { kind?: ReportKind; year?: number }, companyId: number | null): Promise<StudioDocSummary[]> {
  const { data } = await api.get<StudioDocSummary[]>("/studio/docs", { params: withCompany(companyId, filters) });
  return data;
}
/** POST /docs?wait=0: 202 with the build to poll. */
export async function startDocBuild(body: CreateDocBody, companyId: number | null): Promise<StudioDocBuild> {
  const { data } = await api.post<StudioDocBuild>("/studio/docs", bodyWithCompany(body, companyId), { params: withCompany(companyId, { wait: 0 }) });
  return data;
}
export async function getDoc(id: number, companyId: number | null): Promise<StudioDocResponse> {
  const { data } = await api.get<StudioDocResponse>(`/studio/docs/${id}`, { params: withCompany(companyId) });
  return data;
}
export async function getDocBuild(id: number, companyId: number | null): Promise<StudioDocBuild> {
  const { data } = await api.get<StudioDocBuild>(`/studio/docs/${id}`, { params: withCompany(companyId, { build: 1 }) });
  return data;
}
export async function patchDoc(id: number, body: PatchDocBody, companyId: number | null): Promise<StudioDocResponse> {
  const { data } = await api.patch<StudioDocResponse>(`/studio/docs/${id}`, bodyWithCompany(body, companyId), { params: withCompany(companyId) });
  return data;
}
export async function deleteDoc(id: number, companyId: number | null): Promise<void> {
  await api.delete(`/studio/docs/${id}`, { params: withCompany(companyId) });
}
export async function duplicateDoc(id: number, title: string | undefined, companyId: number | null): Promise<{ id: number }> {
  const { data } = await api.post<{ id: number }>(`/studio/docs/${id}/duplicate`, bodyWithCompany(title ? { title } : {}, companyId), { params: withCompany(companyId) });
  return data;
}
export async function postPresence(id: number, companyId: number | null): Promise<{ others: number }> {
  const { data } = await api.post<{ others: number }>(`/studio/docs/${id}/presence`, bodyWithCompany({}, companyId), { params: withCompany(companyId) });
  return data;
}
/** GET /templates (DS-4's endpoint; the gallery reads it). */
export async function listTemplates(filters: { kind: ReportKind; format?: PageFormat; q?: string }, companyId: number | null): Promise<ReportTemplate[]> {
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== ""));
  const { data } = await api.get<ReportTemplate[]>("/studio/templates", { params: withCompany(companyId, params) });
  return Array.isArray(data) ? data : [];
}
export async function resolveDoc(id: number, doc: ReportDoc, companyId: number | null): Promise<ResolveResponse> {
  const { data } = await api.post<ResolveResponse>("/studio/resolve", bodyWithCompany({ ...resolveRequestFor(doc), docId: id }, companyId));
  return data;
}

export const docKeys = {
  all: ["studio", "docs"] as const,
  list: (companyId: number | null, filters: object) => ["studio", "docs", "list", companyId, filters] as const,
  doc: (companyId: number | null, id: number) => ["studio", "docs", id, companyId] as const,
  build: (companyId: number | null, id: number) => ["studio", "docs", id, "build", companyId] as const,
  readiness: (companyId: number | null, scope: ReadinessScope) => ["studio", "readiness", companyId, scope] as const,
  templates: (companyId: number | null, filters: object) => ["studio", "templates", companyId, filters] as const,
  resolve: (companyId: number | null, id: number, rev: number) => ["studio", "docs", id, "resolve", rev, companyId] as const,
};

export function useReadiness(scope: ReadinessScope | null) {
  const companyId = useStudioCompanyId();
  return useQuery({
    queryKey: docKeys.readiness(companyId, scope ?? { kind: "ghg", year: 0, yearType: "CY" }),
    queryFn: () => getReadiness(scope as ReadinessScope, companyId),
    enabled: !!scope,
    staleTime: 60_000,
  });
}

export function useDocs(filters: { kind?: ReportKind; year?: number } = {}) {
  const companyId = useStudioCompanyId();
  return useQuery({ queryKey: docKeys.list(companyId, filters), queryFn: () => listDocs(filters, companyId), staleTime: 15_000 });
}

export function useTemplates(filters: { kind: ReportKind; format?: PageFormat; q?: string }) {
  const companyId = useStudioCompanyId();
  return useQuery({ queryKey: docKeys.templates(companyId, filters), queryFn: () => listTemplates(filters, companyId), staleTime: 60_000 });
}

export function useDoc(id: number | null) {
  const companyId = useStudioCompanyId();
  return useQuery({ queryKey: docKeys.doc(companyId, id ?? 0), queryFn: () => getDoc(id as number, companyId), enabled: id !== null, refetchOnWindowFocus: false });
}

/** The resolved numbers of a design at a rev (refreshes when the rev moves). */
export function useDocValues(id: number | null, doc: ReportDoc | null, rev: number) {
  const companyId = useStudioCompanyId();
  return useQuery({
    queryKey: docKeys.resolve(companyId, id ?? 0, rev),
    queryFn: () => resolveDoc(id as number, doc as ReportDoc, companyId),
    enabled: id !== null && !!doc,
    staleTime: 60_000,
  });
}

/** Polls GET /docs/:id?build=1 every `intervalMs` while the build runs. */
export function useDocBuild(id: number | null, intervalMs = 500) {
  const companyId = useStudioCompanyId();
  return useQuery({
    queryKey: docKeys.build(companyId, id ?? 0),
    queryFn: () => getDocBuild(id as number, companyId),
    enabled: id !== null,
    refetchInterval: (q) => (q.state.data?.build?.state === "running" || !q.state.data ? intervalMs : false),
  });
}

export function useStartBuild() {
  const companyId = useStudioCompanyId();
  return useMutation({ mutationFn: (body: CreateDocBody) => startDocBuild(body, companyId) });
}

export function useDeleteDoc() {
  const qc = useQueryClient();
  const companyId = useStudioCompanyId();
  return useMutation({ mutationFn: (id: number) => deleteDoc(id, companyId), onSuccess: () => qc.invalidateQueries({ queryKey: docKeys.all }) });
}

export function useDuplicateDoc() {
  const qc = useQueryClient();
  const companyId = useStudioCompanyId();
  return useMutation({ mutationFn: ({ id, title }: { id: number; title?: string }) => duplicateDoc(id, title, companyId), onSuccess: () => qc.invalidateQueries({ queryKey: docKeys.all }) });
}

/** A rename from the home list: needs the design's current rev. */
export function useRenameDoc() {
  const qc = useQueryClient();
  const companyId = useStudioCompanyId();
  return useMutation({
    mutationFn: ({ id, rev, title }: { id: number; rev: number; title: string }) => patchDoc(id, { rev, title }, companyId),
    onSuccess: () => qc.invalidateQueries({ queryKey: docKeys.all }),
  });
}

const MESSAGES: Partial<Record<DsErrorCode, string>> = {
  DS_STUDIO_OFF: "Design Studio isn't turned on for your company.",
  DS_KIND_OFF: "Sustainability reports need KPI tracking, which isn't turned on.",
  DS_ROLE: "Your role can't do this.",
  DS_SITES_SCOPE: "A company-wide report needs access to every site. Pick your sites instead.",
  DS_DOC_NOT_FOUND: "This design wasn't found. It may have been deleted.",
  DS_VERSION_CONFLICT: "Someone else changed this design. Reload to see their changes.",
  DS_FINAL_IMMUTABLE: "A final version can't be changed.",
  DS_LAYOUT_NOT_FOUND: "That template isn't available any more. Pick another one.",
  DS_FORMAT_INVALID: "That page format isn't available for this template.",
  DS_DOC_TOO_LARGE: "The design is too large to save (over 2 MB).",
  DS_VALIDATION: "Some details need fixing.",
};

export function errorCode(e: unknown): DsErrorCode | null {
  const code = (e as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === "string" ? (code as DsErrorCode) : null;
}

/** The message to show for a failed studio call. */
export function docErrorMessage(e: unknown, fallback = "Something went wrong. Try again."): string {
  const code = errorCode(e);
  if (code && MESSAGES[code]) return MESSAGES[code] as string;
  const message = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof message === "string" && message ? message : fallback;
}
