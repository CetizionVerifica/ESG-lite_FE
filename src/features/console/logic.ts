import { buildTheme, contrastReport, packFromBrand } from "../../theme";
import type { Brand } from "../../services/brandService";

// Shapes of the admin list endpoints, trimmed to what the Console reads.
export interface ConsoleCompany {
  company_id: number;
  name: string;
  status?: boolean;
}
export interface ConsoleSite {
  site_id: number;
  name: string;
  company?: { company_id: number; name?: string } | null;
  categories?: { category_id: number; category_name: string }[] | null;
}
export interface ConsoleUser {
  user_id: number;
  role?: string;
  site?: { site_id: number } | null;
  sites?: { site_id: number }[] | null;
}
export interface SiteCategoryRef {
  site?: { site_id: number } | null;
  category?: { category_id: number } | null;
}
export interface ConsoleThreshold {
  company?: { company_id: number } | null;
}
export interface FactorBatch {
  upload_batch_id: string;
  count: number;
  uploaded_at: string;
  site_id: number;
  site_name: string;
  category_id: number;
  category_name: string;
}

/** Latest factor year per site; `null` = the site has no factors, missing key = not known. */
export type FactorYears = Map<number, number | null>;
/** Brand per company; missing key = not known (still loading or failed). */
export type Brands = Map<number, Brand>;

export type CheckId = "sites" | "categories" | "configs" | "factors" | "units" | "threshold" | "brand";

export const CHECK_LABELS: Record<CheckId, string> = {
  sites: "Sites exist",
  categories: "Each site has categories",
  configs: "Each site × category has a column config",
  factors: "Factors exist for last year",
  units: "Units exist",
  threshold: "Threshold set",
  brand: "Brand theme set",
};

export interface Gap {
  clientId: number;
  clientName: string;
  /** Site name for site-level gaps, else the client name. */
  subject: string;
  text: string;
  href: string;
  check: CheckId;
}

export interface Check {
  id: CheckId;
  /** null = couldn't be checked (data missing or failed to load). */
  ok: boolean | null;
}

export interface ClientRow {
  id: number;
  name: string;
  active: boolean;
  sites: number;
  users: number;
  checks: Check[];
  /** 0–1 over the checks that could run; null if none could. */
  completeness: number | null;
  gaps: Gap[];
  brand: Brand | undefined;
}

