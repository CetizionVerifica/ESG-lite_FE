// P20 Users (all clients): pure logic (rows, filters, form draft, role rules). No React here.

export type Company = { company_id: number; name: string };
export type Category = { category_id: number; category_name: string; scope?: string | null };
export type Site = {
  site_id: number;
  name: string;
  company?: Company | null;
  categories?: Category[] | null;
};

export const ROLES = ["Superadmin", "Admin", "Manager", "User"] as const;
export type Role = (typeof ROLES)[number];

export type User = {
  user_id: number;
  name?: string | null;
  last_name?: string | null;
  phone_number?: string | null;
  email: string;
  role: string;
  timezone?: string | null;
  /** The one site of an Admin, or of a User created before multi-site. */
  site?: Site | null;
  /** Sites of a Manager or User. */
  sites?: Site[] | null;
  categories?: Category[] | null;
  /** Missing (not null) when the backend doesn't report it yet. */
  last_login_at?: string | null;
};

export type UserRow = User & {
  displayName: string;
  siteList: Site[];
  clients: Company[];
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Manager and User work on several sites; Admin has exactly one; Superadmin none. */
export const multiSite = (role: Role | null) => role === "Manager" || role === "User";

export function personName(u: Pick<User, "name" | "last_name" | "email">): string {
  const full = [u.name, u.last_name].filter(Boolean).join(" ").trim();
  return full || u.email;
}

/**
 * One row per person. Sites are completed from the sites list, so the client
 * and categories show even when the users endpoint only sends site ids.
 */
export function buildRows(users: User[], sites: Site[] = []): UserRow[] {
  const byId = new Map(sites.map((s) => [s.site_id, s]));
  return users.map((u) => {
    const raw = [...(u.sites ?? []), ...(u.site ? [u.site] : [])];
    const seen = new Set<number>();
    const siteList: Site[] = [];
    for (const s of raw) {
      if (seen.has(s.site_id)) continue;
      seen.add(s.site_id);
      const full = byId.get(s.site_id);
      siteList.push({ ...full, ...s, company: s.company ?? full?.company ?? null, categories: full?.categories ?? s.categories ?? null, name: s.name ?? full?.name ?? "" });
    }
    siteList.sort((a, b) => a.name.localeCompare(b.name));
    const clients: Company[] = [];
    for (const s of siteList) {
      if (s.company && !clients.some((c) => c.company_id === s.company!.company_id)) clients.push(s.company);
    }
    return { ...u, displayName: personName(u), siteList, clients };
  });
}

export type UserFilters = { q: string; clientIds: number[]; roles: string[]; siteIds: number[] };

export function matchesFilters(row: UserRow, f: UserFilters): boolean {
  if (f.roles.length && !f.roles.includes(row.role)) return false;
  if (f.clientIds.length && !row.clients.some((c) => f.clientIds.includes(c.company_id))) return false;
  if (f.siteIds.length && !row.siteList.some((s) => f.siteIds.includes(s.site_id))) return false;
  const q = f.q.trim().toLowerCase();
  if (!q) return true;
  return [row.displayName, row.email, row.phone_number, row.role, ...row.clients.map((c) => c.name), ...row.siteList.map((s) => s.name)]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(q));
}

export const toIds = (values: string[] | undefined): number[] => (values ?? []).map(Number).filter((n) => Number.isFinite(n) && n > 0);

/** "Never" for someone who hasn't signed in; null when the backend doesn't report it. */
export function lastActive(row: Pick<User, "last_login_at">): string | null | "never" {
  if (row.last_login_at === undefined) return null;
  return row.last_login_at ?? "never";
}

// ---------- Form draft ----------

export type UserDraft = {
  name: string;
  last_name: string;
  email: string;
  phone_number: string;
  role: Role | null;
  company_id: number | null;
  site_ids: number[];
  category_ids: number[];
  timezone: string | null;
};

export type DraftField = "email" | "role" | "company_id" | "site_ids" | "category_ids" | "timezone";

