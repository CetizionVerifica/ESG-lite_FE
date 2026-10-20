// Design Studio API (DS-0): `/studio/*` on ESG-lite (docs/design-studio/01-contracts.md §4).
// DS-0 adds the status call; each module adds its own calls here or in
// src/features/studio/api.ts (TanStack Query hooks).
import api from "../api/axios";
import type { StudioStatus } from "../lib/studio/contracts";
import type { DataCatalogResponse, DocInputsResponse, InputsPatch, InputsPrefillResponse, MaterialityResponse, ReportInputs, ReportKind, ResolveRequest, ResolveResponse, Sites, YearType } from "../lib/studio/contracts"; // DS-2

const companyParams = (companyId: number | null | undefined) => (companyId ? { company_id: companyId } : undefined);

/** GET /studio/status: answers while the switch is off. A body that isn't an object reads as `{}`. */
export async function getStudioStatus(companyId?: number | null): Promise<Partial<StudioStatus>> {
  const { data } = await api.get("/studio/status", { params: companyParams(companyId) });
  return data && typeof data === "object" ? (data as Partial<StudioStatus>) : {};
}

// ---------------------------------------------------------------------------
// DS-2 · data sources: resolve, report inputs, the Data drawer list, materiality
// ---------------------------------------------------------------------------

/** POST /studio/resolve: every binding and token resolved, with the data hash. */
export async function resolveStudioData(body: ResolveRequest & { docId?: number; inputs?: ReportInputs }, companyId?: number | null): Promise<ResolveResponse> {
  const { data } = await api.post("/studio/resolve", companyId ? { ...body, company_id: companyId } : body);
  return data as ResolveResponse;
}

/** GET /studio/docs/:id/inputs: stored inputs, the doc's rev and what the data prefills. */
export async function getDocInputs(docId: number, companyId?: number | null): Promise<DocInputsResponse> {
  const { data } = await api.get(`/studio/docs/${docId}/inputs`, { params: companyParams(companyId) });
  return data as DocInputsResponse;
}

/** PATCH /studio/docs/:id/inputs: 409 DS_VERSION_CONFLICT when `rev` is stale. */
export async function patchDocInputs(docId: number, rev: number, inputs: InputsPatch, companyId?: number | null): Promise<DocInputsResponse> {
  const { data } = await api.patch(`/studio/docs/${docId}/inputs`, { rev, inputs, ...(companyId ? { company_id: companyId } : {}) });
  return data as DocInputsResponse;
}

export interface StudioScope {
  kind: ReportKind;
  year: number;
  yearType: YearType;
  sites: Sites;
}
const scopeParams = (s: StudioScope, companyId?: number | null) => ({
  kind: s.kind,
  year: s.year,
  yearType: s.yearType,
  sites: s.sites === "all" ? "all" : s.sites.join(","),
  ...(companyId ? { company_id: companyId } : {}),
});

/** GET /studio/inputs/prefill: the inputs the company's data already gives, before a doc exists. */
export async function getInputsPrefill(scope: StudioScope, companyId?: number | null): Promise<InputsPrefillResponse> {
  const { data } = await api.get("/studio/inputs/prefill", { params: scopeParams(scope, companyId) });
  return data as InputsPrefillResponse;
}

/** GET /studio/data: what a design can link to, with values and approval dates. */
export async function getDataCatalog(scope: StudioScope, filters: { q?: string; topic?: string; framework?: string } = {}, companyId?: number | null): Promise<DataCatalogResponse> {
  const extra = Object.fromEntries(Object.entries(filters).filter(([, v]) => !!v));
  const { data } = await api.get("/studio/data", { params: { ...scopeParams(scope, companyId), ...extra } });
  return data as DataCatalogResponse;
}

/** GET/PUT /studio/materiality: matrix scores per ESRS topic (sustainability kind). */
export async function getMateriality(companyId?: number | null): Promise<MaterialityResponse> {
  const { data } = await api.get("/studio/materiality", { params: companyParams(companyId) });
  return data as MaterialityResponse;
}
export async function putMateriality(scores: { esrs_topic: string; impact_score: number | null; financial_score: number | null }[], companyId?: number | null): Promise<MaterialityResponse> {
  const { data } = await api.put("/studio/materiality", { scores, ...(companyId ? { company_id: companyId } : {}) });
  return data as MaterialityResponse;
}
