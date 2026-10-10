import { describe, expect, it } from "vitest";
import type { EmissionFactor } from "../../lib/emissions/types";
import { describeResult, factorYears, factorsFor } from "./sampleCalc";

const f = (year: number, name = "Diesel"): EmissionFactor => ({ emission_factor_id: year, emission_category_name: name, factor_value: 2.5, denominator_unit: "litre", year });

describe("factor years", () => {
  it("lists each year once, newest first", () => expect(factorYears([f(2023), f(2025), f(2023, "Petrol")])).toEqual([2025, 2023]));
  it("keeps only the chosen year's factors", () => expect(factorsFor([f(2023), f(2025)], 2025).map((x) => x.year)).toEqual([2025]));
  it("keeps every factor without a year", () => expect(factorsFor([f(2023), f(2025)], null)).toHaveLength(2));
});

describe("describeResult", () => {
  it("shows tCO2e and the factor used", () => {
    expect(describeResult({ value: 1234.5, status: "ok" }, f(2025))).toEqual({
      tone: "good",
      headline: "1,234.50 tCO₂e",
      detail: "Diesel: 2.5 kgCO₂e per litre (2025)",
    });
  });
  it("says when the unit was converted", () => expect(describeResult({ value: 1, status: "converted" }, f(2025)).detail).toMatch(/unit converted$/));
  it("treats missing input as neutral and other problems as warnings", () => {
    expect(describeResult({ value: null, status: "Enter activity data" }, undefined)).toEqual({ tone: "neutral", headline: "Enter activity data", detail: null });
    expect(describeResult({ value: null, status: "Unit mismatch - no conversion available" }, f(2025)).tone).toBe("warn");
  });
});
