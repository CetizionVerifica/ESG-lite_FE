import { describe, expect, it } from "vitest";
import { ROW_METHOD_COLUMN, calculateEmission } from "./emissionCalc";
import type { CalculationSpec, EmissionFactor } from "./types";

// S3-9: "@method" (the row's method picks the fields) and `divide`, mirroring
// ESG-lite services/calculationSpec.ts so the preview equals the saved total.
const factor = (name: string, value: number, unit: string): EmissionFactor =>
  ({ emission_factor_id: 1, emission_category_name: name, factor_value: value, denominator_unit: unit, year: 2025 }) as EmissionFactor;

describe("commuting spec: method_column @method (S3-9)", () => {
  const spec: CalculationSpec = {
    mode: "per_method",
    method_column: ROW_METHOD_COLUMN,
    methods: {
      distance_based: { multiply: ["Total distance (km)", "Total employees"], divide: ["Employees surveyed"], activity_unit: "passenger.km" },
      average_data: {
        multiply: ["Total employees", "Share using this mode (%)", "One-way distance (km)", "Trips per day", "Working days per year"],
        percent: ["Share using this mode (%)"],
        activity_unit: "passenger.km",
      },
    },
  };
  const input = { emissionFactors: [factor("Rail [passenger.km]", 0.1, "passenger.km")], calculationSpec: spec };
  const row = (over: Record<string, string>) => ({ id: 1, emission_category: "Rail [passenger.km]", activity_data_unit: "passenger.km", ...over });

  it("asks for a method until the row has one", () => {
    expect(calculateEmission(input, row({})).status).toBe("Choose a calculation method");
  });

  it("distance_based scales the survey distance (golden 7.1, rail)", () => {
    // 8,640 km × 3 ÷ 3 surveyed × 0.1 = 864 kg
    const r = row({ "@method": "distance_based", "Total distance (km)": "8640", "Total employees": "3", "Employees surveyed": "3" });
    expect(calculateEmission(input, r)).toEqual({ value: 0.864, status: "ok" }); // 864 kg at 3 dp (#209)
    // A 1 % sample of 300 employees: × 100.
    const scaled = row({ "@method": "distance_based", "Total distance (km)": "8640", "Total employees": "300", "Employees surveyed": "3" });
    expect(calculateEmission(input, scaled).value).toBe(86.4);
  });

  it("average_data multiplies headcount × share × distance × trips × days (golden 7.2, rail)", () => {
    // 10,000 × 50 % × 10 km × 2 × 235 × 0.1 = 2,350,000 kg
    const r = row({
      "@method": "average_data",
      "Total employees": "10000",
      "Share using this mode (%)": "50",
      "One-way distance (km)": "10",
      "Trips per day": "2",
      "Working days per year": "235",
    });
    expect(calculateEmission(input, r)).toEqual({ value: 2350, status: "ok" });
  });

  it("asks for Employees surveyed when it is missing or zero", () => {
    const r = row({ "@method": "distance_based", "Total distance (km)": "8640", "Total employees": "3", "Employees surveyed": "0" });
    expect(calculateEmission(input, r).status).toMatch(/greater than 0/);
  });
});

describe("travel spec: vehicle.km ÷ travellers per vehicle (S3-9, golden 6.1)", () => {
  const spec: CalculationSpec = {
    mode: "per_unit",
    methods: {
      "passenger.km": { multiply: ["Travellers", "Distance (km)"], activity_unit: "passenger.km" },
      "vehicle.km": { multiply: ["Travellers", "Distance (km)"], divide: ["Travellers per vehicle"], activity_unit: "vehicle.km" },
    },
  };
  const input = { emissionFactors: [factor("Car [vehicle.km]", 0.2, "vehicle.km")], calculationSpec: spec };

  it("divides the travellers' distance by the occupancy", () => {
    // 100 travellers × 100 km ÷ 4 per car = 2,500 vehicle.km × 0.2 = 500 kg
    const r = { id: 1, emission_category: "Car [vehicle.km]", activity_data_unit: "vehicle.km", Travellers: "100", "Distance (km)": "100", "Travellers per vehicle": "4" };
    expect(calculateEmission(input, r)).toEqual({ value: 0.5, status: "ok" });
  });
});
