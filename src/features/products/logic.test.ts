import { describe, expect, it } from "vitest";
import {
  type Product,
  cascadeItems,
  changesUnitWithRecords,
  day,
  draftFrom,
  emptyDraft,
  isDirty,
  matchesFilters,
  movesSite,
  pickableSites,
  quantity,
  recordStatus,
  siteLabel,
  siteOptions,
  toIds,
  toPayload,
  unitSuggestions,
  validate,
  wholeMonth,
} from "./logic";

const midal = { company_id: 1, name: "Midal Cables" };
const gulf = { company_id: 2, name: "Gulf Foods" };
const hidd = { site_id: 1, name: "Hidd", company: midal };
const askar = { site_id: 2, name: "Askar", company: midal };
const pune = { site_id: 3, name: "Pune", company: gulf };

const product: Product = {
  product_id: 7,
  name: "Aluminium rod",
  description: "9.5 mm rod",
  unit: "tonnes",
  site: hidd,
  production_count: 14,
  last_period_end: "2026-02-28",
};

describe("matchesFilters", () => {
  const f = (over = {}) => ({ q: "", clientIds: [] as number[], siteIds: [] as number[], ...over });
  it("filters by client, site and search text", () => {
    expect(matchesFilters(product, f())).toBe(true);
    expect(matchesFilters(product, f({ clientIds: [1] }))).toBe(true);
    expect(matchesFilters(product, f({ clientIds: [2] }))).toBe(false);
    expect(matchesFilters(product, f({ siteIds: [2, 1] }))).toBe(true);
    expect(matchesFilters(product, f({ siteIds: [3] }))).toBe(false);
    for (const q of ["ROD", "9.5", "tonn", "hidd", "midal"]) expect(matchesFilters(product, f({ q }))).toBe(true);
    expect(matchesFilters(product, f({ q: "copper" }))).toBe(false);
  });
  it("treats a product without a site as matching no client or site", () => {
    const orphan = { ...product, site: null };
    expect(matchesFilters(orphan, f({ clientIds: [1] }))).toBe(false);
    expect(matchesFilters(orphan, f({ siteIds: [1] }))).toBe(false);
    expect(matchesFilters(orphan, f())).toBe(true);
  });
});

describe("site options and labels", () => {
  it("narrows the Site filter to the chosen client, sorted by name", () => {
    expect(siteOptions([hidd, pune, askar], [])).toEqual([
      { value: "2", label: "Askar" },
      { value: "1", label: "Hidd" },
      { value: "3", label: "Pune" },
    ]);
    expect(siteOptions([hidd, pune, askar], [2]).map((o) => o.label)).toEqual(["Pune"]);
  });
  it("offers an existing product only its own client's sites", () => {
    expect(pickableSites([hidd, askar, pune], null)).toEqual([hidd, askar, pune]);
    expect(pickableSites([hidd, askar, pune], product)).toEqual([hidd, askar]);
    const noClient = { ...product, site: { site_id: 1, name: "Hidd" } };
    expect(pickableSites([hidd, askar, pune], noClient)).toEqual([hidd, askar, pune]);
  });
  it("names the client next to the site", () => {
    expect(siteLabel(hidd)).toBe("Hidd · Midal Cables");
    expect(siteLabel({ site_id: 9, name: "Lonely" })).toBe("Lonely");
  });
  it("parses ids from URL values", () => {
    expect(toIds(["1", "x", "0", "-2", "3"])).toEqual([1, 3]);
    expect(toIds(undefined)).toEqual([]);
  });
});

describe("unitSuggestions", () => {
  it("uses the chosen site's units and every product unit, once each", () => {
    const units = [
      { unit_id: 1, unit_name: "kWh", site: { site_id: 1 } },
      { unit_id: 2, unit_name: "litres", site: { site_id: 3 } },
      { unit_id: 3, unit_name: "Tonnes ", site: { site_id: 1 } },
    ];
    const products = [product, { ...product, product_id: 8, unit: "km" }, { ...product, product_id: 9, unit: " " }];
    expect(unitSuggestions(products, units, 1)).toEqual(["km", "kWh", "Tonnes"]);
    expect(unitSuggestions(products, units, null)).toEqual(["km", "tonnes"]);
  });
});

