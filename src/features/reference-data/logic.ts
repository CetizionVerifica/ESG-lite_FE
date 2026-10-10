// P21 Reference data: pure logic for the Countries, Categories and Units tabs. No React here.

export type Company = { company_id: number; name: string };
export type Country = { country_id: number; name: string; code?: string | null; site_count?: number | null };
export type SiteRef = { site_id: number; name?: string | null };
export type Category = {
  category_id: number;
  category_name: string;
  scope?: string | null;
  sites?: SiteRef[] | null;
  factor_count?: number | null;
  config_count?: number | null;
  unit_count?: number | null;
  entry_count?: number | null;
};
export type Site = {
  site_id: number;
  name: string;
  company?: Company | null;
  country?: { country_id: number } | null;
  categories?: { category_id: number; category_name: string; scope?: string | null }[] | null;
};
export type Unit = {
  unit_id: number;
  unit_name: string;
  description?: string | null;
  site?: SiteRef | null;
  category?: { category_id: number; category_name?: string | null } | null;
  entry_count?: number | null;
};

export type RefTab = "countries" | "categories" | "units";
export const TABS: RefTab[] = ["countries", "categories", "units"];
export const TAB_LABEL: Record<RefTab, string> = { countries: "Countries", categories: "Categories", units: "Units" };
export const readTab = (value: string | null): RefTab => (TABS.includes(value as RefTab) ? (value as RefTab) : "countries");

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

// ── Scope ───────────────────────────────────────────────────────────────────

/** Categories without a scope count as savings (reductions), not emissions. */
export type ScopeKey = "s1" | "s2" | "s3" | "saving";
export const SCOPE_KEYS: ScopeKey[] = ["s1", "s2", "s3", "saving"];
export const SCOPE_LABEL: Record<ScopeKey, string> = { s1: "Scope 1", s2: "Scope 2", s3: "Scope 3", saving: "Saving" };
export const SCOPE_SHORT: Record<ScopeKey, string> = { s1: "S1", s2: "S2", s3: "S3", saving: "Saving" };

/** "Scope 1", "scope1", "1" → s1; empty or anything else → saving. */
export function scopeKey(scope: string | null | undefined): ScopeKey {
  const m = /([123])/.exec(scope ?? "");
  return m ? (`s${m[1]}` as ScopeKey) : "saving";
}

/** The value the API stores for a scope choice. */
export const scopeValue = (k: ScopeKey): string | null => (k === "saving" ? null : SCOPE_LABEL[k]);

// ── Countries ───────────────────────────────────────────────────────────────

export type CountryRow = Country & {
  code: string;
  /** Sites in this country; null while unknown. */
  siteCount: number | null;
};

/** Uses the server's site_count; falls back to counting the sites list. */
export function countryRows(countries: Country[], sites?: Site[]): CountryRow[] {
  const bySites = new Map<number, number>();
  for (const s of sites ?? []) {
    const id = s.country?.country_id;
    if (id) bySites.set(id, (bySites.get(id) ?? 0) + 1);
  }
  return countries.map((c) => ({
    ...c,
    code: (c.code ?? "").toUpperCase(),
    siteCount: typeof c.site_count === "number" ? c.site_count : sites ? (bySites.get(c.country_id) ?? 0) : null,
  }));
}

export function matchesCountry(row: CountryRow, q: string): boolean {
  const t = norm(q);
  return !t || norm(row.name).includes(t) || norm(row.code).includes(t);
}

export type CountryDraft = { name: string; code: string };
export type CountryField = keyof CountryDraft;

export const countryDraftFrom = (c: Country | null): CountryDraft => ({ name: c?.name ?? "", code: (c?.code ?? "").toUpperCase() });

export function validateCountry(d: CountryDraft, others: Country[]): Partial<Record<CountryField, string>> {
  const e: Partial<Record<CountryField, string>> = {};
  const name = norm(d.name);
  const code = d.code.trim().toUpperCase();
  if (!name) e.name = "Enter a country name.";
  else if (others.some((c) => norm(c.name) === name)) e.name = "A country with this name already exists.";
  if (!code) e.code = "Enter the two-letter ISO code.";
  else if (!/^[A-Z]{2}$/.test(code)) e.code = "Use the two-letter ISO code, for example BH or IN.";
  else if (others.some((c) => (c.code ?? "").toUpperCase() === code)) e.code = "Another country already uses this code.";
  return e;
}

export const countryPayload = (d: CountryDraft) => ({ name: d.name.trim(), code: d.code.trim().toUpperCase() });

