import { describe, expect, it } from "vitest";
import {
  type Site,
  type User,
  availableCategories,
  buildRows,
  draftFrom,
  emptyDraft,
  isDirty,
  lastActive,
  lostPermissions,
  matchesFilters,
  retargetCategories,
  sitesForClient,
  timezoneOptions,
  toPayload,
  validate,
  withClient,
  withRole,
} from "./logic";

const steel = { company_id: 1, name: "Steel Co" };
const other = { company_id: 2, name: "Other Co" };
const fuel = { category_id: 1, category_name: "Fuel", scope: "Scope 1" };
const power = { category_id: 2, category_name: "Power", scope: "Scope 2" };
const travel = { category_id: 3, category_name: "Travel", scope: "Scope 3" };
const SITES: Site[] = [
  { site_id: 1, name: "Plant A", company: steel, categories: [fuel, power, travel] },
  { site_id: 2, name: "Plant B", company: steel, categories: [fuel] },
  { site_id: 3, name: "Other plant", company: other, categories: [power] },
];
const USERS: User[] = [
  { user_id: 1, name: "Ana", last_name: "Ruiz", email: "ana@x.io", role: "User", sites: [{ site_id: 2, name: "Plant B" }, { site_id: 1, name: "Plant A" }], categories: [fuel], last_login_at: "2026-10-01T10:00:00Z" },
  { user_id: 2, email: "boss@x.io", role: "Admin", site: { site_id: 3, name: "Other plant" }, last_login_at: null },
  { user_id: 3, name: "Root", email: "root@x.io", role: "Superadmin" },
];

describe("buildRows", () => {
  const rows = buildRows(USERS, SITES);
  it("names people, falling back to email", () => {
    expect(rows.map((r) => r.displayName)).toEqual(["Ana Ruiz", "boss@x.io", "Root"]);
  });
  it("fills the client from the sites list and sorts sites", () => {
    expect(rows[0].siteList.map((s) => s.name)).toEqual(["Plant A", "Plant B"]);
    expect(rows[0].clients).toEqual([steel]);
    expect(rows[1].clients).toEqual([other]);
    expect(rows[2].clients).toEqual([]);
  });
  it("does not list a site twice when both site and sites carry it", () => {
    const [row] = buildRows([{ user_id: 9, email: "a@b.c", role: "User", site: { site_id: 1, name: "Plant A" }, sites: [{ site_id: 1, name: "Plant A" }] }], SITES);
    expect(row.siteList).toHaveLength(1);
  });
});

describe("matchesFilters", () => {
  const rows = buildRows(USERS, SITES);
  const none = { q: "", clientIds: [], roles: [], siteIds: [] };
  it("filters by role, client, site and text", () => {
    expect(rows.filter((r) => matchesFilters(r, { ...none, roles: ["Admin", "Superadmin"] })).map((r) => r.user_id)).toEqual([2, 3]);
    expect(rows.filter((r) => matchesFilters(r, { ...none, clientIds: [1] })).map((r) => r.user_id)).toEqual([1]);
    expect(rows.filter((r) => matchesFilters(r, { ...none, siteIds: [3] })).map((r) => r.user_id)).toEqual([2]);
    expect(rows.filter((r) => matchesFilters(r, { ...none, q: "plant b" })).map((r) => r.user_id)).toEqual([1]);
    expect(rows.filter((r) => matchesFilters(r, { ...none, q: "BOSS" })).map((r) => r.user_id)).toEqual([2]);
  });
});

describe("lastActive", () => {
  it("tells unknown, never and a date apart", () => {
    expect(lastActive({})).toBeNull();
    expect(lastActive({ last_login_at: null })).toBe("never");
    expect(lastActive({ last_login_at: "2026-10-01T10:00:00Z" })).toBe("2026-10-01T10:00:00Z");
  });
});

describe("validate", () => {
  it("needs email, role, client and sites by role", () => {
    expect(validate(emptyDraft())).toEqual({ email: "Enter an email address.", role: "Choose a role." });
    expect(validate({ ...emptyDraft(), email: "nope", role: "Superadmin" })).toEqual({ email: "Enter a valid email address, like name@company.com." });
    expect(validate({ ...emptyDraft(), email: "a@b.co", role: "Admin" })).toEqual({ company_id: "Choose the client this person works for." });
    expect(validate({ ...emptyDraft(1), email: "a@b.co", role: "Manager" })).toEqual({ site_ids: "Choose at least one site." });
    expect(validate({ ...emptyDraft(1), email: "a@b.co", role: "User", site_ids: [1] })).toEqual({ category_ids: "Choose at least one category this person can enter." });
    expect(validate({ ...emptyDraft(1), email: "a@b.co", role: "Admin" })).toEqual({ site_ids: "Choose the site this admin belongs to." });
    expect(validate({ ...emptyDraft(1), email: "a@b.co", role: "Admin", site_ids: [2] })).toEqual({});
  });
});

