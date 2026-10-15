import { describe, expect, it } from "vitest";
import { ROW_METHOD_COLUMN } from "./emissionCalc";
import { applyChange, autoEmissionCategory, isColumnVisible, newRow, toFormModel } from "./form";
import type { ColumnConfig, ColumnEntity, ModalRow } from "./types";

const col = (pk_id: number, column_name: string, column_type = "select"): ColumnEntity => ({ pk_id, column_name, column_type });
const opts = (...labels: string[]) => labels.map((l) => ({ id: l, label: l }));

// The standard Category 6 form ESG-lite seeds (src/scope3/commuting/configs.ts):
// mode → class → radiative forcing, where only air classes offer RF.
const travel: ColumnConfig = {
  pk_id: 1,
  config_name: "Scope 3 travel - Standard",
  columns: [
    col(1, "Trip mode"),
    col(2, "Trip class"),
    col(3, "Radiative forcing"),
    col(4, "Travellers", "number"),
    col(5, "Distance (km)", "number"),
    col(6, "Travellers per vehicle", "number"),
  ],
  column_options: { "1": opts("Air", "Rail"), "2": opts("Long haul, economy", "National rail"), "3": [] },
  column_dependencies: { "Trip class": "Trip mode", "Radiative forcing": "Trip class" },
  dependent_options: {
    "Trip class": { Air: opts("Long haul, economy"), Rail: opts("National rail") },
    "Radiative forcing": { "Long haul, economy": opts("With RF", "Without RF") },
  },
  emission_category_mapping: {
    "Air|Long haul, economy|With RF": "Flights - Long haul - Economy - With RF [passenger.km]",
    "Rail|National rail": "Rail - National rail [passenger.km]",
  },
  extra_fields: [],
};

describe("dependent selects with no choice for the parent (S3-9)", () => {
  const m = toFormModel(travel);
  const rf = travel.columns[2];

  it("maps a rail trip without a radiative-forcing choice", () => {
    let row = applyChange(m, newRow(m, 1), "Trip mode", "Rail");
    row = applyChange(m, row, "Trip class", "National rail");
    expect(row.emission_category).toBe("Rail - National rail [passenger.km]");
    expect(isColumnVisible(m, rf, row)).toBe(false);
  });

  it("still needs the RF choice for a flight", () => {
    let row = applyChange(m, newRow(m, 1), "Trip mode", "Air");
    row = applyChange(m, row, "Trip class", "Long haul, economy");
    expect(isColumnVisible(m, rf, row)).toBe(true);
    expect(autoEmissionCategory(m, row)).toBeNull();
    row = applyChange(m, row, "Radiative forcing", "With RF");
    expect(row.emission_category).toBe("Flights - Long haul - Economy - With RF [passenger.km]");
  });

  it("reads an empty child's own parent, not the last column walked", () => {
    // Mode has two children; Trip class's branch is walked before Seat note's.
    const branched: ColumnConfig = {
      ...travel,
      columns: [...travel.columns, col(7, "Seat note")],
      column_options: { ...travel.column_options, "7": [] },
      column_dependencies: { ...travel.column_dependencies, "Seat note": "Trip mode" },
      dependent_options: { ...travel.dependent_options, "Seat note": { Air: opts("Window") } },
    };
    const b = toFormModel(branched);
    let rail = applyChange(b, newRow(b, 1), "Trip mode", "Rail");
    rail = applyChange(b, rail, "Trip class", "National rail");
    // Rail offers no seat note, so the chain ends and maps.
    expect(autoEmissionCategory(b, rail)?.category).toBe("Rail - National rail [passenger.km]");
    let air = applyChange(b, newRow(b, 1), "Trip mode", "Air");
    air = applyChange(b, air, "Trip class", "Long haul, economy");
    air = applyChange(b, air, "Radiative forcing", "With RF");
    // Air offers a seat note: the last value walked ("With RF") must not decide that.
    expect(autoEmissionCategory(b, air)).toBeNull();
  });

  it("shows a dependent select while its parent is still empty", () => {
    expect(isColumnVisible(m, rf, newRow(m, 1))).toBe(true);
  });
});

describe("row's method (@method) picks and clears fields (S3-9)", () => {
  const commuting: ColumnConfig = {
    pk_id: 2,
    config_name: "Scope 3 commuting - Standard",
    columns: [col(1, "Commuting mode"), col(2, "Total distance (km)", "number"), col(3, "Total employees", "number"), col(4, "Employees surveyed", "number"), col(5, "Share using this mode (%)", "number")],
    column_options: { "1": opts("Rail [passenger.km]") },
    column_dependencies: {},
    dependent_options: {},
    emission_category_mapping: { "Rail [passenger.km]": "Rail [passenger.km]" },
    extra_fields: [],
    calculation: {
      mode: "per_method",
      method_column: ROW_METHOD_COLUMN,
      methods: {
        distance_based: { multiply: ["Total distance (km)", "Total employees"], divide: ["Employees surveyed"], activity_unit: "passenger.km" },
        average_data: { multiply: ["Total employees", "Share using this mode (%)"], percent: ["Share using this mode (%)"], activity_unit: "passenger.km" },
      },
    },
  };
  const m = toFormModel(commuting);
  const surveyed = commuting.columns[3];

  it("shows divide fields and keeps their values when the method is picked", () => {
    let row: ModalRow = { ...newRow(m, 1), "Employees surveyed": "3" };
    expect(isColumnVisible(m, surveyed, row)).toBe(false);
    row = applyChange(m, row, "@method", "distance_based");
    expect(isColumnVisible(m, surveyed, row)).toBe(true);
    expect(row["Employees surveyed"]).toBe("3");
    expect(row.activity_data_unit).toBe("passenger.km");
  });

  it("clears fields the new method doesn't use and prefills its percentages", () => {
    let row = applyChange(m, { ...newRow(m, 1), "Employees surveyed": "3" }, "@method", "average_data");
    expect(row["Employees surveyed"]).toBe("");
    expect(row["Share using this mode (%)"]).toBe("100");
    row = applyChange(m, row, "Commuting mode", "Rail [passenger.km]");
    expect(row.emission_category).toBe("Rail [passenger.km]");
  });
});
