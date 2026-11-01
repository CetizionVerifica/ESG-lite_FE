import { describe, expect, it } from "vitest";
import { columnDecimals, conversionFactor, conversionLine, convertUnit, familyUnits, figureDecimals, formatWithUnit, isTonnesCo2e, normaliseUnit, sameUnit, toCanonicalPreview } from "./units";

describe("KPI units (mirror of the server's registry)", () => {
  it("reads the spellings the library uses", () => {
    expect(normaliseUnit("m³")).toBe("cubic meter");
    expect(normaliseUnit("ML")).toBe("megalitre");
    expect(normaliseUnit("ml")).toBe("ml");
    expect(normaliseUnit("litres")).toBe("litre");
    expect(normaliseUnit("tCO₂e")).toBe("tco2e");
    expect(normaliseUnit("t")).toBe("tonne");
    expect(normaliseUnit("furlongs")).toBeNull();
  });

  it("converts within a family only", () => {
    expect(convertUnit(1200, "kL", "m³")).toBe(1200);
    expect(convertUnit(1200, "m³", "ML")).toBe(1.2);
    expect(convertUnit(1, "GJ", "MWh")).toBe(0.277777777778);
    expect(convertUnit(500, "kg", "t")).toBe(0.5);
    expect(conversionFactor("tCO₂e", "t")).toBeNull();
    expect(conversionFactor("INR", "USD")).toBeNull();
  });

  it("writes the live conversion line (05-ux: 1,200 m³ = 1.2 ML)", () => {
    expect(conversionLine(1200, "m³", "m³")).toBe("1,200 m³ = 1.2 ML");
    expect(conversionLine(1200, "kL", "m³")).toBe("1,200 kL = 1,200 m³");
    expect(conversionLine(1500000, "litres", "m³")).toBe("1,500,000 litres = 1,500 m³");
    expect(conversionLine(null, "m³", "m³")).toBeNull();
    expect(conversionLine(5, "%", "%")).toBeNull();
  });

  it("previews the canonical value for comparisons", () => {
    expect(toCanonicalPreview(2, "ML", "m³")).toBe(2000);
    expect(toCanonicalPreview(2, null, "m³")).toBe(2);
    expect(sameUnit("m3", "m³")).toBe(true);
    expect(formatWithUnit(12.4, "t")).toBe("12.4 t");
    expect(formatWithUnit(null, "t")).toBe("—");
  });

  it("#209: reads every spelling of tCO₂e, and nothing else, as tonnes of CO₂e", () => {
    for (const u of ["tCO₂e", "tCO2e", "TCO2E", "t CO2e", "tonnes CO2e", " tCO₂e "]) expect(isTonnesCo2e(u), u).toBe(true);
    for (const u of ["kgCO₂e", "kg CO2e", "t", "tonnes", "tCO₂e / M USD", "MWh", "%", "", null, undefined]) expect(isTonnesCo2e(u), String(u)).toBe(false);
  });

  it("#209: shows a tCO₂e figure with exactly 3 decimals, whatever the KPI's decimals", () => {
    expect(formatWithUnit(4650.2, "tCO₂e")).toBe("4,650.200 tCO₂e");
    expect(formatWithUnit(4650.2, "tCO₂e", 2)).toBe("4,650.200 tCO₂e");
    expect(formatWithUnit(4650.2, "tCO2e", 0)).toBe("4,650.200 tCO2e");
    expect(formatWithUnit(123456.789, "tCO₂e", 2)).toBe("123,456.789 tCO₂e");
    expect(formatWithUnit(512, "t CO2e")).toBe("512.000 t CO2e");
    expect(formatWithUnit(0.05, "tCO₂e")).toBe("0.050 tCO₂e");
    expect(formatWithUnit(-12.5, "tCO₂e")).toBe("-12.500 tCO₂e");
    expect(formatWithUnit(0, "tCO₂e")).toBe("0.000 tCO₂e");
    expect(formatWithUnit(null, "tCO₂e")).toBe("—");
    expect(figureDecimals(540, "tCO₂e")).toBe(3);
    expect(columnDecimals("tCO₂e", 2)).toBe(3);
  });

  it("#209: leaves every other unit on its own rules", () => {
    expect(formatWithUnit(1500, "m³")).toBe("1,500 m³");
    expect(formatWithUnit(1234.5, "kgCO₂e")).toBe("1,235 kgCO₂e");
    expect(formatWithUnit(1234.5, "kgCO₂e", 2)).toBe("1,234.50 kgCO₂e");
    expect(formatWithUnit(12.3456, "tCO₂e / M USD", 2)).toBe("12.35 tCO₂e / M USD");
    expect(formatWithUnit(98.4, "t", 1)).toBe("98.4 t");
    expect(formatWithUnit(0.38, null)).toBe("0.38");
    expect(figureDecimals(540, "MWh")).toBe(0);
    expect(figureDecimals(12.34, "m³", 1)).toBe(1);
    expect(columnDecimals("m³", 2)).toBe(2);
    expect(columnDecimals(null, 0)).toBe(0);
  });

  it("#209: a kgCO₂e entry converts to the tCO₂e figure the server stores, with 3 decimals", () => {
    expect(conversionLine(1500, "kgCO₂e", "tCO₂e")).toBe("1,500 kgCO₂e = 1.500 tCO₂e");
    expect(conversionLine(1500, "tCO₂e", "tCO₂e")).toBeNull();
  });

  it("lists the units a custom KPI can allow", () => {
    expect(familyUnits("m³")).toEqual(expect.arrayContaining(["m³", "kL", "ML", "litres"]));
    expect(familyUnits("m³")[0]).toBe("m³");
    expect(familyUnits("widgets")).toEqual(["widgets"]);
  });
});
