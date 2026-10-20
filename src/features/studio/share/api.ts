// DS-11 · preview, render jobs, versions and view links: the calls
// (01-contracts §4) and their TanStack Query hooks. A Superadmin works on the
// chosen client (company_id); everyone else on their own company. Files are
// fetched with the session and saved from a blob: the API never hands out a
// storage URL.
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import api from "../../../api/axios";
import type { CreateJobBody, CreateShareBody, PreviewMode, PublicShareMeta, ReportJob, ReportShare, ReportVersion, StudioDocResponse } from "../../../lib/studio/contracts";
import { JOB_POLL_MS, jobFinished } from "../../../lib/studio/outputs";
import { useStudioCompanyId } from "../../../lib/studio/switch";

const withCompany = (companyId: number | null, extra: Record<string, unknown> = {}) => ({ ...extra, ...(companyId ? { company_id: companyId } : {}) });
const bodyWithCompany = <T extends object>(body: T, companyId: number | null): T => (companyId ? { ...body, company_id: companyId } : body);

export const outputsKeys = {
  preview: (docId: number, mode: PreviewMode, companyId: number | null) => ["studio", "preview", docId, mode, companyId] as const,
  job: (jobId: number) => ["studio", "job", jobId] as const,
  jobs: (docId: number) => ["studio", "jobs", docId] as const,
  versions: (docId: number) => ["studio", "versions", docId] as const,
  shares: (docId: number) => ["studio", "shares", docId] as const,
};

/** The error code and details of a studio API error. */
export function dsError(err: unknown): { status?: number; code?: string; message?: string; details?: unknown } {
  const res = (err as { response?: { status?: number; data?: { code?: string; message?: string; details?: unknown } } } | null)?.response;
  return { status: res?.status, code: res?.data?.code, message: res?.data?.message, details: res?.data?.details };
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

export async function getPreviewHtml(docId: number, mode: PreviewMode, companyId: number | null, pageId?: string): Promise<{ html: string; rev: number | null }> {
  const res = await api.get<string>(`/studio/docs/${docId}/preview.html`, { params: withCompany(companyId, { mode, ...(pageId ? { pageId } : {}) }), responseType: "text", transformResponse: (d) => d });
  const rev = Number(res.headers?.["x-doc-rev"]);
  return { html: String(res.data ?? ""), rev: Number.isFinite(rev) && rev > 0 ? rev : null };
}

/** The saved draft's rev (jobs render what is saved). */
export async function currentRev(docId: number, companyId: number | null): Promise<number> {
  const { data } = await api.get<StudioDocResponse>(`/studio/docs/${docId}`, { params: withCompany(companyId) });
  return data.rev;
}

export async function createJob(docId: number, body: CreateJobBody, companyId: number | null): Promise<ReportJob> {
  const { data } = await api.post<ReportJob>(`/studio/docs/${docId}/jobs`, bodyWithCompany(body, companyId), { params: withCompany(companyId) });
  return data;
}
export async function getJob(jobId: number, companyId: number | null): Promise<ReportJob> {
  const { data } = await api.get<ReportJob>(`/studio/jobs/${jobId}`, { params: withCompany(companyId) });
  return data;
}
export async function listJobs(docId: number, companyId: number | null): Promise<ReportJob[]> {
  const { data } = await api.get<ReportJob[]>(`/studio/docs/${docId}/jobs`, { params: withCompany(companyId) });
  return Array.isArray(data) ? data : [];
}
export async function listVersions(docId: number, companyId: number | null): Promise<ReportVersion[]> {
  const { data } = await api.get<ReportVersion[]>(`/studio/docs/${docId}/versions`, { params: withCompany(companyId) });
  return Array.isArray(data) ? data : [];
}
export async function listShares(docId: number, companyId: number | null): Promise<ReportShare[]> {
  const { data } = await api.get<ReportShare[]>(`/studio/docs/${docId}/shares`, { params: withCompany(companyId) });
  return Array.isArray(data) ? data : [];
}
export async function createShare(docId: number, body: CreateShareBody, companyId: number | null): Promise<ReportShare> {
  const { data } = await api.post<ReportShare>(`/studio/docs/${docId}/shares`, bodyWithCompany(body, companyId), { params: withCompany(companyId) });
  return data;
}
export async function revokeShare(shareId: number, companyId: number | null): Promise<void> {
  await api.delete(`/studio/shares/${shareId}`, { params: withCompany(companyId) });
}

/** Fetches a stored file (job or version) with the session. */
export async function fetchFile(path: string, companyId: number | null): Promise<Blob> {
  const { data } = await api.get<Blob>(path, { params: withCompany(companyId), responseType: "blob" });
  return data;
}

/** Saves a blob as a download. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** The public meta of a view link (no session: plain axios, never the signed-in client). */
export async function getPublicShare(token: string): Promise<PublicShareMeta> {
  try {
    const { data } = await axios.get<PublicShareMeta>(`/s/${encodeURIComponent(token)}/meta`, { baseURL: import.meta.env.VITE_API_URL, headers: { Accept: "application/json" } });
    return data;
  } catch (err) {
    const e = dsError(err);
    throw Object.assign(new Error(e.code ?? `HTTP ${e.status ?? "error"}`), { status: e.status, code: e.code });
  }
}
export const publicFileUrl = (fileUrl: string) => `${String(import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "")}${fileUrl}`;

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** preview.html for a mode; refetch() reloads it (Page view keeps the old pages until the new ones arrive). */
export function usePreviewHtml(docId: number, mode: PreviewMode) {
  const companyId = useStudioCompanyId();
  return useQuery({
    queryKey: outputsKeys.preview(docId, mode, companyId),
    queryFn: () => getPreviewHtml(docId, mode, companyId),
    enabled: docId > 0,
    staleTime: 0,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
  });
}

export function useJobs(docId: number, enabled = true) {
  const companyId = useStudioCompanyId();
  return useQuery({ queryKey: outputsKeys.jobs(docId), queryFn: () => listJobs(docId, companyId), enabled: enabled && docId > 0 });
}
export function useVersions(docId: number, enabled = true) {
  const companyId = useStudioCompanyId();
  return useQuery({ queryKey: outputsKeys.versions(docId), queryFn: () => listVersions(docId, companyId), enabled: enabled && docId > 0 });
}
export function useShares(docId: number, enabled = true) {
  const companyId = useStudioCompanyId();
  return useQuery({ queryKey: outputsKeys.shares(docId), queryFn: () => listShares(docId, companyId), enabled: enabled && docId > 0 });
}

export function useCreateShare(docId: number) {
  const companyId = useStudioCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateShareBody) => createShare(docId, body, companyId),
    onSuccess: () => qc.invalidateQueries({ queryKey: outputsKeys.shares(docId) }),
  });
}
export function useRevokeShare(docId: number) {
  const companyId = useStudioCompanyId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (shareId: number) => revokeShare(shareId, companyId),
    onSuccess: () => qc.invalidateQueries({ queryKey: outputsKeys.shares(docId) }),
  });
}

