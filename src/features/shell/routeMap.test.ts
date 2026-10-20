import { matchPath } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { navLinks, resolveNavTo } from "./nav";
import {
  HOME_BY_ROLE,
  LEGACY_REDIRECTS,
  ROLES,
  SHELL_ROUTES,
  asRole,
  canAccess,
  clientIdFromRoute,
  homeFor,
  meetsRequirement,
  pathForClient,
  resolveLegacyRedirect,
  withClientId,
} from "./routeMap";

function routeFor(url: string) {
  const pathname = url.split("?")[0];
  // Most specific first, the way React Router ranks them.
  const sorted = [...SHELL_ROUTES].sort((a, b) => Number(a.path.includes(":") || a.path.endsWith("*")) - Number(b.path.includes(":") || b.path.endsWith("*")));
  return sorted.find((r) => matchPath(r.path, pathname) || (r.path.endsWith("/*") && pathname === r.path.slice(0, -2)));
}

describe("route map", () => {
  it("has unique ids and paths", () => {
    expect(new Set(SHELL_ROUTES.map((r) => r.id)).size).toBe(SHELL_ROUTES.length);
    expect(new Set(SHELL_ROUTES.map((r) => r.path)).size).toBe(SHELL_ROUTES.length);
  });

  it("registers every new path from the F2 table", () => {
    const paths = SHELL_ROUTES.map((r) => r.path);
    for (const p of [
      "/my-month", "/data/new", "/data/mine", "/production", "/overview", "/data/approvals", "/data/ledger",
      "/data/production", "/team", "/reports/ghg", "/reports/ede", "/targets", "/products/*", "/notifications",
      "/settings", "/users", "/console", "/clients", "/clients/new", "/clients/:clientId/brand",
    ]) {
      expect(paths).toContain(p);
    }
  });

  it("sends each role home to a page it can open", () => {
    expect(HOME_BY_ROLE).toEqual({ User: "/my-month", Manager: "/overview", Admin: "/users", Superadmin: "/console" });
    for (const role of ROLES) {
      const route = routeFor(homeFor(role) as string);
      expect(route && canAccess(role, route)).toBe(true);
    }
    expect(homeFor(null)).toBeNull();
  });

  it("only accepts known roles", () => {
    expect(asRole("Manager")).toBe("Manager");
    expect(asRole("manager")).toBeNull();
    expect(asRole(null)).toBeNull();
    expect(canAccess(null, SHELL_ROUTES[0])).toBe(false);
  });

  it("reserves /products/* for PCF and sends staff to setup products instead", () => {
    const pcf = SHELL_ROUTES.find((r) => r.id === "pcf");
    expect(pcf?.roles).toEqual(["Manager"]);
    expect(pcf?.roleRedirect).toEqual({ Superadmin: "/setup/products" });
  });

  it("keeps notifications and settings open to every role", () => {
    for (const id of ["notifications", "settings"]) {
      const route = SHELL_ROUTES.find((r) => r.id === id);
      for (const role of ROLES) expect(canAccess(role, route as (typeof SHELL_ROUTES)[number])).toBe(true);
    }
  });
});

describe("nav per role", () => {
  // With every switch off and with KPI tracking on (KPI-1).
  const FLAGS = [{}, { kpi: true }, { kpi: true, studio: true }, { kpi: true, studio: true, insights: true }]; // DS-0: and the studio on; IN-0: and Insights

  it("only links to pages the role may open", () => {
    for (const flags of FLAGS)
    for (const role of ROLES) {
      for (const link of navLinks(role, flags)) {
        const route = routeFor(resolveNavTo(link.to, 7));
        expect(route, `${role}: ${link.to}`).toBeDefined();
        expect(canAccess(role, route as (typeof SHELL_ROUTES)[number]), `${role}: ${link.to}`).toBe(true);
      }
    }
  });

  it("hides every other role's pages", () => {
    for (const flags of FLAGS)
    for (const role of ROLES) {
      const mine = new Set(navLinks(role, flags).map((l) => resolveNavTo(l.to, 7).split("?")[0]));
      for (const other of ROLES.filter((r) => r !== role)) {
        for (const link of navLinks(other, flags)) {
          const route = routeFor(resolveNavTo(link.to, 7)) as (typeof SHELL_ROUTES)[number];
          if (!canAccess(role, route)) expect(mine.has(resolveNavTo(link.to, 7).split("?")[0])).toBe(false);
        }
      }
    }
  });
});

