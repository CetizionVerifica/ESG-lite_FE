// M6: someone with sites at several clients (internal accounts) works in one company at a time.
// The account menu picks it; the choice is kept per user on this device, put first in the session
// user (its sites first, `company` set) so brand, switches and pickers follow it, and sent as
// `X-Company-Id`, which the server honours only for a company the user belongs to.

export type CompanyOption = { company_id: number; name: string };

type CompanyLike = { company_id: number; name?: string | null; [key: string]: unknown };
type SiteLike = { site_id?: number; company?: CompanyLike | null; [key: string]: unknown };
type UserLike = { user_id?: number; role?: string; company?: CompanyLike | null; site?: SiteLike | null; sites?: SiteLike[]; [key: string]: unknown };

const asUser = (user: unknown): UserLike | null => (user && typeof user === "object" ? (user as UserLike) : null);
const storageKey = (u: UserLike) => `activeCompany:${u.user_id ?? "me"}`;

/** The companies the user's sites belong to, by name; an Admin or Superadmin has no choice. */
export function companiesOf(user: unknown): CompanyOption[] {
  const u = asUser(user);
  if (!u || u.role === "Admin" || u.role === "Superadmin") return [];
  const byId = new Map<number, string>();
  for (const c of [u.company, u.site?.company, ...(u.sites ?? []).map((s) => s.company)]) {
    if (c && Number.isInteger(c.company_id)) byId.set(c.company_id, c.name ?? byId.get(c.company_id) ?? `Company ${c.company_id}`);
  }
  return [...byId].map(([company_id, name]) => ({ company_id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

/** The chosen company, while it is still one of several the user belongs to; else null. */
export function storedActiveCompany(user: unknown): number | null {
  const u = asUser(user);
  if (!u) return null;
  const companies = companiesOf(u);
  if (companies.length < 2) return null;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(storageKey(u));
  } catch {
    return null;
  }
  const id = Number(raw);
  return raw && companies.some((c) => c.company_id === id) ? id : null;
}

export function saveActiveCompany(user: unknown, companyId: number | null): void {
  const u = asUser(user);
  if (!u) return;
  try {
    if (companyId === null) localStorage.removeItem(storageKey(u));
    else localStorage.setItem(storageKey(u), String(companyId));
  } catch {
    // Private mode or blocked storage: the choice lasts until the page reloads.
  }
}

/** The session user as the app sees it in `companyId`: that company first (its sites first, `company` set). */
export function withActiveCompany<T>(user: T, companyId: number | null): T {
  const u = asUser(user);
  if (!u || companyId === null) return user;
  const sites = u.sites ?? [];
  const inCompany = (s: SiteLike | null | undefined) => s?.company?.company_id === companyId;
  const company = [u.company, u.site?.company, ...sites.map((s) => s.company)].find((c) => c?.company_id === companyId);
  if (!company) return user;
  return {
    ...u,
    company,
    site: inCompany(u.site) ? u.site : (sites.find(inCompany) ?? u.site),
    sites: [...sites.filter(inCompany), ...sites.filter((s) => !inCompany(s))],
  } as T;
}

/** The `X-Company-Id` header for an API call, from the stored session user. */
export function activeCompanyHeader(): string | null {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem("user");
  } catch {
    return null;
  }
  if (!stored) return null;
  try {
    const id = storedActiveCompany(JSON.parse(stored));
    return id === null ? null : String(id);
  } catch {
    return null;
  }
}