/** Why the country can't be deleted, or null when it can. */
export function countryDeleteBlock(row: CountryRow): string | null {
  if (!row.siteCount) return null;
  return `${plural(row.siteCount, "site uses", "sites use")} ${row.name}. Move ${row.siteCount === 1 ? "it" : "them"} to another country first.`;
}

// ── Categories ──────────────────────────────────────────────────────────────

export type CategoryRow = Category & {
  scopeKey: ScopeKey;
  siteIds: number[];
  /** Null when the server didn't send the count. */
  factors: number | null;
  configs: number | null;
  units: number | null;
  entries: number | null;
};

const count = (n: number | null | undefined) => (typeof n === "number" ? n : null);

/** Site assignment comes with the category; without it, it is read off the sites list. */
export function categoryRows(categories: Category[], sites?: Site[]): CategoryRow[] {
  const bySites = new Map<number, number[]>();
  for (const s of sites ?? []) for (const c of s.categories ?? []) bySites.set(c.category_id, [...(bySites.get(c.category_id) ?? []), s.site_id]);
  return categories.map((c) => ({
    ...c,
    scopeKey: scopeKey(c.scope),
    siteIds: (c.sites ? c.sites.map((s) => s.site_id) : (bySites.get(c.category_id) ?? [])).sort((a, b) => a - b),
    factors: count(c.factor_count),
    configs: count(c.config_count),
    units: count(c.unit_count),
    entries: count(c.entry_count),
  }));
}

export function matchesCategoryRow(row: CategoryRow, f: { q: string; scopes: string[] }): boolean {
  if (f.scopes.length && !f.scopes.includes(row.scopeKey)) return false;
  const t = norm(f.q);
  return !t || norm(row.category_name).includes(t);
}

export type CategoryDraft = { category_name: string; scope: ScopeKey; site_ids: number[]; assign_all_sites: boolean };

export function categoryDraftFrom(row: CategoryRow | null): CategoryDraft {
  return { category_name: row?.category_name ?? "", scope: row?.scopeKey ?? "s1", site_ids: row ? [...row.siteIds] : [], assign_all_sites: false };
}

export function validateCategory(d: CategoryDraft, others: Category[]): { category_name?: string } {
  const name = norm(d.category_name);
  if (!name) return { category_name: "Enter a category name." };
  if (others.some((c) => norm(c.category_name) === name)) return { category_name: "A category with this name already exists." };
  return {};
}

export function isCategoryDirty(d: CategoryDraft, row: CategoryRow | null): boolean {
  const base = categoryDraftFrom(row);
  const ids = (x: number[]) => [...x].sort((a, b) => a - b).join(",");
  return d.category_name.trim() !== base.category_name || d.scope !== base.scope || ids(d.site_ids) !== ids(base.site_ids) || d.assign_all_sites;
}

/** "Assign to all sites" sends every site id on edit (the API only knows the flag on create). */
export function categoryPayload(d: CategoryDraft, allSiteIds: number[]) {
  const site_ids = d.assign_all_sites ? [...allSiteIds] : [...d.site_ids];
  return { category_name: d.category_name.trim(), scope: scopeValue(d.scope), site_ids: site_ids.sort((a, b) => a - b), assign_all_sites: d.assign_all_sites };
}

/** Sites a save would take the category off (their data is kept, people lose the category). */
export function removedSites(d: CategoryDraft, row: CategoryRow | null): number[] {
  if (!row || d.assign_all_sites) return [];
  return row.siteIds.filter((id) => !d.site_ids.includes(id));
}

/** What on this page still uses the category (the server also checks mappings, invoices and user grants). */
export function categoryUsage(row: CategoryRow): string[] {
  const parts: [number | null, string, string][] = [
    [row.siteIds.length, "site", "sites"],
    [row.entries, "entry", "entries"],
    [row.factors, "emission factor", "emission factors"],
    [row.configs, "column config", "column configs"],
    [row.units, "unit", "units"],
  ];
  return parts.filter(([n]) => !!n).map(([n, one, many]) => plural(n as number, one, many));
}

export function categoryDeleteBlock(row: CategoryRow): string | null {
  // Without the server's counts there is no way to tell it is unused.
  if (row.factors === null || row.configs === null || row.units === null || row.entries === null)
    return `Couldn't check what uses ${row.category_name}, so it can't be deleted right now. Reload the page and try again.`;
  const used = categoryUsage(row);
  if (!used.length) return null;
  return `${row.category_name} is still in use (${used.join(", ")}). Take it off its sites and remove its data first.`;
}