describe("KPI routes (01-contracts §6)", () => {
  it("registers every KPI route behind the switch, except the global library", () => {
    const kpi = SHELL_ROUTES.filter((r) => r.id.startsWith("kpi-"));
    expect(kpi.map((r) => [r.id, r.path])).toEqual([
      ["kpi-my", "/kpi"],
      ["kpi-setup", "/kpi/setup"],
      ["kpi-targets", "/kpi/targets"],
      ["kpi-dashboard", "/kpi/dashboard"],
      ["kpi-esg", "/kpi/esg"],
      ["kpi-reports", "/reports/kpi/:framework"],
      ["kpi-library", "/setup/kpi-library"],
    ]);
    for (const r of kpi) expect((r as { requires?: string }).requires, r.id).toBe(r.id === "kpi-library" ? undefined : "kpi");
  });

  it("gives each KPI route the §6 roles", () => {
    const roles = (id: string) => SHELL_ROUTES.find((r) => r.id === id)?.roles;
    expect(roles("kpi-my")).toEqual(["User", "Manager", "Admin"]);
    expect(roles("kpi-setup")).toEqual(["Admin", "Superadmin"]);
    expect(roles("kpi-library")).toEqual(["Superadmin"]);
  });

  it("meets a requirement only when its switch is on", () => {
    expect(meetsRequirement(undefined, {})).toBe(true);
    expect(meetsRequirement("kpi", {})).toBe(false);
    expect(meetsRequirement("kpi", { kpi: false })).toBe(false);
    expect(meetsRequirement("kpi", { kpi: true })).toBe(true);
  });
});

describe("legacy redirects", () => {
  it("point at registered routes", () => {
    for (const redirect of LEGACY_REDIRECTS) {
      const target = resolveLegacyRedirect(redirect, "", "", 3);
      expect(routeFor(target), `${redirect.from} → ${target}`).toBeDefined();
      expect(routeFor(redirect.from)).toBeUndefined();
    }
  });

  it("covers every old path in the spec", () => {
    const from = LEGACY_REDIRECTS.map((r) => r.from);
    for (const p of [
      "/data-entry", "/my-emissions", "/production-data", "/manager-dashboard", "/company/dashboard", "/data-manage",
      "/manage-production-data", "/manage-users", "/ghg-reports", "/ede-reports", "/sbti-commitment",
      "/admin-company/users", "/superadmin", "/admin/dashboard", "/companies", "/companies/onboard", "/brand-settings",
      "/sites", "/countries", "/categories", "/units", "/emission-factors", "/category-mappings", "/threshold-values",
      "/manage-columns", "/column-config", "/upload-data",
    ]) {
      expect(from).toContain(p);
    }
  });

  it("keeps the query and hash, target params win", () => {
    const units = LEGACY_REDIRECTS.find((r) => r.from === "/units")!;
    expect(resolveLegacyRedirect(units, "?q=kg&tab=x", "#top", null)).toBe("/setup/reference?q=kg&tab=units#top");
    const ghg = LEGACY_REDIRECTS.find((r) => r.from === "/ghg-reports")!;
    expect(resolveLegacyRedirect(ghg, "?year=2025", "", null)).toBe("/reports/ghg?year=2025");
  });

  it("opens the picked client's brand page, or the client list", () => {
    const brand = LEGACY_REDIRECTS.find((r) => r.from === "/brand-settings")!;
    expect(resolveLegacyRedirect(brand, "", "", 6)).toBe("/clients/6/brand");
    expect(resolveLegacyRedirect(brand, "", "", null)).toBe("/clients");
    expect(withClientId("/console", null)).toBe("/console");
  });
});

