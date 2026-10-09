import { describe, expect, it } from "vitest";
import { factorYearForDate, isYearlyAllowed, yearlyPeriodEndDate } from "./reportingPeriod";
import { normalizeUnitKey } from "./emissionCalc";

describe("reporting period", () => {
  it("stores yearly entries on the period-end date", () => {
    expect(yearlyPeriodEndDate("CY", 2025)).toBe("2025-12-31");
    expect(yearlyPeriodEndDate("FY", 2025)).toBe("2026-03-31");
  });
  it("uses the factor year before the reporting year", () => {
    expect(factorYearForDate("2025-09-30")).toBe(2024);
    expect(factorYearForDate("2026-03-31")).toBe(2025);
    expect(factorYearForDate(null)).toBeUndefined();
    expect(factorYearForDate("")).toBeUndefined();
  });
});

describe("normalizeUnitKey", () => {
  it.each([
    ["tonne.km", "tonne.km"],
    ["Tonne KM", "tonne.km"],
    ["tonne-km", "tonne.km"],
    ["tonne_km", "tonne.km"],
    ["tkm", "tonne.km"],
    ["t.km", "tonne.km"],
    ["tonnes km", "tonne.km"],
    ["kms", "km"],
    [undefined, ""],
  ])("%s → %s", (input, expected) => {
    expect(normalizeUnitKey(input)).toBe(expected);
  });
});

describe("yearly entry", () => {
  it("is open once a category is chosen", () => {
    expect(isYearlyAllowed(null)).toBe(false);
    expect(isYearlyAllowed(undefined)).toBe(false);
    expect(isYearlyAllowed(0)).toBe(true);
    expect(isYearlyAllowed(12)).toBe(true);
  });
});