// ── Sites (checkbox list in the category drawer) ────────────────────────────

export type SiteGroup = { key: string; label: string; sites: Site[] };

/** Sites grouped by client, both sorted by name; sites without a client go last. */
export function groupSitesByClient(sites: Site[], q = ""): SiteGroup[] {
  const t = norm(q);
  const groups = new Map<string, SiteGroup>();
  for (const s of sites) {
    if (t && !norm(s.name).includes(t) && !norm(s.company?.name).includes(t)) continue;
    const key = s.company ? String(s.company.company_id) : "none";
    const g = groups.get(key) ?? { key, label: s.company?.name ?? "No client", sites: [] };
    g.sites.push(s);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, sites: [...g.sites].sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => (a.key === "none" ? 1 : b.key === "none" ? -1 : a.label.localeCompare(b.label)));
}

/** Selected ids after ticking or unticking several at once. */
export function setMany(selected: number[], ids: number[], on: boolean): number[] {
  const kept = on ? selected : selected.filter((id) => !ids.includes(id));
  return [...new Set(on ? [...kept, ...ids] : kept)].sort((a, b) => a - b);
}

// ── Units ───────────────────────────────────────────────────────────────────

export type UnitRow = Unit & { siteName: string; categoryName: string; entries: number | null };

export function unitRows(units: Unit[], sites?: Site[], categories?: Category[]): UnitRow[] {
  const siteName = new Map((sites ?? []).map((s) => [s.site_id, s.name]));
  const catName = new Map((categories ?? []).map((c) => [c.category_id, c.category_name]));
  return units.map((u) => ({
    ...u,
    siteName: u.site?.name ?? siteName.get(u.site?.site_id ?? -1) ?? "",
    categoryName: u.category?.category_name ?? catName.get(u.category?.category_id ?? -1) ?? "",
    entries: count(u.entry_count),
  }));
}

export function matchesUnit(row: UnitRow, f: { q: string; siteIds: number[]; categoryId: number | null }): boolean {
  if (f.siteIds.length && !f.siteIds.includes(row.site?.site_id ?? -1)) return false;
  if (f.categoryId && row.category?.category_id !== f.categoryId) return false;
  const t = norm(f.q);
  return !t || [row.unit_name, row.description, row.siteName, row.categoryName].some((v) => norm(v).includes(t));
}

export type UnitDraft = { site_id: number | null; category_id: number | null; unit_name: string; description: string };
export type UnitField = keyof UnitDraft;

export function unitDraftFrom(u: Unit | null, defaults: { siteId?: number | null; categoryId?: number | null } = {}): UnitDraft {
  return {
    site_id: u?.site?.site_id ?? defaults.siteId ?? null,
    category_id: u?.category?.category_id ?? defaults.categoryId ?? null,
    unit_name: u?.unit_name ?? "",
    description: u?.description ?? "",
  };
}

/** Categories a site reports; a unit can only sit on one of these. */
export function siteCategories(site: Site | undefined): { category_id: number; category_name: string }[] {
  return [...(site?.categories ?? [])].sort((a, b) => a.category_name.localeCompare(b.category_name));
}

export function validateUnit(d: UnitDraft, others: Unit[], site: Site | undefined): Partial<Record<UnitField, string>> {
  const e: Partial<Record<UnitField, string>> = {};
  if (!d.site_id) e.site_id = "Choose a site.";
  if (!d.category_id) e.category_id = "Choose a category.";
  else if (site?.categories && !site.categories.some((c) => c.category_id === d.category_id)) e.category_id = "This site doesn't report that category.";
  const name = norm(d.unit_name);
  if (!name) e.unit_name = "Enter a unit name.";
  else if (others.some((u) => u.site?.site_id === d.site_id && u.category?.category_id === d.category_id && norm(u.unit_name) === name))
    e.unit_name = "This site already has that unit for the category.";
  return e;
}

export function isUnitDirty(d: UnitDraft, u: Unit | null): boolean {
  if (!u) return !!(d.unit_name.trim() || d.description.trim());
  const b = unitDraftFrom(u);
  return d.site_id !== b.site_id || d.category_id !== b.category_id || d.unit_name.trim() !== b.unit_name || d.description.trim() !== b.description.trim();
}

export function unitPayload(d: UnitDraft) {
  return { unit_name: d.unit_name.trim(), description: d.description.trim(), site_id: d.site_id as number, category_id: d.category_id as number };
}
