import { describe, expect, it } from "vitest";
import { type FormCheck, fixCount, newErrors, readCheck, stableJson, tabForIssue, versionChanges } from "./check";

const check = (errors: Array<[string, string]>, warnings: Array<[string, string]> = []): FormCheck => ({
  ok: errors.length === 0,
  errors: errors.map(([code, field]) => ({ code, field, message: `${code} at ${field}` })),
  warnings: warnings.map(([code, field]) => ({ code, field, message: `${code} at ${field}` })),
  form_id: 7,
  year: 2025,
  version: 1,
});

describe("readCheck", () => {
  it("reads a check, and gives null for a server that sends none", () => {
    expect(readCheck({ ok: false, errors: [{ code: "X", field: "f", message: "m" }], warnings: [], year: 2025, form_id: 7, version: 2 })).toEqual({
      ok: false,
      errors: [{ code: "X", field: "f", message: "m" }],
      warnings: [],
      year: 2025,
      form_id: 7,
      version: 2,
    });
    expect(readCheck({})).toBeNull();
    expect(readCheck(null)).toBeNull();
    expect(readCheck({ errors: [null, { code: "X" }], warnings: "x" })).toMatchObject({ ok: true, errors: [], warnings: [] });
  });
});

describe("tabForIssue", () => {
  it("sends each problem to the tab that fixes it", () => {
    expect(tabForIssue("emission_category_mapping.Road|Van")).toBe("match");
    expect(tabForIssue("field_settings.Vehicle")).toBe("fields");
    expect(tabForIssue("calculation.methods.trip")).toBe("calculation");
    expect(tabForIssue("method_by_choice.map.rail")).toBe("calculation");
    expect(tabForIssue("units.fixed")).toBe("calculation");
    expect(tabForIssue("currency.fixed")).toBe("calculation");
    expect(tabForIssue("method_options")).toBe("calculation");
  });
});

describe("newErrors", () => {
  it("only problems the saved form doesn't have stop a save, so a live form can be fixed a step at a time", () => {
    const saved = check([
      ["NO_FACTOR_FOR_YEAR", "emission_category_mapping.a"],
      ["NO_FACTOR_FOR_YEAR", "emission_category_mapping.b"],
    ]);
    expect(newErrors(check([["NO_FACTOR_FOR_YEAR", "emission_category_mapping.b"]]), saved)).toEqual([]);
    expect(newErrors(check([["DEFAULT_MISSING", "field_settings.Vehicle"], ["NO_FACTOR_FOR_YEAR", "emission_category_mapping.a"]]), saved).map((e) => e.field)).toEqual(["field_settings.Vehicle"]);
    expect(newErrors(check([["NO_FACTOR_FOR_YEAR", "emission_category_mapping.a"]]), null)).toHaveLength(1);
    // No check from the server never blocks.
    expect(newErrors(null, saved)).toEqual([]);
    expect(newErrors(check([], [["FACTOR_FALLBACK_YEAR", "emission_category_mapping.a"]]), null)).toEqual([]);
  });

  it("counts things", () => {
    expect(fixCount(1)).toBe("1 thing");
    expect(fixCount(3)).toBe("3 things");
  });
});

describe("versionChanges", () => {
  const v1 = {
    config_name: "Freight",
    columns: [
      { pk_id: 1, column_name: "Mode", column_type: "select" },
      { pk_id: 2, column_name: "Distance", column_type: "number" },
    ],
    field_settings: {},
    emission_category_mapping: { "Road|Van": "Van - Diesel", "Boat|Ferry": "Ferry" },
    extra_fields: [{ key: "po", label: "PO number" }],
    method_options: [{ method: "distance_based", units: ["km"] }],
    method_by_choice: null,
    calculation: { mode: "per_method", method_column: "Mode", methods: { road: { multiply: ["Distance"] } } },
    units: {},
    currency: null,
  };

  it("lists each changed setting in the builder's words", () => {
    const v2 = {
      ...v1,
      config_name: "Freight (UK)",
      columns: [
        { pk_id: 1, column_name: "How did it travel?", column_type: "select" },
        { pk_id: 3, column_name: "Litres", column_type: "number" },
      ],
      field_settings: { Mode: { label: "How did it travel?" } },
      emission_category_mapping: { "Road|Van": "Van - Petrol", "Road|HGV": "HGV" },
      extra_fields: [],
      method_options: [
        { method: "fuel_based", units: ["litre"] },
        { method: "distance_based", units: ["km"] },
      ],
      units: { fixed: "km" },
      currency: { fixed: "INR" },
    };
    expect(versionChanges(v1, v2)).toEqual([
      { setting: "Form name", detail: '"Freight" → "Freight (UK)"' },
      { setting: "Fields", detail: "added Litres; removed Distance; renamed Mode → How did it travel?" },
      { setting: "What contributors see", detail: "added Mode" },
      { setting: "Factor match", detail: "added Road › HGV; removed Boat › Ferry; changed Road › Van" },
      { setting: "Extra details", detail: "removed PO number" },
      { setting: "Methods offered", detail: "added From fuel used" },
      { setting: "Fixed unit", detail: "none → km" },
      { setting: "Currency", detail: "none → INR" },
    ]);
  });

  it("finds no change when only the stored key order differs, and reads the method question and formulas", () => {
    const reordered = Object.fromEntries(Object.entries(v1).reverse());
    expect(versionChanges(v1, reordered)).toEqual([]);
    const v3 = {
      ...v1,
      method_by_choice: { column: "Mode", map: { road: "distance_based" } },
      calculation: { ...v1.calculation, methods: { road: { multiply: ["Distance", "Weight"] }, rail: { multiply: ["Distance"] } } },
    };
    expect(versionChanges(v1, v3)).toEqual([
      { setting: "How the method is set", detail: 'the question is now "Mode"' },
      { setting: "Calculation", detail: "added formula for rail; changed formula for road" },
    ]);
    expect(versionChanges(null, v1)).toEqual([]);
    expect(stableJson({ a: 1, b: undefined })).toBe(stableJson({ a: 1 }));
  });
});