describe("form", () => {
  it("requires a name, a site and a unit", () => {
    expect(Object.keys(validate(emptyDraft()))).toEqual(["name", "site_id", "unit"]);
    expect(validate({ name: " Rod ", site_id: 1, unit: "t", description: "" })).toEqual({});
    expect(validate({ name: "  ", site_id: 1, unit: " ", description: "" })).toEqual({
      name: expect.any(String),
      unit: expect.any(String),
    });
  });
  it("starts a new product on the default site", () => {
    expect(emptyDraft(3)).toEqual({ name: "", site_id: 3, unit: "", description: "" });
  });
  it("is dirty only when a trimmed value changes", () => {
    const d = draftFrom(product);
    expect(isDirty(d, product)).toBe(false);
    expect(isDirty({ ...d, name: " Aluminium rod " }, product)).toBe(false);
    expect(isDirty({ ...d, description: "" }, product)).toBe(true);
    expect(isDirty(emptyDraft(2), null)).toBe(false);
    expect(isDirty({ ...emptyDraft(2), name: "x" }, null)).toBe(true);
  });
  it("sends everything for a new product and only changes for an edit", () => {
    expect(toPayload({ name: " Rod ", site_id: 2, unit: " t ", description: " " }, null)).toEqual({ name: "Rod", site_id: 2, unit: "t", description: "" });
    expect(toPayload(draftFrom(product), product)).toEqual({});
    expect(toPayload({ ...draftFrom(product), site_id: 2, description: "" }, product)).toEqual({ site_id: 2, description: "" });
  });
  it("spots a site move and a unit change on a product with records", () => {
    const d = draftFrom(product);
    expect(movesSite(d, product)).toBe(false);
    expect(movesSite({ ...d, site_id: 2 }, product)).toBe(true);
    expect(movesSite({ ...d, site_id: 2 }, null)).toBe(false);
    expect(changesUnitWithRecords({ ...d, unit: "TONNES" }, product)).toBe(false);
    expect(changesUnitWithRecords({ ...d, unit: "kg" }, product)).toBe(true);
    expect(changesUnitWithRecords({ ...d, unit: "kg" }, { ...product, production_count: 0 })).toBe(false);
    // A backend without the counts may hide records.
    expect(changesUnitWithRecords({ ...d, unit: "kg" }, { ...product, production_count: undefined })).toBe(true);
  });
});

describe("cascadeItems", () => {
  it("names the records, the latest period, footprints and the intensity change", () => {
    expect(cascadeItems(product, "Feb 2026")).toEqual([
      "14 production records, the latest for Feb 2026",
      "Its product footprints (PCF studies) and their versions",
      "Emission intensity for Hidd is recalculated without this product's output",
    ]);
  });
  it("says when there is nothing recorded, and copes with an older backend", () => {
    expect(cascadeItems({ ...product, production_count: 0 }, null)).toEqual([
      "No production records (none recorded yet)",
      "Its product footprints (PCF studies) and their versions",
    ]);
    expect(cascadeItems({ ...product, production_count: undefined }, null)[0]).toBe("All of its production records");
    expect(cascadeItems({ ...product, production_count: 1 }, null)[0]).toBe("1 production record");
  });
});

describe("production records", () => {
  it("reads dates bare or as timestamps and spots whole months", () => {
    expect(day("2026-02-28T00:00:00.000Z")).toBe("2026-02-28");
    expect(wholeMonth("2026-02-01", "2026-02-28T00:00:00.000Z")).toBe("2026-02");
    expect(wholeMonth("2024-02-01", "2024-02-28")).toBeNull();
    expect(wholeMonth("2024-02-01", "2024-02-29")).toBe("2024-02");
    expect(wholeMonth("2026-02-02", "2026-02-28")).toBeNull();
    expect(wholeMonth("2026-01-01", "2026-02-28")).toBeNull();
  });
  it("parses decimal quantities and known statuses", () => {
    const r = { production_id: 1, quantity: "120.5000", unit: "t", start_date: "", end_date: "", status: "approved" };
    expect(quantity(r)).toBe(120.5);
    expect(quantity({ ...r, quantity: "abc" })).toBeNull();
    expect(recordStatus("Approved")).toBe("approved");
    expect(recordStatus("draft")).toBeNull();
  });
});
