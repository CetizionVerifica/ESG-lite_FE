import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approvePcfStudy,
  createPcfStudy,
  getPcfStudies,
  getPcfStudy,
  getPcfStudyAudit,
  getPcfStudyResult,
  publishPcfStudy,
  rejectPcfStudy,
} from "../../services/pcfService";
import type { ResultDetail, Study } from "./logic";

export type AuditEntry = {
  id: number;
  action: string;
  changed_fields: Record<string, { old: unknown; new: unknown }> | null;
  reason: string | null;
  changed_by: { user_id: number; name: string } | null;
  changed_at: string;
};

export const keys = {
  versions: (productId: number) => ["footprint-result", "versions", productId] as const,
  study: (id: number) => ["footprint-result", "study", id] as const,
  result: (id: number) => ["footprint-result", "result", id] as const,
  audit: (id: number) => ["footprint-result", "audit", id] as const,
};

/** Server message from an axios error, or the fallback. */
export function errorMessage(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof msg === "string" && msg ? msg : fallback;
}

const isStatus = (e: unknown, code: number) => (e as { response?: { status?: number } })?.response?.status === code;
export const isNotFound = (e: unknown) => isStatus(e, 404);

/** Every version of the product's footprint, any status. */
export function useVersions(productId: number) {
  return useQuery({
    queryKey: keys.versions(productId),
    queryFn: async () => {
      const data = await getPcfStudies({ productId });
      return (Array.isArray(data) ? data : []) as Study[];
    },
    enabled: productId > 0,
  });
}

export function useStudy(id: number | null) {
  return useQuery({
    queryKey: keys.study(id ?? 0),
    queryFn: async () => (await getPcfStudy(id!)) as Study,
    enabled: !!id,
  });
}

/** The stored result; only asked for once the study has one. */
export function useResult(id: number | null, calculated: boolean) {
  return useQuery({
    queryKey: keys.result(id ?? 0),
    queryFn: async () => (await getPcfStudyResult(id!)) as ResultDetail,
    enabled: !!id && calculated,
  });
}

export function useAudit(id: number, enabled: boolean) {
  return useQuery({
    queryKey: keys.audit(id),
    queryFn: async () => {
      const data = await getPcfStudyAudit(id);
      return (Array.isArray(data) ? data : []) as AuditEntry[];
    },
    enabled,
  });
}

type Move = { kind: "approve"; comment?: string } | { kind: "reject"; comment: string } | { kind: "publish" };

/** Approve, send back or publish; refreshes the study, its result and the version list. */
export function useMove(study: Pick<Study, "pcf_study_id"> & { product: { product_id: number } | null }) {
  const qc = useQueryClient();
  return useMutation<Study, unknown, Move>({
    mutationFn: async (m) =>
      (m.kind === "approve"
        ? await approvePcfStudy(study.pcf_study_id, m.comment)
        : m.kind === "reject"
          ? await rejectPcfStudy(study.pcf_study_id, m.comment)
          : await publishPcfStudy(study.pcf_study_id)) as Study,
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.study(study.pcf_study_id) }),
        qc.invalidateQueries({ queryKey: keys.result(study.pcf_study_id) }),
        qc.invalidateQueries({ queryKey: keys.audit(study.pcf_study_id) }),
        study.product && qc.invalidateQueries({ queryKey: keys.versions(study.product.product_id) }),
        qc.invalidateQueries({ queryKey: ["product-footprints"] }),
      ]),
  });
}

/** A new draft version copied from this one (E1 `copy_from_id`). */
export function useNewVersion() {
  const qc = useQueryClient();
  return useMutation<Study, unknown, number>({
    mutationFn: async (fromId) => (await createPcfStudy({ copy_from_id: fromId })) as Study,
    onSuccess: (s) => {
      if (s.product) void qc.invalidateQueries({ queryKey: keys.versions(s.product.product_id) });
      void qc.invalidateQueries({ queryKey: ["product-footprints"] });
    },
  });
}
