// The sites and categories a contributor can report for, from the signed-in
// user (AuthContext's user is untyped, so it is narrowed here).

export interface Category {
  category_id: number;
  category_name: string;
  scope: string;
  /** GHG Protocol category 1–15 for a Scope 3 category (S3-1), when the server sends it. */
  ghg_category?: number | null;
}

export interface EntrySite {
  site_id: number;
  name: string;
  categories: Category[];
  company_id: number | null;
  /** D6a: the site's FERA category even when the user's grants leave it out (ESG-lite session user). */
  fera_category_id?: number | null;
}

interface RawSite {
  site_id: number;
  name: string;
  categories?: Category[];
  company?: { company_id: number } | null;
  fera_category_id?: number | null;
}

const toSite = (s: RawSite): EntrySite => ({
  site_id: s.site_id,
  name: s.name,
  categories: s.categories ?? [],
  company_id: s.company?.company_id ?? null,
  fera_category_id: s.fera_category_id ?? null,
});

/** user.sites, or the single user.site of older accounts. */
export function sitesOf(user: unknown): EntrySite[] {
  const u = (user ?? {}) as { sites?: RawSite[]; site?: RawSite | null };
  if (u.sites?.length) return u.sites.map(toSite);
  return u.site ? [toSite(u.site)] : [];
}

const isFera = (c: Category) => c.category_name.toLowerCase() === "fera";

/** FERA is never chosen directly: the backend adds its rows when the fuel row is saved. */
export const entryCategories = (site: EntrySite | undefined) => (site?.categories ?? []).filter((c) => !isFera(c));

/** The site's FERA category id: from its categories, else from the server's `fera_category_id` (a user whose grants leave FERA out still gets its WTT on save, D6a). */
export const feraCategoryIdOf = (site: EntrySite | undefined): number | null => site?.categories.find(isFera)?.category_id ?? site?.fera_category_id ?? null;

/** The signed-in user's id, sent with bill uploads so My bills can list them. */
export const userIdOf = (user: unknown): number | null => {
  const id = (user as { user_id?: unknown } | null)?.user_id;
  return typeof id === "number" ? id : null;
};
