import { describe, expect, it } from "vitest";
import {
  applyChange,
  autoEmissionCategory,
  columnOptionsFor,
  formColumns,
  isColumnVisible,
  newRow,
  optionLabel,
  toFormModel,
  visibleExtraFields,
} from "./form";
import type { ColumnConfig, ColumnEntity } from "./types";

const col = (pk_id: number, column_name: string, column_type = "select"): ColumnEntity => ({ pk_id, column_name, column_type });

// Waste: Activity Type → Type of Waste → Disposal Method (3 levels, composite keys).
const waste: ColumnConfig = {
  pk_id: 1,
  config_name: "Waste",
  columns: [col(1, "activity_type"), col(2, "type_of_waste"), col(3, "disposal_method"), col(4, "quantity", "number"), col(5, "emission_category", "text")],
  column_options: { "1": [{ id: "m", label: "Metal" }, { id: "p", label: "Paper" }] },
  column_dependencies: { type_of_waste: "activity_type", disposal_method: "type_of_waste" },
  dependent_options: {
    type_of_waste: { Metal: [{ id: "am", label: "Any metals" }], Paper: [{ id: "bk", label: "Books" }] },
    disposal_method: {
      "Metal|Any metals": [{ id: "ol", label: "Open loop" }, { id: "lf", label: "Landfill" }],
      "Any metals": [{ id: "x", label: "Wrong (not scoped)" }],
      books: [{ id: "cl", label: "Closed loop" }],
    },
  },
  emission_category_mapping: {
    "Metal|Any metals|Open loop": "Metal: open loop recycling",
    "books|closed loop": "Paper: closed loop",
  },
  extra_fields: [
    { key: "po", label: "PO number", type: "text", required: false },
    { key: "hauler", label: "Hauler", type: "text", required: false, show_for: ["metal"] },
  ],
};

describe("form model (dependent selects and mapping)", () => {
  const m = toFormModel(waste);

  it("hides the derived emission_category column", () => {
    expect(formColumns(m).map((c) => c.column_name)).not.toContain("emission_category");
  });

  it("scopes 3rd-level options by grandparent|parent before the plain parent key", () => {
    expect(columnOptionsFor(m, waste.columns[2], "am").map((o) => o.id)).toEqual(["ol", "lf"]);
  });

  it("falls back to case-insensitive parent labels", () => {
    expect(columnOptionsFor(m, waste.columns[2], "bk").map((o) => o.id)).toEqual(["cl"]);
  });

  it("returns no options for a dependent column without a parent value", () => {
    expect(columnOptionsFor(m, waste.columns[1], undefined)).toEqual([]);
  });

  it("labels stored ids", () => {
    expect(optionLabel(m, waste.columns[0], "m")).toBe("Metal");
    expect(optionLabel(m, waste.columns[1], "am")).toBe("Any metals");
    expect(optionLabel(m, waste.columns[1], "zz")).toBe("zz");
  });

  it("maps the full chain to an emission category, case-insensitively, dropping leading dimensions", () => {
    expect(autoEmissionCategory(m, { id: 1, activity_type: "m", type_of_waste: "am", disposal_method: "ol" })).toEqual({
      key: "Metal|Any metals|Open loop",
      category: "Metal: open loop recycling",
    });
    expect(autoEmissionCategory(m, { id: 1, activity_type: "p", type_of_waste: "bk", disposal_method: "cl" })).toEqual({
      key: "books|closed loop",
      category: "Paper: closed loop",
    });
    expect(autoEmissionCategory(m, { id: 1, activity_type: "m", type_of_waste: "am" })).toBeNull();
  });

  it("clears dependants, then derives (or clears) the emission category on change", () => {
    let row = newRow(m, 1);
    row = applyChange(m, row, "activity_type", "m");
    row = applyChange(m, row, "type_of_waste", "am");
    row = applyChange(m, row, "disposal_method", "ol");
    expect(row.emission_category).toBe("Metal: open loop recycling");
    expect(row._ecmKey).toBe("Metal|Any metals|Open loop");
    row = applyChange(m, row, "activity_type", "p");
    expect(row.type_of_waste).toBe("");
    expect(row.emission_category).toBe("");
  });

  it("shows extra fields only for matching categories", () => {
    expect(visibleExtraFields(m, { id: 1, emission_category: "Metal: open loop recycling" }).map((f) => f.key)).toEqual(["po", "hauler"]);
    expect(visibleExtraFields(m, { id: 1, emission_category: "Paper: closed loop" }).map((f) => f.key)).toEqual(["po"]);
  });

  it("starts a row with every column blank and every extra field blank", () => {
    expect(newRow(m, 7)).toEqual({
      id: 7,
      activity_type: "",
      type_of_waste: "",
      disposal_method: "",
      quantity: "",
      emission_category: "",
      _extra_data: { po: "", hauler: "" },
    });
  });
});

describe("form model (flat mapping and calculation specs)", () => {
  it("maps a flat select by label", () => {
    const m = toFormModel({
      pk_id: 2,
      config_name: "Fuel",
      columns: [col(1, "fuel"), col(2, "quantity", "number")],
      column_options: { "1": [{ id: 7, label: "Diesel" }] },
      emission_category_mapping: { diesel: "Diesel (avg biofuel blend)" },
    });
    expect(autoEmissionCategory(m, { id: 1, fuel: "7" })).toEqual({ key: "diesel", category: "Diesel (avg biofuel blend)" });
  });

  it("per_method: a method change clears unused numbers, prefills percents and preselects the unit", () => {
    const m = toFormModel({
      pk_id: 3,
      config_name: "Sold products",
      columns: [col(1, "method"), col(2, "units_sold", "number"), col(3, "fuel_per_use", "number"), col(4, "share_used", "number")],
      column_options: { "1": [{ id: "Fuel consumed", label: "Fuel consumed" }] },
      calculation: {
        mode: "per_method",
        method_column: "method",
        methods: {
          "Fuel consumed": { multiply: ["units_sold", "fuel_per_use"], activity_unit: "litre" },
          Electricity: { multiply: ["units_sold", "share_used"], percent: ["share_used"], activity_unit: "kwh" },
        },
      },
    });
    const row = { ...newRow(m, 1), fuel_per_use: "3", units_sold: "10" };
    expect(isColumnVisible(m, m.columns[1], { id: 1 })).toBe(false);
    const changed = applyChange(m, row, "method", "Electricity");
    expect(changed).toMatchObject({ fuel_per_use: "", units_sold: "10", share_used: "100", activity_data_unit: "kwh" });
    expect(isColumnVisible(m, m.columns[3], changed)).toBe(true);
    expect(isColumnVisible(m, m.columns[2], changed)).toBe(false);
  });

  it("per_unit: shows every spec number until a unit is chosen", () => {
    const m = toFormModel({
      pk_id: 4,
      config_name: "Transport",
      columns: [col(1, "weight", "number"), col(2, "distance", "number"), col(3, "notes", "number")],
      calculation: { mode: "per_unit", methods: { km: { multiply: ["distance"] }, "tonne.km": { multiply: ["weight", "distance"] } } },
    });
    expect(isColumnVisible(m, m.columns[0], { id: 1 })).toBe(true);
    expect(isColumnVisible(m, m.columns[2], { id: 1 })).toBe(false);
    expect(isColumnVisible(m, m.columns[0], { id: 1, activity_data_unit: "km" })).toBe(false);
  });
});
