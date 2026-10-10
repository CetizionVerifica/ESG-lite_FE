import { describe, expect, it } from "vitest";
import {
  type Batch,
  type Factor,
  type Site,
  batchLabel,
  batchScope,
  categoriesFor,
  draftFrom,
  emptyDraft,
  factorSummary,
  filterUploads,
  firstId,
  formatFactor,
  isDirty,
  layoutLabel,
  listParams,
  sitesOfClient,
  toPayload,
  toUpdatePayload,
  uploadStatus,
  validate,
  yearHint,
  yearOptions,
} from "./logic";

const cat = (id: number, name: string) => ({ category_id: id, category_name: name, scope: "Scope 1" });
const SITES: Site[] = [
  { site_id: 1, name: "Hidd", company: { company_id: 10, name: "Midal" }, categories: [cat(2, "Refrigerants"), cat(1, "Fuel")] },
  { site_id: 2, name: "Pune", company: { company_id: 20, name: "Gulf" }, categories: [] },
];
const ALL = [cat(3, "Electricity"), cat(1, "Fuel"), cat(2, "Refrigerants")];

const factor: Factor = {
  emission_factor_id: 7,
  year: 2024,
  factor_value: "2.6800",
  denominator_unit: "litre",
  source: "DEFRA 2024",
  emission_category_name: "Diesel",
  upload_batch_id: null,
  site: { site_id: 1, name: "Hidd" },
  category: { category_id: 1, category_name: "Fuel" },
};

describe("list query", () => {
  const none = { clientId: null, siteId: null, categoryId: null, year: null, q: "" };
  it("sends a 1-based page and only the filters that are set", () => {
    expect(listParams(none, 0)).toEqual({ page: 1, limit: 50 });
    expect(listParams({ ...none, clientId: 10, categoryId: 3, year: 2024, q: "  diesel " }, 2)).toEqual({
      page: 3,
      limit: 50,
      company_id: 10,
      category_id: 3,
      year: 2024,
      search: "diesel",
    });
  });
  it("a site replaces the client", () => {
    expect(listParams({ ...none, clientId: 10, siteId: 1 }, 0)).toEqual({ page: 1, limit: 50, site_id: 1 });
  });
  it("reads the first valid id from a filter", () => {
    expect(firstId(undefined)).toBeNull();
    expect(firstId(["x", "0", "12"])).toBe(12);
  });
});

describe("filter options", () => {
  it("years run from next year back to 2015", () => {
    const years = yearOptions(new Date(2026, 5, 1));
    expect(years[0]).toBe(2027);
    expect(years[years.length - 1]).toBe(2015);
    expect(years).toHaveLength(13);
  });
  it("sites narrow to the client", () => {
    expect(sitesOfClient(SITES, 20).map((s) => s.site_id)).toEqual([2]);
    expect(sitesOfClient(SITES, null)).toHaveLength(2);
  });
  it("categories are the site's own, sorted; every category without a site", () => {
    expect(categoriesFor(1, SITES, ALL).map((c) => c.category_name)).toEqual(["Fuel", "Refrigerants"]);
    expect(categoriesFor(2, SITES, ALL)).toEqual([]);
    expect(categoriesFor(null, SITES, ALL).map((c) => c.category_id)).toEqual([3, 1, 2]);
  });
});

