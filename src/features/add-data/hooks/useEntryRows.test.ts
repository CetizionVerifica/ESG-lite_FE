import { describe, expect, it } from "vitest";
import { toFormModel } from "../../../lib/emissions/form";
import type { ColumnConfig, ColumnEntity } from "../../../lib/emissions/types";
import { billOf } from "../logic/bill";
import { editRow, isEstimated, rowsReducer } from "./useEntryRows";

const col = (pk_id: number, column_name: string, column_type = "select"): ColumnEntity => ({ pk_id, column_name, column_type });
const waste: ColumnConfig = {
  pk_id: 1,
  config_name: "Waste",
  columns: [col(1, "activity_type"), col(2, "type_of_waste"), col(3, "quantity", "number"), col(4, "emission_category", "text")],
  column_options: { "1": [{ id: "m", label: "Metal" }, { id: "p", label: "Paper" }] },
  column_dependencies: { type_of_waste: "activity_type" },
  dependent_options: { type_of_waste: { Metal: [{ id: "am", label: "Any metals" }], Paper: [{ id: "bk", label: "Books" }] } },
  emission_category_mapping: { "Metal|Any metals": "Metal recycling" },
};

describe("editing a bill row", () => {
  it("drops the AI mark from the edited field and from values the edit cleared or re-derived", () => {
    const m = toFormModel(waste);
    const row = {
      id: 1,
      activity_type: "m",
      type_of_waste: "am",
      quantity: "120",
      emission_category: "Metal recycling",
      _bill: { ai: ["activity_type", "type_of_waste", "quantity", "emission_category"], confidence: null },
    };
    const next = editRow(m, row, "activity_type", "p");
    expect(next.type_of_waste).toBe("");
    expect(next.emission_category).toBe("");
    expect(billOf(next)?.ai).toEqual(["quantity"]);
  });
});

describe("duplicating a row loaded with Edit", () => {
  it("makes a new entry that doesn't update the saved one or change the comparison", () => {
    const loaded = { id: 1, quantity: "43", emission_category: "Diesel", _editOf: 55, _editSaved: { category: "Diesel", tco2e: 4.2 } };
    const state = rowsReducer({ rows: [loaded], nextId: 2, key: null, sent: false }, { type: "duplicate", id: 1 });
    expect(state.rows).toHaveLength(2);
    expect(state.rows[0]).toMatchObject({ _editOf: 55 });
    expect(state.rows[1]).toMatchObject({ id: 2, quantity: "43", emission_category: "Diesel" });
    expect(state.rows[1]).not.toHaveProperty("_editOf");
    expect(state.rows[1]).not.toHaveProperty("_editSaved");
  });
});

describe("an estimated distance (S3-3 is_estimate, S3-8)", () => {
  it("stays an estimate until the user types over it", () => {
    const m = toFormModel(waste);
    const start = { rows: [{ id: 1, quantity: "" }], nextId: 2, key: null, sent: false };
    const estimated = rowsReducer(start, { type: "distance", model: m, id: 1, column: "quantity", value: "147.91", estimate: true });
    expect(isEstimated(estimated.rows[0])).toBe(true);
    const typed = rowsReducer(estimated, { type: "change", model: m, id: 1, column: "quantity", value: "150" });
    expect(typed.rows[0].quantity).toBe("150");
    expect(isEstimated(typed.rows[0])).toBe(false);
  });
});

describe("the unit follows the emission category (#183)", () => {
  const fuel: ColumnConfig = { pk_id: 2, config_name: "Fuel", columns: [col(5, "quantity", "number")], column_options: {} };
  const unitOptions = {
    fixed_unit: null,
    all_units: ["litre", "kWh", "SCM"],
    activities: [
      { name: "Diesel", factor_unit: "litre", units: ["litre", "kl"] },
      { name: "Natural gas", factor_unit: "cubic meter", units: ["SCM", "litre"] },
      { name: "Grid electricity", factor_unit: "kWh", units: ["kWh"] },
    ],
  };
  const m = toFormModel(fuel, unitOptions);

  it("keeps a unit the new emission category still offers and clears one it doesn't", () => {
    const row = { id: 1, emission_category: "Diesel", activity_data_unit: "litre", quantity: "10" };
    expect(editRow(m, row, "emission_category", "Natural gas").activity_data_unit).toBe("litre");
    expect(editRow(m, { ...row, activity_data_unit: "kl" }, "emission_category", "Natural gas").activity_data_unit).toBe("");
  });

  it("picks the only unit an emission category offers", () => {
    expect(editRow(m, { id: 1, emission_category: "", activity_data_unit: "" }, "emission_category", "Grid electricity").activity_data_unit).toBe("kWh");
  });

  it("leaves a spend row's currency alone, and every row alone without a list (older API)", () => {
    const spend = { id: 1, emission_category: "Diesel", activity_data_unit: "INR", currency: "INR", "@method": "spend_based" };
    expect(editRow(m, spend, "emission_category", "Natural gas").activity_data_unit).toBe("INR");
    expect(editRow(toFormModel(fuel), { id: 1, emission_category: "Diesel", activity_data_unit: "kl" }, "emission_category", "Natural gas").activity_data_unit).toBe("kl");
  });

  it("narrows a method's units to those the emission category allows", () => {
    const withMethods = toFormModel({ ...fuel, method_options: [{ method: "fuel_based", units: ["kl", "SCM"] }] }, unitOptions);
    const row = { id: 1, emission_category: "Diesel", activity_data_unit: "kl", "@method": "fuel_based" };
    // Natural gas allows SCM and litre; of the method's kl and SCM only SCM is left, so it's picked.
    expect(editRow(withMethods, row, "emission_category", "Natural gas").activity_data_unit).toBe("SCM");
  });
});