describe("client context from the URL", () => {
  const byPath = (path: string) => SHELL_ROUTES.find((r) => r.path === path) ?? null;

  it("reads :clientId only on routes that declare client context", () => {
    expect(clientIdFromRoute(byPath("/clients/:clientId/brand"), { clientId: "7" })).toBe(7);
    expect(clientIdFromRoute(byPath("/clients/:clientId"), { clientId: "3" })).toBe(3);
    expect(clientIdFromRoute(byPath("/capture/forms/:id"), { id: "5" })).toBeNull();
    expect(clientIdFromRoute(byPath("/reports/ghg"), {})).toBeNull();
    expect(clientIdFromRoute(byPath("/clients/:clientId"), { clientId: "new" })).toBeNull();
    expect(clientIdFromRoute(null, { clientId: "7" })).toBeNull();
  });

  it("matches /clients/7/brand to the brand route with a clientId param", () => {
    const route = byPath("/clients/:clientId/brand");
    expect(matchPath(route?.path ?? "", "/clients/7/brand")?.params).toEqual({ clientId: "7" });
  });

  it("switches client only on :clientId routes", () => {
    expect(pathForClient(byPath("/clients/:clientId/brand"), 9)).toBe("/clients/9/brand");
    expect(pathForClient(byPath("/capture/forms/:id"), 9)).toBeNull();
    expect(pathForClient(byPath("/reports/ghg"), 9)).toBeNull();
  });
});

describe("Design Studio routes (DS-0, 01-contracts §9)", () => {
  it("registers every studio route behind the studio switch, for Admins, Managers and the Superadmin", () => {
    const studio = SHELL_ROUTES.filter((r) => r.id.startsWith("studio-"));
    expect(studio.map((r) => [r.id, r.path])).toEqual([
      ["studio-home", "/studio"],
      ["studio-new", "/studio/new"],
      ["studio-brand-kit", "/studio/brand-kit"],
      ["studio-editor", "/studio/:id"],
      ["studio-preview", "/studio/:id/preview"],
      ["studio-present", "/studio/:id/present"],
      ["studio-versions", "/studio/:id/versions"],
    ]);
    for (const r of studio) {
      expect((r as { requires?: string }).requires, r.id).toBe("studio");
      expect(r.roles, r.id).toEqual(["Manager", "Admin", "Superadmin"]);
      expect(canAccess("User", r), r.id).toBe(false);
    }
  });

  it("sends /studio/new and /studio/brand-kit to their own pages, not the editor", () => {
    expect(routeFor("/studio/new?kind=ghg")?.id).toBe("studio-new");
    expect(routeFor("/studio/brand-kit")?.id).toBe("studio-brand-kit");
    expect(routeFor("/studio/12")?.id).toBe("studio-editor");
    expect(routeFor("/studio/12/present")?.id).toBe("studio-present");
  });

  it("meets the studio requirement only when its switch is on", () => {
    expect(meetsRequirement("studio", {})).toBe(false);
    expect(meetsRequirement("studio", { kpi: true })).toBe(false);
    expect(meetsRequirement("studio", { studio: true })).toBe(true);
  });
});

describe("Insights routes (IN-0, 01-contracts §9)", () => {
  it("registers /insights and /insights/present behind the Insights switch, for Managers, Admins and the Superadmin", () => {
    const insights = SHELL_ROUTES.filter((r) => r.id.startsWith("insights"));
    expect(insights.map((r) => [r.id, r.path])).toEqual([
      ["insights", "/insights"],
      ["insights-present", "/insights/present"],
    ]);
    for (const r of insights) {
      expect((r as { requires?: string }).requires, r.id).toBe("insights");
      expect(r.roles, r.id).toEqual(["Manager", "Admin", "Superadmin"]);
      expect(canAccess("User", r), r.id).toBe(false);
    }
    expect(routeFor("/insights?year=2025&panel=bridge")?.id).toBe("insights");
    expect(routeFor("/insights/present")?.id).toBe("insights-present");
  });

  it("meets the insights requirement only when its switch is on", () => {
    expect(meetsRequirement("insights", {})).toBe(false);
    expect(meetsRequirement("insights", { kpi: true, studio: true })).toBe(false);
    expect(meetsRequirement("insights", { insights: true })).toBe(true);
  });
});
