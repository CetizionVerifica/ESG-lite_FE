import { describe, expect, it } from "vitest";
import { createEmissionCalculator } from "../hooks/emissionCalc";
import type { EmissionFactor, ModalRow } from "../types";
import { withWttInRow } from "./wtt";

// D6a, the engine's own case (ESG-lite ci/unit/s3-7-fera.test.cjs): a DESNZ domestic flight,
// 1,000 passenger.km × (0.22928 + 0.0335 WTT) = 262.78 kg → 0.26 t.
const FLIGHT = "Flights - Domestic, to/from UK, Average passenger, With RF [passenger.km]";
const factors: EmissionFactor[] = [
  { emission_factor_id: 1, emission_category_name: FLIGHT, factor_value: 0.22928, denominator_unit: "passenger.km", year: 2024, factor_type: "life_cycle" },
  { emission_factor_id: 2, emission_category_name: "HGV summed", factor_value: 0.11, denominator_unit: "tonne.km", year: 2024, factor_type: "life_cycle", includes_wtt: true },
  { emission_factor_id: 3, emission_category_name: "Hotel stay - UK [Room per night]", factor_value: 10.4, denominator_unit: "Room per night", year: 2024 },
];
const wttFactors: EmissionFactor[] = [
  { emission_factor_id: 11, emission_category_name: FLIGHT, factor_value: 0.0335, denominator_unit: "passenger.km", year: 2024, factor_type: "wtt" },
  { emission_factor_id: 12, emission_category_name: "HGV summed", factor_value: 0.02, denominator_unit: "tonne.km", year: 2024, factor_type: "wtt" },
];
const calc = withWttInRow(createEmissionCalculator({ emissionFactors: factors, targetYear: 2024 }), createEmissionCalculator({ emissionFactors: wttFactors, targetYear: 2024 }));
const row = (o: Partial<ModalRow> = {}): ModalRow => ({ id: 1, emission_category: FLIGHT, activity_data_unit: "passenger.km", quantity: "1000", ...o });

describe("withWttInRow (D6a)", () => {
  it("adds the same-name WTT factor to the row's total, summing kg before rounding", () => {
    const r = calc.calculateEmission(row());
    expect(r.value).toBe(0.26);
    expect(r.wtt_kg).toBeCloseTo(33.5, 6);
  });

  it("adds nothing to a factor that already includes WTT", () => {
    const r = calc.calculateEmission(row({ emission_category: "HGV summed", activity_data_unit: "tonne.km" }));
    expect([r.value, r.wtt_kg]).toEqual([0.11, undefined]);
  });

  it("adds nothing when the FERA table has no factor of that name", () => {
    const r = calc.calculateEmission(row({ emission_category: "Hotel stay - UK [Room per night]", activity_data_unit: "Room per night", quantity: "3" }));
    expect([r.value, r.wtt_kg]).toEqual([0.03, undefined]);
  });

  it("adds nothing to a supplier-method row", () => {
    const base = createEmissionCalculator({ emissionFactors: factors, targetYear: 2024 });
    const supplierRow = row({ "@method": "supplier_specific" });
    expect(calc.calculateEmission(supplierRow)).toEqual(base.calculateEmission(supplierRow));
  });

  it("leaves a row with no total alone", () => {
    expect(calc.calculateEmission(row({ quantity: "" })).value).toBeNull();
  });
});
