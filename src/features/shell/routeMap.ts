/**
 * F2 route map: every path of the redesigned app, who may open it, and the
 * old paths that redirect to it while VITE_NEW_UI is on.
 * Source: src/features/shell/CLAUDE.md ("Route map" and "Navigation per role").
 */

export const ROLES = ["User", "Manager", "Admin", "Superadmin"] as const;
export type Role = (typeof ROLES)[number];

export function asRole(value: string | null | undefined): Role | null {
  return (ROLES as readonly string[]).includes(value ?? "") ? (value as Role) : null;
}

export interface ShellRoute {
  /** Stable key; src/routes/newUiRoutes.tsx maps each id to its page element. */
  id: string;
  /** React Router path, absolute. */
  path: string;
  title: string;
  /** Breadcrumb shown above the page, ending with the page itself. */
  crumb: string[];
  roles: readonly Role[];
  /** Page spec that will replace the placeholder (docs/redesign/pages, docs/pcf). */
  spec: string;
  /**
   * Superadmin client switcher shows in the page header on these routes. A
   * `:clientId` param in such a route's path sets the client context.
   */
  clientContext?: boolean;
  /** Roles that land somewhere else instead of seeing the 403 page. */
  roleRedirect?: Partial<Record<Role, string>>;
}

const ALL: readonly Role[] = ROLES;

