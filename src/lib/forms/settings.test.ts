import { describe, expect, it } from "vitest";
import { fieldLabelFor, isDefaultValue, methodForAnswer, readFormSettings, settingFor, withDefaults } from "./settings";

describe("readFormSettings (SE-2 fields on a form)", () => {
  it("reads what fits and leaves out what doesn't", () => {
    const s = readFormSettings({
      field_settings: { Vehicle: { label: "Truck", hidden: true, default: "hgv", colour: "red" }, Bad: "x", Empty: { label: " " } },
      method_by_choice: { column: "Record type", map: { trip: "distance_based", bad: 5 } },
      units: { fixed: "km" },
      currency: { fixed: "USD" },
    });
    expect(s.fieldSettings).toEqual({ Vehicle: { label: "Truck", hidden: true, default: "hgv" }, Empty: {} });
    expect(s.methodByChoice).toEqual({ column: "Record type", map: { trip: "distance_based" } });
    expect(s.fixedUnit).toBe("km");
    expect(s.fixedCurrency).toBe("USD");
    expect(readFormSettings({ method_by_choice: { map: {} }, units: "km", currency: null })).toEqual({ fieldSettings: {}, methodByChoice: null, fixedUnit: null, fixedCurrency: null });
    expect(readFormSettings(null).fieldSettings).toEqual({});
  });

  it("finds a field's settings and label without regard to case", () => {
    const fs = { Vehicle: { label: "Truck" } };
    expect(settingFor(fs, "vehicle")).toEqual({ label: "Truck" });
    expect(fieldLabelFor(fs, "VEHICLE", "Vehicle")).toBe("Truck");
    expect(fieldLabelFor(fs, "Distance", "Distance")).toBe("Distance");
  });

  it("maps an answer to its method, matching the answer without regard to case", () => {
    const mbc = { column: "Record type", map: { trip: "distance_based", fuel_bill: "fuel_based" } };
    expect(methodForAnswer(mbc, "TRIP")).toBe("distance_based");
    expect(methodForAnswer(mbc, "")).toBeNull();
    expect(methodForAnswer(mbc, "boat")).toBeNull();
    expect(methodForAnswer(null, "trip")).toBeNull();
  });

  it("a new row gets the defaults where it is empty, hidden ones too, extras in _extra_data", () => {
    const row = withDefaults({ id: 1, Vehicle: "", Share: "50", _extra_data: { paid_by: "" } }, { vehicle: { default: "hgv", hidden: true }, Share: { default: 100 }, paid_by: { default: "We paid" } }, ["paid_by"]);
    // What was filled is remembered, so it doesn't count as typed input (Add data's rowHasInput).
    expect(row).toEqual({ id: 1, Vehicle: "hgv", Share: "50", _extra_data: { paid_by: "We paid" }, _defaults: { Vehicle: "hgv", "_extra_data.paid_by": "We paid" } });
    expect(isDefaultValue(row, "Vehicle", "hgv")).toBe(true);
    expect(isDefaultValue(row, "Vehicle", "van")).toBe(false);
    expect(isDefaultValue(row, "Share", "50")).toBe(false);
  });
});
