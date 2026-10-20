// PRO-0 · PE-1 background remover (server job, decision E1):
//   POST /studio/assets/:id/remove-background   → 202 ImageJob (503 DS_BG_UNAVAILABLE without a model)
//   GET  /studio/image-jobs/:id                  → ImageJob; done → resultAssetId (a NEW asset, original kept)
// Adjustments, filters, duotone and transparency are element props (no endpoint).
import { useMutation, useQuery } from "@tanstack/react-query";
import api from "../../../api/axios";
import type { DsErrorCode, ImageJob } from "../../../lib/studio/contracts";
import { useStudioCompanyId } from "../../../lib/studio/switch";

const params = (companyId: number | null) => (companyId ? { company_id: companyId } : {});

export async function removeBackground(assetId: string, companyId: number | null): Promise<ImageJob> {
  const { data } = await api.post<ImageJob>(`/studio/assets/${encodeURIComponent(assetId)}/remove-background`, companyId ? { company_id: companyId } : {}, { params: params(companyId) });
  return data;
}
export async function getImageJob(jobId: number, companyId: number | null): Promise<ImageJob> {
  const { data } = await api.get<ImageJob>(`/studio/image-jobs/${jobId}`, { params: params(companyId) });
  return data;
}

export const imageJobKeys = { job: (companyId: number | null, jobId: number) => ["studio", "image-jobs", jobId, companyId] as const };

export function useRemoveBackground() {
  const companyId = useStudioCompanyId();
  return useMutation({ mutationFn: (assetId: string) => removeBackground(assetId, companyId) });
}

/** Polls a job every second until it is done or failed. */
export function useImageJob(jobId: number | null) {
  const companyId = useStudioCompanyId();
  return useQuery({
    queryKey: imageJobKeys.job(companyId, jobId ?? 0),
    queryFn: () => getImageJob(jobId as number, companyId),
    enabled: jobId !== null,
    refetchInterval: (q) => (q.state.data && (q.state.data.status === "done" || q.state.data.status === "failed") ? false : 1000),
  });
}

const MESSAGES: Partial<Record<DsErrorCode, string>> = {
  DS_BG_UNAVAILABLE: "Background remover isn't set up on this server yet",
  DS_ASSET_TYPE: "The background can be removed from JPG, PNG and WebP images only.",
  DS_JOB_FAILED: "The background couldn't be removed from this image.",
  DS_NOT_BUILT: "Background remover isn't available yet.",
};
export function photoErrorMessage(e: unknown, fallback = "Something went wrong. Try again."): string {
  const code = (e as { response?: { data?: { code?: DsErrorCode } } })?.response?.data?.code;
  return (code && MESSAGES[code]) || fallback;
}
