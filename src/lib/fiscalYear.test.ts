import { describe, expect, it } from "vitest";
import { fyBothYears, fyEndYear, fyStartMonthOf, fyStartYearOf } from "./fiscalYear";

describe("fiscal year helpers", () => {
  it("reads the start month from the reporting calendar, April otherwise", () => {
    expect(fyStartMonthOf({ fiscalYearStartMonth: 7 })).toBe(7);
    expect(fyStartMonthOf({ fiscalYearStartMonth: 13 })).toBe(4);
    expect(fyStartMonthOf({ fiscalYearStartMonth: "x" })).toBe(4);
    expect(fyStartMonthOf(null)).toBe(4);
  });

  it("finds the FY a date falls in, by start year", () => {
    expect(fyStartYearOf(new Date(2025, 2, 31))).toBe(2024);
    expect(fyStartYearOf(new Date(2025, 3, 1))).toBe(2025);
    expect(fyStartYearOf(new Date(2025, 5, 30), 7)).toBe(2024);
    expect(fyStartYearOf(new Date(2025, 0, 1), 1)).toBe(2025);
  });

  it("names the end year and both years", () => {
    expect(fyEndYear(2025)).toBe(2026);
    expect(fyEndYear(2025, 1)).toBe(2025);
    expect(fyBothYears(2025)).toBe("FY2025-26");
    expect(fyBothYears(2099)).toBe("FY2099-00");
    expect(fyBothYears(2025, 1)).toBe("FY2025");
  });
});
