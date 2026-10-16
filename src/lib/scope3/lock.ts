/**
 * S3-15 part 2 · Close month: the words and the pure logic behind the lock
 * view (`GET /periods/lock`). Pages read reason words and grid labels from
 * here, never their own.
 */
import {
  GHG_CATEGORY_NUMBERS,
  LOCK_LEFT_REASONS,
  type BoundaryStatus,
  type LockLeftItem,
  type LockLeftReason,
  type PeriodLock,
  type PeriodLockCategory,
  type PeriodLockSite,
  type PeriodLockStatus,
  type Scope3GridCell,
  UNLOCK_REASON_MIN,
} from "./contracts";
import { BOUNDARY_STATUSES, BOUNDARY_STATUS_LABEL } from "./boundary";

export { UNLOCK_REASON_MIN } from "./contracts";

/** What each `left` reason means, in a manager's words. */
export const LEFT_REASON_LABEL: Record<LockLeftReason, string> = {
  missing: "Nothing entered yet",
  draft: "Drafts not submitted",
  pending: "Waiting for approval",
  rejected: "Sent back, not fixed yet",
  scope3_no_data: "Included in your boundary, but no data this month",
};

export const isLeftReason = (v: unknown): v is LockLeftReason => typeof v === "string" && (LOCK_LEFT_REASONS as readonly string[]).includes(v);

/** The word for a `left` reason; a reason this build doesn't know is shown as the server sent it. */
export function leftReasonLabel(reason: string): string {
  return isLeftReason(reason) ? LEFT_REASON_LABEL[reason] : reason.replace(/_/g, " ");
}

