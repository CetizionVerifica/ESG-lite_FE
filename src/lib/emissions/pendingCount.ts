import { getEmissionsPaginated } from "../../services/emissionService";

type CategorySite = { categories?: { category_id: number; category_name: string }[] };

/** Ids of the FERA categories on these sites (FERA rows are twins of another entry). */
export function feraCategoryIds(sites: CategorySite[]): number[] {
  const ids = new Set<number>();
  for (const s of sites) for (const c of s.categories ?? []) if (c.category_name?.toLowerCase() === "fera") ids.add(c.category_id);
  return [...ids].sort((a, b) => a - b);
}

/**
 * Pending entries as the approvals list shows them: a FERA twin is folded into
 * its parent row, so it isn't counted on its own. The server counts every row,
 * so its pending FERA rows are taken off.
 */
export async function fetchPendingForApproval(siteIds: number[], feraIds: number[]): Promise<number> {
  const [all, ...fera] = await Promise.all([
    getEmissionsPaginated({ siteIds, status: "pending", page: 1, limit: 1 }),
    ...feraIds.map((categoryId) => getEmissionsPaginated({ siteIds, categoryId, status: "pending", page: 1, limit: 1 })),
  ]);
  const twins = fera.reduce((n, r) => n + (r.summary.pending_count ?? 0), 0);
  return Math.max(0, (all.summary.pending_count ?? 0) - twins);
}
