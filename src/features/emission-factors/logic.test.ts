import { describe, expect, it } from "vitest";
import {
  gridFactorHint,
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
  gasSumHint,
  TYPE_FILTER_VALUES,
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
    expect(formatFactor(1234.567891234)).toBe("1234.56789123");
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
    expect(validate(d)).toEqual({ categoryId: "Choose a category.", value: "Enter the factor.", unit: "Enter the unit, e.g. litre or kWh." });
    const ok = { ...d, categoryId: 1, unit: "litre" };
    expect(validate({ ...ok, value: -1 }).value).toBe("The factor can't be negative.");
    // numeric(18,8) since S3-2: 10 digits before the point, 8 after.
    expect(validate({ ...ok, value: 10_000_000_000 }).value).toMatch(/below 10,000,000,000/);
    expect(validate({ ...ok, value: 0.123456789 }).value).toBe("Use at most 8 decimals.");
    expect(validate({ ...ok, value: 0.00012345 })).toEqual({});
    expect(validate({ ...ok, value: 0 })).toEqual({});
    expect(validate({ ...ok, value: 1, gases: { ...ok.gases, ch4: -1 } }).ch4).toBe("A gas part can't be negative.");
  });
  it("round-trips a saved factor and spots changes", () => {
    const d = draftFrom(factor);
    expect(d).toEqual({
      siteId: 1, categoryId: 1, name: "Diesel", year: 2024, value: 2.68, unit: "litre", source: "DEFRA 2024",
      factorType: null, gwpSet: null, geography: null, dataset: "", datasetVersion: "",
      gases: { co2: null, ch4: null, n2o: null, other: null, biogenic: null },
    });
    expect(isDirty(d, factor)).toBe(false);
    expect(isDirty({ ...d, source: " DEFRA 2024 " }, factor)).toBe(false);
    expect(isDirty({ ...d, value: 2.7 }, factor)).toBe(true);
  });
  it("leaves blank text out of the payload", () => {
    const blank = { ...emptyDraft(), gwpSet: null };
    expect(toPayload({ ...blank, siteId: 1, categoryId: 2, name: " ", year: 2024, value: 0.5, unit: "", source: " IPCC " })).toEqual({
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

describe("factor metadata (S3-2)", () => {
  const typed: Factor = { ...factor, factor_type: "combustion", gwp_set: "AR6", geography: "GB", dataset: "DEFRA", dataset_version: "2024", co2_kg: "2.60000000", ch4_kg: "0.00012345" };

  it("a new factor starts on AR6 (D7) with no type", () => {
    expect(emptyDraft()).toMatchObject({ factorType: null, gwpSet: "AR6", geography: null });
  });

  it("reads and sends the metadata", () => {
    const d = draftFrom(typed);
    expect(d).toMatchObject({ factorType: "combustion", gwpSet: "AR6", geography: "GB", dataset: "DEFRA", datasetVersion: "2024" });
    expect(d.gases).toEqual({ co2: 2.6, ch4: 0.00012345, n2o: null, other: null, biogenic: null });
    expect(toPayload({ ...d, siteId: 1, categoryId: 1 })).toMatchObject({
      factor_type: "combustion", gwp_set: "AR6", geography: "GB", dataset: "DEFRA", dataset_version: "2024", co2_kg: 2.6, ch4_kg: 0.00012345,
    });
    expect(toPayload({ ...d, siteId: 1, categoryId: 1 })).not.toHaveProperty("n2o_kg");
  });

  it("edits send changed metadata only, cleared as null", () => {
    const d = draftFrom(typed);
    expect(toUpdatePayload(d, typed)).toEqual({});
    expect(isDirty({ ...d, gases: { ...d.gases } }, typed)).toBe(false);
    expect(toUpdatePayload({ ...d, factorType: "wtt", geography: null, dataset: " ", gases: { ...d.gases, ch4: null } }, typed)).toEqual({
      factor_type: "wtt", geography: null, dataset: null, ch4_kg: null,
    });
    expect(isDirty({ ...d, gwpSet: "AR5" }, typed)).toBe(true);
  });

  it("hints when the gas parts don't add up within 1%", () => {
    const d = { ...emptyDraft(), value: 2.68, gwpSet: "AR6" as const };
    expect(gasSumHint(d)).toBeNull();
    // 2.6 + 0.001 × 29.8 + 0.0002 × 273 = 2.6844: within 1%.
    expect(gasSumHint({ ...d, gases: { co2: 2.6, ch4: 0.001, n2o: 0.0002, other: null, biogenic: 5 } })).toBeNull();
    expect(gasSumHint({ ...d, gases: { co2: 2.0, ch4: null, n2o: null, other: null, biogenic: null } })).toMatch(/add up to 2 kgCO₂e with AR6/);
  });

  it("only known types reach the list query", () => {
    const base = { clientId: null, siteId: null, categoryId: null, year: null, q: "" };
    expect(listParams({ ...base, factorType: "wtt" }, 0).factor_type).toBe("wtt");
    expect(listParams({ ...base, factorType: "none" }, 0).factor_type).toBe("none");
    expect(listParams({ ...base, factorType: "bogus" }, 0)).not.toHaveProperty("factor_type");
    expect(TYPE_FILTER_VALUES).toContain("none");
  });

  it("shows factors at up to 8 decimals", () => {
    expect(formatFactor("0.00012345")).toBe("0.00012345");
    expect(formatFactor("2.68000000")).toBe("2.68");
  });
});

describe("gridFactorHint (F-04)", () => {
  it("warns when a grid electricity factor looks like tonnes, not kg", () => {
    expect(gridFactorHint("Purchased Electricity", 0.71, "MWh")).toMatch(/50–1,200 kgCO₂e per MWh.*0\.71 looks like tonnes per MWh; in kg that is 710/);
    expect(gridFactorHint("Purchased Electricity", 0.0007, "kWh")).toMatch(/1,000 times too small/);
  });
  it("stays quiet for real values, other categories and renewables", () => {
    expect(gridFactorHint("Purchased Electricity", 710, "MWh")).toBeNull();
    expect(gridFactorHint("Purchased Electricity", 0.71, "kWh")).toBeNull();
    expect(gridFactorHint("Stationary Combustion", 0.5, "MWh")).toBeNull();
    expect(gridFactorHint("Renewable Electricity", 0, "kWh")).toBeNull();
    expect(gridFactorHint("Renewable Electricity", 0.001, "kWh")).toBeNull();
    expect(gridFactorHint(null, 0.71, "MWh")).toBeNull();
  });
});
