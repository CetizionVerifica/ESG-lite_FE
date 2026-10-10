import { getEmissionsPaginated } from "../../services/emissionService";

type CategorySite = { categories?: { category_id: number; category_name: string }[] };

/** Ids of the FERA categories on these sites (FERA rows are twins of another entry). */
export function feraCategoryIds(sites: CategorySite[]): number[] {
  const ids = new Set<number>();
  for (const s of sites) for (const c of s.categories ?? []) if (c.category_name?.toLowerCase() === "fera") ids.add(c.category_id);
  return [...ids].sort((a, b) => a - b);
}

/**
 * Pending entries as the approvals list shows them: a FERA twin of a pending
 * entry is folded into that entry, so it isn't counted on its own. The API
 * returns that count as `pending_review_count` (ESG-lite #82). An older API
 * only counts every row; then its pending FERA rows are taken off.
 */
export async function fetchPendingForApproval(siteIds: number[], feraIds: number[]): Promise<number> {
  const all = await getEmissionsPaginated({ siteIds, status: "pending", page: 1, limit: 1 });
  if (typeof all.summary.pending_review_count === "number") return all.summary.pending_review_count;
  const fera = await Promise.all(
    feraIds.map((categoryId) => getEmissionsPaginated({ siteIds, categoryId, status: "pending", page: 1, limit: 1 })),
  );
  const twins = fera.reduce((n, r) => n + (r.summary.pending_count ?? 0), 0);
  return Math.max(0, (all.summary.pending_count ?? 0) - twins);
}
