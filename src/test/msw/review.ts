/**
 * MSW handlers for S3-15 part 2 (ESG-lite docs/scope3/01-contracts.md §4, §5,
 * §7): drafts and submit, "Nothing this month", the live checks dry run, and
 * the month lock. Stateful like the backend, so a test can submit, mark, lock
 * and reopen and read the result back. Spread into `scope3Handlers`.
 */
import { http, HttpResponse } from "msw";
import {
  type BoundaryStatus,
  CHECK_ROWS_MAX,
  type CheckRowBody,
  type GhgCategoryNumber,
  GHG_CATEGORY_NUMBERS,
  type LockPeriodBody,
  type NothingThisMonthBody,
  type PeriodLock,
  type RowChecks,
  type Scope3ErrorCode,
  type SubmitEmissionsBody,
  type SubmitEmissionsResult,
  type UnlockPeriodBody,
  UNLOCK_REASON_MIN,
} from "../../lib/scope3/contracts";
import type { EmissionStatus } from "../../services/emissionService";

const COMPANY_ID = 1;

const error = (code: Scope3ErrorCode, status: number, message: string) => HttpResponse.json({ code, message }, { status });
const invalid = (path: string, message: string) => HttpResponse.json({ code: "FIELD_INVALID", field: path, message }, { status: 400 });

type Site = { site_id: number; name: string };
type Category = { category_id: number; category_name: string; scope: string; ghg_category: number | null };

export const REVIEW_SITES: Site[] = [
  { site_id: 1, name: "Hidd plant" },
  { site_id: 2, name: "Sitra yard" },
];

/** What each site owes every month (contributorSiteCategories). */
const OWED: Record<number, Category[]> = {
  1: [
    { category_id: 1, category_name: "Diesel", scope: "Scope 1", ghg_category: null },
    { category_id: 2, category_name: "LPG", scope: "Scope 1", ghg_category: null },
    { category_id: 3, category_name: "Grid electricity", scope: "Scope 2", ghg_category: null },
    { category_id: 11, category_name: "Purchased aluminium", scope: "Scope 3", ghg_category: 1 },
  ],
  2: [{ category_id: 1, category_name: "Diesel", scope: "Scope 1", ghg_category: null }],
};

/** S3-1 boundary per Scope 3 category for the sample company; unlisted = not relevant. */
const BOUNDARY: Partial<Record<GhgCategoryNumber, BoundaryStatus>> = { 1: "included", 4: "excluded", 6: "screening", 7: "included" };

export type ReviewRow = {
  pk_id: number;
  site: Site;
  category: { category_id: number; category_name: string };
  status: EmissionStatus;
  /** YYYY-MM-DD */
  date_of_reporting: string;
  total_emission: number;
  activity_data: Record<string, unknown>;
  created_by: number;
  documents: number;
};

/** The signed-in contributor in these mocks. */
export const ME = 7;

const row = (pk_id: number, siteId: number, categoryId: number, status: EmissionStatus, tco2e: number, extra: Partial<ReviewRow> = {}): ReviewRow => {
  const site = REVIEW_SITES.find((s) => s.site_id === siteId) as Site;
  const c = OWED[siteId].find((x) => x.category_id === categoryId) as Category;
  return {
    pk_id,
    site,
    category: { category_id: c.category_id, category_name: c.category_name },
    status,
    date_of_reporting: "2026-09-30",
    total_emission: tco2e,
    activity_data: { emission_category: c.category_name, quantity: "100" },
    created_by: ME,
    documents: 0,
    ...extra,
  };
};

/** September 2026: three drafts on Hidd plant, one pending and one approved row; Sitra yard is complete. */
const initialRows = (): ReviewRow[] => [
  row(701, 1, 1, "draft", 4.29, { activity_data: { emission_category: "Diesel (avg biofuel blend)", quantity: "1600" } }),
  row(702, 1, 3, "draft", 312.4),
  row(703, 1, 11, "draft", 5.04, { activity_data: { emission_category: "Aluminium ingot", quantity: "1200" } }),
  row(704, 1, 3, "pending", 1.2),
  row(705, 1, 2, "rejected", 0.8, { documents: 1 }),
  row(706, 2, 1, "approved", 2.1, { documents: 1 }),
  // Another contributor's draft: never theirs to submit.
  row(707, 1, 1, "draft", 1.1, { created_by: 99 }),
];

