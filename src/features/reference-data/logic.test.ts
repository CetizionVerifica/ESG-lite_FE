import { describe, expect, it } from "vitest";
import {
  type Category,
  type Site,
  categoryDeleteBlock,
  categoryDraftFrom,
  categoryPayload,
  categoryRows,
  countryDeleteBlock,
  countryRows,
  groupSitesByClient,
  isCategoryDirty,
  isUnitDirty,
  matchesCategoryRow,
  matchesUnit,
  readTab,
  removedSites,
  scopeKey,
  unitDraftFrom,
  unitRows,
  validateCategory,
  validateCountry,
  validateUnit,
} from "./logic";

const SITES: Site[] = [
  { site_id: 1, name: "Hidd", company: { company_id: 1, name: "Midal" }, country: { country_id: 1 }, categories: [{ category_id: 10, category_name: "Fuel", scope: "Scope 1" }] },
  { site_id: 2, name: "Pune", company: { company_id: 2, name: "Gulf Foods" }, country: { country_id: 2 }, categories: [{ category_id: 10, category_name: "Fuel", scope: "Scope 1" }, { category_id: 11, category_name: "Solar", scope: null }] },
  { site_id: 3, name: "Askar", company: { company_id: 1, name: "Midal" }, country: { country_id: 1 }, categories: [] },
];

describe("readTab", () => {
  it("defaults to countries for a missing or unknown tab", () => {
    expect(readTab(null)).toBe("countries");
    expect(readTab("nope")).toBe("countries");
    expect(readTab("units")).toBe("units");
  });
});

describe("scopeKey", () => {
  it("reads the scope number and treats no scope as saving", () => {
    expect(scopeKey("Scope 2")).toBe("s2");
    expect(scopeKey("scope3")).toBe("s3");
    expect(scopeKey(null)).toBe("saving");
    expect(scopeKey("")).toBe("saving");
  });
});

describe("countries", () => {
  it("prefers the server's site_count and falls back to the sites list", () => {
    const rows = countryRows([{ country_id: 1, name: "Bahrain", code: "bh", site_count: 5 }, { country_id: 2, name: "India", code: "IN" }], SITES);
    expect(rows.map((r) => [r.code, r.siteCount])).toEqual([["BH", 5], ["IN", 1]]);
    expect(countryRows([{ country_id: 2, name: "India" }])[0].siteCount).toBeNull();
  });

  it("validates name and the two-letter ISO code, including duplicates", () => {
    const others = [{ country_id: 1, name: "Bahrain", code: "BH" }];
    expect(validateCountry({ name: "", code: "" }, others)).toEqual({ name: "Enter a country name.", code: "Enter the two-letter ISO code." });
    expect(validateCountry({ name: "India", code: "IND" }, others).code).toMatch(/two-letter/);
    expect(validateCountry({ name: "India", code: "1N" }, others).code).toMatch(/two-letter/);
    expect(validateCountry({ name: " bahrain ", code: "bh" }, others)).toEqual({
      name: "A country with this name already exists.",
      code: "Another country already uses this code.",
    });
    expect(validateCountry({ name: "India", code: "in" }, others)).toEqual({});
  });

  it("blocks deleting a country that sites use", () => {
    const [bh, xx] = countryRows([{ country_id: 1, name: "Bahrain", code: "BH" }, { country_id: 9, name: "Nowhere", code: "XX" }], SITES);
    expect(countryDeleteBlock(bh)).toBe("2 sites use Bahrain. Move them to another country first.");
    expect(countryDeleteBlock(xx)).toBeNull();
  });
});

