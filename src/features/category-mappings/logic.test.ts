import { describe, expect, it } from "vitest";
import {
  type Factor,
  type FactorIndex,
  type Mapping,
  type MappingFilters,
  type Site,
  buildRows,
  categoriesInUse,
  checkImport,
  createFactorHref,
  createPayload,
  draftFrom,
  emptyDraft,
  factorNames,
  findDuplicate,
  findFactor,
  formatFactor,
  importPayloads,
  importRows,
  isDirty,
  matchesFilters,
  summarizeImport,
  updatePayload,
  validate,
} from "./logic";

const steel = { company_id: 1, name: "Steel Co" };
const foods = { company_id: 2, name: "Foods Co" };
const SITES: Site[] = [
  { site_id: 10, name: "Plant A", company: steel },
  { site_id: 11, name: "Plant B", company: steel },
  { site_id: 20, name: "Kitchen", company: foods },
];
const CATEGORIES = [
  { category_id: 1, category_name: "Fuel" },
  { category_id: 2, category_name: "Electricity" },
];
const f = (id: number, name: string, site: number, year: number, value: number | string = 2.68): Factor => ({
  emission_factor_id: id,
  emission_category_name: name,
  site: { site_id: site },
  year,
  factor_value: value,
  denominator_unit: "litre",
});
const INDEX: FactorIndex = new Map([[1, [f(1, "Diesel", 10, 2024), f(2, "Diesel", 10, 2025, "2.70"), f(3, "Petrol", 20, 2025), f(4, " LPG ", 11, 2025)]]]);

const m = (id: number, over: Partial<Mapping> = {}): Mapping => ({
  id,
  company_id: 1,
  company_name: "Steel Co (old)",
  site_id: null,
  category_id: 1,
  company_category_name: "HSD fuel",
  global_category_name: "Diesel",
  ...over,
});

describe("findFactor", () => {
  it("takes the newest factor at the mapping's site", () => {
    const r = findFactor(INDEX, m(1, { site_id: 10 }), SITES);
    expect(r).toMatchObject({ state: "matched", factor: { emission_factor_id: 2 } });
  });
  it("looks across the client's sites for a company-wide mapping, and only theirs", () => {
    expect(findFactor(INDEX, m(1), SITES).state).toBe("matched");
    expect(findFactor(INDEX, m(1, { global_category_name: "Petrol" }), SITES).state).toBe("missing");
    expect(findFactor(INDEX, m(1, { company_id: 2, global_category_name: "Petrol" }), SITES).state).toBe("matched");
  });
  it("misses at another site, matches trimmed names, and is unknown until factors load", () => {
    expect(findFactor(INDEX, m(1, { site_id: 11 }), SITES).state).toBe("missing");
    expect(findFactor(INDEX, m(1, { global_category_name: "LPG" }), SITES).state).toBe("matched");
    expect(findFactor(INDEX, m(1, { global_category_name: "diesel" }), SITES).state).toBe("missing");
    expect(findFactor(INDEX, m(1, { category_id: 2 }), SITES).state).toBe("unknown");
  });
});

describe("buildRows and filters", () => {
  const rows = buildRows([m(1), m(2, { site_id: 11, company_category_name: "Grid power", category_id: 2, global_category_name: "Electricity" }), m(3, { company_id: 2, global_category_name: "Gas" })], {
    companies: [steel, foods],
    categories: CATEGORIES,
    sites: SITES,
    factors: INDEX,
  });
  it("names client, category and site", () => {
    expect(rows.map((r) => [r.clientName, r.categoryName, r.siteName, r.match.state])).toEqual([
      ["Steel Co", "Fuel", "All sites", "matched"],
      ["Steel Co", "Electricity", "Plant B", "unknown"],
      ["Foods Co", "Fuel", "All sites", "missing"],
    ]);
  });
  it("filters by client, category, site (company-wide is 'all'), factor and text", () => {
    const none: MappingFilters = { q: "", clientIds: [], categoryIds: [], sites: [], match: [] };
    const ids = (f2: Partial<typeof none>) => rows.filter((r) => matchesFilters(r, { ...none, ...f2 })).map((r) => r.id);
    expect(ids({ clientIds: [1] })).toEqual([1, 2]);
    expect(ids({ categoryIds: [2] })).toEqual([2]);
    expect(ids({ sites: ["all"] })).toEqual([1, 3]);
    expect(ids({ sites: ["11"] })).toEqual([2]);
    expect(ids({ match: ["missing"] })).toEqual([3]);
    expect(ids({ q: "plant b" })).toEqual([2]);
    expect(ids({ q: "GAS" })).toEqual([3]);
  });
  it("lists each category in use once", () => {
    expect(categoriesInUse([m(1), m(2, { category_id: 2 }), m(3)], [2, null, 5])).toEqual([1, 2, 5]);
  });
});

