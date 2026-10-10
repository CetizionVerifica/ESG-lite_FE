import { describe, expect, it } from "vitest";
import { NAV_BY_ROLE, isActiveLink, navFor, resolveNavTo } from "./nav";

const labels = (role: keyof typeof NAV_BY_ROLE) =>
  NAV_BY_ROLE[role].map((i) => (i.kind === "link" ? i.label : `${i.label} ▾ (${i.items.map((c) => c.label).join(", ")})`));

describe("nav labels (final copy from the F2 spec)", () => {
  it("User", () => expect(labels("User")).toEqual(["My month", "Add data", "My entries", "Production"]));
  it("Manager", () =>
    expect(labels("Manager")).toEqual([
      "Overview",
      "Data ▾ (Approvals, Emissions ledger, Production data)",
      "Reports ▾ (GHG report, EDE report)",
      "Targets (SBTi)",
      "Products (PCF)",
      "Team",
    ]));
  it("Admin", () => expect(labels("Admin")).toEqual(["Users", "Brand theme"]));
  it("Superadmin", () =>
    expect(labels("Superadmin")).toEqual([
      "Console",
      "Clients ▾ (Companies, Onboard client, Brand themes)",
      "Setup ▾ (Sites, Users, Countries, Categories, Units, Products)",
      "Factors ▾ (Emission factors, Category mappings, Thresholds, Material factors)",
      "Capture ▾ (Columns, Column configs, Bulk upload)",
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