describe("categories", () => {
  const cats: Category[] = [
    { category_id: 10, category_name: "Fuel", scope: "Scope 1", sites: [{ site_id: 2 }, { site_id: 1 }], factor_count: 2, config_count: 1, unit_count: 0, entry_count: 7 },
    { category_id: 11, category_name: "Solar", scope: null },
    { category_id: 12, category_name: "Unused", scope: "Scope 3", sites: [], factor_count: 0, config_count: 0, unit_count: 0, entry_count: 0 },
  ];

  it("reads sites off the category, or off the sites list when absent", () => {
    const rows = categoryRows(cats, SITES);
    expect(rows[0].siteIds).toEqual([1, 2]);
    expect(rows[1].siteIds).toEqual([2]);
    expect(rows[1].factors).toBeNull();
    expect(rows[1].scopeKey).toBe("saving");
  });

  it("filters by scope and name", () => {
    const rows = categoryRows(cats, SITES);
    expect(rows.filter((r) => matchesCategoryRow(r, { q: "", scopes: ["saving"] })).map((r) => r.category_id)).toEqual([11]);
    expect(rows.filter((r) => matchesCategoryRow(r, { q: "fu", scopes: [] })).map((r) => r.category_id)).toEqual([10]);
  });

  it("only allows deleting a category nothing uses", () => {
    const [fuel, solar, unused] = categoryRows(cats, SITES);
    expect(categoryDeleteBlock(fuel)).toBe("Fuel is still in use (2 sites, 7 entries, 2 emission factors, 1 column config). Take it off its sites and remove its data first.");
    expect(categoryDeleteBlock(solar)).toMatch(/1 site\)/);
    expect(categoryDeleteBlock(unused)).toBeNull();
  });

  it("validates the name against other categories", () => {
    expect(validateCategory({ ...categoryDraftFrom(null), category_name: " " }, cats).category_name).toBe("Enter a category name.");
    expect(validateCategory({ ...categoryDraftFrom(null), category_name: "fuel" }, cats).category_name).toMatch(/already exists/);
    expect(validateCategory({ ...categoryDraftFrom(null), category_name: "Water" }, cats)).toEqual({});
  });

  it("tracks changes and the sites a save removes", () => {
    const [fuel] = categoryRows(cats, SITES);
    const d = categoryDraftFrom(fuel);
    expect(isCategoryDirty(d, fuel)).toBe(false);
    expect(isCategoryDirty({ ...d, site_ids: [2, 1] }, fuel)).toBe(false);
    expect(isCategoryDirty({ ...d, scope: "s2" }, fuel)).toBe(true);
    expect(removedSites({ ...d, site_ids: [2] }, fuel)).toEqual([1]);
    expect(removedSites({ ...d, site_ids: [], assign_all_sites: true }, fuel)).toEqual([]);
  });

  it("sends a null scope for savings and every site for 'assign to all'", () => {
    expect(categoryPayload({ category_name: " Solar ", scope: "saving", site_ids: [2], assign_all_sites: false }, [1, 2, 3])).toEqual({
      category_name: "Solar",
      scope: null,
      site_ids: [2],
      assign_all_sites: false,
    });
    expect(categoryPayload({ category_name: "Fuel", scope: "s1", site_ids: [], assign_all_sites: true }, [3, 1, 2]).site_ids).toEqual([1, 2, 3]);
  });

  it("groups sites by client, sorted, with search", () => {
    const groups = groupSitesByClient([...SITES, { site_id: 4, name: "Loose" }]);
    expect(groups.map((g) => [g.label, g.sites.map((s) => s.name)])).toEqual([
      ["Gulf Foods", ["Pune"]],
      ["Midal", ["Askar", "Hidd"]],
      ["No client", ["Loose"]],
    ]);
    expect(groupSitesByClient(SITES, "midal").flatMap((g) => g.sites.map((s) => s.site_id))).toEqual([3, 1]);
  });
});

describe("units", () => {
  const units = [
    { unit_id: 1, unit_name: "litres", description: "Diesel", site: { site_id: 1 }, category: { category_id: 10 }, entry_count: 3 },
    { unit_id: 2, unit_name: "kWh", description: null, site: { site_id: 2, name: "Pune" }, category: { category_id: 11, category_name: "Solar" } },
  ];

  it("fills site and category names from the lists", () => {
    const rows = unitRows(units, SITES, [{ category_id: 10, category_name: "Fuel" }]);
    expect(rows.map((r) => [r.siteName, r.categoryName, r.entries])).toEqual([["Hidd", "Fuel", 3], ["Pune", "Solar", null]]);
  });

  it("filters by sites, category and text", () => {
    const rows = unitRows(units, SITES);
    expect(rows.filter((r) => matchesUnit(r, { q: "", siteIds: [2], categoryId: null })).map((r) => r.unit_id)).toEqual([2]);
    expect(rows.filter((r) => matchesUnit(r, { q: "", siteIds: [], categoryId: 10 })).map((r) => r.unit_id)).toEqual([1]);
    expect(rows.filter((r) => matchesUnit(r, { q: "diesel", siteIds: [], categoryId: null })).map((r) => r.unit_id)).toEqual([1]);
  });

  it("requires a site, one of its categories and a unique name", () => {
    const draft = unitDraftFrom(null, { siteId: 1 });
    expect(validateUnit(draft, units, SITES[0])).toEqual({ category_id: "Choose a category.", unit_name: "Enter a unit name." });
    expect(validateUnit({ ...draft, category_id: 11, unit_name: "kg" }, units, SITES[0]).category_id).toMatch(/doesn't report/);
    expect(validateUnit({ ...draft, category_id: 10, unit_name: " Litres " }, units, SITES[0]).unit_name).toMatch(/already has/);
    expect(validateUnit({ ...draft, category_id: 10, unit_name: "m3" }, units, SITES[0])).toEqual({});
  });

  it("is dirty when moved or renamed", () => {
    const d = unitDraftFrom(units[0]);
    expect(isUnitDirty(d, units[0])).toBe(false);
    expect(isUnitDirty({ ...d, site_id: 2 }, units[0])).toBe(true);
    expect(isUnitDirty(unitDraftFrom(null), null)).toBe(false);
  });
});
