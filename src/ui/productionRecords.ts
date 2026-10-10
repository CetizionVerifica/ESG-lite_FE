import type { ProductionData } from "../services/productionDataService";
import { MONTH_SHORT } from "./period";

/**
 * Helpers shared by the production pages (P05 contributor, P08 review), so
 * both show periods and overlaps the same way.
 */

/** "2025-01-31T00:00:00Z" → [2025, 0, 31], read as a calendar date (no time zone shift). */
function ymd(value: string): [number, number, number] {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return [y, m - 1, d];
}

/** "Jan 1 – Jan 31, 2025"; the start year is shown only when it differs. */
export function productionPeriodText(start: string, end: string): string {
  const [sy, sm, sd] = ymd(start);
  const [ey, em, ed] = ymd(end);
  const from = `${MONTH_SHORT[sm]} ${sd}${sy !== ey ? `, ${sy}` : ""}`;
  return `${from} – ${MONTH_SHORT[em]} ${ed}, ${ey}`;
}

/** "Feb 1–15" or "Jan 20 – Feb 5" (overlap chips; year left out). */
export function shortRange(start: string, end: string): string {
  const [, sm, sd] = ymd(start);
  const [, em, ed] = ymd(end);
  return sm === em ? `${MONTH_SHORT[sm]} ${sd}–${ed}` : `${MONTH_SHORT[sm]} ${sd} – ${MONTH_SHORT[em]} ${ed}`;
}

type Dated = Pick<ProductionData, "production_id" | "status" | "start_date" | "end_date"> & {
  product?: { product_id: number } | null;
  site?: { site_id: number } | null;
};

/** True when two inclusive date ranges share at least one day. */
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart.slice(0, 10) <= bEnd.slice(0, 10) && bStart.slice(0, 10) <= aEnd.slice(0, 10);
}

/**
 * Other records of the same product on the same site whose dates overlap this
 * one. Rejected records don't count (they never reach intensity). Returns, per
 * record id, the overlapping records' date ranges.
 */
export function overlapsById(rows: Dated[]): Map<number, string[]> {
  const out = new Map<number, string[]>();
  const live = rows.filter((r) => r.status !== "rejected");
  const groups = new Map<string, Dated[]>();
  for (const r of live) {
    const key = `${r.site?.site_id}:${r.product?.product_id}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  for (const group of groups.values()) {
    for (const a of group)
      for (const b of group) {
        if (a.production_id === b.production_id) continue;
        if (rangesOverlap(a.start_date, a.end_date, b.start_date, b.end_date)) {
          out.set(a.production_id, [...(out.get(a.production_id) ?? []), shortRange(b.start_date, b.end_date)]);
        }
      }
  }
  return out;
}

/**
 * Records a new or edited record would overlap: same site and product, not
 * rejected, not the record itself. Used for the warning before saving.
 */
export function overlapsFor(
  rows: Dated[],
  draft: { siteId: number | null; productId: number | null; start: string; end: string; exceptId?: number },
): Dated[] {
  if (!draft.siteId || !draft.productId || !draft.start || !draft.end || draft.end < draft.start) return [];
  return rows.filter(
    (r) =>
      r.status !== "rejected" &&
      r.production_id !== draft.exceptId &&
      r.site?.site_id === draft.siteId &&
      r.product?.product_id === draft.productId &&
      rangesOverlap(r.start_date, r.end_date, draft.start, draft.end),
  );
}
