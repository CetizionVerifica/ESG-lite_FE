import { describe, expect, it } from "vitest";
import { pushRecent, routeCommands } from "./commands";

describe("command registry", () => {
  it("lists the role's pages plus account pages", () => {
    const labels = routeCommands("Admin", null).map((c) => c.label);
    expect(labels).toEqual(["Users", "Notifications", "Settings"]);
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

  it("keeps recent items unique, newest first, capped", () => {
    expect(pushRecent(["a", "b"], "b")).toEqual(["b", "a"]);
    expect(pushRecent(["a", "b", "c"], "d", 3)).toEqual(["d", "a", "b"]);
  });

});
