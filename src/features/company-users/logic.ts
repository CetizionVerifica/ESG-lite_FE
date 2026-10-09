import type { CompanyUserPayload } from "../../services/companyAdminService";

export type Role = "Manager" | "User";
export const ROLES: Role[] = ["Manager", "User"];

export type CompanySite = { site_id: number; name: string };

/** A row of GET /company-admin/users (User entity with site + sites). */
export type CompanyUser = {
  user_id: number;
  name?: string | null;
  last_name?: string | null;
  email: string;
  role: string;
  site?: CompanySite | null;
  sites?: CompanySite[] | null;
};

export type PersonDraft = { name: string; email: string; role: Role | ""; siteIds: number[]; password: string; sendLink: boolean };
export type DraftErrors = Partial<Record<"name" | "email" | "role" | "sites" | "password", string>>;

export const EMPTY_DRAFT: PersonDraft = { name: "", email: "", role: "", siteIds: [], password: "", sendLink: true };
export const MIN_PASSWORD = 8;

export function displayName(u: Pick<CompanyUser, "name" | "last_name" | "email">): string {
  return [u.name, u.last_name].filter((s) => s && s.trim()).join(" ").trim() || u.email;
}

/** Sites from either relation (legacy single `site` or multi `sites`), no duplicates. */
export function sitesOf(u: CompanyUser): CompanySite[] {
  const list = u.sites?.length ? u.sites : u.site ? [u.site] : [];
  return list.filter((s, i) => list.findIndex((o) => o.site_id === s.site_id) === i);
}

export function draftFromUser(u: CompanyUser): PersonDraft {
  return {
    name: u.name ?? "",
    email: u.email,
    role: u.role === "Manager" || u.role === "User" ? u.role : "",
    siteIds: sitesOf(u).map((s) => s.site_id),
    password: "",
    sendLink: false,
  };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Field errors; `creating` adds the temporary password rule (the API needs one). */
export function validate(d: PersonDraft, creating: boolean): DraftErrors {
  const e: DraftErrors = {};
  if (!d.email.trim()) e.email = "Enter an email address.";
  else if (!EMAIL.test(d.email.trim())) e.email = "Enter a valid email address.";
  if (!d.role) e.role = "Choose a role.";
  if (d.siteIds.length === 0) e.sites = "Choose at least one site.";
  if (creating && d.password.length < MIN_PASSWORD) e.password = `Use at least ${MIN_PASSWORD} characters.`;
  return e;
}

/** POST body. Sites always go as site_ids, so Managers and Users can have several. */
export function createPayload(d: PersonDraft): CompanyUserPayload {
  return { name: d.name.trim() || undefined, email: d.email.trim().toLowerCase(), password: d.password, role: d.role, site_ids: [...d.siteIds].sort((a, b) => a - b) };
}

/**
 * PATCH body with only what changed. Sites are sent only when they changed,
 * because the server resets the person's category access to the sites'
 * categories whenever site_ids is sent.
 */
export function updatePayload(before: CompanyUser, d: PersonDraft): Partial<CompanyUserPayload> {
  const out: Partial<CompanyUserPayload> = {};
  const was = draftFromUser(before);
  if (d.name.trim() !== was.name.trim()) out.name = d.name.trim();
  if (d.email.trim().toLowerCase() !== was.email.toLowerCase()) out.email = d.email.trim().toLowerCase();
  if (d.role && d.role !== was.role) out.role = d.role;
  const a = [...d.siteIds].sort((x, y) => x - y);
  const b = [...was.siteIds].sort((x, y) => x - y);
  if (a.join(",") !== b.join(",")) out.site_ids = a;
  return out;
}

export function matchesSearch(u: CompanyUser, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [displayName(u), u.email, ...sitesOf(u).map((s) => s.name)].some((v) => v?.toLowerCase().includes(needle));
}

export function matchesFilters(u: CompanyUser, f: { role?: string; siteIds: number[]; q: string }): boolean {
  if (f.role && u.role !== f.role) return false;
  if (f.siteIds.length && !sitesOf(u).some((s) => f.siteIds.includes(s.site_id))) return false;
  return matchesSearch(u, f.q);
}

export type PeopleKpis = { people: number; managers: number; contributors: number; unmanaged: CompanySite[] };

export function kpis(users: CompanyUser[], sites: CompanySite[]): PeopleKpis {
  const managed = new Set(users.filter((u) => u.role === "Manager").flatMap((u) => sitesOf(u).map((s) => s.site_id)));
  return {
    people: users.length,
    managers: users.filter((u) => u.role === "Manager").length,
    contributors: users.filter((u) => u.role === "User").length,
    unmanaged: sites.filter((s) => !managed.has(s.site_id)),
  };
}
