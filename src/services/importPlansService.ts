import { isAxiosError } from "axios";
import api from "../api/axios";

/**
 * ESG-lite's import plans API (IM2, `/imports/plans`), called with the
 * signed-in user's token, so every call is scoped the way the API scopes it.
 * The smart import flow (XI4) uses it to fix or skip rows of the plan the AI
 * service made; the plan's rows are read back through `/v1/excel/preview`.
 */

/** An ESG-lite refusal: its status and IM0 body (`{ code, message, details }`). */
export class ImportPlanError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string | null = null,
  ) {
    super(message);
    this.name = "ImportPlanError";
  }
}

function asPlanError(e: unknown, fallback: string): ImportPlanError {
  if (isAxiosError(e)) {
    const data = e.response?.data as { code?: unknown; message?: unknown } | undefined;
    return new ImportPlanError(typeof data?.message === "string" ? data.message : fallback, e.response?.status ?? 0, typeof data?.code === "string" ? data.code : null);
  }
  return new ImportPlanError(e instanceof Error ? e.message : fallback, 0);
}

/** One row change (IM0 `RowChange`): a partial `ImportRow` to merge, or skip / unskip. */
export interface RowChange {
  row_ref: string;
  set?: Record<string, unknown>;
  skip?: boolean;
}

export interface PatchPlanBody {
  version: number;
  changes?: RowChange[];
  activity_matches?: { site_id: number; category_id: number; sheet_name: string; factor_name: string; save_mapping?: boolean }[];
}

export interface PlanRowsPage {
  plan_id: string;
  version: number;
  status: string;
  counts: { rows: number; ready: number; issue: number; skipped: number; warnings: number };
  rows: { row_ref: string; state: string }[];
  page?: number;
  page_size?: number;
  total_rows?: number;
}

/** Up to 2,000 changes per call (IM0 `ROWS_PER_REQUEST`). Answers the plan at its new version. */
export async function patchImportPlan(planId: string, body: PatchPlanBody): Promise<PlanRowsPage> {
  try {
    const res = await api.patch(`/imports/plans/${encodeURIComponent(planId)}`, body);
    return res.data;
  } catch (e) {
    throw asPlanError(e, "The row couldn't be changed.");
  }
}

export async function getImportPlanPage(planId: string, query: { code?: string; state?: string; page?: number; page_size?: number }): Promise<PlanRowsPage> {
  try {
    const res = await api.get(`/imports/plans/${encodeURIComponent(planId)}`, { params: query });
    return res.data;
  } catch (e) {
    throw asPlanError(e, "The plan couldn't be read.");
  }
}

const PAGE = 200;
const CHANGES_PER_CALL = 2000;

/**
 * Skips every row of the plan that carries `code` ("Skip all rows with this
 * issue"). Reads the row refs page by page, then patches them in batches,
 * carrying the version forward. Answers the plan after the last patch.
 */
export async function skipRowsWithIssue(planId: string, version: number, code: string): Promise<PlanRowsPage | null> {
  const refs: string[] = [];
  for (let page = 1; ; page++) {
    const res = await getImportPlanPage(planId, { code, page, page_size: PAGE });
    for (const r of res.rows) if (r.state !== "skipped") refs.push(r.row_ref);
    const total = res.total_rows ?? res.rows.length;
    if (res.rows.length < PAGE || page * PAGE >= total) break;
  }
  let plan: PlanRowsPage | null = null;
  let v = version;
  for (let i = 0; i < refs.length; i += CHANGES_PER_CALL) {
    plan = await patchImportPlan(planId, { version: v, changes: refs.slice(i, i + CHANGES_PER_CALL).map((row_ref) => ({ row_ref, skip: true })) });
    v = plan.version;
  }
  return plan;
}

export interface ActivityOption {
  name: string;
  kind: "factor" | "mapping";
  maps_to?: string;
  /** The factor's own units. */
  units: string[];
  /** #183: every unit a row may use for this activity; absent from an older API. */
  accepted_units?: string[];
  latest_year: number | null;
}

/** Factor names (and P23 mappings) a site × category knows, filtered by `q` (IM3 `/imports/context/activities`). */
export async function searchImportActivities(siteId: number, categoryId: number, q: string, companyId?: number | null): Promise<ActivityOption[]> {
  try {
    const res = await api.get("/imports/context/activities", {
      params: { site_id: siteId, category_id: categoryId, ...(q && { q }), limit: 50, ...(companyId && { company_id: companyId }) },
    });
    const data = res.data;
    return Array.isArray(data) ? data : (data?.activities ?? data?.options ?? []);
  } catch (e) {
    throw asPlanError(e, "Couldn't load the factor names.");
  }
}

/** A remembered sheet mapping as XI0 shapes it (`MappingProfile`); the feature types `sheet_proposal`. See src/features/bulk-upload/smart/types.ts. */
export type MappingProfileRow = {
  id: string;
  company_id: number;
  site_id: number;
  category_id: number | null;
  fingerprint: string;
  sheet_proposal: unknown;
  confirmed_by: number | null;
  confirmed_at: string | null;
  uses: number;
  created_at: string;
  updated_at: string;
};

/**
 * The company's remembered mappings for a sheet's header fingerprint and the
 * upload's site (XI3 `GET /imports/mapping-profiles`), newest confirmation
 * first. A Superadmin names the client with `companyId`.
 */
export async function listMappingProfiles(fingerprint: string, siteId: number, companyId?: number | null): Promise<MappingProfileRow[]> {
  try {
    const res = await api.get("/imports/mapping-profiles", { params: { fingerprint, site_id: siteId, ...(companyId && { company_id: companyId }) } });
    return Array.isArray(res.data) ? res.data : (res.data?.profiles ?? []);
  } catch (e) {
    throw asPlanError(e, "Couldn't load the remembered mappings.");
  }
}

/** "Forget this mapping" (XI3 `DELETE /imports/mapping-profiles/:id`). */
export async function deleteMappingProfile(id: string): Promise<{ id: string; deleted: true }> {
  try {
    // data-loss-reviewed: deletes one remembered mapping (import_mapping_profile row), never emission data; the user confirms "Forget it" on the sheet card first, and rows already imported don't change.
    const res = await api.delete(`/imports/mapping-profiles/${encodeURIComponent(id)}`);
    return res.data;
  } catch (e) {
    throw asPlanError(e, "The mapping couldn't be forgotten.");
  }
}
