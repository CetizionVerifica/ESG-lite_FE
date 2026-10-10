import { describe, expect, it } from "vitest";
import {
  type CompanyUser,
  EMPTY_DRAFT,
  createPayload,
  displayName,
  draftFromUser,
  kpis,
  matchesFilters,
  sitesOf,
  updatePayload,
  validate,
} from "./logic";

const HIDD = { site_id: 1, name: "Hidd" };
const SITRA = { site_id: 2, name: "Sitra" };
const ASKAR = { site_id: 3, name: "Askar" };

function user(over: Partial<CompanyUser> = {}): CompanyUser {
  return { user_id: 7, name: "Omar", last_name: null, email: "omar@example.com", role: "User", site: null, sites: [HIDD, SITRA], ...over };
}

describe("people", () => {
  it("names fall back to email", () => {
    expect(displayName(user())).toBe("Omar");
    expect(displayName(user({ name: " ", last_name: null }))).toBe("omar@example.com");
  });

  it("reads sites from either relation", () => {
    expect(sitesOf(user())).toEqual([HIDD, SITRA]);
    expect(sitesOf(user({ sites: [], site: ASKAR }))).toEqual([ASKAR]);
    expect(sitesOf(user({ sites: null, site: null }))).toEqual([]);
  });
});

describe("validate", () => {
  it("asks for email, role, a site and (when inviting) a temporary password", () => {
    expect(validate(EMPTY_DRAFT, true)).toEqual({
      email: "Enter an email address.",
      role: "Choose a role.",
      sites: "Choose at least one site.",
      password: "Use at least 8 characters.",
    });
    expect(validate({ ...EMPTY_DRAFT, email: "nope" }, false).email).toBe("Enter a valid email address.");
    const ok = { ...EMPTY_DRAFT, email: "a@b.co", role: "User" as const, siteIds: [1], password: "longenough" };
    expect(validate(ok, true)).toEqual({});
    expect(validate({ ...ok, password: "" }, false)).toEqual({});
  });

  it("keeps a name once the person has one", () => {
    const ok = { ...EMPTY_DRAFT, email: "a@b.co", role: "User" as const, siteIds: [1] };
    expect(validate(ok, false, true).name).toBe("Enter a name.");
    expect(validate(ok, false, false)).toEqual({});
  });
});

describe("payloads", () => {
  it("invite sends trimmed, lower-cased fields and sorted site_ids", () => {
    expect(createPayload({ name: " Layla ", email: " Layla@Example.com ", role: "Manager", siteIds: [2, 1], password: "temp-pass", sendLink: true })).toEqual({
      name: "Layla",
      email: "layla@example.com",
      password: "temp-pass",
      role: "Manager",
      site_ids: [1, 2],
    });
  });

  it("edit sends only what changed, and sites only when they changed", () => {
    const u = user();
    expect(updatePayload(u, draftFromUser(u))).toEqual({});
    expect(updatePayload(u, { ...draftFromUser(u), siteIds: [2, 1] })).toEqual({});
    expect(updatePayload(u, { ...draftFromUser(u), role: "Manager", siteIds: [3] })).toEqual({ role: "Manager", site_ids: [3] });
    expect(updatePayload(u, { ...draftFromUser(u), name: "Omar S", email: "OMAR@example.com" })).toEqual({ name: "Omar S" });
  });
});

describe("filters and figures", () => {
  it("filters by role, site and search", () => {
    const u = user();
    expect(matchesFilters(u, { siteIds: [], q: "" })).toBe(true);
    expect(matchesFilters(u, { role: "Manager", siteIds: [], q: "" })).toBe(false);
    expect(matchesFilters(u, { siteIds: [3], q: "" })).toBe(false);
    expect(matchesFilters(u, { siteIds: [2], q: "sitra" })).toBe(true);
    expect(matchesFilters(u, { siteIds: [], q: "layla" })).toBe(false);
  });

  it("counts roles and finds sites without a manager", () => {
    const people = [user(), user({ user_id: 8, role: "Manager", sites: [HIDD] }), user({ user_id: 9, role: "Manager", sites: [], site: SITRA })];
    expect(kpis(people, [HIDD, SITRA, ASKAR])).toEqual({ people: 3, managers: 2, contributors: 1, unmanaged: [ASKAR] });
  });
});
