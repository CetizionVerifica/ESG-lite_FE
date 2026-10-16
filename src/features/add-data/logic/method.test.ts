import { describe, expect, it } from "vitest";
import { applyChange, newRow, rowMethodChoices, toFormModel } from "../../../lib/emissions/form";
import type { ColumnConfig, ModalRow } from "../../../lib/emissions/types";
import { editRow, isEstimated, rowHasInput, rowsReducer } from "../hooks/useEntryRows";
import { buildPayload } from "./entry";

// S3-3: the row's method (Add data method cards), its units, and the distance helper's estimate flag.

const goods: ColumnConfig = {
  pk_id: 1,
  config_name: "Purchased goods",
  columns: [
    { pk_id: 1, column_name: "material", column_type: "select" },
    { pk_id: 2, column_name: "amount", column_type: "number" },
  ],
  method_options: [
    { method: "supplier_specific", units: ["kg"] },
    { method: "average_data", units: ["kg", "tonne"] },
    { method: "spend_based", units: ["USD", "EUR"] },
  ],
};

const travel: ColumnConfig = {
  pk_id: 2,
  config_name: "Travel",
  columns: [{ pk_id: 1, column_name: "distance", column_type: "number" }],
  calculation: { mode: "per_method", method_column: "@method", methods: { distance_based: { multiply: ["distance"], activity_unit: "passenger.km" } } },
};

const period = { mode: "monthly" as const, year: 2026, month: 9 };
const ctx = { siteId: 4, categoryId: 11, period };

describe("the row's method", () => {
  it("reads the form's method_options, else a spec's @method methods, else none", () => {
    expect(rowMethodChoices(toFormModel(goods))).toEqual(["supplier_specific", "average_data", "spend_based"]);
    expect(rowMethodChoices(toFormModel(travel))).toEqual(["distance_based"]);
    expect(rowMethodChoices(toFormModel({ ...travel, calculation: null }))).toEqual([]);
    // Legacy bare keys (the first cut of the column) work too, as the engine reads them.
    expect(rowMethodChoices(toFormModel({ ...goods, method_options: ["spend_based"] }))).toEqual(["spend_based"]);
  });

  it("starts a new row on the form's first method, which isn't input by itself", () => {
    const row = newRow(toFormModel(goods), 1);
    expect(row["@method"]).toBe("supplier_specific");
    expect(row.activity_data_unit).toBeUndefined();
    expect(rowHasInput(row)).toBe(false);
    // A form without method_options leaves the method to the person (S3-9 behaviour).
    expect(newRow(toFormModel(travel), 1)).not.toHaveProperty("@method");
  });

  it("keeps a unit the new method offers, picks its only one, or clears it", () => {
    const m = toFormModel(goods);
    let row: ModalRow = { ...newRow(m, 1), activity_data_unit: "kg" };
    row = applyChange(m, row, "@method", "average_data");
    expect(row.activity_data_unit).toBe("kg");
    row = applyChange(m, row, "@method", "spend_based");
    expect(row.activity_data_unit).toBe("");
    row = applyChange(m, { ...row, activity_data_unit: "EUR" }, "@method", "supplier_specific");
    expect(row.activity_data_unit).toBe("kg");
  });
});

describe("the save payload", () => {
  it("sends the method, and keeps @method in activity_data only for an @method spec", () => {
    const row = { ...newRow(toFormModel(goods), 1), material: "steel", amount: "1200", activity_data_unit: "USD", "@method": "spend_based", emission_category: "Steel" };
    const body = buildPayload(row, { ...ctx, rowMethodInActivity: false });
    expect(body.method).toBe("spend_based");
    expect(body.activity_data).not.toHaveProperty("@method");
    expect(body).not.toHaveProperty("is_estimate");

    const trip = { id: 1, distance: "40", "@method": "distance_based", activity_data_unit: "passenger.km", emission_category: "Car" };
    const tripBody = buildPayload(trip, { ...ctx, rowMethodInActivity: true });
    expect(tripBody.method).toBe("distance_based");
    expect(tripBody.activity_data["@method"]).toBe("distance_based");
  });

  it("sends no method for a row without a valid one", () => {
    expect(buildPayload({ id: 1, quantity: "3" }, ctx)).not.toHaveProperty("method");
    expect(buildPayload({ id: 1, quantity: "3", "@method": "nope" }, ctx)).not.toHaveProperty("method");
    expect(buildPayload({ id: 1, quantity: "3", "@method": "unknown" }, ctx)).not.toHaveProperty("method");
  });
});

describe("the distance helper's estimate flag", () => {
  const m = toFormModel(travel);
  const start = { rows: [newRow(m, 1)], nextId: 2, key: null, sent: false };

  it("marks the row an estimate, sends is_estimate and never puts the flag in activity_data", () => {
    const state = rowsReducer(start, { type: "distance", model: m, id: 1, column: "distance", value: "412", estimate: true });
    const row = state.rows[0];
    expect(row.distance).toBe("412");
    expect(isEstimated(row)).toBe(true);
    const body = buildPayload({ ...row, emission_category: "Rail" }, ctx);
    expect(body.is_estimate).toBe(true);
    expect(body.activity_data).not.toHaveProperty("_estimates");
  });

  it("drops the flag when the helper gives an exact distance or the person types over it", () => {
    let state = rowsReducer(start, { type: "distance", model: m, id: 1, column: "distance", value: "412", estimate: true });
    state = rowsReducer(state, { type: "distance", model: m, id: 1, column: "distance", value: "398", estimate: false });
    expect(isEstimated(state.rows[0])).toBe(false);
    state = rowsReducer(state, { type: "distance", model: m, id: 1, column: "distance", value: "412", estimate: true });
    const typed = editRow(m, state.rows[0], "distance", "400");
    expect(isEstimated(typed)).toBe(false);
    expect(buildPayload(typed, ctx)).not.toHaveProperty("is_estimate");
  });
});
