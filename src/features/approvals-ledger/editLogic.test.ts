import { describe, expect, it } from "vitest";
import {
  applyChange,
  editErrors,
  editPayload,
  editableKeys,
  fieldOptions,
  isNumberField,
  parentPrompt,
  prefillFromCategory,
  resolveEmissionCategory,
  selectChain,
} from "./editLogic";
import type { ColumnConfig } from "./logic";

// Fuel type → grade, mapped to factor names.
const chained: ColumnConfig = {
  columns: [
    { pk_id: 5, column_name: "fuel_type", column_type: "select" },
    { pk_id: 6, column_name: "grade", column_type: "select" },
    { pk_id: 7, column_name: "quantity", column_type: "number" },
  ],
  column_options: { "5": [{ id: 1, label: "Diesel" }, { id: 2, label: "Petrol" }] },
  column_dependencies: { grade: "fuel_type" },
  dependent_options: {
    grade: { Diesel: [{ id: 11, label: "ULSD" }, { id: 12, label: "Red" }], Petrol: [{ id: 21, label: "95 RON" }] },
  },
  emission_category_mapping: { "Diesel|ULSD": "Diesel (average biofuel blend)", "Diesel|Red": "Gas oil", "Petrol|95 RON": "Petrol (average biofuel blend)" },
};

// Three levels: vehicle → size → fuel, keyed "vehicle|size" for the fuel list.
const threeLevel: ColumnConfig = {
  columns: [
    { pk_id: 1, column_name: "vehicle", column_type: "select" },
    { pk_id: 2, column_name: "size", column_type: "select" },
    { pk_id: 3, column_name: "fuel", column_type: "select" },
  ],
  column_options: { "1": [{ id: "v1", label: "Van" }] },
  column_dependencies: { size: "vehicle", fuel: "size" },
  dependent_options: {
    size: { Van: [{ id: "s1", label: "Large" }] },
    fuel: { "Van|Large": [{ id: "f1", label: "Diesel" }] },
  },
  emission_category_mapping: { "Van|Large|Diesel": "Vans large diesel" },
};

// No dependencies: single select mapped directly.
const flat: ColumnConfig = {
  columns: [{ pk_id: 9, column_name: "source", column_type: "select" }],
  column_options: { "9": [{ id: 1, label: "Grid" }] },
  emission_category_mapping: { Grid: "Electricity grid" },
};

describe("fieldOptions", () => {
  it("offers a column's own options", () => {
    expect(fieldOptions(chained, "fuel_type", {})?.map((o) => o.label)).toEqual(["Diesel", "Petrol"]);
  });

  it("offers dependent options only once the parent is chosen", () => {
    expect(fieldOptions(chained, "grade", {})).toBeNull();
    expect(fieldOptions(chained, "grade", { fuel_type: "2" })?.map((o) => o.label)).toEqual(["95 RON"]);
  });

  it("uses composite keys for three-level chains", () => {
    expect(fieldOptions(threeLevel, "fuel", { vehicle: "v1", size: "s1" })?.map((o) => o.id)).toEqual(["f1"]);
  });

  it("is a free input for number columns and when no config loaded", () => {
    expect(fieldOptions(chained, "quantity", {})).toBeNull();
    expect(fieldOptions(undefined, "fuel_type", {})).toBeNull();
  });
});

describe("applyChange", () => {
  it("clears dependants and re-resolves the emission category", () => {
    const a = applyChange(chained, { fuel_type: "1", grade: "11", emission_category: "Diesel (average biofuel blend)" }, "fuel_type", "2");
    expect(a).toMatchObject({ fuel_type: "2", grade: "", emission_category: "" });
    const b = applyChange(chained, a, "grade", "21");
    expect(b.emission_category).toBe("Petrol (average biofuel blend)");
  });

  it("clears grandchildren too", () => {
    const a = applyChange(threeLevel, { vehicle: "v1", size: "s1", fuel: "f1" }, "vehicle", "v1");
    expect(a).toMatchObject({ size: "", fuel: "" });
  });

  it("leaves number edits alone", () => {
    expect(applyChange(chained, { quantity: "1", emission_category: "X" }, "quantity", "2")).toEqual({ quantity: "2", emission_category: "X" });
  });
});

describe("resolveEmissionCategory", () => {
  it("walks the chain", () => {
    expect(resolveEmissionCategory(chained, { fuel_type: "1", grade: "12" })).toBe("Gas oil");
    expect(resolveEmissionCategory(threeLevel, { vehicle: "v1", size: "s1", fuel: "f1" })).toBe("Vans large diesel");
  });

  it("needs every select in the chain", () => {
    expect(resolveEmissionCategory(chained, { fuel_type: "1" })).toBeNull();
  });

  it("matches a single select without dependencies", () => {
    expect(resolveEmissionCategory(flat, { source: "1" })).toBe("Electricity grid");
  });
});

describe("prefillFromCategory", () => {
  it("fills empty selects from the stored category", () => {
    expect(prefillFromCategory(chained, { emission_category: "Gas oil", quantity: "5" })).toMatchObject({ fuel_type: "1", grade: "12" });
  });

  it("keeps values already stored", () => {
    expect(prefillFromCategory(chained, { emission_category: "Gas oil", fuel_type: "2" })).toMatchObject({ fuel_type: "2" });
  });
});

describe("form helpers", () => {
  it("orders fields by the form and keeps extra stored keys", () => {
    expect(editableKeys(chained, { note: "x", quantity: "1", emission_category: "y", category_name: "z" })).toEqual(["fuel_type", "grade", "quantity", "note"]);
    expect(selectChain(chained)).toEqual(["fuel_type", "grade"]);
  });

  it("knows number fields", () => {
    expect(isNumberField(chained, "quantity", "")).toBe(true);
    expect(isNumberField(chained, "fuel_type", "1")).toBe(false);
    expect(isNumberField(undefined, "kwh", "12.5")).toBe(true);
  });

  it("builds the payload and requires a reason", () => {
    expect(editPayload({ quantity: "2", category_name: "Diesel", _isFeraRow: true }, "2025-09-30", "", " Fixed unit ")).toEqual({
      activity_data: { quantity: "2" },
      date_of_reporting: "2025-09-30",
      activity_data_unit: undefined,
      reason: "Fixed unit",
    });
    expect(editErrors("no").reason).toMatch(/at least 5/);
    expect(editErrors("Typo in litres")).toEqual({});
    expect(editErrors("Typo in litres", "").category).toMatch(/emission factor/);
    expect(editErrors("Typo in litres", "Diesel")).toEqual({});
  });

  it("prompts for the parent", () => {
    expect(parentPrompt(chained, "grade")).toBe("Select fuel type first");
    expect(parentPrompt(chained, "fuel_type")).toBeUndefined();
  });
});
