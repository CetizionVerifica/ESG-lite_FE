import { describe, expect, it } from "vitest";
import { readUnitOptions, unitForCategory, unitsForRow, withMethodUnits, type UnitOptionsByActivity } from "./unitOptions";

const options: UnitOptionsByActivity = {
  fixed_unit: null,
  all_units: ["litre", "kWh", "SCM", "kg"],
  activities: [
    { name: "Diesel", factor_unit: "litre", units: ["litre", "kl", "gallon"] },
    { name: "HSD", maps_to: "Diesel", factor_unit: "litre", units: ["litre", "kl", "gallon"] },
    { name: "Natural gas", factor_unit: "cubic meter", units: ["SCM", "litre"] },
    { name: "Grid electricity", factor_unit: "kWh", units: ["kWh"] },
  ],
};

describe("readUnitOptions", () => {
  it("keeps a well-formed response and refuses anything else (older API, plain unit list)", () => {
    expect(readUnitOptions(options)).toEqual(options);
    expect(readUnitOptions([{ unit_id: 1, unit_name: "litre" }])).toBeNull();
    expect(readUnitOptions(null)).toBeNull();
    expect(readUnitOptions({ activities: [] })).toBeNull();
  });
});

describe("unitsForRow (#183)", () => {
  it("offers the emission category's units, matched trimmed and case-blind; an alias has its factor's list", () => {
    expect(unitsForRow(options, " diesel ", "litre")).toEqual({ units: ["litre", "kl", "gallon"], factorUnit: "litre", notOffered: null });
    expect(unitsForRow(options, "HSD", null)?.units).toEqual(["litre", "kl", "gallon"]);
    expect(unitsForRow(options, "Grid electricity", null)?.units).toEqual(["kWh"]);
  });

  it("offers nothing before an emission category is chosen", () => {
    expect(unitsForRow(options, "", "kg")).toEqual({ units: [], factorUnit: null, notOffered: null });
  });

  it("keeps a unit the list doesn't hold as not offered, so a saved entry never changes silently", () => {
    expect(unitsForRow(options, "Diesel", "kWh")?.notOffered).toBe("kWh");
    expect(unitsForRow(options, "Diesel", "LITRE")?.notOffered).toBeNull();
  });

  it("a name the server doesn't know offers every unit (or the fixed one); no options keeps the flat list", () => {
    expect(unitsForRow(options, "Biogas", null)?.units).toEqual(options.all_units);
    expect(unitsForRow({ ...options, fixed_unit: "MWh" }, "Biogas", null)?.units).toEqual(["MWh"]);
    expect(unitsForRow(null, "Diesel", null)).toBeNull();
  });
});

describe("withMethodUnits", () => {
  it("narrows a method's units to the allowed ones, or keeps the method's when they share none", () => {
    expect(withMethodUnits(["kg", "tonne"], null)).toEqual(["kg", "tonne"]);
    expect(withMethodUnits(["kg", "tonne"], ["tonne", "USD"])).toEqual(["tonne"]);
    expect(withMethodUnits(["kg"], ["passenger.km"])).toEqual(["passenger.km"]);
  });
});

describe("unitForCategory: the row's unit after its emission category changes", () => {
  it("keeps a unit still offered, picks the only one, else clears", () => {
    expect(unitForCategory(options, "Natural gas", "litre")).toBe("litre");
    expect(unitForCategory(options, "Natural gas", "kWh")).toBe("");
    expect(unitForCategory(options, "Grid electricity", "litre")).toBe("kWh");
    expect(unitForCategory(options, "Grid electricity", "")).toBe("kWh");
  });

  it("leaves the unit alone with no options or no emission category", () => {
    expect(unitForCategory(null, "Diesel", "kWh")).toBe("kWh");
    expect(unitForCategory(options, "", "kWh")).toBe("kWh");
  });
});
