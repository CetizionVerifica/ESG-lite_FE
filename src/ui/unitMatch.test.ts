import { describe, expect, it } from "vitest";
import { canConvert, getConversionFactor } from "./unitMatch";

describe("unit conversions", () => {
  it("treats ton as the metric tonne, like the backend", () => {
    expect(getConversionFactor("kg", "ton")).toBe(0.001);
    expect(getConversionFactor("ton", "kg")).toBe(1000);
    expect(canConvert("tonne", "ton")).toBe(true);
    expect(getConversionFactor("Tonnes", "ton")).toBe(1);
  });
});
