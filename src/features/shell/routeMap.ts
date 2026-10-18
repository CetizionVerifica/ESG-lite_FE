/**
 * F2 route map: every path of the app, who may open it, and the old paths
 * that redirect to it.
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
  /** Page trail, ending with the page itself. Route metadata only; not rendered above the title. */
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
  /** A company switch the route needs (KPI-1); while it's off the route shows "not available". */
  requires?: Requirement;
}

/** Company switches nav items and routes can depend on (KPI-1: `"kpi"` = `kpi_tracking_enabled`). */
export const REQUIREMENTS = ["kpi"] as const;
export type Requirement = (typeof REQUIREMENTS)[number];
/** Which switches are on for the signed-in user; a missing key is off. */
export type FeatureFlags = Partial<Record<Requirement, boolean>>;

export function meetsRequirement(requires: Requirement | undefined, flags: FeatureFlags): boolean {
  return !requires || flags[requires] === true;
}

const ALL: readonly Role[] = ROLES;

export const SHELL_ROUTES = [
  // Contributor (User)
  { id: "my-month", path: "/my-month", title: "Current Month", crumb: ["Current Month"], roles: ["User"], spec: "P02" },
  { id: "add-data", path: "/data/new", title: "Add data", crumb: ["Add data"], roles: ["User"], spec: "P03" },
  { id: "my-entries", path: "/data/mine", title: "My entries", crumb: ["My entries"], roles: ["User"], spec: "P04" },
  { id: "production", path: "/production", title: "Production", crumb: ["Production"], roles: ["User"], spec: "P05" },

  // Manager
  { id: "overview", path: "/overview", title: "Overview", crumb: ["Overview"], roles: ["Manager"], spec: "P06" },
  // D18: a Superadmin opens only the KPIs tab (`?view=kpi`), for the chosen client.
  { id: "approvals", path: "/data/approvals", title: "Approvals", crumb: ["Data", "Approvals"], roles: ["Manager", "Superadmin"], spec: "P07", clientContext: true },
  { id: "ledger", path: "/data/ledger", title: "Emissions ledger", crumb: ["Data", "Emissions ledger"], roles: ["Manager"], spec: "P07" },
  { id: "production-review", path: "/data/production", title: "Production data", crumb: ["Data", "Production data"], roles: ["Manager"], spec: "P08" },
  { id: "team", path: "/team", title: "Team", crumb: ["Team"], roles: ["Manager"], spec: "P09" },
  { id: "ghg-report", path: "/reports/ghg", title: "GHG report", crumb: ["Reports", "GHG report"], roles: ["Manager", "Superadmin"], spec: "P10", clientContext: true },
  { id: "ede-report", path: "/reports/ede", title: "EDE report", crumb: ["Reports", "EDE report"], roles: ["Manager", "Superadmin"], spec: "P11", clientContext: true },
  { id: "targets", path: "/targets", title: "Targets (SBTi)", crumb: ["Targets (SBTi)"], roles: ["Manager"], spec: "P12" },
  // PCF slot, owned by the Product carbon footprint plan (docs/pcf/).
  { id: "product-footprints", path: "/products", title: "Product footprints", crumb: ["Products (PCF)"], roles: ["Manager"], spec: "C01", roleRedirect: { Superadmin: "/setup/products" } },
  { id: "footprint-new", path: "/products/new", title: "New footprint", crumb: ["Products (PCF)", "New footprint"], roles: ["Manager"], spec: "C02", roleRedirect: { Superadmin: "/setup/products" } },
  { id: "footprint-builder", path: "/products/:productId/footprints/:studyId/edit", title: "Footprint builder", crumb: ["Products (PCF)", "Footprint builder"], roles: ["Manager"], spec: "C02", roleRedirect: { Superadmin: "/setup/products" } },
  { id: "footprint-latest", path: "/products/:productId", title: "Footprint", crumb: ["Products (PCF)", "Footprint"], roles: ["Manager"], spec: "C03", roleRedirect: { Superadmin: "/setup/products" } },
  { id: "footprint-result", path: "/products/:productId/footprints/:studyId", title: "Footprint", crumb: ["Products (PCF)", "Footprint"], roles: ["Manager"], spec: "C03", roleRedirect: { Superadmin: "/setup/products" } },
  { id: "pcf", path: "/products/*", title: "Products (PCF)", crumb: ["Products (PCF)"], roles: ["Manager"], spec: "C01–C06", roleRedirect: { Superadmin: "/setup/products" } },
  // C05: a footprint's declaration as PDF, PACT JSON or CSV; more specific than /products/*, so it wins.
  // C06: supplier data requests; a static segment, so it outranks /products/:productId.
  { id: "supplier-requests", path: "/products/suppliers", title: "Supplier requests", crumb: ["Products (PCF)", "Supplier requests"], roles: ["Manager"], spec: "C06", roleRedirect: { Superadmin: "/setup/products" } },
  { id: "declaration-export", path: "/products/:studyId/export", title: "Export declaration", crumb: ["Products (PCF)", "Export declaration"], roles: ["Manager"], spec: "C05", roleRedirect: { Superadmin: "/setup/products" } },

  // Everyone
  { id: "notifications", path: "/notifications", title: "Notifications", crumb: ["Notifications"], roles: ALL, spec: "P13" },
  { id: "settings", path: "/settings", title: "Settings", crumb: ["Settings"], roles: ALL, spec: "P14" },
  // Scope 3 boundary (S3-1): Admin and Superadmin edit, Managers read.
  { id: "scope3-boundary", path: "/settings/scope3", title: "Scope 3 boundary", crumb: ["Settings", "Scope 3 boundary"], roles: ["Manager", "Admin", "Superadmin"], spec: "S3-1", clientContext: true },
  // S3-11: the Category 15 investments register (Admin and Superadmin edit, Managers read).
  { id: "scope3-investments", path: "/settings/scope3/investments", title: "Investments", crumb: ["Settings", "Scope 3 boundary", "Investments"], roles: ["Manager", "Admin", "Superadmin"], spec: "S3-11", clientContext: true },
  // S3-9: the yearly commuting survey → a Category 7 import plan (Manager and above, own sites).
  { id: "scope3-commuting", path: "/settings/scope3/commuting", title: "Commuting survey", crumb: ["Settings", "Scope 3 boundary", "Commuting survey"], roles: ["Manager", "Admin", "Superadmin"], spec: "S3-9", clientContext: true },
  // S3-10: sales per product and month → Category 10 / 11 / 12 import plans (Manager and above, own sites).
  { id: "scope3-sold-products", path: "/settings/scope3/sold-products", title: "Sold products", crumb: ["Settings", "Scope 3 boundary", "Sold products"], roles: ["Manager", "Admin", "Superadmin"], spec: "S3-10", clientContext: true },
  // S3-12: screening (sizes, Table II ticks, suggestions) and extrapolation (Admin and Superadmin edit, Managers read and extrapolate own sites).
  { id: "scope3-screening", path: "/settings/scope3/screening", title: "Scope 3 screening", crumb: ["Settings", "Scope 3 boundary", "Screening"], roles: ["Manager", "Admin", "Superadmin"], spec: "S3-12", clientContext: true },
  // S3-6: suppliers, their own figures and facility data, and the name-match review (Manager and above).
  { id: "scope3-suppliers", path: "/suppliers", title: "Suppliers", crumb: ["Data", "Suppliers"], roles: ["Manager", "Admin", "Superadmin"], spec: "S3-6", clientContext: true },
  // Connect Claude consent (MCP import plan IM10); ESG-lite /oauth/authorize lands here.
  // Superadmin only (Shyam, 2026-10-14): other roles get the 403 page, never the consent screen.
  { id: "oauth-consent", path: "/oauth/consent", title: "Connect Claude", crumb: ["Connect Claude"], roles: ["Superadmin"], spec: "IM10" },

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
  { id: "bulk-upload", path: "/capture/upload", title: "Bulk upload", crumb: ["Capture", "Bulk upload"], roles: ["Superadmin", "Admin", "Manager", "User"], spec: "P27" },

  // KPI tracking (docs/kpi/01-contracts.md §6). Every route but the library is hidden while the company's switch is off (KPI-1).
  // kpi-review is a tab of Approvals (/data/approvals?view=kpi), not a route of its own.
  { id: "kpi-my", path: "/kpi", title: "My KPIs", crumb: ["My KPIs"], roles: ["User", "Manager", "Admin"], spec: "KPI-7", requires: "kpi" },
  { id: "kpi-setup", path: "/kpi/setup", title: "KPI setup", crumb: ["Settings", "KPI setup"], roles: ["Admin", "Superadmin"], spec: "KPI-3", clientContext: true, requires: "kpi" },
  { id: "kpi-targets", path: "/kpi/targets", title: "KPI targets", crumb: ["KPIs", "Targets"], roles: ["Manager", "Admin", "Superadmin"], spec: "KPI-9", clientContext: true, requires: "kpi" },
  { id: "kpi-dashboard", path: "/kpi/dashboard", title: "KPIs", crumb: ["Data", "KPIs"], roles: ["Manager", "Admin", "Superadmin"], spec: "KPI-10", clientContext: true, requires: "kpi" },
  { id: "kpi-reports", path: "/reports/kpi/:framework", title: "Framework reports", crumb: ["Reports", "Framework reports"], roles: ["Manager", "Admin", "Superadmin"], spec: "KPI-11", clientContext: true, requires: "kpi" },
  { id: "kpi-library", path: "/setup/kpi-library", title: "KPI library", crumb: ["Setup", "KPI library"], roles: ["Superadmin"], spec: "KPI-2" },
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
 * Old path → new path, so bookmarks from the old UI keep working. Kept for
 * one release.
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
  { from: "/data/new/classic", to: "/data/new" },
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
