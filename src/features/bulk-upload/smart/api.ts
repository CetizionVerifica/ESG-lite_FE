import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { type MutableRefObject, useEffect } from "react";
import { fetchSmartPreview, importProposal, proposeMapping } from "../../../services/excelService";
import { type PatchPlanBody, deleteMappingProfile, listMappingProfiles, patchImportPlan, searchImportActivities, skipRowsWithIssue } from "../../../services/importPlansService";
import type { PreviewData } from "../api";
import type { ImportResult, PreviewRow } from "../logic";
import type { MappingProfile, MappingProposal } from "./types";
import { smartErrorMessage } from "./logic";

export const smartKeys = {
  all: ["bulk-upload", "smart"] as const,
  preview: (args: SmartPreviewArgs | null) => [...smartKeys.all, "preview", args] as const,
  activities: (siteId: number, categoryId: number, q: string) => [...smartKeys.all, "activities", siteId, categoryId, q] as const,
  profiles: (siteId: number, fingerprint: string, companyId: number | null) => [...smartKeys.all, "profiles", siteId, fingerprint, companyId] as const,
};

/** `POST /v1/excel/propose`: the mapper's proposal for the uploaded workbook and the chosen site. */
export const usePropose = () =>
  useMutation({ mutationFn: ({ documentId, siteId }: { documentId: number; siteId: number }) => proposeMapping(documentId, siteId) as Promise<MappingProposal> });

export interface SmartPreviewArgs {
  proposal: MappingProposal;
  /** Set once the first preview made the plan: later reads page it instead of planning again. */
  planId: string | null;
  /** Only rows with this issue code. */
  code: string | null;
  page: number;
}

export interface SmartPreviewData extends PreviewData {
  sheetRows: number;
}

/**
 * The plan ESG-lite made for the confirmed proposal, with one page of its rows.
 * The first read plans the workbook (cancelling the plan of an earlier preview
 * held in `lastPlan`); once the plan id is known the args switch to paging it,
 * seeded with the same data so nothing is fetched twice.
 */
export function useSmartPreview(args: SmartPreviewArgs | null, lastPlan: MutableRefObject<string | null>, onPlanned: (planId: string) => void) {
  const qc = useQueryClient();
  const query = useQuery<SmartPreviewData>({
    queryKey: smartKeys.preview(args),
    enabled: args !== null,
    staleTime: Infinity,
    queryFn: async () => {
      const a = args as SmartPreviewArgs;
      const res = await fetchSmartPreview(a.proposal, { page: a.page, pageSize: 100, code: a.code, planId: a.planId, cancelPlanId: a.planId ? null : lastPlan.current });
      lastPlan.current = res.plan?.plan_id ?? null;
      return { plan: res.plan, rows: (res.rows ?? []) as PreviewRow[], total: res.total_rows ?? 0, notSelected: res.not_selected ?? 0, sheetRows: res.sheet_rows ?? 0 };
    },
  });
  const planId = query.data?.plan?.plan_id ?? null;
  useEffect(() => {
    if (!args || args.planId !== null || !planId || !query.data) return;
    qc.setQueryData(smartKeys.preview({ ...args, planId }), query.data);
    onPlanned(planId);
  }, [args, planId, query.data, qc, onPlanned]);
  return query;
}

/** Fixes or skips rows of the plan (`PATCH /imports/plans/:id`), then rereads the preview at the new version. */
export function usePatchPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, body }: { planId: string; body: PatchPlanBody }) => patchImportPlan(planId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...smartKeys.all, "preview"] }),
  });
}

/** "Skip all rows with this issue". */
export function useSkipIssue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ planId, version, code }: { planId: string; version: number; code: string }) => skipRowsWithIssue(planId, version, code),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...smartKeys.all, "preview"] }),
  });
}

/** Factor names the site × category knows, for the activity picker. */
export function useActivityOptions(siteId: number, categoryId: number | null, q: string, enabled: boolean) {
  return useQuery({
    queryKey: smartKeys.activities(siteId, categoryId ?? 0, q),
    enabled: enabled && categoryId !== null,
    staleTime: 5 * 60_000,
    queryFn: () => searchImportActivities(siteId, categoryId as number, q),
  });
}

/**
 * Commits the plan of the confirmed proposal. Callbacks given here still run
 * when the page has been left ("Continue in background"); ones passed to
 * mutate don't.
 */
export function useSmartImport(onDone: (result: ImportResult) => void, onFail: (message: string) => void) {
  return useMutation({
    mutationFn: async ({ proposal, plan }: { proposal: MappingProposal; plan: { plan_id: string; version: number } }): Promise<ImportResult> => importProposal(proposal, plan),
    onSuccess: onDone,
    onError: (e) => onFail(smartErrorMessage(e, "The import didn't finish. Nothing was saved, so you can try again.")),
  });
}

/**
 * The company's remembered mappings for every sheet of the proposal (XI3,
 * one read per distinct fingerprint, cached for the session). A Superadmin
 * names the client. Off until the client switch is known to be on, because
 * ESG-lite refuses the read otherwise.
 */
export function useMappingProfiles(proposal: MappingProposal | null, companyId: number | null, enabled: boolean) {
  const qc = useQueryClient();
  const siteId = proposal?.site_id ?? 0;
  const fingerprints = [...new Set((proposal?.sheets ?? []).map((s) => s.fingerprint))];
  const results = useQueries({
    queries: fingerprints.map((fingerprint) => ({
      queryKey: smartKeys.profiles(siteId, fingerprint, companyId),
      enabled: enabled && proposal !== null,
      staleTime: 5 * 60_000,
      queryFn: () => listMappingProfiles(fingerprint, siteId, companyId) as Promise<MappingProfile[]>,
    })),
  });
  const profiles: MappingProfile[] = results.flatMap((r) => r.data ?? []);
  const forget = useMutation({
    mutationFn: (profile: MappingProfile) => deleteMappingProfile(profile.id),
    onSuccess: (_res, profile) => {
      qc.setQueryData<MappingProfile[]>(smartKeys.profiles(siteId, profile.fingerprint, companyId), (old) => (old ?? []).filter((p) => p.id !== profile.id));
    },
  });
  return { profiles, loading: results.some((r) => r.isLoading), forget };
}
