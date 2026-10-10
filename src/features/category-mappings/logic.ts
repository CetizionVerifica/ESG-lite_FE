// P23 Category mappings: pure logic (rows, factor match, filters, form draft, import preview). No React here.

export type Company = { company_id: number; name: string };
export type Category = { category_id: number; category_name: string };
export type Site = { site_id: number; name: string; company?: Company | null };

export type Mapping = {
  id: number;
  company_id: number;
  company_name: string;
  site_id: number | null;
  category_id: number;
  company_category_name: string;
  global_category_name: string;
  created_at?: string;
  updated_at?: string;
};

/** One emission factor, as GET /admin/emission-factors/category/:id returns it. */
export type Factor = {
  emission_factor_id: number;
  year: number;
  factor_value: number | string;
  denominator_unit?: string | null;
  emission_category_name?: string | null;
  site?: { site_id: number; name?: string } | null;
};

/** Factors by category id; a category whose factors haven't loaded is missing. */
export type FactorIndex = Map<number, Factor[]>;

export type Match =
  | { state: "matched"; factor: Factor }
  | { state: "missing" }
  /** Factors for the category are still loading or failed. */
  | { state: "unknown" };

export type MappingRow = Mapping & {
  clientName: string;
  categoryName: string;
  /** "All sites" for a company-wide mapping. */
  siteName: string;
  match: Match;
};

export const ALL_SITES = "All sites";

const norm = (s: string | null | undefined) => (s ?? "").trim();
const lower = (s: string | null | undefined) => norm(s).toLowerCase();

/** Site ids that belong to a client. */
export function clientSiteIds(sites: Site[], companyId: number): Set<number> {
  return new Set(sites.filter((s) => s.company?.company_id === companyId).map((s) => s.site_id));
}

/**
 * The factor an entry would pick for this global name: the newest year at the
 * mapping's site, or at any of the client's sites for a company-wide mapping.
 * Names compare exactly (trimmed), as the entry form and the backend do.
 */
export function findFactor(
  index: FactorIndex,
  m: Pick<Mapping, "category_id" | "company_id" | "site_id" | "global_category_name">,
  sites: Site[],
): Match {
  const factors = index.get(m.category_id);
  if (!factors) return { state: "unknown" };
  const name = norm(m.global_category_name);
  if (!name) return { state: "missing" };
  const allowed = m.site_id !== null ? new Set([m.site_id]) : clientSiteIds(sites, m.company_id);
  let best: Factor | null = null;
  for (const f of factors) {
    if (norm(f.emission_category_name) !== name) continue;
    if (!f.site || !allowed.has(f.site.site_id)) continue;
    if (!best || f.year > best.year) best = f;
  }
  return best ? { state: "matched", factor: best } : { state: "missing" };
}

export function buildRows(mappings: Mapping[], ctx: { companies: Company[]; categories: Category[]; sites: Site[]; factors: FactorIndex }): MappingRow[] {
  const company = new Map(ctx.companies.map((c) => [c.company_id, c.name]));
  const category = new Map(ctx.categories.map((c) => [c.category_id, c.category_name]));
  const site = new Map(ctx.sites.map((s) => [s.site_id, s.name]));
  return mappings.map((m) => ({
    ...m,
    clientName: company.get(m.company_id) ?? m.company_name,
    categoryName: category.get(m.category_id) ?? `Category ${m.category_id}`,
    siteName: m.site_id === null ? ALL_SITES : (site.get(m.site_id) ?? `Site ${m.site_id}`),
    match: findFactor(ctx.factors, m, ctx.sites),
  }));
}

/** Site filter value for company-wide mappings. */
export const COMPANY_WIDE = "all";

export type MappingFilters = { q: string; clientIds: number[]; categoryIds: number[]; sites: string[]; match: string[] };

export function matchesFilters(r: MappingRow, f: MappingFilters): boolean {
  if (f.clientIds.length && !f.clientIds.includes(r.company_id)) return false;
  if (f.categoryIds.length && !f.categoryIds.includes(r.category_id)) return false;
  if (f.sites.length && !f.sites.includes(r.site_id === null ? COMPANY_WIDE : String(r.site_id))) return false;
  if (f.match.length && !f.match.includes(r.match.state)) return false;
  const q = lower(f.q);
  if (!q) return true;
  return [r.company_category_name, r.global_category_name, r.clientName, r.categoryName, r.siteName].some((v) => v.toLowerCase().includes(q));
}