describe("display", () => {
  it("formats decimals from the API without trailing zeros", () => {
    expect(formatFactor("2.6800")).toBe("2.68");
    expect(formatFactor(1234.56789)).toBe("1234.5679");
    expect(formatFactor(null)).toBe("—");
    expect(formatFactor("abc")).toBe("—");
  });
  it("summarises a factor for confirm dialogs", () => {
    expect(factorSummary(factor)).toBe("Hidd · Fuel (Diesel) · 2024: 2.68 per litre");
  });
  it("labels the import batch", () => {
    const batches: Batch[] = [{ upload_batch_id: "b1", count: 3, uploaded_at: "2026-10-03T08:00:00Z", site_id: 1, site_name: "Hidd", category_id: 1, category_name: "Fuel" }];
    expect(batchLabel(null, batches)).toBe("Added by hand");
    expect(batchLabel("b1", batches)).toBe("Import · 3 Oct 2026");
    expect(batchLabel("gone", batches)).toBe("Import");
  });
  it("adds up every site and category one import batch covers", () => {
    const b = (site_name: string, category_name: string, count: number, id = "b9") =>
      ({ upload_batch_id: id, count, uploaded_at: "2026-10-03T08:00:00Z", site_id: 1, site_name, category_id: 1, category_name });
    const all = [b("Hidd", "Fuel", 3), b("Sitra", "Fuel", 2), b("Hidd", "Power", 1, "other")];
    expect(batchScope("b9", all)).toEqual({ count: 5, parts: ["Hidd · Fuel", "Sitra · Fuel"] });
    expect(batchScope("none", all)).toEqual({ count: 0, parts: [] });
  });
  it("explains which entries use a year's factors", () => {
    expect(yearHint(2024)).toBe("Entries for 2025 use 2024 factors.");
  });
});

describe("form", () => {
  it("starts from the filters and validates required fields", () => {
    const d = emptyDraft({ siteId: 1, year: 2024 });
    expect(d).toMatchObject({ siteId: 1, categoryId: null, year: 2024 });
    expect(validate(d)).toEqual({ categoryId: "Choose a category.", value: "Enter the factor." });
    expect(validate({ ...d, categoryId: 1, value: -1 }).value).toBe("The factor can't be negative.");
    expect(validate({ ...d, categoryId: 1, value: 1_000_000 }).value).toMatch(/below 1,000,000/);
    expect(validate({ ...d, categoryId: 1, value: 0 })).toEqual({});
  });
  it("round-trips a saved factor and spots changes", () => {
    const d = draftFrom(factor);
    expect(d).toEqual({ siteId: 1, categoryId: 1, name: "Diesel", year: 2024, value: 2.68, unit: "litre", source: "DEFRA 2024" });
    expect(isDirty(d, factor)).toBe(false);
    expect(isDirty({ ...d, source: " DEFRA 2024 " }, factor)).toBe(false);
    expect(isDirty({ ...d, value: 2.7 }, factor)).toBe(true);
  });
  it("leaves blank text out of the payload", () => {
    expect(toPayload({ siteId: 1, categoryId: 2, name: " ", year: 2024, value: 0.5, unit: "", source: " IPCC " })).toEqual({
      site_id: 1,
      category_id: 2,
      year: 2024,
      factor_value: 0.5,
      source: "IPCC",
    });
  });
  it("sends only changed fields on edit, and cleared text as empty", () => {
    const d = draftFrom(factor);
    expect(toUpdatePayload(d, factor)).toEqual({});
    expect(toUpdatePayload({ ...d, value: 2.7, source: " ", unit: "kg " }, factor)).toEqual({ factor_value: 2.7, source: "", denominator_unit: "kg" });
    expect(toUpdatePayload({ ...d, name: "", year: 2023 }, factor)).toEqual({ emission_category_name: "", year: 2023 });
  });
});

describe("uploads", () => {
  const up = (id: number, site_id: number | null, status = "completed") => ({ id, file_name: `f${id}.xlsx`, site_id, status });
  it("maps status and layout to words", () => {
    expect(uploadStatus(up(1, 1))).toEqual({ label: "Saved", tone: "good" });
    expect(uploadStatus(up(1, 1, "parsed"))).toEqual({ label: "Not saved", tone: "warn" });
    expect(uploadStatus(up(1, 1, "failed")).label).toBe("Failed");
    expect(layoutLabel("disposal_pivot")).toBe("Disposal pivot");
    expect(layoutLabel("wide_years")).toBe("wide years");
    expect(layoutLabel(null)).toBe("—");
  });
  it("filters by site and drops site-less records only when filtered", () => {
    const list = [up(1, 1), up(2, 2), up(3, null)];
    expect(filterUploads(list, null)).toHaveLength(3);
    expect(filterUploads(list, [1]).map((u) => u.id)).toEqual([1]);
  });
});