const num = (v: unknown): number | null => {
  const n = Number(v);
  return v !== null && v !== "" && Number.isFinite(n) ? n : null;
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/**
 * A site's active lock. ESG-lite sends `{locked_at, locked_by, locked_by_name}`
 * on the site (one period_lock row per site, so the lock is the site's own);
 * the year and month are the answer's.
 */
function readLock(raw: unknown, siteId: number, period: { year: number; month: number }): PeriodLock | null {
  const l = obj(raw);
  if (!l.locked_at || l.reopened_at) return null; // a reopened lock no longer holds
  return {
    company_id: num(l.company_id) ?? 0,
    site_id: "site_id" in l ? num(l.site_id) : siteId,
    year: num(l.year) ?? period.year,
    month: "month" in l ? num(l.month) : period.month,
    locked_by: num(l.locked_by) ?? 0,
    locked_at: String(l.locked_at),
  };
}

function readCategory(raw: unknown): PeriodLockCategory {
  const c = obj(raw);
  const counts = obj(c.counts);
  return {
    category_id: num(c.category_id) ?? 0,
    category_name: str(c.category_name) ?? str(c.name) ?? "—",
    scope: str(c.scope),
    ghg_category: num(c.ghg_category),
    counts: { draft: num(counts.draft) ?? 0, pending: num(counts.pending) ?? 0, approved: num(counts.approved) ?? 0, rejected: num(counts.rejected) ?? 0 },
    // ESG-lite sends `nothing` (and `state: "nothing"`); 01-contracts §4 names the table `nothing_this_month`.
    nothing_this_month: c.nothing === true || c.nothing_this_month === true || c.state === "nothing",
  };
}

function readSite(raw: unknown, period: { year: number; month: number }): PeriodLockSite {
  const s = obj(raw);
  const siteId = num(s.site_id) ?? 0;
  const lock = readLock(s.lock, siteId, period);
  return {
    site_id: siteId,
    name: str(s.name) ?? str(s.site_name) ?? "—",
    locked: s.locked === true || !!lock,
    lock,
    categories: Array.isArray(s.categories) ? s.categories.map(readCategory) : [],
  };
}

function readLeft(raw: unknown): LockLeftItem {
  const l = obj(raw);
  // `site` / `category` may come as ids or as {id, name} objects.
  const site = obj(l.site);
  const category = obj(l.category);
  return {
    site_id: num(l.site_id) ?? num(site.site_id) ?? num(l.site) ?? 0,
    site_name: str(l.site_name) ?? str(site.name) ?? "—",
    category_id: num(l.category_id) ?? num(category.category_id) ?? (typeof l.category === "number" ? l.category : null),
    category_name: str(l.category_name) ?? str(category.category_name) ?? str(category.name),
    ghg_category: num(l.ghg_category) ?? num(category.ghg_category),
    reason: str(l.reason) ?? str(l.code) ?? "missing",
  };
}

const isBoundary = (v: unknown): v is BoundaryStatus => typeof v === "string" && (BOUNDARY_STATUSES as readonly string[]).includes(v);

/** Always 15 cells, in order; a category the server didn't send has no status and no data. */
function readGrid(raw: unknown): Scope3GridCell[] {
  const list = Array.isArray(raw) ? raw.map(obj) : [];
  return GHG_CATEGORY_NUMBERS.map((n) => {
    const cell = list.find((c) => num(c.n ?? c.ghg_category) === n) ?? {};
    return { n, status: isBoundary(cell.status) ? cell.status : null, has_data: cell.has_data === true || cell.data === true };
  });
}

/**
 * The grid for the sites in the answer. ESG-lite sends one grid per site
 * (`sites[].scope3`, data per site); the view shows one grid: the company's
 * boundary status, with data when any site has some.
 */
function gridOf(r: Record<string, unknown>): Scope3GridCell[] {
  if (Array.isArray(r.scope3)) return readGrid(r.scope3);
  const grids = (Array.isArray(r.sites) ? r.sites : []).map((s) => readGrid(obj(s).scope3));
  if (grids.length === 0) return readGrid([]);
  return grids[0].map((cell, i) => ({ ...cell, has_data: grids.some((g) => g[i].has_data) }));
}

/** `GET /periods/lock` as the API sent it, cleaned to the contract shape. */
export function readPeriodLockStatus(raw: unknown, fallback: { year: number; month: number }): PeriodLockStatus {
  const r = obj(raw);
  const period = { year: num(r.year) ?? fallback.year, month: num(r.month) ?? fallback.month };
  return {
    ...period,
    sites: Array.isArray(r.sites) ? r.sites.map((s) => readSite(s, period)) : [],
    scope3: gridOf(r),
    left: Array.isArray(r.left) ? r.left.map(readLeft) : [],
  };
}

/** A site's completeness: categories done (approved, or marked "Nothing this month") out of owed, and rows counted by status. */
export type SiteCompleteness = {
  done: number;
  owed: number;
  draft: number;
  pending: number;
  rejected: number;
  missing: number;
  nothing: number;
};

/** A category is done when it has rows and every one is approved, or it's marked "Nothing this month". */
export function categoryDone(c: PeriodLockCategory): boolean {
  if (c.nothing_this_month) return true;
  const { draft, pending, approved, rejected } = c.counts;
  return approved > 0 && draft + pending + rejected === 0;
}

/** Nothing at all for the category: no rows of any status and no "Nothing this month". */
export function categoryMissing(c: PeriodLockCategory): boolean {
  const { draft, pending, approved, rejected } = c.counts;
  return !c.nothing_this_month && draft + pending + approved + rejected === 0;
}

export function siteCompleteness(site: PeriodLockSite): SiteCompleteness {
  const cs = site.categories;
  const sum = (k: keyof PeriodLockCategory["counts"]) => cs.reduce((t, c) => t + c.counts[k], 0);
  return {
    done: cs.filter(categoryDone).length,
    owed: cs.length,
    draft: sum("draft"),
    pending: sum("pending"),
    rejected: sum("rejected"),
    missing: cs.filter(categoryMissing).length,
    nothing: cs.filter((c) => c.nothing_this_month).length,
  };
}

/** `left` items for one site (the server's list decides; the FE never adds its own). */
export const leftFor = (status: PeriodLockStatus, siteId: number): LockLeftItem[] => status.left.filter((l) => l.site_id === siteId);

export type LockGate = { canLock: boolean; reason: string | null };

/**
 * Whether Lock is offered for the sites in view, and the text beside a
 * disabled button. The server's `left` list decides; every site already
 * locked means there is nothing to lock.
 */
export function lockGate(status: PeriodLockStatus, siteIds: number[]): LockGate {
  const sites = status.sites.filter((s) => siteIds.includes(s.site_id));
  if (sites.length === 0) return { canLock: false, reason: "No sites to lock." };
  const open = sites.filter((s) => !s.locked);
  if (open.length === 0) return { canLock: false, reason: sites.length === 1 ? "This month is locked." : "Every site is locked for this month." };
  const left = status.left.filter((l) => open.some((s) => s.site_id === l.site_id)).length;
  if (left > 0) return { canLock: false, reason: `${left} ${left === 1 ? "item is" : "items are"} left before you can lock.` };
  return { canLock: true, reason: null };
}

/** The Scope 3 grid cell's words: its boundary status, and whether the month has data. */
export function gridCellText(cell: Scope3GridCell): { status: string; data: string } {
  return {
    status: cell.status ? BOUNDARY_STATUS_LABEL[cell.status] : "Not set",
    data: cell.status === "excluded" || cell.status === "not_relevant" ? "Not needed" : cell.has_data ? "Data in" : "No data",
  };
}

/** A grid cell that blocks the lock: in the boundary (included) but no data this month. */
export const gridCellOpen = (cell: Scope3GridCell): boolean => cell.status === "included" && !cell.has_data;

/** The text a reopen reason must meet, or null when it's fine. */
export function unlockReasonError(reason: string): string | null {
  return reason.trim().length >= UNLOCK_REASON_MIN ? null : `Give a reason of at least ${UNLOCK_REASON_MIN} characters.`;
}

/** Year and month from "YYYY-MM". */
export function yearMonth(month: string): { year: number; month: number } {
  const [y, m] = month.split("-").map(Number);
  return { year: y, month: m };
}