export const toIds = (values: string[] | undefined): number[] => (values ?? []).map(Number).filter((n) => Number.isFinite(n) && n > 0);

/** Categories that need their factors loaded to show matches. */
export const categoriesInUse = (mappings: Pick<Mapping, "category_id">[], extra: (number | null)[] = []): number[] =>
  [...new Set([...mappings.map((m) => m.category_id), ...extra.filter((c): c is number => c !== null)])].sort((a, b) => a - b);

/** Factor names one category offers at the chosen scope, for the global-name picker. */
export function factorNames(index: FactorIndex, categoryId: number | null, scopeSites: Set<number> | null): string[] {
  if (categoryId === null) return [];
  const names = new Set<string>();
  for (const f of index.get(categoryId) ?? []) {
    const n = norm(f.emission_category_name);
    if (!n) continue;
    if (scopeSites && (!f.site || !scopeSites.has(f.site.site_id))) continue;
    names.add(n);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** P22 link prefilled with the mapping's client, site and category, searching for the global name. */
export function createFactorHref(r: Pick<Mapping, "company_id" | "site_id" | "category_id" | "global_category_name">): string {
  const p = new URLSearchParams({ client: String(r.company_id), category: String(r.category_id), q: r.global_category_name });
  if (r.site_id !== null) p.set("site", String(r.site_id));
  return `/factors?${p.toString()}`;
}

export function formatFactor(f: Factor): string {
  const value = Number(f.factor_value);
  const shown = Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 6 }) : String(f.factor_value);
  return `${shown} kgCO₂e${f.denominator_unit ? ` / ${f.denominator_unit}` : ""} · ${f.year}`;
}

// ---------- Form draft ----------

export type MappingDraft = {
  company_id: number | null;
  category_id: number | null;
  site_id: number | null;
  company_category_name: string;
  global_category_name: string;
};

export type DraftField = keyof MappingDraft;

export function emptyDraft(defaults: Partial<MappingDraft> = {}): MappingDraft {
  return { company_id: null, category_id: null, site_id: null, company_category_name: "", global_category_name: "", ...defaults };
}

export function draftFrom(m: Mapping): MappingDraft {
  return {
    company_id: m.company_id,
    category_id: m.category_id,
    site_id: m.site_id,
    company_category_name: m.company_category_name,
    global_category_name: m.global_category_name,
  };
}

/** Same client, site, category and client's name (case-blind): the backend allows one. */
export function findDuplicate(d: MappingDraft, all: Mapping[], selfId: number | null): Mapping | null {
  const name = lower(d.company_category_name);
  if (!name) return null;
  return (
    all.find(
      (m) =>
        m.id !== selfId &&
        m.company_id === d.company_id &&
        m.category_id === d.category_id &&
        (m.site_id ?? null) === d.site_id &&
        lower(m.company_category_name) === name,
    ) ?? null
  );
}

export function validate(d: MappingDraft, all: Mapping[], selfId: number | null): Partial<Record<DraftField, string>> {
  const e: Partial<Record<DraftField, string>> = {};
  if (d.company_id === null) e.company_id = "Choose the client.";
  if (d.category_id === null) e.category_id = "Choose a category.";
  if (!norm(d.company_category_name)) e.company_category_name = "Enter the name this client uses.";
  if (!norm(d.global_category_name)) e.global_category_name = "Choose the factor name it means.";
  if (!e.company_category_name && findDuplicate(d, all, selfId)) {
    e.company_category_name = `This client already maps “${norm(d.company_category_name)}” for this category and site.`;
  }
  return e;
}

export function isDirty(d: MappingDraft, row: Mapping | null, base: MappingDraft): boolean {
  const from = row ? draftFrom(row) : base;
  return (
    d.company_id !== from.company_id ||
    d.category_id !== from.category_id ||
    d.site_id !== from.site_id ||
    norm(d.company_category_name) !== norm(from.company_category_name) ||
    norm(d.global_category_name) !== norm(from.global_category_name)
  );
}

export type CreatePayload = {
  company_id: number;
  company_name: string;
  site_id: number | null;
  category_id: number;
  company_category_name: string;
  global_category_name: string;
  created_by?: number | null;
};

