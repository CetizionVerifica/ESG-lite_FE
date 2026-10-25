// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { saveActiveCompany, storedActiveCompany } from "./activeCompany";
import { clearSession } from "./session";

afterEach(() => localStorage.clear());

describe("clearSession (#245)", () => {
  it("removes the sign-in and keeps the person's choices on this device", () => {
    const user = { user_id: 7, role: "Manager", sites: [{ site_id: 1, company: { company_id: 1, name: "Midal" } }, { site_id: 2, company: { company_id: 2, name: "Glochem" } }] };
    localStorage.setItem("token", "t");
    localStorage.setItem("role", "Manager");
    localStorage.setItem("user", JSON.stringify(user));
    saveActiveCompany(user, 2);
    localStorage.setItem("dt:my-entries", JSON.stringify({ hidden: ["submitted"], density: "compact" }));
    localStorage.setItem("fb:ledger", "[]");

    clearSession();

    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("role")).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
    // Signing back in as the same person finds their company and table settings.
    expect(storedActiveCompany(user)).toBe(2);
    expect(JSON.parse(localStorage.getItem("dt:my-entries") ?? "{}")).toEqual({ hidden: ["submitted"], density: "compact" });
    expect(localStorage.getItem("fb:ledger")).toBe("[]");
    // Someone else on the device doesn't get that company: the choice is per user id.
    expect(storedActiveCompany({ ...user, user_id: 8 })).toBeNull();
  });
});
