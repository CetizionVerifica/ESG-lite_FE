import { describe, expect, it } from "vitest";
import { pushRecent, routeCommands } from "./commands";

describe("command registry", () => {
  it("lists the role's pages plus account pages", () => {
    const labels = routeCommands("Admin", null).map((c) => c.label);
    expect(labels).toEqual(["Users", "Bulk upload", "Brand theme", "Scope 3 boundary", "Suppliers", "Notifications", "Settings"]);
    expect(routeCommands(null, null)).toEqual([]);
  });

  it("never offers another role's pages", () => {
    const tos = routeCommands("User", null).map((c) => c.to);
    expect(tos).not.toContain("/overview");
    expect(tos).not.toContain("/console");
  });

  it("resolves client-scoped pages with the picked client", () => {
    const brand = routeCommands("Superadmin", 9).find((c) => c.label === "Brand themes");
    expect(brand?.to).toBe("/clients/9/brand");
  });

  it("offers KPI pages only while the company's KPI tracking is on (KPI-1)", () => {
    expect(routeCommands("User", null).map((c) => c.to)).not.toContain("/kpi");
    expect(routeCommands("User", null, { kpi: false }).map((c) => c.to)).not.toContain("/kpi");
    expect(routeCommands("User", null, { kpi: true }).find((c) => c.to === "/kpi")?.label).toBe("My KPIs");
    expect(routeCommands("Admin", null, { kpi: true }).map((c) => c.label)).toContain("KPI setup");
  });

  it("names KPI pages plainly in the palette and follows role and switch (wave D)", () => {
    const labels = (role: "Manager" | "Admin" | "Superadmin" | "User", kpi: boolean) => routeCommands(role, 3, { kpi }).filter((c) => c.group === "KPIs" || c.to.includes("kpi")).map((c) => c.label);
    expect(labels("Admin", true)).toEqual(["ESG dashboard", "KPI dashboard", "KPI targets", "Framework reports", "KPI setup"]);
    expect(labels("Manager", true)).toEqual(["Framework reports", "ESG dashboard", "KPI dashboard", "KPI targets"]);
    expect(labels("Superadmin", true)).toEqual(["KPI library", "ESG dashboard", "KPI dashboard", "KPI targets", "KPI approvals", "Framework reports", "KPI setup"]);
    expect(labels("User", true)).toEqual(["My KPIs"]);
    expect(labels("Admin", false)).toEqual([]);
    expect(routeCommands("Superadmin", 3, { kpi: true }).find((c) => c.label === "KPI dashboard")?.keywords).toContain("kpis dashboard");
  });

  it("keeps recent items unique, newest first, capped", () => {
    expect(pushRecent(["a", "b"], "b")).toEqual(["b", "a"]);
    expect(pushRecent(["a", "b", "c"], "d", 3)).toEqual(["d", "a", "b"]);
  });

});

describe("Design Studio commands (DS-0)", () => {
  const studio = (role: "User" | "Manager" | "Admin" | "Superadmin", flags: { kpi?: boolean; studio?: boolean }) =>
    routeCommands(role, 3, flags)
      .filter((c) => c.group === "Design Studio" || c.to.startsWith("/studio"))
      .map((c) => [c.label, c.to]);

  it("offers nothing while the studio is off", () => {
    for (const role of ["User", "Manager", "Admin", "Superadmin"] as const) expect(studio(role, { kpi: true }), role).toEqual([]);
  });

  it("offers the studio and a new GHG design; a sustainability design also needs KPI tracking", () => {
    expect(studio("Manager", { studio: true })).toEqual([
      ["Design Studio", "/studio"],
      ["New GHG report design", "/studio/new?kind=ghg"],
    ]);
    expect(studio("Admin", { studio: true, kpi: true })).toEqual([
      ["Design Studio", "/studio"],
      ["New GHG report design", "/studio/new?kind=ghg"],
      ["New sustainability report design", "/studio/new?kind=sustainability"],
    ]);
    expect(studio("User", { studio: true, kpi: true })).toEqual([]);
  });
});