describe("factor names and links", () => {
  it("offers names at the chosen scope", () => {
    expect(factorNames(INDEX, 1, null)).toEqual(["Diesel", "LPG", "Petrol"]);
    expect(factorNames(INDEX, 1, new Set([10, 11]))).toEqual(["Diesel", "LPG"]);
    expect(factorNames(INDEX, null, null)).toEqual([]);
  });
  it("formats a factor and links to P22 with the mapping's context", () => {
    expect(formatFactor(f(9, "Diesel", 10, 2025, "2.6800"))).toBe("2.68 kgCO₂e / litre · 2025");
    expect(createFactorHref(m(1, { site_id: 10 }))).toBe("/factors?client=1&category=1&q=Diesel&site=10");
    expect(createFactorHref(m(1))).toBe("/factors?client=1&category=1&q=Diesel");
  });
});

describe("draft", () => {
  const all = [m(1), m(2, { site_id: 10 })];
  it("needs client, category and both names, and refuses a duplicate", () => {
    expect(validate(emptyDraft(), all, null)).toEqual({
      company_id: "Choose the client.",
      category_id: "Choose a category.",
      company_category_name: "Enter the name this client uses.",
      global_category_name: "Choose the factor name it means.",
    });
    const dup = { ...draftFrom(m(9)), company_category_name: " hsd FUEL " };
    expect(validate(dup, all, null).company_category_name).toMatch(/already maps “hsd FUEL”/);
    // Same name at a site is a different mapping; editing itself is fine.
    expect(findDuplicate({ ...dup, site_id: 11 }, all, null)).toBeNull();
    expect(validate(draftFrom(m(1)), all, 1)).toEqual({});
  });
  it("tracks changes and sends only what changed", () => {
    const row = m(1);
    const d = draftFrom(row);
    expect(isDirty(d, row, d)).toBe(false);
    expect(isDirty({ ...d, company_category_name: "HSD fuel " }, row, d)).toBe(false);
    expect(updatePayload({ ...d, global_category_name: " Petrol " }, row)).toEqual({ global_category_name: "Petrol" });
    expect(updatePayload({ ...d, site_id: 10 }, row)).toEqual({ site_id: 10 });
    expect(updatePayload(d, row)).toEqual({});
  });
  it("creates with trimmed names and the client's current name", () => {
    expect(createPayload({ company_id: 1, category_id: 1, site_id: null, company_category_name: " HSD ", global_category_name: "Diesel " }, "Steel Co", 7)).toEqual({
      company_id: 1,
      company_name: "Steel Co",
      site_id: null,
      category_id: 1,
      company_category_name: "HSD",
      global_category_name: "Diesel",
      created_by: 7,
    });
  });
});

describe("import", () => {
  const parsed = [
    { company_category_name: "HSD fuel", global_category_name: "Diesel" },
    { company_category_name: "Gasoline", global_category_name: "Petrol", factor_value: 2.3, unit: "litre" },
    { company_category_name: " Bottled gas ", global_category_name: "LPG" },
    { company_category_name: "gasoline", global_category_name: "Petrol" },
    { company_category_name: "", global_category_name: "Coal" },
  ];
  const target = { company_id: 1, category_id: 1, site_id: null };
  const existing = [m(1)];
  const rows = importRows(parsed);

  it("reads rows, switching off ones missing a name", () => {
    expect(rows.map((r) => r.include)).toEqual([true, true, true, true, false]);
    expect(rows[1].sheetFactor).toBe("2.3 / litre");
    expect(rows[2].company_category_name).toBe("Bottled gas");
  });
  it("flags existing mappings and repeats, and counts matches", () => {
    const checks = checkImport(rows, target, existing, INDEX, SITES);
    expect([0, 1, 2, 3, 4].map((k) => checks.get(k)?.problem ?? null)).toEqual(["Already mapped", null, null, "Repeats row 2", "Both names are needed."]);
    expect(checks.get(1)?.match.state).toBe("missing");
    expect(checks.get(2)?.match.state).toBe("matched");
    expect(summarizeImport(rows, checks)).toEqual({ included: 2, matched: 1, missing: 1, blocked: 2 });
  });
  it("sends only included rows without a problem", () => {
    const edited = rows.map((r) => (r.key === 1 ? { ...r, include: false } : r));
    const checks = checkImport(edited, target, existing, INDEX, SITES);
    // Row 4 is no longer a repeat once row 2 is left out.
    expect(importPayloads(edited, checks, target, "Steel Co", null).map((p) => p.company_category_name)).toEqual(["Bottled gas", "gasoline"]);
    expect(importPayloads(rows, checks, { ...target, category_id: null }, "Steel Co", null)).toEqual([]);
  });
});