export interface ConsoleData {
  companies: ConsoleCompany[];
  sites: ConsoleSite[];
  users: ConsoleUser[];
  configs: SiteCategoryRef[];
  units: SiteCategoryRef[];
  thresholds: ConsoleThreshold[];
  factorYears: FactorYears;
  brands: Brands;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Every company id a user belongs to, through their own site or the sites they manage. */
function userCompanies(u: ConsoleUser, companyOfSite: Map<number, number>): Set<number> {
  const out = new Set<number>();
  for (const s of [u.site, ...(u.sites ?? [])]) {
    const c = s ? companyOfSite.get(s.site_id) : undefined;
    if (c !== undefined) out.add(c);
  }
  return out;
}

/**
 * Brand check: a saved brand row with both logos whose colours pass AA in
 * every look. Returns the first problem, or null when it passes.
 */
export function brandProblem(brand: Brand): string | null {
  if (!brand.updatedAt) return "no brand theme set";
  if (!brand.logoUrl) return "no logo";
  if (!brand.logoOnDarkUrl) return "no logo on dark";
  const pack = packFromBrand(brand);
  const looks = [buildTheme(pack, "classic", "light"), buildTheme(pack, "light", "light"), buildTheme(pack, "classic", "dark")];
  const fails = looks.some((t) => contrastReport(t).some((p) => p.ratio < p.min));
  return fails ? "theme fails contrast" : null;
}

/**
 * Setup completeness per client (P16 spec): sites exist · each site has
 * categories · each site×category has a ColumnConfig · factors exist for last
 * year · units exist · threshold set · brand theme set. "Products exist (if
 * intensity used)" is left out: nothing tells us whether a client uses
 * intensity.
 */
export function buildClientRows(d: ConsoleData, year = new Date().getFullYear()): ClientRow[] {
  const lastYear = year - 1;
  const companyOfSite = new Map<number, number>();
  for (const s of d.sites) if (s.company) companyOfSite.set(s.site_id, s.company.company_id);

  const configKeys = new Set(d.configs.map((c) => `${c.site?.site_id}:${c.category?.category_id}`));
  const unitSites = new Set(d.units.map((u) => u.site?.site_id).filter((id): id is number => id !== undefined));
  const thresholdCompanies = new Set(d.thresholds.map((t) => t.company?.company_id));

  const userCount = new Map<number, number>();
  for (const u of d.users) {
    if (u.role === "Superadmin") continue;
    for (const c of userCompanies(u, companyOfSite)) userCount.set(c, (userCount.get(c) ?? 0) + 1);
  }

  return d.companies.map((co) => {
    const sites = d.sites.filter((s) => s.company?.company_id === co.company_id);
    const gaps: Gap[] = [];
    const gap = (check: CheckId, subject: string, text: string, href: string) =>
      gaps.push({ clientId: co.company_id, clientName: co.name, subject, text, href, check });

    const hasSites = sites.length > 0;
    if (!hasSites) gap("sites", co.name, "no sites yet", "/setup/sites");

    let categoriesOk = hasSites;
    let configsOk = hasSites;
    let unitsOk = hasSites;
    let factorsOk: boolean | null = hasSites;
    for (const s of sites) {
      const cats = s.categories ?? [];
      if (cats.length === 0) {
        categoriesOk = false;
        gap("categories", s.name, "no categories enabled", "/setup/sites");
      }
      const missing = cats.filter((c) => !configKeys.has(`${s.site_id}:${c.category_id}`)).length;
      if (missing > 0) {
        configsOk = false;
        gap("configs", s.name, `${plural(missing, "category has", "categories have")} no column config`, `/capture/forms?site=${s.site_id}`);
      }
      if (cats.length > 0 && !unitSites.has(s.site_id)) {
        unitsOk = false;
        gap("units", s.name, "no units set up", "/setup/reference");
      }
      if (!d.factorYears.has(s.site_id)) {
        if (factorsOk) factorsOk = null;
      } else {
        const latest = d.factorYears.get(s.site_id);
        if (latest === null || latest === undefined || latest < lastYear) {
          factorsOk = false;
          gap("factors", s.name, latest ? `latest factors are for ${latest}` : "no emission factors", "/factors");
        }
      }
    }

    const thresholdOk = thresholdCompanies.has(co.company_id);
    if (!thresholdOk) gap("threshold", co.name, "no threshold set", "/factors/thresholds");

    const brand = d.brands.get(co.company_id);
    let brandOk: boolean | null = null;
    if (brand) {
      const problem = brandProblem(brand);
      brandOk = problem === null;
      if (problem) gap("brand", co.name, problem, `/clients/${co.company_id}/brand`);
    }

    const checks: Check[] = [
      { id: "sites", ok: hasSites },
      { id: "categories", ok: categoriesOk },
      { id: "configs", ok: configsOk },
      { id: "factors", ok: factorsOk },
      { id: "units", ok: unitsOk },
      { id: "threshold", ok: thresholdOk },
      { id: "brand", ok: brandOk },
    ];
    const known = checks.filter((c) => c.ok !== null);
    return {
      id: co.company_id,
      name: co.name,
      active: co.status !== false,
      sites: sites.length,
      users: userCount.get(co.company_id) ?? 0,
      checks,
      completeness: known.length ? known.filter((c) => c.ok).length / known.length : null,
      gaps,
      brand,
    };
  });
}

/** Completeness as a whole percent, or null when no check could run. */
export const setupPercent = (r: ClientRow): number | null => (r.completeness === null ? null : Math.round(r.completeness * 100));

/** Gaps for the side panel: active clients only, least complete client first. */
export function setupGaps(rows: ClientRow[]): Gap[] {
  return rows
    .filter((r) => r.active)
    .sort((a, b) => (a.completeness ?? 1) - (b.completeness ?? 1) || a.name.localeCompare(b.name))
    .flatMap((r) => r.gaps);
}

export interface Activity {
  id: string;
  when: string;
  title: string;
  detail: string;
}

/** Recent factor uploads, newest first, with the client each site belongs to. */
export function recentActivity(batches: FactorBatch[], sites: ConsoleSite[], limit = 8): Activity[] {
  const clientOf = new Map(sites.map((s) => [s.site_id, s.company?.name]));
  return [...batches]
    .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())
    .slice(0, limit)
    .map((b) => ({
      id: b.upload_batch_id,
      when: b.uploaded_at,
      title: `Factor upload · ${plural(b.count, "factor")}`,
      detail: [clientOf.get(b.site_id), b.site_name, b.category_name].filter(Boolean).join(" · "),
    }));
}
