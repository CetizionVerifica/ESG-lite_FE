// P17 Clients: pure logic (rows, filters, edit draft, delete rules). No React here.

/** A row of GET /admin/companies (the Company entity as stored). */
export type Company = {
  company_id: number;
  name: string;
  address?: string | null;
  contact_person?: string | null;
  email?: string | null;
  phone_number?: string | null;
  industry?: string | null;
  region?: string | null;
  employee_range?: string | null;
  cin_number?: string | null;
  /** true = active. */
  status?: boolean | null;
  subscription_id?: string | null;
  isEmailVerified?: boolean | null;
  esgMitraAccess?: boolean | null;
};
export type Site = { site_id: number; name: string; address?: string | null; company?: { company_id: number } | null; country?: { name: string } | null };
export type AdminUser = {
  user_id: number;
  name?: string | null;
  last_name?: string | null;
  email: string;
  role: string;
  /** The one site a data-entry user (or company admin) belongs to. */
  site?: { site_id: number } | null;
  /** Sites a manager looks after. */
  sites?: { site_id: number }[] | null;
};
export type BrandSwatch = { primary: string; accent: string; logoUrl: string | null };

export const EMPLOYEE_RANGES = ["1-10", "11-50", "51-200", "201-500", "500+"] as const;

export type ClientRow = Company & {
  active: boolean;
  sites: Site[];
  users: AdminUser[];
};

export function isActive(c: Pick<Company, "status">): boolean {
  // Missing means the column default (active).
  return c.status !== false;
}

export function personName(u: AdminUser): string {
  const full = [u.name, u.last_name].filter(Boolean).join(" ").trim();
  return full || u.email;
}

/**
 * Joins companies with their sites and people. A person counts for a client
 * when their own site or any site they manage belongs to it (once each).
 */
export function buildRows(companies: Company[], sites: Site[] = [], users: AdminUser[] = []): ClientRow[] {
  const companyOfSite = new Map<number, number>();
  const sitesBy = new Map<number, Site[]>();
  for (const s of sites) {
    const cid = s.company?.company_id;
    if (!cid) continue;
    companyOfSite.set(s.site_id, cid);
    sitesBy.set(cid, [...(sitesBy.get(cid) ?? []), s]);
  }
  const usersBy = new Map<number, AdminUser[]>();
  for (const u of users) {
    const ids = new Set<number>();
    for (const sid of [u.site?.site_id, ...(u.sites ?? []).map((s) => s.site_id)]) {
      const cid = sid ? companyOfSite.get(sid) : undefined;
      if (cid) ids.add(cid);
    }
    for (const cid of ids) usersBy.set(cid, [...(usersBy.get(cid) ?? []), u]);
  }
  return companies.map((c) => ({
    ...c,
    active: isActive(c),
    sites: sitesBy.get(c.company_id) ?? [],
    users: usersBy.get(c.company_id) ?? [],
  }));
}

export type StatusFilter = "active" | "inactive";
export type ClientFilters = { q: string; status: StatusFilter[]; industries: string[]; regions: string[] };

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export function matchesFilters(r: ClientRow, f: ClientFilters): boolean {
  const q = norm(f.q);
  if (q && ![r.name, r.contact_person, r.email, r.industry, r.region, r.cin_number].some((v) => norm(v).includes(q))) return false;
  if (f.status.length && !f.status.includes(r.active ? "active" : "inactive")) return false;
  if (f.industries.length && !f.industries.some((i) => norm(i) === norm(r.industry))) return false;
  if (f.regions.length && !f.regions.some((i) => norm(i) === norm(r.region))) return false;
  return true;
}

/** Distinct non-empty values (first spelling wins), sorted. Feeds the Industry / Region filters. */
export function distinctValues(values: (string | null | undefined)[]): string[] {
  const seen = new Map<string, string>();
  for (const v of values) {
    const t = (v ?? "").trim();
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

// ---- Overview edit ----

export type CompanyDraft = {
  name: string;
  address: string;
  contact_person: string;
  email: string;
  phone_number: string;
  industry: string;
  region: string;
  employee_range: string;
  cin_number: string;
  esgMitraAccess: boolean;
};
export type DraftField = keyof CompanyDraft;

export function draftFrom(c: Company): CompanyDraft {
  return {
    name: c.name ?? "",
    address: c.address ?? "",
    contact_person: c.contact_person ?? "",
    email: c.email ?? "",
    phone_number: c.phone_number ?? "",
    industry: c.industry ?? "",
    region: c.region ?? "",
    employee_range: c.employee_range ?? "",
    cin_number: c.cin_number ?? "",
    esgMitraAccess: !!c.esgMitraAccess,
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validate(d: CompanyDraft): Partial<Record<DraftField, string>> {
  const e: Partial<Record<DraftField, string>> = {};
  if (!d.name.trim()) e.name = "Enter the client's name.";
  if (!d.address.trim()) e.address = "Enter an address.";
  if (!d.contact_person.trim()) e.contact_person = "Enter a contact person.";
  if (d.email.trim() && !EMAIL.test(d.email.trim())) e.email = "Enter a valid email address.";
  return e;
}

export function isDirty(d: CompanyDraft, c: Company): boolean {
  const base = draftFrom(c);
  return (Object.keys(base) as DraftField[]).some((k) => (typeof d[k] === "string" ? (d[k] as string).trim() : d[k]) !== base[k]);
}

/** PUT body: trimmed strings, empty optional fields sent as null. */
export function toPayload(d: CompanyDraft): Record<string, string | boolean | null> {
  const opt = (v: string) => v.trim() || null;
  return {
    name: d.name.trim(),
    address: d.address.trim(),
    contact_person: d.contact_person.trim(),
    email: opt(d.email),
    phone_number: opt(d.phone_number),
    industry: opt(d.industry),
    region: opt(d.region),
    employee_range: opt(d.employee_range),
    cin_number: opt(d.cin_number),
    esgMitraAccess: d.esgMitraAccess,
  };
}

// ---- Delete ----

/**
 * The backend deletes a company row only; its sites reference it without a
 * cascade, so a client that still has sites can't be deleted (the server
 * would refuse). Returns why, or null when delete is allowed.
 */
export function deleteBlocker(r: Pick<ClientRow, "sites">): string | null {
  const n = r.sites.length;
  return n ? `Remove its ${n} ${n === 1 ? "site" : "sites"} first, or deactivate the client instead.` : null;
}

/** What goes with the company (cascades in the database). */
export function cascadeItems(hasThreshold: boolean): string[] {
  return hasThreshold ? ["Its approval threshold value"] : [];
}

// ---- Threshold ----

/** The backend accepts 2–5 % (threshold.controller MIN/MAX_THRESHOLD). */
export const THRESHOLD_MIN = 2;
export const THRESHOLD_MAX = 5;

/** Threshold input → number in 2–5 with at most 2 decimals, or an error message. */
export function parseThreshold(raw: string): { value: number } | { error: string } {
  const t = raw.trim();
  if (!t) return { error: "Enter a percentage." };
  const n = Number(t);
  if (!Number.isFinite(n) || n < THRESHOLD_MIN || n > THRESHOLD_MAX) return { error: `Enter a number from ${THRESHOLD_MIN} to ${THRESHOLD_MAX}.` };
  if (Math.round(n * 100) !== n * 100) return { error: "Use at most 2 decimals." };
  return { value: n };
}
