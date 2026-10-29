import { describe, expect, it } from "vitest";
import { createEmissionCalculator } from "../emissions/emissionCalc";
import type { EmissionFactor, ModalRow } from "../emissions/types";
import { withWttInRow } from "./wtt";

// D6a, the engine's own case (ESG-lite ci/unit/s3-7-fera.test.cjs): a DESNZ domestic flight,
// 1,000 passenger.km × (0.22928 + 0.0335 WTT) = 262.78 kg → 0.26 t.
const FLIGHT = "Flights - Domestic, to/from UK, Average passenger, With RF [passenger.km]";
const factors: EmissionFactor[] = [
  { emission_factor_id: 1, emission_category_name: FLIGHT, factor_value: 0.22928, denominator_unit: "passenger.km", year: 2024, factor_type: "life_cycle" },
  { emission_factor_id: 2, emission_category_name: "HGV summed", factor_value: 0.11, denominator_unit: "tonne.km", year: 2024, factor_type: "life_cycle", includes_wtt: true },
  { emission_factor_id: 3, emission_category_name: "Hotel stay - UK [Room per night]", factor_value: 10.4, denominator_unit: "Room per night", year: 2024 },
  { emission_factor_id: 4, emission_category_name: "Van small", factor_value: 0.004996, denominator_unit: "tonne.km", year: 2024, factor_type: "life_cycle" },
  { emission_factor_id: 5, emission_category_name: "Rail freight", factor_value: 0.028, denominator_unit: "tonne.km", year: 2024, factor_type: "life_cycle" },
];
const wttFactors: EmissionFactor[] = [
  { emission_factor_id: 11, emission_category_name: FLIGHT, factor_value: 0.0335, denominator_unit: "passenger.km", year: 2024, factor_type: "wtt" },
  { emission_factor_id: 12, emission_category_name: "HGV summed", factor_value: 0.02, denominator_unit: "tonne.km", year: 2024, factor_type: "wtt" },
  { emission_factor_id: 13, emission_category_name: "Van small", factor_value: 0.0000045, denominator_unit: "tonne.km", year: 2024, factor_type: "wtt" },
  // Spelled differently from the activity's factor: the engine's FERA lookup is exact, so it adds nothing.
  { emission_factor_id: 14, emission_category_name: "rail freight ", factor_value: 0.006, denominator_unit: "tonne.km", year: 2024, factor_type: "wtt" },
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

  it("rounds the summed kg, not each part: 4.996 + 0.0045 kg = 5.0005 kg → 0.01 t", () => {
    const r = calc.calculateEmission(row({ emission_category: "Van small", activity_data_unit: "tonne.km" }));
    expect(r.value).toBe(0.01);
  });

  it("takes the WTT factor by its exact name only, as the engine does", () => {
    const r = calc.calculateEmission(row({ emission_category: "Rail freight", activity_data_unit: "tonne.km" }));
    expect([r.value, r.wtt_kg]).toEqual([0.03, undefined]);
  });

  it("adds nothing to a saved entry that kept its Category 3 twin (the server's keep_fera_twin)", () => {
    const base = createEmissionCalculator({ emissionFactors: factors, targetYear: 2024 });
    const kept = row({ _editOf: 7, _keepsFeraTwin: true });
    expect(calc.calculateEmission(kept)).toEqual(base.calculateEmission(kept));
    expect(calc.calculateEmission(kept).value).toBe(0.23);
  });

  it("leaves a row with no total alone", () => {
    expect(calc.calculateEmission(row({ quantity: "" })).value).toBeNull();
  });
});