export type UpdatePayload = Partial<Pick<Mapping, "company_category_name" | "global_category_name" | "site_id">>;

export function createPayload(d: MappingDraft, companyName: string, userId: number | null): CreatePayload {
  return {
    company_id: d.company_id as number,
    company_name: companyName,
    site_id: d.site_id,
    category_id: d.category_id as number,
    company_category_name: norm(d.company_category_name),
    global_category_name: norm(d.global_category_name),
    created_by: userId,
  };
}

/** Only what changed: client and category can't change on an existing mapping. */
export function updatePayload(d: MappingDraft, row: Mapping): UpdatePayload {
  const p: UpdatePayload = {};
  if (norm(d.company_category_name) !== row.company_category_name) p.company_category_name = norm(d.company_category_name);
  if (norm(d.global_category_name) !== row.global_category_name) p.global_category_name = norm(d.global_category_name);
  if (d.site_id !== (row.site_id ?? null)) p.site_id = d.site_id;
  return p;
}

// ---------- Import ----------

export type ParsedRow = { company_category_name: string; global_category_name: string; factor_value?: number | null; unit?: string | null };

export type ImportRow = {
  key: number;
  company_category_name: string;
  global_category_name: string;
  include: boolean;
  /** The sheet's own factor value and unit, for reference. */
  sheetFactor: string | null;
};

export type ImportTarget = { company_id: number | null; category_id: number | null; site_id: number | null };

export function importRows(parsed: ParsedRow[]): ImportRow[] {
  return parsed.map((p, i) => ({
    key: i,
    company_category_name: norm(p.company_category_name),
    global_category_name: norm(p.global_category_name),
    include: !!norm(p.company_category_name) && !!norm(p.global_category_name),
    sheetFactor: p.factor_value !== null && p.factor_value !== undefined ? `${p.factor_value}${p.unit ? ` / ${p.unit}` : ""}` : null,
  }));
}

export type ImportCheck = { match: Match; problem: string | null };

/**
 * Per row: whether the global name has a factor, and why the row can't be
 * saved (empty names, already mapped, or repeated in the sheet).
 */
export function checkImport(rows: ImportRow[], target: ImportTarget, existing: Mapping[], index: FactorIndex, sites: Site[]): Map<number, ImportCheck> {
  const out = new Map<number, ImportCheck>();
  const seen = new Map<string, number>();
  for (const r of rows) {
    const match =
      target.category_id === null || target.company_id === null
        ? ({ state: "unknown" } as Match)
        : findFactor(index, { category_id: target.category_id, company_id: target.company_id, site_id: target.site_id, global_category_name: r.global_category_name }, sites);
    let problem: string | null = null;
    if (!r.company_category_name || !r.global_category_name) problem = "Both names are needed.";
    else if (findDuplicate({ ...target, company_category_name: r.company_category_name, global_category_name: r.global_category_name }, existing, null)) problem = "Already mapped";
    else if (r.include) {
      const k = lower(r.company_category_name);
      if (seen.has(k)) problem = `Repeats row ${(seen.get(k) as number) + 1}`;
      else seen.set(k, r.key);
    }
    out.set(r.key, { match, problem });
  }
  return out;
}

export type ImportSummary = { included: number; matched: number; missing: number; blocked: number };

export function summarizeImport(rows: ImportRow[], checks: Map<number, ImportCheck>): ImportSummary {
  const s: ImportSummary = { included: 0, matched: 0, missing: 0, blocked: 0 };
  for (const r of rows) {
    if (!r.include) continue;
    const c = checks.get(r.key);
    if (c?.problem) {
      s.blocked++;
      continue;
    }
    s.included++;
    if (c?.match.state === "matched") s.matched++;
    else if (c?.match.state === "missing") s.missing++;
  }
  return s;
}

/** Rows to send: included and with no problem. */
export function importPayloads(rows: ImportRow[], checks: Map<number, ImportCheck>, target: ImportTarget, companyName: string, userId: number | null): CreatePayload[] {
  if (target.company_id === null || target.category_id === null) return [];
  return rows
    .filter((r) => r.include && !checks.get(r.key)?.problem)
    .map((r) => createPayload({ ...target, company_category_name: r.company_category_name, global_category_name: r.global_category_name }, companyName, userId));
}