describe("site and category helpers", () => {
  it("lists one client's sites and their categories", () => {
    expect(sitesForClient(SITES, 1).map((s) => s.site_id)).toEqual([1, 2]);
    expect(sitesForClient(SITES, null)).toEqual([]);
    expect(availableCategories(SITES, [2, 3]).map((c) => c.category_id)).toEqual([1, 2]);
  });
  it("keeps chosen categories still available and switches on new ones", () => {
    // Had Plant B (fuel) with fuel picked; adding Plant A brings power and travel.
    expect(retargetCategories([1], [fuel], [fuel, power, travel])).toEqual([1, 2, 3]);
    // Dropping Plant A drops power and travel, keeps fuel.
    expect(retargetCategories([1, 2], [fuel, power, travel], [fuel])).toEqual([1]);
    // A category the person had switched off stays off when sites change elsewhere.
    expect(retargetCategories([1], [fuel, power], [fuel, power])).toEqual([1]);
  });
  it("applies role and client changes", () => {
    const d = { ...emptyDraft(1), role: "User" as const, site_ids: [1, 2], category_ids: [1] };
    expect(withRole(d, "Admin")).toMatchObject({ site_ids: [1], category_ids: [], company_id: 1 });
    expect(withRole(d, "Superadmin")).toMatchObject({ site_ids: [], category_ids: [], company_id: null });
    expect(withClient(d, 2)).toMatchObject({ company_id: 2, site_ids: [], category_ids: [] });
    expect(withClient(d, 1)).toBe(d);
  });
});

describe("toPayload", () => {
  const rows = buildRows(USERS, SITES);
  it("creates a User with sites and categories and no empty extras", () => {
    const d = { ...emptyDraft(1), name: " Lee ", email: " lee@x.io ", role: "User" as const, site_ids: [1], category_ids: [1, 2] };
    expect(toPayload(d, null)).toEqual({ name: "Lee", email: "lee@x.io", role: "User", site_ids: [1], category_ids: [1, 2] });
  });
  it("creates an Admin with their site", () => {
    expect(toPayload({ ...emptyDraft(1), email: "a@x.io", role: "Admin", site_ids: [2] }, null)).toEqual({ email: "a@x.io", role: "Admin", site_id: 2 });
  });
  it("sends only changed fields on edit", () => {
    const row = rows[0];
    expect(toPayload({ ...draftFrom(row), phone_number: "+39 1" }, row)).toEqual({ phone_number: "+39 1" });
    expect(toPayload({ ...draftFrom(row), last_name: "" }, row)).toEqual({ last_name: null });
    expect(toPayload({ ...draftFrom(row), category_ids: [1, 2] }, row)).toEqual({ category_ids: [1, 2] });
    expect(toPayload({ ...draftFrom(row), site_ids: [1], category_ids: [1] }, row)).toEqual({ site_ids: [1], category_ids: [1] });
  });
  it("moves sites to the right field when the role changes", () => {
    const row = rows[0];
    expect(toPayload(withRole(draftFrom(row), "Admin"), row)).toEqual({ role: "Admin", site_id: 1 });
    expect(toPayload(withRole(draftFrom(rows[1]), "Superadmin"), rows[1])).toEqual({ role: "Superadmin", site_id: null });
  });
  it("is clean right after opening", () => {
    for (const r of rows) {
      expect(isDirty(draftFrom(r), r)).toBe(false);
      expect(toPayload(draftFrom(r), r)).toEqual({});
    }
  });
});

describe("lostPermissions", () => {
  it("lists what a lower role takes away and nothing for a promotion", () => {
    expect(lostPermissions("Manager", "User")).toEqual(["Approve and reject data for their sites", "Choose which categories their users can enter"]);
    expect(lostPermissions("Superadmin", "Manager")).toHaveLength(4);
    expect(lostPermissions("User", "Admin")).toEqual([]);
    expect(lostPermissions("Admin", "Admin")).toEqual([]);
    expect(lostPermissions("Ghost", "User")).toEqual([]);
  });
});

describe("timezoneOptions", () => {
  it("includes the browser's zones and keeps an unknown current one", () => {
    expect(timezoneOptions(null)).toContain("UTC");
    expect(timezoneOptions("Mars/Base")[0]).toBe("Mars/Base");
  });
});
