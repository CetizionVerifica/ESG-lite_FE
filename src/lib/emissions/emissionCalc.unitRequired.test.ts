import { describe, expect, it } from "vitest";
import { createEmissionCalculator } from "./emissionCalc";
import type { EmissionFactor, ModalRow } from "./types";

// S3-4: the preview mirrors the engine, which refuses a row whose factor has
// no unit (UNIT_REQUIRED) instead of applying it to any quantity.
const factor = (unit: string | null): EmissionFactor =>
  ({
    emission_factor_id: 1,
    emission_category_name: "Mystery fuel",
    global_category_name: "Mystery fuel",
    factor_value: 1000,
    denominator_unit: unit,
    year: 2024,
  }) as unknown as EmissionFactor;

const row = { id: 1, emission_category: "Mystery fuel", quantity: "10", activity_data_unit: "litre" } as unknown as ModalRow;

describe("a factor with no unit (S3-4)", () => {
  it("gives no total in the preview, with the reason", () => {
    for (const unit of [null, "", "  "]) {
      const calc = createEmissionCalculator({ emissionFactors: [factor(unit)], targetYear: 2024 });
      expect(calc.calculateEmission(row)).toEqual({ value: null, status: "This emission factor has no unit - ask an admin to set it" });
    }
  });

  it("still calculates when the factor has its unit", () => {
    const calc = createEmissionCalculator({ emissionFactors: [factor("litre")], targetYear: 2024 });
    expect(calc.calculateEmission(row)).toEqual({ value: 10, status: "ok" });
  });
});
