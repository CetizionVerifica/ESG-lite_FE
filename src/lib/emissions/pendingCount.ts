import { type CategoryFilter, getEmissionsPaginated } from "../../services/emissionService";

type CategorySite = { categories?: { category_id: number; category_name: string }[] };

/** Ids of the FERA categories on these sites (FERA rows are twins of another entry). */
export function feraCategoryIds(sites: CategorySite[]): number[] {
  const ids = new Set<number>();
  for (const s of sites) for (const c of s.categories ?? []) if (c.category_name?.toLowerCase() === "fera") ids.add(c.category_id);
  return [...ids].sort((a, b) => a - b);
}

export type PendingFilter = { categoryId?: CategoryFilter; year?: number | null; month?: number | null; search?: string | null; batchId?: string | null };

/**
 * Pending entries as the approvals list shows them: a FERA twin of a pending
 * entry is folded into that entry, so it isn't counted on its own. The API
 * returns that count as `pending_review_count` (ESG-lite #82). An older API
 * only counts every row; then its pending FERA rows are taken off.
 *
 * `filter` narrows the count to the list's category, period and search, so the badge
 * matches the list under it. With the FERA category among those chosen, the
 * list shows its rows, so every pending row counts.
 */
export async function fetchPendingForApproval(siteIds: number[], feraIds: number[], filter: PendingFilter = {}): Promise<number> {
  const narrow = Object.fromEntries(Object.entries(filter).filter(([, v]) => v != null));
  const all = await getEmissionsPaginated({ siteIds, ...narrow, status: "pending", page: 1, limit: 1 });
  const categories = Array.isArray(filter.categoryId) ? filter.categoryId : filter.categoryId != null ? [filter.categoryId] : [];
  if (categories.some((id) => feraIds.includes(id))) return all.summary.pending_count ?? 0;
  if (typeof all.summary.pending_review_count === "number") return all.summary.pending_review_count;
  // Non-FERA categories have no FERA rows to take off.
  if (categories.length > 0) return all.summary.pending_count ?? 0;
  const fera = await Promise.all(
    feraIds.map((categoryId) => getEmissionsPaginated({ siteIds, ...narrow, categoryId, status: "pending", page: 1, limit: 1 })),
  );
  const twins = fera.reduce((n, r) => n + (r.summary.pending_count ?? 0), 0);
  return Math.max(0, (all.summary.pending_count ?? 0) - twins);
}
