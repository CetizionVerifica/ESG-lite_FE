// DS-2 · TanStack Query hooks for data sources: the Data drawer list, resolve,
// report inputs (per doc, or prefill before a doc exists), materiality.
// A Superadmin works on the chosen client (company_id); everyone else on
// their own company.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../../context/AuthContext";
import { useClientContext } from "../../../../lib/clientContext";
import type { InputsPatch, ReportInputs, ResolveRequest } from "../../../../lib/studio/contracts";
import {
  getDataCatalog,
  getDocInputs,
  getInputsPrefill,
  getMateriality,
  patchDocInputs,
  putMateriality,
  resolveStudioData,
  type StudioScope,
} from "../../../../services/studioService";

/** The company a studio call is about: the chosen client for a Superadmin, else the session's (null). */
export function useStudioCompanyId(): number | null {
  const { role } = useAuth();
  const { clientId } = useClientContext();
  return role === "Superadmin" ? clientId : null;
}

export const sourceKeys = {
  data: (companyId: number | null, scope: StudioScope, filters: object) => ["studio", "data", companyId, scope, filters] as const,
  resolve: (companyId: number | null, body: unknown) => ["studio", "resolve", companyId, body] as const,
  inputs: (companyId: number | null, docId: number) => ["studio", "docs", docId, "inputs", companyId] as const,
  prefill: (companyId: number | null, scope: StudioScope) => ["studio", "inputs", "prefill", companyId, scope] as const,
  materiality: (companyId: number | null) => ["studio", "materiality", companyId] as const,
};

/** GET /studio/data: the Data drawer list for the doc's kind, year and sites. */
export function useDataCatalog(scope: StudioScope, filters: { q?: string; topic?: string; framework?: string } = {}) {
  const companyId = useStudioCompanyId();
  return useQuery({
    queryKey: sourceKeys.data(companyId, scope, filters),
    queryFn: () => getDataCatalog(scope, filters, companyId),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

/** POST /studio/resolve for a set of bindings and tokens (the page's numbers). */
export function useResolve(body: (ResolveRequest & { docId?: number; inputs?: ReportInputs }) | null) {
  const companyId = useStudioCompanyId();
  return useQuery({
    queryKey: sourceKeys.resolve(companyId, body),
    queryFn: () => resolveStudioData(body as ResolveRequest, companyId),
    enabled: !!body,
    staleTime: 60_000,
  });
}

/** GET /studio/docs/:id/inputs. */
export function useDocInputs(docId: number | null) {
  const companyId = useStudioCompanyId();
  return useQuery({
    queryKey: sourceKeys.inputs(companyId, docId ?? 0),
    queryFn: () => getDocInputs(docId as number, companyId),
    enabled: docId !== null,
  });
}

/** PATCH /studio/docs/:id/inputs with the rev it read; resolve and the Data list refresh after. */
export function useSaveDocInputs(docId: number) {
  const qc = useQueryClient();
  const companyId = useStudioCompanyId();
  return useMutation({
    mutationFn: ({ rev, inputs }: { rev: number; inputs: InputsPatch }) => patchDocInputs(docId, rev, inputs, companyId),
    onSuccess: (data) => {
      qc.setQueryData(sourceKeys.inputs(companyId, docId), data);
      void qc.invalidateQueries({ queryKey: ["studio", "resolve"] });
      void qc.invalidateQueries({ queryKey: ["studio", "data"] });
    },
  });
}

/** GET /studio/inputs/prefill: report details before a doc exists (new-design flow). */
export function useInputsPrefill(scope: StudioScope | null) {
  const companyId = useStudioCompanyId();
  return useQuery({
    queryKey: sourceKeys.prefill(companyId, scope as StudioScope),
    queryFn: () => getInputsPrefill(scope as StudioScope, companyId),
    enabled: !!scope,
    staleTime: 60_000,
  });
}

/** GET/PUT /studio/materiality. */
export function useMateriality(enabled = true) {
  const companyId = useStudioCompanyId();
  return useQuery({ queryKey: sourceKeys.materiality(companyId), queryFn: () => getMateriality(companyId), enabled });
}
export function useSaveMateriality() {
  const qc = useQueryClient();
  const companyId = useStudioCompanyId();
  return useMutation({
    mutationFn: (scores: Parameters<typeof putMateriality>[0]) => putMateriality(scores, companyId),
    onSuccess: (data) => qc.setQueryData(sourceKeys.materiality(companyId), data),
  });
}

/** The server's words for a studio error, or a plain fallback; never a raw code. */
export function studioErrorMessage(e: unknown, fallback: string): string {
  const data = (e as { response?: { data?: { code?: unknown; message?: unknown } } })?.response?.data;
  return typeof data?.message === "string" && data.message ? data.message : fallback;
}

/** The DS_VALIDATION issues of a failed PATCH, by input key (`inputs.revenue` → revenue). */
export function inputIssues(e: unknown): Record<string, string> {
  const data = (e as { response?: { data?: { code?: unknown; details?: { issues?: { path: string; message: string }[] } } } })?.response?.data;
  if (data?.code !== "DS_VALIDATION") return {};
  const out: Record<string, string> = {};
  for (const i of data.details?.issues ?? []) {
    const key = i.path.split(".")[1];
    if (key && !out[key]) out[key] = i.message;
  }
  return out;
}

/** True for 409 DS_VERSION_CONFLICT. */
export const isRevConflict = (e: unknown) => (e as { response?: { data?: { code?: unknown } } })?.response?.data?.code === "DS_VERSION_CONFLICT";
