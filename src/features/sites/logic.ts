// P19 Sites: pure logic (rows, filters, form draft, delete cascades). No React here.

export type Company = { company_id: number; name: string };
export type Country = { country_id: number; name: string; code?: string | null };
export type Category = { category_id: number; category_name: string; scope?: string | null };
export type Site = {
  site_id: number;
  name: string;
  address: string;
  contact_person: string;
  company?: Company | null;
  country?: Country | null;
  categories?: Category[] | null;
};
export type AdminUser = {
  user_id: number;
  name?: string | null;
  last_name?: string | null;
  email: string;
  role: string;
  /** The one site a data-entry user reports for. */
  site?: { site_id: number } | null;
  /** Sites a manager looks after. */
  sites?: { site_id: number }[] | null;
};
export type ColumnConfig = {
  pk_id: number;
  config_name: string;
  site?: { site_id: number } | null;
  category?: { category_id: number } | null;
};

export type ScopeKey = "s1" | "s2" | "s3" | "other";
export const SCOPE_KEYS: ScopeKey[] = ["s1", "s2", "s3", "other"];
export const SCOPE_LABEL: Record<ScopeKey, string> = { s1: "Scope 1", s2: "Scope 2", s3: "Scope 3", other: "No scope" };
export const SCOPE_SHORT: Record<ScopeKey, string> = { s1: "S1", s2: "S2", s3: "S3", other: "—" };

/** "Scope 1", "scope1", "1" → s1; anything else → other. */
export function scopeKey(scope: string | null | undefined): ScopeKey {
  const m = /([123])/.exec(scope ?? "");
  return m ? (`s${m[1]}` as ScopeKey) : "other";
}

export function scopeCounts(categories: Category[]): Record<ScopeKey, number> {
  const out: Record<ScopeKey, number> = { s1: 0, s2: 0, s3: 0, other: 0 };
  for (const c of categories) out[scopeKey(c.scope)]++;
  return out;
}

/** Categories grouped by scope, each group sorted by name; empty groups left out. */
export function groupByScope(categories: Category[]): { key: ScopeKey; items: Category[] }[] {
  return SCOPE_KEYS.map((key) => ({
    key,
    items: categories.filter((c) => scopeKey(c.scope) === key).sort((a, b) => a.category_name.localeCompare(b.category_name)),
  })).filter((g) => g.items.length > 0);
}

export function personName(u: AdminUser): string {
  const full = [u.name, u.last_name].filter(Boolean).join(" ").trim();
  return full || u.email;
}

export type SiteRow = Site & {
  users: AdminUser[];
  managers: AdminUser[];
  /** Category ids on this site that have a column config. */
  configured: Set<number>;
  /** All configs for this site (some may be for categories no longer on it). */
  configCount: number;
};

/** Joins sites with people and column configs in one pass each. */
export function buildRows(sites: Site[], users: AdminUser[] = [], configs: ColumnConfig[] = []): SiteRow[] {
  const usersBy = new Map<number, AdminUser[]>();
  const managersBy = new Map<number, AdminUser[]>();
  const push = (m: Map<number, AdminUser[]>, id: number, u: AdminUser) => m.set(id, [...(m.get(id) ?? []), u]);
  for (const u of users) {
    if (u.site?.site_id) push(usersBy, u.site.site_id, u);
    for (const s of u.sites ?? []) push(managersBy, s.site_id, u);
  }
  const configsBy = new Map<number, ColumnConfig[]>();
  for (const c of configs) {
    const id = c.site?.site_id;
    if (id) configsBy.set(id, [...(configsBy.get(id) ?? []), c]);
  }
  return sites.map((s) => {
    const own = configsBy.get(s.site_id) ?? [];
    const onSite = new Set((s.categories ?? []).map((c) => c.category_id));
    const configured = new Set(own.map((c) => c.category?.category_id).filter((id): id is number => !!id && onSite.has(id)));
    return { ...s, users: usersBy.get(s.site_id) ?? [], managers: managersBy.get(s.site_id) ?? [], configured, configCount: own.length };
  });
}

