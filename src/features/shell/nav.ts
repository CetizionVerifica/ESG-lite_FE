import { CLIENT_ID, type Role, withClientId } from "./routeMap";

/** Top-bar navigation per role. Labels are final copy from the F2 spec. */

export interface NavLinkItem {
  kind: "link";
  label: string;
  /** May contain CLIENT_ID; resolve with resolveNavTo before linking. */
  to: string;
}

export interface NavGroupItem {
  kind: "group";
  label: string;
  items: NavLinkItem[];
}

export type NavItem = NavLinkItem | NavGroupItem;

const link = (label: string, to: string): NavLinkItem => ({ kind: "link", label, to });
const group = (label: string, items: NavLinkItem[]): NavGroupItem => ({ kind: "group", label, items });

export const NAV_BY_ROLE: Record<Role, NavItem[]> = {
  User: [
    link("My month", "/my-month"),
    link("Add data", "/data/new"),
    link("My entries", "/data/mine"),
    link("Production", "/production"),
  ],
  Manager: [
    link("Overview", "/overview"),
    group("Data", [
      link("Approvals", "/data/approvals"),
      link("Emissions ledger", "/data/ledger"),
      link("Production data", "/data/production"),
    ]),
    group("Reports", [link("GHG report", "/reports/ghg"), link("EDE report", "/reports/ede")]),
    link("Targets (SBTi)", "/targets"),
    link("Products (PCF)", "/products"),
    link("Team", "/team"),
  ],
  Admin: [link("Users", "/users"), link("Brand theme", "/brand")],
  Superadmin: [
    link("Console", "/console"),
    group("Clients", [
      // "/clients/" prefix would also match brand pages, so list them apart.
      link("Companies", "/clients"),
      link("Onboard client", "/clients/new"),
      link("Brand themes", `/clients/${CLIENT_ID}/brand`),
    ]),
    group("Setup", [
      link("Sites", "/setup/sites"),
      link("Users", "/setup/users"),
      link("Countries", "/setup/reference?tab=countries"),
      link("Categories", "/setup/reference?tab=categories"),
      link("Units", "/setup/reference?tab=units"),
      link("Products", "/setup/products"),
    ]),
    group("Factors", [
      link("Emission factors", "/factors"),
      link("Category mappings", "/factors/mappings"),
      link("Thresholds", "/factors/thresholds"),
    ]),
    group("Capture", [
      link("Columns", "/capture/columns"),
      link("Column configs", "/capture/forms"),
      link("Bulk upload", "/capture/upload"),
    ]),
    group("Reports", [link("GHG", "/reports/ghg"), link("EDE", "/reports/ede")]),
  ],
};

export function navFor(role: Role | null): NavItem[] {
  return role ? NAV_BY_ROLE[role] : [];
}

/** Every link a role can reach from the nav, groups flattened, in nav order. */
export function navLinks(role: Role | null): { label: string; to: string; group?: string }[] {
  return navFor(role).flatMap((item) =>
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

// "/clients" must not light up on "/clients/new" or a client's brand page,
// which have their own nav items.
function hasMoreSpecificSibling(path: string, pathname: string): boolean {
  return path === "/clients" && (pathname === "/clients/new" || /^\/clients\/[^/]+\/brand$/.test(pathname));
}

export function isGroupActive(group: NavGroupItem, pathname: string, search: string): boolean {
  return group.items.some((item) => isActiveLink(item.to, pathname, search));
}
