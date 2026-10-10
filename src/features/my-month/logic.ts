import { MONTH_SHORT, fyLabel } from "../../ui";
import type { MyMonthCategory, MyMonthResponse, MyMonthSite } from "../../services/myMonthService";

export type ScopeGroup = { key: string; label: string; categories: MyMonthCategory[] };

const pad = (n: number) => String(n).padStart(2, "0");

/** "Scope 1", "scope1", "1" → 1. Anything else → null (shown under "Other"). */
export function scopeNumber(scope: string | null | undefined): 1 | 2 | 3 | null {
  const m = /([123])/.exec(scope ?? "");
  return m ? (Number(m[1]) as 1 | 2 | 3) : null;
}

/** "10 Oct" from "2025-10-10". */
export function shortDay(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTH_SHORT[m - 1]}`;
}

/** "10 Oct" in the year of `today`, "10 Oct 2025" in any other year. */
export function dayWithYear(iso: string, today: string): string {
  return iso.slice(0, 4) === today.slice(0, 4) ? shortDay(iso) : `${shortDay(iso)} ${iso.slice(0, 4)}`;
}

/** "September 2025" from "2025-09". */
export function monthTitle(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const name = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
  return `${name} ${y}`;
}

/** The month `steps` away from "YYYY-MM". */
export function shiftMonth(month: string, steps: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + steps;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

/** Local calendar date as YYYY-MM-DD. */
export function isoDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000);
}

const isYearly = (c: MyMonthCategory) => c.filing === "yearly" && c.period !== null;

/** "Yearly · FY 2025-26" or "Yearly · CY 2025" for a yearly-filed category, else null. */
export function yearlyLabel(c: MyMonthCategory): string | null {
  if (!isYearly(c) || !c.period) return null;
  const [y, m] = c.period.start.split("-").map(Number);
  return `Yearly · ${c.year_type === "CY" || m === 1 ? `CY ${y}` : fyLabel(y, m)}`;
}

/** The `?period=` a row's links carry: the month, or FY2025 / CY2025 for a yearly filing. */
export function rowPeriod(c: MyMonthCategory, month: string): string {
  if (!isYearly(c) || !c.period) return month;
  const [y, m] = c.period.start.split("-").map(Number);
  return c.year_type === "CY" || m === 1 ? `CY${y}` : `FY${y}`;
}

function contextQuery(siteId: number, categoryId: number, period: string): string {
  return new URLSearchParams({ site: String(siteId), category: String(categoryId), period }).toString();
}

/** P03 Add data, prefilled with the row's site, category and period. */
export function addDataLink(siteId: number, c: MyMonthCategory, month: string): string {
  return `/data/new?${contextQuery(siteId, c.category_id, rowPeriod(c, month))}`;
}

/** P04 My entries, filtered to the row. */
export function entriesLink(siteId: number, c: MyMonthCategory, month: string): string {
  return `/data/mine?${contextQuery(siteId, c.category_id, rowPeriod(c, month))}`;
}

/**
 * Rows the checklist shows. A month covered by a yearly batch filed elsewhere
 * ("covered") needs nothing, so yearly categories appear only in their due month.
 */
export function visibleCategories(site: MyMonthSite): MyMonthCategory[] {
  return site.categories.filter((c) => c.status !== "covered");
}

const ORDER: Record<MyMonthCategory["status"], number> = { rejected: 0, todo: 1, pending: 2, approved: 3, covered: 4 };

/** Checklist groups Scope 1/2/3 (+ Other), rejected rows first, then to do, pending, approved. */
export function groupByScope(categories: MyMonthCategory[]): ScopeGroup[] {
  const groups = new Map<string, ScopeGroup>();
  for (const c of categories) {
    const n = scopeNumber(c.scope);
    const key = n ? `s${n}` : "other";
    if (!groups.has(key)) groups.set(key, { key, label: n ? `Scope ${n}` : "Other", categories: [] });
    groups.get(key)?.categories.push(c);
  }
  const order = ["s1", "s2", "s3", "other"];
  return [...groups.values()]
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
    .map((g) => ({
      ...g,
      categories: [...g.categories].sort(
        (a, b) => ORDER[a.status] - ORDER[b.status] || a.category_name.localeCompare(b.category_name),
      ),
    }));
}

/** "2 entries, 1 pending" when a row has several entries in different states; null otherwise. */
export function entriesSummary(c: MyMonthCategory): string | null {
  const { total, pending, approved, rejected } = c.entries;
  if (total < 2) return null;
  const parts = [`${total} entries`];
  if (rejected) parts.push(`${rejected} rejected`);
  if (pending) parts.push(`${pending} pending`);
  if (approved && approved !== total) parts.push(`${approved} approved`);
  return parts.join(", ");
}

/** Filled when approved, empty when to do, half when anything is still open. */
export function rowMark(c: MyMonthCategory): "full" | "half" | "empty" {
  if (c.status === "todo") return "empty";
  if (c.status === "approved" || c.status === "covered") return "full";
  return "half";
}

export type SentBack = { siteId: number; siteName: string; category: MyMonthCategory };

/** Every rejected row, across sites, for the "Sent back to you" panel. */
export function sentBack(data: MyMonthResponse): SentBack[] {
  return data.sites.flatMap((s) =>
    visibleCategories(s)
      .filter((c) => c.status === "rejected")
      .map((category) => ({ siteId: s.site_id, siteName: s.name, category })),
  );
}

export type Progress = { filed: number; total: number; allIn: boolean };

/**
 * Categories with something filed (pending or approved, or covered by a yearly
 * filing) out of all owed, over the sites in `data` (the same tally as B5's
 * summary, so it still holds when the page narrows to one site).
 */
export function progress(data: MyMonthResponse): Progress {
  const all = data.sites.flatMap((s) => s.categories);
  const filed = all.filter((c) => c.status !== "todo" && c.status !== "rejected").length;
  return { filed, total: all.length, allIn: all.length > 0 && filed === all.length };
}

export type DuePhase = "open" | "late" | "escalated";

export type DueState = { phase: DuePhase; message: string };

/**
 * The due banner. Data for month M is due on the 10th of M+1 and escalated on
 * the 15th (backend deadlineScheduler); the banner turns warn after the 10th.
 */
export function dueState(data: MyMonthResponse, today: string): DueState {
  const { filed, total } = progress(data);
  const tally = `${filed} of ${total} ${total === 1 ? "category" : "categories"} filed.`;
  const days = daysBetween(today, data.due_date);
  const due = dayWithYear(data.due_date, today);
  if (today >= data.escalation_date) return { phase: "escalated", message: `Overdue since ${due}. Escalated to your manager. ${tally}` };
  if (days < 0) return { phase: "late", message: `Overdue since ${due}. Escalates to your manager on ${dayWithYear(data.escalation_date, today)}. ${tally}` };
  if (days === 0) return { phase: "open", message: `Due today (${due}). ${tally}` };
  if (days === 1) return { phase: "open", message: `Due tomorrow (${due}). ${tally}` };
  return { phase: "open", message: `Due in ${days} days (${due}). ${tally}` };
}

export type Glance = { tonnes: number; pendingEntries: number; approvedEntries: number };

/** "Your month at a glance": tCO₂e entered (pending + approved) and entry counts. */
export function glance(data: MyMonthResponse): Glance {
  const all = data.sites.flatMap(visibleCategories);
  return {
    tonnes: all.reduce((sum, c) => sum + (Number(c.total_emission) || 0), 0),
    pendingEntries: all.reduce((sum, c) => sum + c.entries.pending, 0),
    approvedEntries: all.reduce((sum, c) => sum + c.entries.approved, 0),
  };
}

/** No categories owed anywhere: the user needs access first. */
export function hasNoAssignments(data: MyMonthResponse): boolean {
  return data.sites.every((s) => s.categories.length === 0);
}
