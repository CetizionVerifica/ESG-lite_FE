import { describe, expect, it } from "vitest";
import { canConvert, getConversionFactor, matchUnit, unitsMatchExact } from "./unitMatch";

describe("unit conversions", () => {
  it("treats ton as the metric tonne, like the backend", () => {
    expect(getConversionFactor("kg", "ton")).toBe(0.001);
    expect(getConversionFactor("ton", "kg")).toBe(1000);
    expect(canConvert("tonne", "ton")).toBe(true);
    expect(getConversionFactor("Tonnes", "ton")).toBe(1);
  });

  // ESG-lite #183: the server now offers every unit it converts to the factor's unit, so the
  // preview must fold the same aliases or it would block a unit the server accepts.
  it("folds the backend's aliases: a factor spelled SCM or MT takes litre or kg", () => {
    expect(matchUnit("litre", "SCM")).toEqual({ state: "convertible", factor: 0.001 });
    expect(matchUnit("kg", "MT")).toEqual({ state: "convertible", factor: 0.001 });
    expect(matchUnit("Ltr", "litre")).toEqual({ state: "ok" });
    expect(matchUnit("Kilo Litre", "KL")).toEqual({ state: "ok" });
    expect(unitsMatchExact("m³", "cubic meter")).toBe(true);
    expect(getConversionFactor("KL", "SCM")).toBe(1);
  });

  it("converts the three units the engine used to refuse one way", () => {
    expect(getConversionFactor("ml", "SCM")).toBe(0.000001);
    expect(getConversionFactor("g", "MT")).toBe(0.000001);
    expect(getConversionFactor("MJ", "MWh")).toBe(0.000277778);
  });

  it("still refuses what the engine refuses", () => {
    expect(matchUnit("kWh", "litre")).toEqual({ state: "mismatch" });
    expect(matchUnit("kg", "SCM")).toEqual({ state: "mismatch" });
  });
});
