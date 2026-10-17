// S3-15 part 2 · Close month (`/data/approvals?view=close&period=`): which
// month, what Lock sends, and where each "left" item links. Pure.
import type { LockLeftItem, LockPeriodBody, PeriodLockSite, PeriodLockStatus } from "../../lib/scope3/contracts";
import type { Period } from "../../ui";

const pad = (n: number) => String(n).padStart(2, "0");

/** The month the view closes: the `?period=` month, else the month before `today` (the one just due). */
export function closeMonth(period: Period | null, today: Date): { year: number; month: number; key: string } {
  if (period?.kind === "month") return { year: period.year, month: period.month, key: `${period.year}-${pad(period.month)}` };
  const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  return { year: prev.getFullYear(), month: prev.getMonth() + 1, key: `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}` };
}

const COMPANY_WIDE = new Set(["Admin", "Superadmin"]);

/** The sites the view shows: the site chip's, or every site in the answer. */
export function sitesInView(status: PeriodLockStatus, siteIds: number[]): PeriodLockSite[] {
  return siteIds.length ? status.sites.filter((s) => siteIds.includes(s.site_id)) : status.sites;
}

/**
 * What Lock sends. Admins and Superadmins with no site chip lock the whole
 * company in one call (`site_id: null`, D11); otherwise each open site in view
 * is locked on its own (a Manager locks only their own sites).
 */
export function lockBodies(role: string | null, status: PeriodLockStatus, siteIds: number[]): LockPeriodBody[] {
  const { year, month } = status;
  const open = sitesInView(status, siteIds).filter((s) => !s.locked);
  if (open.length === 0) return [];
  if (role && COMPANY_WIDE.has(role) && siteIds.length === 0) return [{ site_id: null, year, month }];
  return open.map((s) => ({ site_id: s.site_id, year, month }));
}

/** The body that reopens a site: its own lock, or the company-wide one it sits under. */
export function unlockTarget(site: PeriodLockSite, status: PeriodLockStatus): LockPeriodBody {
  return { site_id: site.lock ? site.lock.site_id : site.site_id, year: status.year, month: status.month };
}

export type LeftLink = { to: string; label: string } | null;

/** Where a "left" item is fixed: the queue for pending rows, the ledger for rejected ones, the form for missing data. */
export function leftLink(item: LockLeftItem, period: string): LeftLink {
  const q = (extra: Record<string, string> = {}) =>
    new URLSearchParams({ site: String(item.site_id), ...(item.category_id != null ? { category: String(item.category_id) } : {}), period, ...extra }).toString();
  switch (item.reason) {
    case "pending":
      return { to: `/data/approvals?${q()}`, label: "Review" };
    case "rejected":
      return { to: `/data/ledger?${q({ status: "rejected" })}`, label: "View" };
    case "missing":
      return item.category_id != null ? { to: `/data/new?${q()}`, label: "Add data" } : null;
    case "scope3_no_data":
      return { to: "/settings/scope3", label: "Scope 3 boundary" };
    default:
      // Drafts: only the contributor who saved them can submit.
      return null;
  }
}

/** "Category 4 · Upstream transportation" for a Scope 3 item, else the category's own name. */
export function leftItemName(item: LockLeftItem, scope3Label: (n: number) => string): string {
  if (item.category_name) return item.category_name;
  return item.ghg_category != null ? scope3Label(item.ghg_category) : "Whole site";
}