export const SHELL_ROUTES = [
  // Contributor (User)
  { id: "my-month", path: "/my-month", title: "My month", crumb: ["My month"], roles: ["User"], spec: "P02" },
  { id: "add-data", path: "/data/new", title: "Add data", crumb: ["Add data"], roles: ["User"], spec: "P03" },
  // Today's Add data page, kept for bills and bulk upload until P03-B/C move them; removed with it in P03-C.
  { id: "add-data-classic", path: "/data/new/classic", title: "Add data (current page)", crumb: ["Add data", "Current page"], roles: ["User"], spec: "P03" },
  { id: "my-entries", path: "/data/mine", title: "My entries", crumb: ["My entries"], roles: ["User"], spec: "P04" },
  { id: "production", path: "/production", title: "Production", crumb: ["Production"], roles: ["User"], spec: "P05" },

  // Manager
  { id: "overview", path: "/overview", title: "Overview", crumb: ["Overview"], roles: ["Manager"], spec: "P06" },
  { id: "approvals", path: "/data/approvals", title: "Approvals", crumb: ["Data", "Approvals"], roles: ["Manager"], spec: "P07" },
  { id: "ledger", path: "/data/ledger", title: "Emissions ledger", crumb: ["Data", "Emissions ledger"], roles: ["Manager"], spec: "P07" },
  { id: "production-review", path: "/data/production", title: "Production data", crumb: ["Data", "Production data"], roles: ["Manager"], spec: "P08" },
  { id: "team", path: "/team", title: "Team", crumb: ["Team"], roles: ["Manager"], spec: "P09" },
  { id: "ghg-report", path: "/reports/ghg", title: "GHG report", crumb: ["Reports", "GHG report"], roles: ["Manager", "Superadmin"], spec: "P10", clientContext: true },
  { id: "ede-report", path: "/reports/ede", title: "EDE report", crumb: ["Reports", "EDE report"], roles: ["Manager", "Superadmin"], spec: "P11", clientContext: true },
  { id: "targets", path: "/targets", title: "Targets (SBTi)", crumb: ["Targets (SBTi)"], roles: ["Manager"], spec: "P12" },
  // PCF slot, owned by the Product carbon footprint plan (docs/pcf/).
  { id: "pcf", path: "/products/*", title: "Products (PCF)", crumb: ["Products (PCF)"], roles: ["Manager"], spec: "C01–C06", roleRedirect: { Superadmin: "/setup/products" } },

  // Everyone
  { id: "notifications", path: "/notifications", title: "Notifications", crumb: ["Notifications"], roles: ALL, spec: "P13" },
  { id: "settings", path: "/settings", title: "Settings", crumb: ["Settings"], roles: ALL, spec: "P14" },

  // Company admin
  { id: "company-users", path: "/users", title: "Users", crumb: ["Users"], roles: ["Admin"], spec: "P15", roleRedirect: { Superadmin: "/setup/users" } },
  { id: "brand-view", path: "/brand", title: "Brand theme", crumb: ["Brand theme"], roles: ["Admin"], spec: "P18" },

  // Superadmin
  { id: "console", path: "/console", title: "Console", crumb: ["Console"], roles: ["Superadmin"], spec: "P16" },
  { id: "clients", path: "/clients", title: "Companies", crumb: ["Clients", "Companies"], roles: ["Superadmin"], spec: "P17" },
  { id: "client-new", path: "/clients/new", title: "Onboard client", crumb: ["Clients", "Onboard client"], roles: ["Superadmin"], spec: "P17" },
  { id: "client-detail", path: "/clients/:clientId", title: "Client", crumb: ["Clients", "Client"], roles: ["Superadmin"], spec: "P17", clientContext: true },
  { id: "brand-themes", path: "/clients/:clientId/brand", title: "Brand themes", crumb: ["Clients", "Brand themes"], roles: ["Superadmin"], spec: "P18", clientContext: true },
  { id: "sites", path: "/setup/sites", title: "Sites", crumb: ["Setup", "Sites"], roles: ["Superadmin"], spec: "P19" },
  { id: "users-global", path: "/setup/users", title: "Users", crumb: ["Setup", "Users"], roles: ["Superadmin"], spec: "P20" },
  { id: "reference-data", path: "/setup/reference", title: "Reference data", crumb: ["Setup", "Reference data"], roles: ["Superadmin"], spec: "P21" },
  { id: "products", path: "/setup/products", title: "Products", crumb: ["Setup", "Products"], roles: ["Superadmin"], spec: "P25" },
  { id: "emission-factors", path: "/factors", title: "Emission factors", crumb: ["Factors", "Emission factors"], roles: ["Superadmin"], spec: "P22" },
  { id: "category-mappings", path: "/factors/mappings", title: "Category mappings", crumb: ["Factors", "Category mappings"], roles: ["Superadmin"], spec: "P23" },
  // Managers see the global library and add their own (supplier) factors; no nav item, PCF pages link here.
  { id: "material-factors", path: "/factors/materials", title: "Material factors", crumb: ["Factors", "Material factors"], roles: ["Manager", "Superadmin"], spec: "C04" },
  { id: "thresholds", path: "/factors/thresholds", title: "Thresholds", crumb: ["Factors", "Thresholds"], roles: ["Superadmin"], spec: "P26" },
  { id: "capture-columns", path: "/capture/columns", title: "Columns", crumb: ["Capture", "Columns"], roles: ["Superadmin"], spec: "P24" },
  { id: "capture-forms", path: "/capture/forms", title: "Data-entry forms", crumb: ["Capture", "Data-entry forms"], roles: ["Superadmin"], spec: "P24" },
  { id: "capture-form", path: "/capture/forms/:id", title: "Form", crumb: ["Capture", "Data-entry forms", "Edit"], roles: ["Superadmin"], spec: "P24" },
  // Contributors reach it from Add data, for their own sites (P27).
  { id: "bulk-upload", path: "/capture/upload", title: "Bulk upload", crumb: ["Capture", "Bulk upload"], roles: ["Superadmin", "User"], spec: "P27" },
] as const satisfies readonly ShellRoute[];

export type ShellRouteId = (typeof SHELL_ROUTES)[number]["id"];

export function getShellRoute(id: ShellRouteId): ShellRoute {
  return SHELL_ROUTES.find((r) => r.id === id) as ShellRoute;
}

export function canAccess(role: Role | null, route: Pick<ShellRoute, "roles">): boolean {
  return role !== null && route.roles.includes(role);
}