/**
 * One render job at a time for a design: start it (with the saved rev; a
 * stale rev is retried once with the server's), poll it until it ends, and
 * optionally save the file when it's done.
 */
export function useRenderJob(docId: number, opts: { autoDownload?: boolean } = {}) {
  const companyId = useStudioCompanyId();
  const qc = useQueryClient();
  const [jobId, setJobId] = useState<number | null>(null);
  const [startError, setStartError] = useState<unknown>(null);
  const savedFor = useRef<number | null>(null);

  const job = useQuery({
    queryKey: outputsKeys.job(jobId ?? 0),
    queryFn: () => getJob(jobId as number, companyId),
    enabled: jobId !== null,
    refetchInterval: (q) => (jobFinished(q.state.data) ? false : JOB_POLL_MS),
  });

  const start = useMutation({
    mutationFn: async (body: Omit<CreateJobBody, "rev">) => {
      setStartError(null);
      const rev = await currentRev(docId, companyId);
      try {
        return await createJob(docId, { ...body, rev }, companyId);
      } catch (err) {
        const e = dsError(err);
        const fresh = (e.details as { rev?: number } | undefined)?.rev;
        if (e.code === "DS_VERSION_CONFLICT" && typeof fresh === "number" && fresh !== rev) return createJob(docId, { ...body, rev: fresh }, companyId);
        throw err;
      }
    },
    onSuccess: (j) => {
      setJobId(j.id);
      qc.setQueryData(outputsKeys.job(j.id), j);
      void qc.invalidateQueries({ queryKey: outputsKeys.jobs(docId) });
    },
    onError: (err) => setStartError(err),
  });

  const current = job.data ?? null;
  const download = useCallback(
    async (j: ReportJob) => {
      if (!j.downloadUrl) return;
      const blob = await fetchFile(j.downloadUrl, companyId);
      saveBlob(blob, j.fileName ?? "report.pdf");
    },
    [companyId],
  );

  // Save once when the job ends (and refresh versions for a final).
  const autoDownload = opts.autoDownload !== false;
  useEffect(() => {
    if (!current || current.status !== "done" || savedFor.current === current.id) return;
    savedFor.current = current.id;
    void qc.invalidateQueries({ queryKey: outputsKeys.jobs(docId) });
    if (current.kind === "final") void qc.invalidateQueries({ queryKey: outputsKeys.versions(docId) });
    if (autoDownload) void download(current).catch(() => undefined);
  }, [current, autoDownload, docId, download, qc]);

  const reset = () => {
    setJobId(null);
    setStartError(null);
  };
  return { start, job: current, busy: start.isPending || (current !== null && !jobFinished(current)), startError, download, reset };
}
