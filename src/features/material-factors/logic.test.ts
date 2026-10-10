import { describe, expect, it } from "vitest";
import {
  type MaterialFactor,
  canEdit,
  createPayload,
  detectMapping,
  draftFrom,
  emptyDraft,
  formatFactor,
  isBlankRow,
  isDirty,
  matchesFilters,
  missingRequired,
  sourceLabel,
  toRow,
  updatePayload,
  validate,
} from "./logic";

const factor = (extra: Partial<MaterialFactor> = {}): MaterialFactor => ({
  material_factor_id: 1,
  company_id: 1,
  name: "Primary aluminium ingot",
  material_group: "aluminium",
  geography: "BH",
  unit: "kg",
  value_kgco2e: 8.6,
  value_hidden: false,
  gwp_set: "AR6",
  source: "IAI",
  source_year: 2023,
  dataset_ref: null,
  licence: "open",
  recycled_variant: false,
  valid_from: null,
  valid_to: null,
  used_by: 2,
  used_by_approved: 1,
  ...extra,
});

const noFilters = { q: "", groups: [], geographies: [], sources: [], licences: [], years: [], owners: [] };

describe("display", () => {
  it("formats factors without trailing zeros", () => {
    expect(formatFactor(8.6)).toBe("8.6");
    expect(formatFactor(0.002408)).toBe("0.002408");
    expect(formatFactor(1200)).toBe("1,200");
    expect(formatFactor(null)).toBe("—");
  });
  it("joins source and year", () => {
    expect(sourceLabel({ source: "IAI", source_year: 2023 })).toBe("IAI 2023");
    expect(sourceLabel({ source: null, source_year: 2023 })).toBe("2023");
    expect(sourceLabel({ source: " ", source_year: null })).toBe("");
  });
});

describe("permissions", () => {
  it("lets managers change only their own unlicensed rows", () => {
    expect(canEdit(factor(), "Manager")).toBe(true);
    expect(canEdit(factor({ company_id: null }), "Manager")).toBe(false);
    expect(canEdit(factor({ licence: "ecoinvent" }), "Manager")).toBe(false);
    expect(canEdit(factor({ company_id: null, licence: "ecoinvent" }), "Superadmin")).toBe(true);
  });
});

describe("filters", () => {
  it("searches name, group, source and dataset", () => {
    expect(matchesFilters(factor(), { ...noFilters, q: "iai" })).toBe(true);
    expect(matchesFilters(factor({ dataset_ref: "UUID-42" }), { ...noFilters, q: "uuid" })).toBe(true);
    expect(matchesFilters(factor(), { ...noFilters, q: "copper" })).toBe(false);
  });
  it("matches each filter, with Global and — for empty values", () => {
    expect(matchesFilters(factor({ geography: null }), { ...noFilters, geographies: ["Global"] })).toBe(true);
    expect(matchesFilters(factor({ source_year: null }), { ...noFilters, years: ["—"] })).toBe(true);
    expect(matchesFilters(factor(), { ...noFilters, years: ["2022"] })).toBe(false);
    expect(matchesFilters(factor({ company_id: null }), { ...noFilters, owners: ["global"] })).toBe(true);
    expect(matchesFilters(factor(), { ...noFilters, licences: ["ecoinvent"] })).toBe(false);
  });
});

describe("form", () => {
  it("requires name, group, unit and a value unless the value is hidden", () => {
    const e = validate(emptyDraft(null));
    expect(Object.keys(e).sort()).toEqual(["material_group", "name", "value"]);
    const hidden = { ...draftFrom(factor({ value_kgco2e: null, value_hidden: true })) };
    expect(validate(hidden, { valueHidden: true })).toEqual({});
  });
  it("rejects a validity window that ends before it starts", () => {
    expect(validate({ ...draftFrom(factor()), valid_from: "2025-01-01", valid_to: "2024-12-31" }).valid_to).toBeTruthy();
  });
  it("sends company only for superadmins and trims text", () => {
    const d = { ...emptyDraft(4), name: " Copper cathode ", material_group: "copper", value: 3.8, geography: " ", source: " ICA " };
    expect(createPayload(d, "Superadmin")).toMatchObject({ company_id: 4, name: "Copper cathode", geography: null, source: "ICA" });
    expect(createPayload(d, "Manager")).not.toHaveProperty("company_id");
  });
  it("sends only changed fields, never a hidden licensed value", () => {
    const f = factor();
    expect(updatePayload(draftFrom(f), f)).toEqual({});
    expect(isDirty(draftFrom(f), f)).toBe(false);
    expect(updatePayload({ ...draftFrom(f), value: 9.1, source_year: 2024 }, f)).toEqual({ value_kgco2e: 9.1, source_year: 2024 });
    const lic = factor({ value_kgco2e: null, value_hidden: true, licence: "ecoinvent" });
    expect(updatePayload({ ...draftFrom(lic), source: "ecoinvent 3.10" }, lic)).toEqual({ source: "ecoinvent 3.10" });
  });
});

describe("import", () => {
  it("detects columns by name and synonym", () => {
    const m = detectMapping(["Material", "Group", "Unit", "kgCO2e", "Region", "Year", "Licence", "Notes"]);
    expect(m).toMatchObject({ name: "Material", material_group: "Group", unit: "Unit", value_kgco2e: "kgCO2e", geography: "Region", source_year: "Year", licence: "Licence" });
    expect(missingRequired(m)).toEqual([]);
    expect(missingRequired(detectMapping(["name", "unit"]))).toEqual(["Group", "Value (kgCO₂e per unit)"]);
  });
  it("turns a sheet row into a request row and lists problems", () => {
    const m = detectMapping(["name", "material_group", "unit", "value_kgco2e", "geography", "source_year", "licence", "recycled_variant", "valid_from"]);
    const ok = toRow(
      { name: " PVC ", material_group: "Polymer", unit: "kg", value_kgco2e: "1,950", geography: "", source_year: 2021, licence: "Open", recycled_variant: "yes", valid_from: 45658 },
      m,
    );
    expect(ok.problems).toEqual([]);
    expect(ok.row).toEqual({
      name: "PVC",
      material_group: "polymer",
      unit: "kg",
      value_kgco2e: 1950,
      geography: null,
      source_year: 2021,
      licence: "open",
      recycled_variant: true,
      valid_from: "2025-01-01",
    });
    const bad = toRow({ name: "", material_group: "x", unit: "kg", value_kgco2e: "n/a", source_year: "2021a", licence: "paid" }, m);
    expect(bad.problems).toEqual(["Name is empty", "Value must be a number of 0 or more", "Source year must be a year", "Licence must be open, supplier or ecoinvent"]);
  });
  it("skips blank rows", () => {
    expect(isBlankRow({ a: "", b: " " })).toBe(true);
    expect(isBlankRow({ a: 0 })).toBe(false);
  });
});