/** Where RootRedirect sends each role. */
export const HOME_BY_ROLE: Record<Role, string> = {
  User: "/my-month",
  Manager: "/overview",
  Admin: "/users",
  Superadmin: "/console",
};

export function homeFor(role: Role | null): string | null {
  return role ? HOME_BY_ROLE[role] : null;
}

/** Placeholder in a path that resolves to the Superadmin's selected client. */
export const CLIENT_ID = ":clientId";

/**
 * Old path → new path, active only with VITE_NEW_UI on. Kept for one release.
 * A target containing CLIENT_ID needs a selected client; without one it
 * falls back to `fallback`.
 */
export interface LegacyRedirect {
  from: string;
  to: string;
  fallback?: string;
}

export const LEGACY_REDIRECTS: readonly LegacyRedirect[] = [
  { from: "/data-entry", to: "/data/new" },
  { from: "/my-emissions", to: "/data/mine" },
  { from: "/production-data", to: "/production" },
  { from: "/manager-dashboard", to: "/overview" },
  { from: "/company/dashboard", to: "/overview" },
  { from: "/data-manage", to: "/data/approvals" },
  { from: "/manage-production-data", to: "/data/production" },
  { from: "/manage-users", to: "/team" },
  { from: "/ghg-reports", to: "/reports/ghg" },
  { from: "/ede-reports", to: "/reports/ede" },
  { from: "/sbti-commitment", to: "/targets" },
  { from: "/admin-company/users", to: "/users" },
  { from: "/superadmin", to: "/console" },
  { from: "/admin/dashboard", to: "/console" },
  { from: "/companies", to: "/clients" },
  { from: "/companies/onboard", to: "/clients/new" },
  { from: "/brand-settings", to: `/clients/${CLIENT_ID}/brand`, fallback: "/clients" },
  { from: "/sites", to: "/setup/sites" },
  { from: "/countries", to: "/setup/reference?tab=countries" },
  { from: "/categories", to: "/setup/reference?tab=categories" },
  { from: "/units", to: "/setup/reference?tab=units" },
  { from: "/emission-factors", to: "/factors" },
  { from: "/category-mappings", to: "/factors/mappings" },
  { from: "/threshold-values", to: "/factors/thresholds" },
  { from: "/manage-columns", to: "/capture/columns" },
  { from: "/column-config", to: "/capture/forms" },
  { from: "/upload-data", to: "/capture/upload" },
];

/** Fills CLIENT_ID; returns `fallback` (or null) when no client is selected. */
export function withClientId(path: string, clientId: number | null, fallback: string | null = null): string | null {
  if (!path.includes(CLIENT_ID)) return path;
  return clientId ? path.split(CLIENT_ID).join(String(clientId)) : fallback;
}

/**
 * The client a URL points at: only routes that declare `clientContext` and a
 * `:clientId` param count, so `/capture/forms/5` never changes the client.
 */
export function clientIdFromRoute(
  route: Pick<ShellRoute, "path" | "clientContext"> | null,
  params: Readonly<Record<string, string | undefined>>,
): number | null {
  if (!route?.clientContext || !route.path.includes(CLIENT_ID)) return null;
  const id = Number(params.clientId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** The current route's path for another client, or null if it has no `:clientId`. */
export function pathForClient(route: Pick<ShellRoute, "path" | "clientContext"> | null, clientId: number): string | null {
  if (!route?.clientContext || !route.path.includes(CLIENT_ID)) return null;
  return withClientId(route.path, clientId);
}

/**
 * Builds the redirect target, keeping the old URL's query and hash. Query
 * keys in the target win over the same keys in the old URL.
 */
export function resolveLegacyRedirect(
  redirect: LegacyRedirect,
  search: string,
  hash: string,
  clientId: number | null,
): string {
  const target = withClientId(redirect.to, clientId, redirect.fallback ?? "/") as string;
  const [pathname, targetQuery = ""] = target.split("?");
  const params = new URLSearchParams(search);
  new URLSearchParams(targetQuery).forEach((value, key) => params.set(key, value));
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}
