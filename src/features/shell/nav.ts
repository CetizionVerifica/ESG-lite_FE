import { CLIENT_ID, type FeatureFlags, type Requirement, type Role, meetsRequirement, withClientId } from "./routeMap";

/** Top-bar navigation per role. Labels are final copy from the F2 spec. */

export interface NavLinkItem {
  kind: "link";
  label: string;
  /** May contain CLIENT_ID; resolve with resolveNavTo before linking. */
  to: string;
  /** A company switch the item needs (KPI-1: `"kpi"` = KPI tracking on); left out of the nav while it's off. */
  requires?: Requirement;
}

export interface NavGroupItem {
  kind: "group";
  label: string;
  items: NavLinkItem[];
}

export type NavItem = NavLinkItem | NavGroupItem;

const link = (label: string, to: string, requires?: Requirement): NavLinkItem => (requires ? { kind: "link", label, to, requires } : { kind: "link", label, to });
const group = (label: string, items: NavLinkItem[]): NavGroupItem => ({ kind: "group", label, items });

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  User: [
    link("Current Month", "/my-month"),
    link("My KPIs", "/kpi", "kpi"), // KPI-1
    link("Add data", "/data/new"),
    link("My entries", "/data/mine"),
    link("Production", "/production"),
  ],
  Manager: [
    link("Overview", "/overview"),
    group("Data", [
      link("Approvals", "/data/approvals"),
      link("KPIs", "/kpi/dashboard", "kpi"), // KPI-1
      link("Emissions ledger", "/data/ledger"),
      link("Production data", "/data/production"),
      link("Suppliers", "/suppliers"),
      link("Bulk upload", "/capture/upload"),
    ]),
    group("Reports", [
      link("GHG report", "/reports/ghg"),
      link("EDE report", "/reports/ede"),
      link("Framework reports", "/reports/kpi/GRI", "kpi"), // KPI-1
      link("Scope 3 boundary", "/settings/scope3"),
    ]),
    link("Targets (SBTi)", "/targets"),
    link("Products (PCF)", "/products"),
    link("Team", "/team"),
  ],
  Admin: [
    link("Users", "/users"),
    link("Bulk upload", "/capture/upload"),
    link("Brand theme", "/brand"),
    link("Scope 3 boundary", "/settings/scope3"),
    link("Suppliers", "/suppliers"),
    link("KPIs", "/kpi/dashboard", "kpi"), // KPI-1
    link("KPI setup", "/kpi/setup", "kpi"), // KPI-1
  ],
  Superadmin: [
    link("Console", "/console"),
    group("Clients", [
      // "/clients/" prefix would also match brand pages, so list them apart.
      link("Companies", "/clients"),
      link("Onboard client", "/clients/new"),
      link("Brand themes", `/clients/${CLIENT_ID}/brand`),
      link("Scope 3 boundary", "/settings/scope3"),
      link("Suppliers", "/suppliers"),
    ]),
    group("Setup", [
      link("Sites", "/setup/sites"),
      link("Users", "/setup/users"),
      link("Countries", "/setup/reference?tab=countries"),
      link("Categories", "/setup/reference?tab=categories"),
      link("Units", "/setup/reference?tab=units"),
      link("Products", "/setup/products"),
      link("KPI library", "/setup/kpi-library"), // KPI-2: the global library, not behind a client's switch
    ]),
    group("Factors", [
      link("Emission factors", "/factors"),
      link("Category mappings", "/factors/mappings"),
      link("Thresholds", "/factors/thresholds"),
      link("Material factors", "/factors/materials"),
    ]),
    group("Capture", [
      link("Columns", "/capture/columns"),
      link("Data-entry forms", "/capture/forms"),
      link("Bulk upload", "/capture/upload"),
    ]),
    group("Reports", [link("GHG", "/reports/ghg"), link("EDE", "/reports/ede")]),
  ],
};

/**
 * The role's nav with the company's switches applied (KPI-1): items whose
 * `requires` is off are left out, and a group left empty goes too. No flags =
 * every switch off.
 */
export function navFor(role: Role | null, flags: FeatureFlags = {}): NavItem[] {
  if (!role) return [];
  const shown = (item: NavLinkItem) => meetsRequirement(item.requires, flags);
  return NAV_BY_ROLE[role].flatMap((item): NavItem[] => {
    if (item.kind === "link") return shown(item) ? [item] : [];
    const items = item.items.filter(shown);
    return items.length ? [{ ...item, items }] : [];
  });
}

/** Every link a role can reach from the nav, groups flattened, in nav order. */
export function navLinks(role: Role | null, flags: FeatureFlags = {}): { label: string; to: string; group?: string }[] {
  return navFor(role, flags).flatMap((item) =>
    item.kind === "link"
      ? [{ label: item.label, to: item.to }]
      : item.items.map((child) => ({ label: child.label, to: child.to, group: item.label })),
  );
}

/** Brand themes needs a client; without one it opens the Companies list. */
export function resolveNavTo(to: string, clientId: number | null): string {
  return withClientId(to, clientId, "/clients") as string;
}

/**
 * True when `to` is the page at `pathname` + `search`. Paths match exactly or
 * as a prefix ("/products" matches "/products/12"); a query in `to` must
 * match too, so Countries and Units are told apart.
 */
export function isActiveLink(to: string, pathname: string, search: string): boolean {
  const [path, query] = to.split("?");
  if (path.includes(":")) {
    const pattern = new RegExp(`^${path.replace(/:[^/]+/g, "[^/]+")}$`);
    if (!pattern.test(pathname)) return false;
  } else if (pathname !== path && !(pathname.startsWith(`${path}/`) && !hasMoreSpecificSibling(path, pathname))) {
    return false;
  }
  if (!query) return true;
  const current = new URLSearchParams(search);
  let matches = true;
  new URLSearchParams(query).forEach((value, key) => {
    if (current.get(key) !== value) matches = false;
  });
  return matches;
}

// "/clients" must not light up on "/clients/new" or a client's brand page, and
// "/factors" not on the other Factors pages; they have their own nav items.
function hasMoreSpecificSibling(path: string, pathname: string): boolean {
  if (path === "/factors") return true;
  return path === "/clients" && (pathname === "/clients/new" || /^\/clients\/[^/]+\/brand$/.test(pathname));
}

export function isGroupActive(group: NavGroupItem, pathname: string, search: string): boolean {
  return group.items.some((item) => isActiveLink(item.to, pathname, search));
}