export function emptyDraft(defaultCompanyId: number | null = null): UserDraft {
  return { name: "", last_name: "", email: "", phone_number: "", role: null, company_id: defaultCompanyId, site_ids: [], category_ids: [], timezone: null };
}

export function draftFrom(row: UserRow): UserDraft {
  const role = isRole(row.role) ? row.role : null;
  return {
    name: row.name ?? "",
    last_name: row.last_name ?? "",
    email: row.email,
    phone_number: row.phone_number ?? "",
    role,
    company_id: row.clients[0]?.company_id ?? null,
    site_ids: row.siteList.map((s) => s.site_id),
    category_ids: (row.categories ?? []).map((c) => c.category_id).sort((a, b) => a - b),
    timezone: row.timezone ?? null,
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validate(d: UserDraft): Partial<Record<DraftField, string>> {
  const e: Partial<Record<DraftField, string>> = {};
  if (!d.email.trim()) e.email = "Enter an email address.";
  else if (!EMAIL.test(d.email.trim())) e.email = "Enter a valid email address, like name@company.com.";
  if (!d.role) e.role = "Choose a role.";
  if (d.role && d.role !== "Superadmin" && d.company_id === null) e.company_id = "Choose the client this person works for.";
  if (multiSite(d.role) && d.site_ids.length === 0) e.site_ids = "Choose at least one site.";
  // Users have no client link of their own: an Admin's client is their site's.
  if (d.role === "Admin" && d.company_id !== null && d.site_ids.length === 0) e.site_ids = "Choose the site this admin belongs to.";
  if (d.role === "User" && d.site_ids.length > 0 && d.category_ids.length === 0) e.category_ids = "Choose at least one category this person can enter.";
  return e;
}

/** Sites of one client, by name. */
export function sitesForClient(sites: Site[], companyId: number | null): Site[] {
  if (companyId === null) return [];
  return sites.filter((s) => s.company?.company_id === companyId).sort((a, b) => a.name.localeCompare(b.name));
}

/** Every category the chosen sites report, by id. */
export function availableCategories(sites: Site[], siteIds: number[]): Category[] {
  const out = new Map<number, Category>();
  for (const s of sites) {
    if (!siteIds.includes(s.site_id)) continue;
    for (const c of s.categories ?? []) out.set(c.category_id, c);
  }
  return [...out.values()].sort((a, b) => a.category_name.localeCompare(b.category_name));
}

/**
 * Categories after the site choice changes: keep what is still available,
 * switch on what the newly added sites bring (as the backend does on create).
 */
export function retargetCategories(selected: number[], before: Category[], after: Category[]): number[] {
  const had = new Set(before.map((c) => c.category_id));
  const now = new Set(after.map((c) => c.category_id));
  const kept = selected.filter((id) => now.has(id));
  const added = after.map((c) => c.category_id).filter((id) => !had.has(id) && !kept.includes(id));
  return [...kept, ...added].sort((a, b) => a - b);
}

/** Applies a role change: Superadmin drops client and sites; Admin keeps at most one site. */
export function withRole(d: UserDraft, role: Role | null): UserDraft {
  if (role === "Superadmin") return { ...d, role, company_id: null, site_ids: [], category_ids: [] };
  if (role === "Admin") return { ...d, role, site_ids: d.site_ids.slice(0, 1), category_ids: [] };
  return { ...d, role };
}

/** Changing client clears sites (they belong to the old client). */
export function withClient(d: UserDraft, companyId: number | null): UserDraft {
  if (companyId === d.company_id) return d;
  return { ...d, company_id: companyId, site_ids: [], category_ids: [] };
}

const sameIds = (a: number[], b: number[]) => a.length === b.length && [...a].sort((x, y) => x - y).every((v, i) => v === [...b].sort((x, y) => x - y)[i]);

export function isDirty(d: UserDraft, row: UserRow | null): boolean {
  const base = row ? draftFrom(row) : emptyDraft(d.company_id);
  return (
    d.name !== base.name ||
    d.last_name !== base.last_name ||
    d.email.trim() !== base.email ||
    d.phone_number !== base.phone_number ||
    d.role !== base.role ||
    d.company_id !== base.company_id ||
    !sameIds(d.site_ids, base.site_ids) ||
    !sameIds(d.category_ids, base.category_ids) ||
    d.timezone !== base.timezone
  );
}

export type UserPayload = {
  name?: string;
  last_name?: string | null;
  email?: string;
  phone_number?: string | null;
  role?: string;
  timezone?: string | null;
  site_id?: number | null;
  site_ids?: number[];
  category_ids?: number[];
};

/**
 * Request body. On edit only changed fields go out: re-sending sites makes the
 * backend re-seed categories, which would undo a Manager's own narrowing.
 */
export function toPayload(d: UserDraft, row: UserRow | null): UserPayload {
  const base = row ? draftFrom(row) : null;
  const p: UserPayload = {};
  const text = (v: string) => v.trim() || null;
  if (!base || d.name !== base.name) p.name = d.name.trim();
  if (!base || d.last_name !== base.last_name) p.last_name = text(d.last_name);
  if (!base || d.email.trim() !== base.email) p.email = d.email.trim();
  if (!base || d.phone_number !== base.phone_number) p.phone_number = text(d.phone_number);
  if (!base || d.role !== base.role) p.role = d.role ?? undefined;
  if (!base || d.timezone !== base.timezone) p.timezone = d.timezone;

  const sitesChanged = !base || !sameIds(d.site_ids, base.site_ids) || d.role !== base.role;
  if (sitesChanged) {
    if (multiSite(d.role)) p.site_ids = d.site_ids;
    else p.site_id = d.role === "Admin" ? (d.site_ids[0] ?? null) : null;
  }
  if (d.role === "User" && (sitesChanged || !sameIds(d.category_ids, base?.category_ids ?? []))) p.category_ids = d.category_ids;
  if (!row) {
    // Create sends no empty extras.
    for (const k of Object.keys(p) as (keyof UserPayload)[]) if (p[k] === null || p[k] === "") delete p[k];
  }
  return p;
}

// ---------- Role change warning ----------

const RANK: Record<Role, number> = { User: 0, Manager: 1, Admin: 2, Superadmin: 3 };

export const ROLE_POWERS: Record<Role, string[]> = {
  Superadmin: ["Set up clients, sites and reference data", "Manage people across every client"],
  Admin: ["Manage their client's people and sites", "See and export reports for the whole client"],
  Manager: ["Approve and reject data for their sites", "Choose which categories their users can enter"],
  User: ["Enter data for the categories they are given"],
};

/** What someone loses moving to a lower role; empty when nothing is lost. */
export function lostPermissions(from: string | null | undefined, to: Role | null): string[] {
  if (!isRole(from) || !to || RANK[to] >= RANK[from]) return [];
  const kept = new Set(ROLES.filter((r) => RANK[r] <= RANK[to]).flatMap((r) => ROLE_POWERS[r]));
  return ROLES.filter((r) => RANK[r] > RANK[to] && RANK[r] <= RANK[from])
    .flatMap((r) => ROLE_POWERS[r])
    .filter((p) => !kept.has(p));
}

// ---------- Timezones ----------

const FALLBACK_ZONES = ["UTC", "Asia/Dubai", "Asia/Kolkata", "Europe/London", "Europe/Rome", "America/New_York"];

/** IANA zones this browser knows, with the person's current one kept even if unknown. */
export function timezoneOptions(current: string | null): string[] {
  const intl = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  const known = intl.supportedValuesOf?.("timeZone") ?? FALLBACK_ZONES;
  // Some browsers leave UTC out of the list.
  const zones = known.includes("UTC") ? known : ["UTC", ...known];
  return current && !zones.includes(current) ? [current, ...zones] : zones;
}
