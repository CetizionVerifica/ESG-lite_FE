import { describe, expect, it } from "vitest";
import { NAV_BY_ROLE, type NavItem, isActiveLink, navFor, navLinks, resolveNavTo } from "./nav";

const show = (items: NavItem[]) => items.map((i) => (i.kind === "link" ? i.label : `${i.label} ▾ (${i.items.map((c) => c.label).join(", ")})`));
// Today's nav: every company switch off.
const labels = (role: keyof typeof NAV_BY_ROLE) => show(navFor(role));

describe("nav labels (final copy from the F2 spec)", () => {
  it("User", () => expect(labels("User")).toEqual(["Current Month", "Add data", "My entries", "Production"]));
  it("Manager", () =>
    expect(labels("Manager")).toEqual([
      "Overview",
      "Data ▾ (Approvals, Emissions ledger, Production data, Suppliers, Bulk upload)",
      "Reports ▾ (GHG report, EDE report, Scope 3 boundary)",
      "Targets (SBTi)",
      "Products (PCF)",
      "Team",
    ]));
  it("Admin", () => expect(labels("Admin")).toEqual(["Users", "Bulk upload", "Brand theme", "Scope 3 boundary", "Suppliers"]));
  it("Superadmin", () =>
    expect(labels("Superadmin")).toEqual([
      "Console",
      "Clients ▾ (Companies, Onboard client, Brand themes, Scope 3 boundary, Suppliers)",
      "Setup ▾ (Sites, Users, Countries, Categories, Units, Products, KPI library)",
      "Factors ▾ (Emission factors, Category mappings, Thresholds, Material factors)",
      "Capture ▾ (Columns, Data-entry forms, Bulk upload)",
      "Reports ▾ (GHG, EDE)",
    ]));
  it("is empty when signed out", () => expect(navFor(null)).toEqual([]));
});

describe("resolveNavTo", () => {
  it("fills the picked client, else opens the client list", () => {
    expect(resolveNavTo("/clients/:clientId/brand", 4)).toBe("/clients/4/brand");
    expect(resolveNavTo("/clients/:clientId/brand", null)).toBe("/clients");
  });
});

describe("isActiveLink", () => {
  it("matches exact paths and sub-pages", () => {
    expect(isActiveLink("/overview", "/overview", "")).toBe(true);
    expect(isActiveLink("/products", "/products/12/result", "")).toBe(true);
    expect(isActiveLink("/data/approvals", "/data/ledger", "")).toBe(false);
  });
  it("tells reference tabs apart by query", () => {
    expect(isActiveLink("/setup/reference?tab=units", "/setup/reference", "?tab=units")).toBe(true);
    expect(isActiveLink("/setup/reference?tab=units", "/setup/reference", "?tab=countries")).toBe(false);
  });
  it("does not light Companies on onboarding or brand pages", () => {
    expect(isActiveLink("/clients", "/clients/new", "")).toBe(false);
    expect(isActiveLink("/clients", "/clients/3/brand", "")).toBe(false);
    expect(isActiveLink("/clients", "/clients/3", "")).toBe(true);
  });
  it("lights only the matching Factors page", () => {
    expect(isActiveLink("/factors", "/factors", "")).toBe(true);
    expect(isActiveLink("/factors", "/factors/materials", "")).toBe(false);
    expect(isActiveLink("/factors/materials", "/factors/materials", "")).toBe(true);
  });
});

describe("switch-aware nav (KPI-1)", () => {
  it("leaves every KPI item out while KPI tracking is off", () => {
    for (const role of ["User", "Manager", "Admin"] as const) {
      for (const flags of [{}, { kpi: false }]) {
        const links = navLinks(role, flags).map((l) => l.to);
        expect(links.filter((to) => to.startsWith("/kpi") || to.startsWith("/reports/kpi")), role).toEqual([]);
      }
    }
  });

  it("adds the §6 items per role when it's on", () => {
    expect(show(navFor("User", { kpi: true }))).toEqual(["Current Month", "My KPIs", "Add data", "My entries", "Production"]);
    expect(show(navFor("Manager", { kpi: true }))).toEqual([
      "Overview",
      "Data ▾ (Approvals, KPIs, Emissions ledger, Production data, Suppliers, Bulk upload)",
      "Reports ▾ (GHG report, EDE report, Framework reports, Scope 3 boundary)",
      "Targets (SBTi)",
      "Products (PCF)",
      "Team",
    ]);
    expect(show(navFor("Admin", { kpi: true }))).toEqual(["Users", "Bulk upload", "Brand theme", "Scope 3 boundary", "Suppliers", "KPIs", "KPI setup"]);
  });

  it("keeps the Superadmin's KPI library whatever the switch: the library is global", () => {
    for (const flags of [{}, { kpi: true }]) expect(navLinks("Superadmin", flags).some((l) => l.to === "/setup/kpi-library")).toBe(true);
  });

  it("drops a group left empty and never changes the static nav", () => {
    const before = JSON.stringify(NAV_BY_ROLE);
    navFor("Manager", {});
    expect(JSON.stringify(NAV_BY_ROLE)).toBe(before);
    expect(navFor("Manager", {}).every((i) => i.kind === "link" || i.items.length > 0)).toBe(true);
  });
});