/** August 2026 is locked on Hidd plant. */
const initialLocks = (): PeriodLock[] => [{ company_id: COMPANY_ID, site_id: 1, year: 2026, month: 8, locked_by: 4, locked_at: "2026-09-10T08:00:00.000Z" }];

let rows = initialRows();
let locks = initialLocks();
let nothing: NothingThisMonthBody[] = [];
/** Scope 3 grid cells with data this month (the sample has Category 7 data in from a survey). */
let scope3Data = new Set<number>([7]);

/** Restore the sample data (called by `resetScope3Mocks`). */
export function resetReviewMocks(): void {
  rows = initialRows();
  locks = initialLocks();
  nothing = [];
  scope3Data = new Set([7]);
}

/** Test hook: approve every open row of a month and fill the Scope 3 grid, so the month can lock. */
export function completeMonth(year: number, month: number): void {
  const key = `${year}-${String(month).padStart(2, "0")}`;
  for (const r of rows) if (r.date_of_reporting.startsWith(key)) r.status = "approved";
  for (const n of GHG_CATEGORY_NUMBERS) if (BOUNDARY[n] === "included") scope3Data.add(n);
  for (const site of REVIEW_SITES)
    for (const c of OWED[site.site_id])
      if (!rows.some((r) => r.site.site_id === site.site_id && r.category.category_id === c.category_id && r.date_of_reporting.startsWith(key)))
        nothing.push({ site_id: site.site_id, category_id: c.category_id, month: `${key}-01` });
}

/** Test hook: a draft of the caller's in `date`'s month (e.g. one saved before the month was locked). */
export function addDraft(pk_id: number, siteId: number, categoryId: number, date: string): void {
  rows.push(row(pk_id, siteId, categoryId, "draft", 1, { date_of_reporting: date }));
}

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;
const activeLock = (siteId: number, year: number, month: number): PeriodLock | null =>
  locks.find((l) => !l.reopened_at && l.year === year && (l.month === null || l.month === month) && (l.site_id === null || l.site_id === siteId)) ?? null;
const lockedRow = (r: ReviewRow) => !!activeLock(r.site.site_id, Number(r.date_of_reporting.slice(0, 4)), Number(r.date_of_reporting.slice(5, 7)));

type State = "missing" | "draft" | "pending" | "rejected" | "approved" | "nothing";

/** `GET /periods/lock` as ESG-lite answers it (01-contracts §5 "as built"): one grid per site, `nothing`, `state`, the site's own lock. */
function status(year: number, month: number, siteIds: number[]) {
  const key = monthKey(year, month);
  const left: { site_id: number; site_name: string; category_id: number; category_name: string; reason: State }[] = [];
  const sites = REVIEW_SITES.filter((s) => !siteIds.length || siteIds.includes(s.site_id)).map((s) => {
    const lock = activeLock(s.site_id, year, month);
    const categories = OWED[s.site_id].map((c) => {
      const mine = rows.filter((r) => r.site.site_id === s.site_id && r.category.category_id === c.category_id && r.date_of_reporting.startsWith(key));
      const count = (st: EmissionStatus) => mine.filter((r) => r.status === st).length;
      const counts = { draft: count("draft"), pending: count("pending"), approved: count("approved"), rejected: count("rejected") };
      const nothingMark = nothing.some((n) => n.site_id === s.site_id && n.category_id === c.category_id && n.month === `${key}-01`);
      const state: State = counts.rejected ? "rejected" : counts.draft ? "draft" : counts.pending ? "pending" : counts.approved ? "approved" : nothingMark ? "nothing" : "missing";
      if (!lock && ["missing", "draft", "pending", "rejected"].includes(state)) left.push({ site_id: s.site_id, site_name: s.name, category_id: c.category_id, category_name: c.category_name, reason: state });
      return { category_id: c.category_id, category_name: c.category_name, scope: c.scope, ghg_category: c.ghg_category, state, counts, nothing: nothingMark };
    });
    return {
      site_id: s.site_id,
      name: s.name,
      locked: !!lock,
      lock: lock ? { site_id: lock.site_id, locked_at: lock.locked_at, locked_by: lock.locked_by, locked_by_name: "Mia Manager" } : null,
      reopened: null,
      left: left.filter((l) => l.site_id === s.site_id).length,
      categories,
      scope3: GHG_CATEGORY_NUMBERS.map((n) => ({ n, status: BOUNDARY[n] ?? "screening", data: s.site_id === 1 && scope3Data.has(n) })),
    };
  });
  return {
    company_id: COMPANY_ID,
    year,
    month,
    period: key,
    review_workflow_v2: true,
    can_lock: left.length === 0 && sites.some((s) => !s.locked),
    locked: sites.length > 0 && sites.every((s) => s.locked),
    left,
    sites,
  };
}

