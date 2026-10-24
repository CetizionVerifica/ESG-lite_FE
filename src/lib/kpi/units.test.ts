import { describe, expect, it } from "vitest";
import { conversionFactor, conversionLine, convertUnit, familyUnits, formatWithUnit, normaliseUnit, sameUnit, toCanonicalPreview } from "./units";

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

  it("lists the units a custom KPI can allow", () => {
    expect(familyUnits("m³")).toEqual(expect.arrayContaining(["m³", "kL", "ML", "litres"]));
    expect(familyUnits("m³")[0]).toBe("m³");
    expect(familyUnits("widgets")).toEqual(["widgets"]);
  });
});
