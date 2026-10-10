import { describe, expect, it } from "vitest";
import {
  type AdminUser,
  type Site,
  buildRows,
  cascadeItems,
  coverage,
  draftFrom,
  emptyDraft,
  groupByScope,
  isDirty,
  matchesFilters,
  scopeCounts,
  scopeKey,
  setMany,
  toIds,
  toPayload,
  validate,
} from "./logic";

const cat = (id: number, scope: string | null, name = `Cat ${id}`) => ({ category_id: id, category_name: name, scope });
const site: Site = {
  site_id: 1,
  name: "Pune Plant",
  address: "MIDC Road",
  contact_person: "Asha",
  company: { company_id: 10, name: "Acme" },
  country: { country_id: 5, name: "India" },
  categories: [cat(1, "Scope 1"), cat(2, "scope1"), cat(3, "Scope 2"), cat(4, "3"), cat(5, null)],
};
const user = (id: number, extra: Partial<AdminUser>): AdminUser => ({ user_id: id, email: `u${id}@x.io`, role: "User", ...extra });

describe("scopes", () => {
  it("reads the scope number from loose labels", () => {
    expect(scopeKey("Scope 1")).toBe("s1");
    expect(scopeKey("scope3")).toBe("s3");
    expect(scopeKey(undefined)).toBe("other");
  });
  it("counts and groups categories by scope", () => {
    expect(scopeCounts(site.categories!)).toEqual({ s1: 2, s2: 1, s3: 1, other: 1 });
    expect(groupByScope(site.categories!).map((g) => [g.key, g.items.length])).toEqual([
      ["s1", 2],
      ["s2", 1],
      ["s3", 1],
      ["other", 1],
    ]);
  });
});

describe("buildRows", () => {
  const users = [
    user(1, { site: { site_id: 1 } }),
    user(2, { role: "Manager", sites: [{ site_id: 1 }, { site_id: 2 }] }),
    user(3, { site: { site_id: 2 } }),
  ];
  const configs = [
    { pk_id: 1, config_name: "a", site: { site_id: 1 }, category: { category_id: 1 } },
    { pk_id: 2, config_name: "b", site: { site_id: 1 }, category: { category_id: 3 } },
    // A config for a category no longer on the site: counted for delete, not coverage.
    { pk_id: 3, config_name: "c", site: { site_id: 1 }, category: { category_id: 99 } },
  ];
  const [row] = buildRows([site], users, configs);

  it("splits users and managers per site", () => {
    expect(row.users.map((u) => u.user_id)).toEqual([1]);
    expect(row.managers.map((u) => u.user_id)).toEqual([2]);
  });
  it("counts coverage over the site's own categories", () => {
    expect(coverage(row)).toEqual({ done: 2, total: 5 });
    expect(row.configCount).toBe(3);
  });
  it("works without people or configs", () => {
    const [bare] = buildRows([site]);
    expect(bare.users).toEqual([]);
    expect(coverage(bare)).toEqual({ done: 0, total: 5 });
  });
  it("lists cascades, naming the user accounts that go with the site", () => {
    const items = cascadeItems(row);
    expect(items).toContain("3 column configs");
    // Every site relation the backend deletes with ON DELETE CASCADE.
    expect(items).toEqual(
      expect.arrayContaining([
        "All emission entries recorded for this site",
        "Its emission factors",
        "Its products and their production data",
        "Its PCF studies",
        "Its site-specific units",
      ]),
    );
    expect(items[items.length - 1]).toMatch(/^1 user account assigned to this site \(u1@x\.io\)/);
  });
});

describe("matchesFilters", () => {
  const f = { q: "", clientIds: [] as number[], countryIds: [] as number[] };
  it("filters by client, country and text", () => {
    expect(matchesFilters(site, { ...f, clientIds: [10] })).toBe(true);
    expect(matchesFilters(site, { ...f, clientIds: [11] })).toBe(false);
    expect(matchesFilters(site, { ...f, countryIds: [5, 6] })).toBe(true);
    expect(matchesFilters(site, { ...f, q: "acme" })).toBe(true);
    expect(matchesFilters(site, { ...f, q: "berlin" })).toBe(false);
  });
  it("parses ids from the URL", () => {
    expect(toIds(["3", "x", "0", "7"])).toEqual([3, 7]);
  });
});

describe("draft", () => {
  it("requires every detail, including client and country", () => {
    expect(Object.keys(validate(emptyDraft()))).toEqual(["name", "address", "contact_person", "company_id", "country_id"]);
    expect(validate(draftFrom(site))).toEqual({});
    expect(validate({ ...draftFrom(site), name: "  " })).toEqual({ name: "Enter a site name." });
  });
  it("is dirty only after a real change; category order doesn't count", () => {
    const d = draftFrom(site);
    expect(isDirty(d, site)).toBe(false);
    expect(isDirty({ ...d, category_ids: [...d.category_ids].reverse() }, site)).toBe(false);
    expect(isDirty({ ...d, category_ids: [1] }, site)).toBe(true);
    expect(isDirty(emptyDraft(10), null)).toBe(false);
  });
  it("trims the payload", () => {
    expect(toPayload({ ...draftFrom(site), name: " New name " }).name).toBe("New name");
  });
  it("selects and clears many categories", () => {
    expect(setMany([1, 5], [2, 3], true)).toEqual([1, 2, 3, 5]);
    expect(setMany([1, 2, 3], [2, 3], false)).toEqual([1]);
  });
});