const sameMark = (a: NothingThisMonthBody, b: Partial<NothingThisMonthBody>) => a.site_id === b.site_id && a.category_id === b.category_id && a.month === b.month;

export const reviewHandlers = [
  // Drafts are the contributor's own; the list endpoint never shows another person's.
  http.get("*/user/emissions", ({ request }) => {
    const q = new URL(request.url).searchParams;
    if (q.get("status") !== "draft") return undefined; // the S3-3 list mock answers everything else
    const year = Number(q.get("year"));
    const month = Number(q.get("month"));
    const siteIds = (q.get("siteIds") ?? "").split(",").filter(Boolean).map(Number);
    const data = rows.filter(
      (r) =>
        r.status === "draft" &&
        r.created_by === ME &&
        (!siteIds.length || siteIds.includes(r.site.site_id)) &&
        (!year || r.date_of_reporting.startsWith(monthKey(year, month || 1).slice(0, month ? 7 : 4))),
    );
    return HttpResponse.json({ data, total: data.length, summary: { total_emission: 0, pending_count: 0, approved_count: 0, rejected_count: 0 } });
  }),

  http.post<never, Partial<SubmitEmissionsBody>>("*/user/emissions/submit", async ({ request }) => {
    const ids = (await request.json()).ids ?? [];
    if (!Array.isArray(ids) || ids.length === 0) return invalid("ids", "Choose at least one entry.");
    const result: SubmitEmissionsResult = { submitted: [], refused: [] };
    for (const id of ids) {
      const r = rows.find((x) => x.pk_id === id && x.created_by === ME);
      if (!r || r.status !== "draft") result.refused.push({ id, code: "NOT_DRAFT" });
      else if (lockedRow(r)) result.refused.push({ id, code: "PERIOD_LOCKED" });
      else {
        r.status = "pending";
        result.submitted.push(id);
      }
    }
    return HttpResponse.json(result);
  }),

  // `{rows}`: unsaved rows as they'd be saved now (live checks); `{ids}`: saved rows as if submitted now. Saves nothing.
  http.post<never, { ids?: number[]; rows?: Partial<CheckRowBody>[] }>("*/user/emissions/check", async ({ request }) => {
    const body = await request.json();
    if (Array.isArray(body.rows)) {
      if (body.rows.length === 0 || body.rows.length > CHECK_ROWS_MAX) return invalid("rows", "Give 1 to 50 rows.");
      const results = body.rows.map((r) => {
        const ref = String(r.ref ?? "");
        const values = Object.entries(r.activity_data ?? {}).filter(([k]) => k !== "emission_category");
        if (values.length === 0 || values.some(([, v]) => v === "" || v == null))
          return { ref, checks: { ready: false, held: [] }, issue: { code: "FIELD_REQUIRED", message: "Enter every value.", field: "values" } };
        const saved = r.id ? rows.find((x) => x.pk_id === r.id) : undefined;
        const month = String(r.date_of_reporting ?? "").slice(0, 7);
        // Same site, category, month and values as another saved row (an edit isn't compared with itself).
        const duplicate = rows.some(
          (x) => x.pk_id !== r.id && x.site.site_id === r.site_id && x.category.category_id === r.category_id && x.date_of_reporting.startsWith(month) && JSON.stringify(x.activity_data) === JSON.stringify(r.activity_data),
        );
        const held: RowChecks["held"] = [];
        // As ESG-lite: has_evidence decides; left out on an edit, the saved row's evidence counts.
        if (!(r.has_evidence ?? (saved ? saved.documents > 0 : false))) held.push("EVIDENCE_ATTACHED");
        if (duplicate) held.push("NO_DUPLICATE");
        return { ref, checks: { ready: held.length === 0, held } satisfies RowChecks };
      });
      return HttpResponse.json({ results });
    }
    const ids = body.ids ?? [];
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 200) return invalid("ids", "Give 1 to 200 entry ids.");
    const results = ids.map((id) => {
      const saved = rows.find((r) => r.pk_id === id);
      const held: RowChecks["held"] = (saved?.documents ?? 0) > 0 ? [] : ["EVIDENCE_ATTACHED"];
      return { id, status: saved?.status ?? "pending", checks: { ready: held.length === 0, held } satisfies RowChecks };
    });
    return HttpResponse.json({ results });
  }),

  http.post<never, Partial<NothingThisMonthBody>>("*/user/my-month/nothing", async ({ request }) => {
    const body = await request.json();
    if (!body.site_id || !body.category_id || !/^\d{4}-\d{2}-01$/.test(body.month ?? "")) return invalid("month", "Give the site, category and month (first day).");
    const [y, m] = (body.month as string).split("-").map(Number);
    if (activeLock(body.site_id, y, m)) return error("PERIOD_LOCKED", 409, "This month is closed. Ask your manager to reopen it.");
    const mark = { site_id: body.site_id, category_id: body.category_id, month: body.month as string };
    if (!nothing.some((n) => sameMark(n, mark))) nothing.push(mark);
    return HttpResponse.json({ ...mark, nothing: true });
  }),
  // data-loss-reviewed: a test mock; it removes a "Nothing this month" mark from in-memory sample data, never a real record.
  http.delete("*/user/my-month/nothing", async ({ request }) => {
    const body = (await request.json()) as Partial<NothingThisMonthBody>;
    nothing = nothing.filter((n) => !sameMark(n, body));
    return HttpResponse.json({ site_id: body.site_id, category_id: body.category_id, month: body.month, nothing: false });
  }),

  http.get("*/periods/lock", ({ request }) => {
    const q = new URL(request.url).searchParams;
    const year = Number(q.get("year"));
    const month = Number(q.get("month"));
    if (!year || !month || month < 1 || month > 12) return invalid("month", "Give the year and month.");
    const site = Number(q.get("site_id"));
    return HttpResponse.json(status(year, month, site ? [site] : []));
  }),
  // One period_lock row per site; site_id null locks every site.
  http.post<never, Partial<LockPeriodBody>>("*/periods/lock", async ({ request }) => {
    const body = await request.json();
    if (!body.year) return invalid("year", "Give the year to lock.");
    if (!body.month) return invalid("month", "Give the month to lock.");
    const { year, month } = body as { year: number; month: number };
    const siteIds = body.site_id == null ? [] : [body.site_id];
    const now = status(year, month, siteIds);
    if (now.left.length > 0) return HttpResponse.json({ code: "PERIOD_INCOMPLETE", message: `${now.left.length} items are left before this month can be locked.`, details: { left: now.left } }, { status: 422 });
    for (const s of now.sites) if (!s.locked) locks.push({ company_id: COMPANY_ID, site_id: s.site_id, year, month, locked_by: 4, locked_at: new Date().toISOString() });
    return HttpResponse.json(status(year, month, siteIds));
  }),
  http.post<never, Partial<UnlockPeriodBody>>("*/periods/unlock", async ({ request }) => {
    const body = await request.json();
    if ((body.reason ?? "").trim().length < UNLOCK_REASON_MIN)
      return HttpResponse.json({ code: "UNLOCK_REASON_REQUIRED", message: "Give a reason of at least 5 characters for reopening this month.", details: { min_length: UNLOCK_REASON_MIN } }, { status: 400 });
    const year = body.year as number;
    const month = body.month as number;
    const siteIds = body.site_id == null ? [] : [body.site_id];
    const open = locks.filter((l) => !l.reopened_at && l.year === year && l.month === month && (!siteIds.length || siteIds.includes(l.site_id as number)));
    if (!open.length) return HttpResponse.json({ code: "SCOPE3_NOT_FOUND", message: "That month isn't locked." }, { status: 404 });
    for (const l of open) Object.assign(l, { reopened_by: 4, reopened_at: new Date().toISOString(), reopened_reason: body.reason });
    return HttpResponse.json(status(year, month, siteIds));
  }),
];