export function coverage(row: SiteRow): { done: number; total: number } {
  return { done: row.configured.size, total: row.categories?.length ?? 0 };
}

export type SiteFilters = { q: string; clientIds: number[]; countryIds: number[] };

export function matchesFilters(row: Site, f: SiteFilters): boolean {
  if (f.clientIds.length && !f.clientIds.includes(row.company?.company_id ?? -1)) return false;
  if (f.countryIds.length && !f.countryIds.includes(row.country?.country_id ?? -1)) return false;
  const q = f.q.trim().toLowerCase();
  if (!q) return true;
  return [row.name, row.address, row.contact_person, row.company?.name, row.country?.name].some((v) => v?.toLowerCase().includes(q));
}

export const toIds = (values: string[] | undefined): number[] => (values ?? []).map(Number).filter((n) => Number.isInteger(n) && n > 0);

// ── Form ────────────────────────────────────────────────────────────────────

export type SiteDraft = {
  name: string;
  address: string;
  contact_person: string;
  company_id: number | null;
  country_id: number | null;
  category_ids: number[];
};
export type DraftField = "name" | "address" | "contact_person" | "company_id" | "country_id";

export function emptyDraft(companyId: number | null = null): SiteDraft {
  return { name: "", address: "", contact_person: "", company_id: companyId, country_id: null, category_ids: [] };
}

export function draftFrom(site: Site): SiteDraft {
  return {
    name: site.name ?? "",
    address: site.address ?? "",
    contact_person: site.contact_person ?? "",
    company_id: site.company?.company_id ?? null,
    country_id: site.country?.country_id ?? null,
    category_ids: (site.categories ?? []).map((c) => c.category_id).sort((a, b) => a - b),
  };
}

/** Field errors for the Details tab; empty when the draft can be saved. */
export function validate(d: SiteDraft): Partial<Record<DraftField, string>> {
  const e: Partial<Record<DraftField, string>> = {};
  if (!d.name.trim()) e.name = "Enter a site name.";
  if (!d.address.trim()) e.address = "Enter the site address.";
  if (!d.contact_person.trim()) e.contact_person = "Enter a contact person.";
  if (!d.company_id) e.company_id = "Choose the client this site belongs to.";
  if (!d.country_id) e.country_id = "Choose a country.";
  return e;
}

export function isDirty(d: SiteDraft, site: Site | null): boolean {
  const base = site ? draftFrom(site) : emptyDraft(d.company_id);
  return JSON.stringify({ ...d, category_ids: [...d.category_ids].sort((a, b) => a - b) }) !== JSON.stringify(base);
}

export function toPayload(d: SiteDraft) {
  return {
    name: d.name.trim(),
    address: d.address.trim(),
    contact_person: d.contact_person.trim(),
    company_id: d.company_id as number,
    country_id: d.country_id as number,
    category_ids: d.category_ids,
  };
}

/** Selected ids after "select all" / "clear" on the visible categories. */
export function setMany(selected: number[], ids: number[], on: boolean): number[] {
  const kept = on ? selected : selected.filter((id) => !ids.includes(id));
  return [...new Set(on ? [...kept, ...ids] : kept)].sort((a, b) => a - b);
}

export function matchesCategory(c: Category, q: string): boolean {
  const t = q.trim().toLowerCase();
  return !t || c.category_name.toLowerCase().includes(t);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What deleting the site takes with it (the database cascades all of these). */
export function cascadeItems(row: SiteRow): string[] {
  return [
    "All emission entries recorded for this site",
    "Its emission factors",
    `${plural(row.configCount, "column config", "column configs")}`,
    "Its products and their production data",
    "Its PCF studies",
    "Its site-specific units",
    row.users.length
      ? `${plural(row.users.length, "user account", "user accounts")} assigned to this site (${row.users.slice(0, 3).map(personName).join(", ")}${row.users.length > 3 ? ", …" : ""})`
      : "No user accounts (no one is assigned to this site)",
  ];
}
