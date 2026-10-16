// S3-15 part 2 (ESG-lite docs/scope3/01-contracts.md §5): submit drafts,
// "Nothing this month", the live checks dry run and the month lock.
import api from "../api/axios";
import type {
  LockPeriodBody,
  NothingThisMonthBody,
  PeriodLock,
  RowChecks,
  SubmitEmissionsResult,
  UnlockPeriodBody,
} from "../lib/scope3/contracts";
import { readChecks } from "../lib/scope3/checks";
import { readPeriodLockStatus } from "../lib/scope3/lock";

/** `POST /user/emissions/submit {ids}`: own drafts → pending. Ids that weren't drafts or sit in a locked month come back refused. */
export const submitEmissions = async (ids: number[]): Promise<SubmitEmissionsResult> => {
  const { data } = await api.post("/user/emissions/submit", { ids });
  const submitted = Array.isArray(data?.submitted) ? data.submitted.map(Number) : [];
  const refused = Array.isArray(data?.refused) ? data.refused.map((r: { id: unknown; code: unknown }) => ({ id: Number(r.id), code: String(r.code ?? "") })) : [];
  return { submitted, refused };
};

/** `POST /user/my-month/nothing`: mark a category as having nothing to report this month. */
export const markNothingThisMonth = async (body: NothingThisMonthBody): Promise<void> => {
  await api.post("/user/my-month/nothing", body);
};

/** `DELETE /user/my-month/nothing` (same body): take the mark off again. */
export const unmarkNothingThisMonth = async (body: NothingThisMonthBody): Promise<void> => {
  await api.delete("/user/my-month/nothing", { data: body });
};

/** The row as Add data would save it; `pk_id` when it changes a saved entry. */
export type CheckDryRunBody = {
  pk_id?: number | null;
  site_id: number;
  category_id: number;
  activity_data: Record<string, unknown>;
  activity_data_unit?: string;
  date_of_reporting: string;
  reporting_period?: string;
  year_type?: string | null;
  method?: string;
  /** Files picked on the row but not uploaded yet: EVIDENCE_ATTACHED passes on them. */
  evidence_count?: number;
};

/** `POST /user/emissions/check`: the review checks for an unsaved row. Saves nothing. */
export const checkEmission = async (body: CheckDryRunBody): Promise<RowChecks | null> => {
  const { data } = await api.post("/user/emissions/check", body);
  return readChecks(data?.checks ?? data) ?? null;
};

/** `GET /periods/lock?year&month`: completeness of the month over the caller's sites. */
export const getPeriodLock = async (year: number, month: number, siteIds?: number[]) => {
  const params: Record<string, string | number> = { year, month };
  if (siteIds?.length) params.siteIds = siteIds.join(",");
  const { data } = await api.get("/periods/lock", { params });
  return readPeriodLockStatus(data, { year, month });
};

/** `POST /periods/lock {site_id | null, year, month}`; null = every site (Admin and Superadmin). */
export const lockPeriod = async (body: LockPeriodBody): Promise<PeriodLock> => {
  const { data } = await api.post("/periods/lock", body);
  return data;
};

/** `POST /periods/unlock {site_id, year, month, reason}`. */
export const unlockPeriod = async (body: UnlockPeriodBody): Promise<PeriodLock> => {
  const { data } = await api.post("/periods/unlock", body);
  return data;
};

/** The `code` an S3-15 refusal carries (`PERIOD_LOCKED`, `PERIOD_INCOMPLETE`, `UNLOCK_REASON_REQUIRED`, …). */
export function errorCode(e: unknown): string | null {
  const code = (e as { response?: { data?: { code?: unknown } } })?.response?.data?.code;
  return typeof code === "string" ? code : null;
}

/** The server's message, or `fallback`. */
export function errorText(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof msg === "string" && msg ? msg : fallback;
}
