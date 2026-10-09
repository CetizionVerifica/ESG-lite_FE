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
  homeFor,
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
      "/settings", "/users", "/console", "/clients", "/clients/new", "/clients/:id/brand",
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
  it("only links to pages the role may open", () => {
    for (const role of ROLES) {
      for (const link of navLinks(role)) {
        const route = routeFor(resolveNavTo(link.to, 7));
        expect(route, `${role}: ${link.to}`).toBeDefined();
        expect(canAccess(role, route as (typeof SHELL_ROUTES)[number]), `${role}: ${link.to}`).toBe(true);
      }
    }
  });

  it("hides every other role's pages", () => {
    for (const role of ROLES) {
      const mine = new Set(navLinks(role).map((l) => resolveNavTo(l.to, 7).split("?")[0]));
      for (const other of ROLES.filter((r) => r !== role)) {
        for (const link of navLinks(other)) {
          const route = routeFor(resolveNavTo(link.to, 7)) as (typeof SHELL_ROUTES)[number];
          if (!canAccess(role, route)) expect(mine.has(resolveNavTo(link.to, 7).split("?")[0])).toBe(false);
        }
      }
    }
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
