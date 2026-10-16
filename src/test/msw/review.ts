/**
 * MSW handlers for S3-15 part 2 (ESG-lite docs/scope3/01-contracts.md §4, §5,
 * §7): drafts and submit, "Nothing this month", the live checks dry run, and
 * the month lock. Stateful like the backend, so a test can submit, mark, lock
 * and reopen and read the result back. Spread into `scope3Handlers`.
 */
import { http, HttpResponse } from "msw";
import {
  type BoundaryStatus,
  type GhgCategoryNumber,
  GHG_CATEGORY_NUMBERS,
  type LockLeftItem,
  type LockPeriodBody,
  type NothingThisMonthBody,
  type PeriodLock,
  type PeriodLockCategory,
  type PeriodLockSite,
  type PeriodLockStatus,
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
    activity_data: { emission_category: c.category_name },
    created_by: ME,
    documents: 0,
    ...extra,
  };
};

/** September 2026: three drafts on Hidd plant, one pending and one approved row; Sitra yard is complete. */
const initialRows = (): ReviewRow[] => [
  row(701, 1, 1, "draft", 4.29, { activity_data: { emission_category: "Diesel (avg biofuel blend)" } }),
  row(702, 1, 3, "draft", 312.4),
  row(703, 1, 11, "draft", 5.04, { activity_data: { emission_category: "Aluminium ingot" } }),
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

function status(year: number, month: number, siteIds: number[]): PeriodLockStatus {
  const key = monthKey(year, month);
  const sites: PeriodLockSite[] = REVIEW_SITES.filter((s) => !siteIds.length || siteIds.includes(s.site_id)).map((s) => {
    const categories: PeriodLockCategory[] = OWED[s.site_id].map((c) => {
      const mine = rows.filter((r) => r.site.site_id === s.site_id && r.category.category_id === c.category_id && r.date_of_reporting.startsWith(key));
      const count = (st: EmissionStatus) => mine.filter((r) => r.status === st).length;
      return {
        category_id: c.category_id,
        category_name: c.category_name,
        scope: c.scope,
        ghg_category: c.ghg_category,
        counts: { draft: count("draft"), pending: count("pending"), approved: count("approved"), rejected: count("rejected") },
        nothing_this_month: nothing.some((n) => n.site_id === s.site_id && n.category_id === c.category_id && n.month === `${key}-01`),
      };
    });
    const lock = activeLock(s.site_id, year, month);
    return { site_id: s.site_id, name: s.name, locked: !!lock, lock, categories };
  });
  const scope3 = GHG_CATEGORY_NUMBERS.map((n) => ({ n, status: BOUNDARY[n] ?? "not_relevant", has_data: scope3Data.has(n) }));
  const left: LockLeftItem[] = [];
  for (const s of sites) {
    if (s.locked) continue;
    for (const c of s.categories) {
      const base = { site_id: s.site_id, site_name: s.name, category_id: c.category_id, category_name: c.category_name, ghg_category: c.ghg_category };
      const { draft, pending, approved, rejected } = c.counts;
      if (c.nothing_this_month) continue;
      if (draft + pending + approved + rejected === 0) left.push({ ...base, reason: "missing" });
      if (draft) left.push({ ...base, reason: "draft" });
      if (pending) left.push({ ...base, reason: "pending" });
      if (rejected) left.push({ ...base, reason: "rejected" });
    }
  }
  // Company-level: an included Scope 3 category with no data this month, on the first site in view that is open.
  const open = sites.find((s) => !s.locked);
  if (open)
    for (const cell of scope3)
      if (cell.status === "included" && !cell.has_data)
        left.push({ site_id: open.site_id, site_name: open.name, category_id: null, category_name: null, ghg_category: cell.n, reason: "scope3_no_data" });
  return { year, month, sites, scope3, left };
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

  http.post<never, { pk_id?: number | null; evidence_count?: number }>("*/user/emissions/check", async ({ request }) => {
    const body = await request.json();
    const saved = rows.find((r) => r.pk_id === body.pk_id);
    const held: RowChecks["held"] = (saved?.documents ?? 0) + (body.evidence_count ?? 0) > 0 ? [] : ["EVIDENCE_ATTACHED"];
    return HttpResponse.json({ ready: held.length === 0, held } satisfies RowChecks);
  }),

  http.post<never, Partial<NothingThisMonthBody>>("*/user/my-month/nothing", async ({ request }) => {
    const body = await request.json();
    if (!body.site_id || !body.category_id || !/^\d{4}-\d{2}-01$/.test(body.month ?? "")) return invalid("month", "Give the site, category and month (first day).");
    const [y, m] = (body.month as string).split("-").map(Number);
    if (activeLock(body.site_id, y, m)) return error("PERIOD_LOCKED", 409, "This month is closed. Ask your manager to reopen it.");
    const mark = { site_id: body.site_id, category_id: body.category_id, month: body.month as string };
    if (!nothing.some((n) => sameMark(n, mark))) nothing.push(mark);
    return HttpResponse.json(mark, { status: 201 });
  }),
  // data-loss-reviewed: a test mock; it removes a "Nothing this month" mark from in-memory sample data, never a real record.
  http.delete("*/user/my-month/nothing", async ({ request }) => {
    const body = (await request.json()) as Partial<NothingThisMonthBody>;
    nothing = nothing.filter((n) => !sameMark(n, body));
    return new HttpResponse(null, { status: 204 });
  }),

  http.get("*/periods/lock", ({ request }) => {
    const q = new URL(request.url).searchParams;
    const year = Number(q.get("year"));
    const month = Number(q.get("month"));
    if (!year || !month || month < 1 || month > 12) return invalid("month", "Give the year and month.");
    const siteIds = (q.get("siteIds") ?? "").split(",").filter(Boolean).map(Number);
    return HttpResponse.json(status(year, month, siteIds));
  }),
  http.post<never, Partial<LockPeriodBody>>("*/periods/lock", async ({ request }) => {
    const body = await request.json();
    if (!body.year) return invalid("year", "Give the year to lock.");
    if (!body.month) return invalid("month", "Give the month to lock.");
    const { year, month } = body as { year: number; month: number };
    const siteIds = body.site_id == null ? [] : [body.site_id];
    const now = status(year, month, siteIds);
    if (now.sites.every((s) => s.locked)) return error("PERIOD_LOCKED", 409, "This month is already locked.");
    if (now.left.length > 0) return error("PERIOD_INCOMPLETE", 409, `${now.left.length} items are left before this month can be locked.`);
    const lock: PeriodLock = { company_id: COMPANY_ID, site_id: body.site_id ?? null, year, month, locked_by: 4, locked_at: new Date().toISOString() };
    locks.push(lock);
    return HttpResponse.json(lock, { status: 201 });
  }),
  http.post<never, Partial<UnlockPeriodBody>>("*/periods/unlock", async ({ request }) => {
    const body = await request.json();
    if ((body.reason ?? "").trim().length < UNLOCK_REASON_MIN) return error("UNLOCK_REASON_REQUIRED", 400, "Give a reason of at least 5 characters for reopening this month.");
    const lock = locks.find((l) => !l.reopened_at && l.site_id === (body.site_id ?? null) && l.year === body.year && l.month === (body.month ?? null));
    if (!lock) return HttpResponse.json({ message: "That month isn't locked." }, { status: 404 });
    Object.assign(lock, { reopened_by: 4, reopened_at: new Date().toISOString(), reopened_reason: body.reason });
    return HttpResponse.json(lock);
  }),
];
