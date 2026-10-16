// S3-15 part 2 (ESG-lite docs/scope3/01-contracts.md §5): submit drafts,
// "Nothing this month", the live checks dry run and the month lock.
import api from "../api/axios";
import type {
  LockPeriodBody,
  NothingThisMonthBody,
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

/**
 * `POST /user/emissions/check {ids}`: the review checks on saved rows, as if
 * they were submitted now. Saves nothing. ESG-lite checks the saved row, not
 * unsaved edits, so the Fix screen refreshes it after each save.
 */
export const checkEmissions = async (ids: number[]): Promise<Map<number, RowChecks | null>> => {
  const { data } = await api.post("/user/emissions/check", { ids });
  const out = new Map<number, RowChecks | null>();
  for (const r of Array.isArray(data?.results) ? data.results : []) out.set(Number(r?.id), readChecks(r?.checks) ?? null);
  return out;
};

/**
 * `GET /periods/lock?year&month[&site_id]`: completeness of the month over the
 * caller's sites. ESG-lite filters by one site only; with several site chips
 * the view narrows the answer itself.
 */
export const getPeriodLock = async (year: number, month: number, siteIds?: number[]) => {
  const params: Record<string, string | number> = { year, month };
  if (siteIds?.length === 1) params.site_id = siteIds[0];
  const { data } = await api.get("/periods/lock", { params });
  return readPeriodLockStatus(data, { year, month });
};

/** `POST /periods/lock {site_id | null, year, month}`; null = every site (Admin and Superadmin). Answers the month's new status; the view refetches it. */
export const lockPeriod = async (body: LockPeriodBody): Promise<void> => {
  await api.post("/periods/lock", body);
};

/** `POST /periods/unlock {site_id, year, month, reason}`. */
export const unlockPeriod = async (body: UnlockPeriodBody): Promise<void> => {
  await api.post("/periods/unlock", body);
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
