import { describe, expect, it } from "vitest";
import { ROW_METHOD_COLUMN, calculateEmission } from "./emissionCalc";
import type { CalculationSpec, EmissionFactor } from "./types";

// S3-10: the Category 10 / 11 / 12 forms (ESG-lite src/scope3/soldProducts/configs.ts)
// through the add-data preview. Nothing new in emissionCalc: these pin that the
// preview of each option chain equals the engine's total for the golden cases.
const factor = (name: string, value: number, unit: string): EmissionFactor =>
  ({ emission_factor_id: 1, emission_category_name: name, factor_value: value, denominator_unit: unit, year: 2025 }) as EmissionFactor;

describe("Category 10 · processing of sold products (@method)", () => {
  const spec: CalculationSpec = {
    mode: "per_method",
    method_column: ROW_METHOD_COLUMN,
    methods: {
      site_specific: { multiply: ["Quantity", "Share for our product (%)"], percent: ["Share for our product (%)"] },
      average_data: { multiply: ["Mass sold (kg)"], activity_unit: "kg" },
    },
  };

  it("average_data: mass sold × processing factor (golden 10.2)", () => {
    // 1,000 kg × 1.5 = 1,500 kg
    const input = { emissionFactors: [factor("Processing of sold products [kg]", 1.5, "kg")], calculationSpec: spec };
    const row = { id: 1, emission_category: "Processing of sold products [kg]", activity_data_unit: "kg", "@method": "average_data", "Mass sold (kg)": "1000" };
    expect(calculateEmission(input, row)).toEqual({ value: 1.5, status: "ok" });
  });

  it("site_specific: the customer's quantity × our share (golden 10.1, gas line)", () => {
    // 3,500 kWh × 100 % × 0.2 = 700 kg; at 40 % it is 280 kg
    const input = { emissionFactors: [factor("Natural gas [kWh]", 0.2, "kWh")], calculationSpec: spec };
    const row = (share: string) => ({ id: 1, emission_category: "Natural gas [kWh]", activity_data_unit: "kWh", "@method": "site_specific", Quantity: "3500", "Share for our product (%)": share });
    expect(calculateEmission(input, row("100"))).toEqual({ value: 0.7, status: "ok" });
    expect(calculateEmission(input, row("40")).value).toBe(0.28);
  });
});

describe("Category 11 · use of sold products (Method select)", () => {
  const spec: CalculationSpec = {
    mode: "per_method",
    method_column: "Method",
    identity_columns: ["Product Name"],
    methods: {
      "Product that uses energy": { multiply: ["Units Sold", "Energy per Use (kWh)", "Lifetime Uses"], activity_unit: "kWh" },
      "Fuel sold to customers": { multiply: ["Units Sold"], activity_unit: "litre" },
      "Product containing gas": { multiply: ["Units Sold", "Gas per Product (kg)", "% of Gas Released"], percent: ["% of Gas Released"], activity_unit: "kg" },
      "Part of a customer's product": {
        multiply: ["Units Sold", "Lifetime uses of final product", "Share of final product (%)"],
        percent: ["Share of final product (%)"],
        activity_unit: "use",
      },
    },
  };

  it("energy-using product: units × kWh per use × lifetime uses × grid factor (golden 11.1, first product)", () => {
    // 1,000 × 1.3 kWh × 11,500 uses × 0.5 = 7,475,000 kg
    const input = { emissionFactors: [factor("Grid Mix Germany", 0.5, "kWh")], calculationSpec: spec };
    const row = {
      id: 1,
      emission_category: "Grid Mix Germany",
      activity_data_unit: "kWh",
      Method: "Product that uses energy",
      "Product Name": "Dryer",
      "Units Sold": "1000",
      "Energy per Use (kWh)": "1.3",
      "Lifetime Uses": "11500",
    };
    expect(calculateEmission(input, row)).toEqual({ value: 7475, status: "ok" });
  });

  it("product containing gas: units × kg × % released × GWP", () => {
    // 1,000 × 2 kg × 50 % × 1,530 (R134a AR6) = 1,530,000 kg
    const input = { emissionFactors: [factor("R134a - GWP", 1530, "kg")], calculationSpec: spec };
    const row = { id: 1, emission_category: "R134a - GWP", activity_data_unit: "kg", Method: "Product containing gas", "Units Sold": "1000", "Gas per Product (kg)": "2", "% of Gas Released": "50" };
    expect(calculateEmission(input, row)).toEqual({ value: 1530, status: "ok" });
  });

  it("part of a customer's product: units × final-product uses × our share × factor per use (golden 11.3)", () => {
    // 10 engines × 300,000 km × 4 % × 0.3 kg/km = 36,000 kg
    const input = { emissionFactors: [factor("Use of final product [use]", 0.3, "use")], calculationSpec: spec };
    const row = {
      id: 1,
      emission_category: "Use of final product [use]",
      activity_data_unit: "use",
      Method: "Part of a customer's product",
      "Units Sold": "10",
      "Lifetime uses of final product": "300000",
      "Share of final product (%)": "4",
    };
    expect(calculateEmission(input, row)).toEqual({ value: 36, status: "ok" });
  });
});

describe("Category 12 · end-of-life treatment of sold products (@method)", () => {
  const spec: CalculationSpec = {
    mode: "per_method",
    method_column: ROW_METHOD_COLUMN,
    methods: {
      waste_type_specific: { multiply: ["Mass at end of life (kg)", "Share treated this way (%)"], percent: ["Share treated this way (%)"], activity_unit: "kg" },
      average_data: { multiply: ["Mass at end of life (kg)"], activity_unit: "kg" },
    },
  };
  const landfill = factor("End of life - Mixed - Landfill [kg]", 0.3, "kg");
  const incineration = factor("End of life - Mixed - Incineration [kg]", 1.0, "kg");
  const input = { emissionFactors: [landfill, incineration], calculationSpec: spec };
  const row = (name: string, share: string) => ({
    id: 1,
    emission_category: name,
    activity_data_unit: "kg",
    "@method": "waste_type_specific",
    Material: "Mixed",
    "Mass at end of life (kg)": "10000",
    "Share treated this way (%)": share,
  });

  it("one row per treatment: mass × share × treatment factor (golden 12.1 = 2,700 + 1,000 kg)", () => {
    expect(calculateEmission(input, row(landfill.emission_category_name, "90"))).toEqual({ value: 2.7, status: "ok" });
    expect(calculateEmission(input, row(incineration.emission_category_name, "10"))).toEqual({ value: 1, status: "ok" });
  });

  it("average_data: mass × the average disposal factor", () => {
    const avg = factor("End of life - Mixed - Average [kg]", 0.5, "kg");
    const r = { id: 1, emission_category: avg.emission_category_name, activity_data_unit: "kg", "@method": "average_data", "Mass at end of life (kg)": "2000" };
    expect(calculateEmission({ emissionFactors: [avg], calculationSpec: spec }, r)).toEqual({ value: 1, status: "ok" });
  });
});
