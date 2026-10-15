import { describe, expect, it } from "vitest";
import { calculateEmission } from "./emissionCalc";
import type { CalculationSpec, EmissionFactor } from "./types";

// S3-11 `divide`: mirrors ESG-lite services/calculationSpec.ts, so the preview
// equals the saved total (guidance example 8.1, one row).
const spec: CalculationSpec = {
  mode: "per_unit",
  methods: {
    kwh: {
      multiply: ["Building or asset quantity", "Leased floor area (m²)"],
      divide: ["Building floor area (m²)", "Occupancy rate (%)"],
      percent: ["Occupancy rate (%)"],
      activity_unit: "kWh",
    },
  },
};
const factor: EmissionFactor = { emission_factor_id: 1, emission_category_name: "Electricity [kWh]", factor_value: 0.7, denominator_unit: "kWh", year: 2025 } as EmissionFactor;
const input = { emissionFactors: [factor], calculationSpec: spec };
const row = (over: Record<string, string> = {}) => ({
  id: 1,
  emission_category: "Electricity [kWh]",
  activity_data_unit: "kWh",
  "Building or asset quantity": "3000",
  "Leased floor area (m²)": "200",
  "Building floor area (m²)": "2000",
  "Occupancy rate (%)": "75",
  ...over,
});

describe("calculation spec divide (S3-11)", () => {
  it("divides the product by each divide field, percentages by value / 100", () => {
    // 3,000 kWh × 200 ÷ (2,000 × 75 %) = 400 kWh × 0.7 = 280 kg = 0.28 t
    expect(calculateEmission(input, row())).toEqual({ value: 0.28, status: "ok" });
  });
  it("asks for a divide field that is missing, zero or over 100 %", () => {
    expect(calculateEmission(input, row({ "Building floor area (m²)": "" })).status).toMatch(/Enter Building floor area/);
    expect(calculateEmission(input, row({ "Building floor area (m²)": "0" })).status).toMatch(/greater than 0/);
    expect(calculateEmission(input, row({ "Occupancy rate (%)": "120" })).status).toMatch(/cannot be more than 100/);
  });
});
