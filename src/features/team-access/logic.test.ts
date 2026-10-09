import { describe, expect, it } from "vitest";
import type { ManagerUser } from "../../services/managerService";
import {
  accessCount,
  currentMonth,
  displayName,
  enabledIds,
  initialDraft,
  isDirty,
  matchesSearch,
  monthStatusById,
  onSites,
  saveError,
  setSite,
  sharedCategories,
} from "./logic";

// Fuel (1) is on both sites, so it is one switch in both sections.
function user(over: Partial<ManagerUser> = {}): ManagerUser {
  return {
    user_id: 7,
    name: "Omar",
    last_name: "Saleh",
    email: "omar@example.com",
    role: "User",
    sites: [
      {
        site_id: 1,
        site_name: "Hidd",
        categories: [
          { category_id: 1, category_name: "Fuel", has_access: true },
          { category_id: 2, category_name: "Electricity", has_access: false },
        ],
      },
      {
        site_id: 2,
        site_name: "Sitra",
        categories: [
          { category_id: 1, category_name: "Fuel", has_access: true },
          { category_id: 3, category_name: "Refrigerants", has_access: true },
        ],
      },
    ],
    ...over,
  };
}

describe("displayName", () => {
  it("joins first and last name, falling back to email", () => {
    expect(displayName(user())).toBe("Omar Saleh");
    expect(displayName(user({ name: "", last_name: "" }))).toBe("omar@example.com");
    expect(displayName(user({ last_name: null as unknown as string }))).toBe("Omar");
  });
});

describe("draft", () => {
  it("starts from the saved access, keyed by category", () => {
    expect(initialDraft(user())).toEqual({ 1: true, 2: false, 3: true });
  });

  it("enable/disable all touches only that site's categories (shared ones follow)", () => {
    const u = user();
    const off = setSite(initialDraft(u), u, 2, false);
    expect(off).toEqual({ 1: false, 2: false, 3: false });
    const on = setSite(initialDraft(u), u, 1, true);
    expect(on).toEqual({ 1: true, 2: true, 3: true });
    expect(setSite(initialDraft(u), u, 99, false)).toEqual(initialDraft(u));
  });

  it("sends enabled ids on the person's sites only, sorted", () => {
    const u = user();
    expect(enabledIds({ 3: true, 1: true, 2: false, 42: true }, u)).toEqual([1, 3]);
  });

  it("is dirty only when a switch differs from the saved state", () => {
    const u = user();
    expect(isDirty(initialDraft(u), u)).toBe(false);
    expect(isDirty({ ...initialDraft(u), 2: true }, u)).toBe(true);
  });

  it("won't save with every category revoked (server reads none as all)", () => {
    const u = user();
    expect(saveError({ 1: false, 2: false, 3: false }, u)).toMatch(/at least one/);
    expect(saveError(initialDraft(u), u)).toBeNull();
    expect(saveError({}, user({ sites: [{ site_id: 1, site_name: "Hidd", categories: [] }] }))).toBeNull();
  });
});

describe("sharedCategories", () => {
  it("lists categories on two or more of the person's sites", () => {
    expect(sharedCategories(user())).toEqual(new Map([[1, ["Hidd", "Sitra"]]]));
  });
});

describe("accessCount", () => {
  it("counts site × category rows, optionally for some sites", () => {
    expect(accessCount(user())).toEqual({ enabled: 3, total: 4 });
    expect(accessCount(user(), [1])).toEqual({ enabled: 1, total: 2 });
    expect(accessCount(user(), [])).toEqual({ enabled: 3, total: 4 });
  });
});

describe("filters", () => {
  it("searches name, email and site", () => {
    expect(matchesSearch(user(), "")).toBe(true);
    expect(matchesSearch(user(), "saleh")).toBe(true);
    expect(matchesSearch(user(), "EXAMPLE")).toBe(true);
    expect(matchesSearch(user(), "sitra")).toBe(true);
    expect(matchesSearch(user(), "askar")).toBe(false);
  });

  it("keeps people on any chosen site; no sites means all", () => {
    expect(onSites(user(), [])).toBe(true);
    expect(onSites(user(), [2, 3])).toBe(true);
    expect(onSites(user(), [3])).toBe(false);
  });
});

describe("month status", () => {
  it("maps submission rows by user", () => {
    const m = monthStatusById([{ user_id: 7, name: "Omar", email: "", site_name: "Hidd", submission_count: 3, status: "submitted" }]);
    expect(m.get(7)).toEqual({ status: "submitted", count: 3 });
    expect(m.get(8)).toBeUndefined();
    expect(monthStatusById(undefined).size).toBe(0);
  });

  it("formats the current month", () => {
    expect(currentMonth(new Date(2026, 0, 31))).toBe("2026-01");
    expect(currentMonth(new Date(2026, 9, 9))).toBe("2026-10");
  });
});
