import type { ManagerUser } from "../../services/managerService";
import type { SubmissionUser } from "../../services/overviewService";

/**
 * Category access as the drawer edits it, keyed by category_id.
 *
 * The spec asks for site_id + category_id, but `user_categories` has no site
 * column (ESG-lite `User.categories`, PUT /manager/users/:id/categories takes
 * plain category ids). So a category that sits on two of the person's sites
 * is one switch, shown on both sites and changed together, and the drawer says so.
 */
export type AccessDraft = Record<number, boolean>;

export type MonthStatus = { status: "submitted" | "missing"; count: number };

export function displayName(u: Pick<ManagerUser, "name" | "last_name" | "email">): string {
  return [u.name, u.last_name].filter((s) => s && s.trim()).join(" ").trim() || u.email;
}

export function initialDraft(user: ManagerUser): AccessDraft {
  const draft: AccessDraft = {};
  for (const site of user.sites) for (const c of site.categories) draft[c.category_id] = c.has_access;
  return draft;
}

/** Turns every category on one site on or off (shared categories follow on their other sites). */
export function setSite(draft: AccessDraft, user: ManagerUser, siteId: number, on: boolean): AccessDraft {
  const site = user.sites.find((s) => s.site_id === siteId);
  if (!site) return draft;
  const next = { ...draft };
  for (const c of site.categories) next[c.category_id] = on;
  return next;
}

/** category_id → the names of every site of this person that has it, for categories on 2+ sites. */
export function sharedCategories(user: ManagerUser): Map<number, string[]> {
  const where = new Map<number, string[]>();
  for (const site of user.sites)
    for (const c of site.categories) where.set(c.category_id, [...(where.get(c.category_id) ?? []), site.site_name]);
  for (const [id, names] of where) if (names.length < 2) where.delete(id);
  return where;
}

/** Ids to send: enabled categories that are on one of the person's sites, ascending. */
export function enabledIds(draft: AccessDraft, user: ManagerUser): number[] {
  const known = new Set(user.sites.flatMap((s) => s.categories.map((c) => c.category_id)));
  return Object.entries(draft)
    .filter(([id, on]) => on && known.has(Number(id)))
    .map(([id]) => Number(id))
    .sort((a, b) => a - b);
}

export function isDirty(draft: AccessDraft, user: ManagerUser): boolean {
  const start = initialDraft(user);
  return Object.keys(start).some((id) => !!start[Number(id)] !== !!draft[Number(id)]);
}

/**
 * Why the draft can't be saved, or null. The server reads "no categories" as
 * "every category" (legacy users have no rows), so revoking everything would
 * grant everything instead.
 */
export function saveError(draft: AccessDraft, user: ManagerUser): string | null {
  const total = user.sites.reduce((n, s) => n + s.categories.length, 0);
  if (total > 0 && enabledIds(draft, user).length === 0)
    return "Keep at least one category enabled. With none, the server gives this person every category.";
  return null;
}

/** Site × category rows enabled / shown, as in the table's "8 of 10". */
export function accessCount(user: ManagerUser, sites?: number[]): { enabled: number; total: number } {
  const shown = sites?.length ? user.sites.filter((s) => sites.includes(s.site_id)) : user.sites;
  let enabled = 0;
  let total = 0;
  for (const s of shown)
    for (const c of s.categories) {
      total += 1;
      if (c.has_access) enabled += 1;
    }
  return { enabled, total };
}

export function matchesSearch(user: ManagerUser, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [displayName(user), user.email, ...user.sites.map((s) => s.site_name)].some((v) => v?.toLowerCase().includes(needle));
}

export function onSites(user: ManagerUser, siteIds: number[]): boolean {
  return siteIds.length === 0 || user.sites.some((s) => siteIds.includes(s.site_id));
}

/** Submission status by user. The endpoint covers contributors (role User) only; others stay undefined. */
export function monthStatusById(rows: SubmissionUser[] | undefined): Map<number, MonthStatus> {
  const map = new Map<number, MonthStatus>();
  for (const r of rows ?? []) map.set(r.user_id, { status: r.status, count: r.submission_count });
  return map;
}

/** YYYY-MM for the given date (local time, like the old page's month pickers). */
export function currentMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
