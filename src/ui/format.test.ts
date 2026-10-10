import { describe, expect, it } from "vitest";
import {
  emissionsParts,
  formatDate,
  formatDelta,
  formatEmissions,
  formatIntensity,
  formatMonth,
  formatNumber,
  formatReportingYear,
} from "./format";

describe("formatEmissions", () => {
  it("adds thousands separators and drops decimals from 1,000 t", () => {
    expect(formatEmissions(12345.67)).toBe("12,346 tCO₂e");
  });
  it("keeps one decimal between 1 and 1,000 t", () => {
    expect(formatEmissions(12.46)).toBe("12.5 tCO₂e");
    expect(formatEmissions(12)).toBe("12 tCO₂e");
  });
  it("stays in tCO₂e below 1 t, with up to 3 decimals", () => {
    expect(formatEmissions(0.71)).toBe("0.71 tCO₂e");
    expect(formatEmissions(0.42)).toBe("0.42 tCO₂e");
    expect(formatEmissions(0.0123)).toBe("0.012 tCO₂e");
    expect(emissionsParts(0.0004)).toEqual({ value: "0", unit: "tCO₂e" });
  });
  it("shows zero in tonnes and a dash for missing values", () => {
    expect(formatEmissions(0)).toBe("0 tCO₂e");
    expect(formatEmissions(null)).toBe("—");
    expect(formatEmissions(Number.NaN)).toBe("—");
  });
  it("handles negative values (removals)", () => {
    expect(formatEmissions(-1500)).toBe("-1,500 tCO₂e");
  });
  it("rounds near the 1 t and 1,000 t boundaries", () => {
    expect(formatEmissions(0.9996)).toBe("1 tCO₂e");
    expect(formatEmissions(-0.9996)).toBe("-1 tCO₂e");
    expect(formatEmissions(0.9994)).toBe("0.999 tCO₂e");
    expect(formatEmissions(999.96)).toBe("1,000 tCO₂e");
  });
  it("never prints -0", () => {
    expect(formatEmissions(-0.0004)).toBe("0 tCO₂e");
    expect(formatEmissions(-0)).toBe("0 tCO₂e");
    expect(formatEmissions(-0.04)).toBe("-0.04 tCO₂e");
    expect(formatNumber(-0.4)).toBe("0");
    expect(formatNumber(-0.004, 2)).toBe("0.00");
    expect(formatIntensity(-0.04)).toBe("0.0 tCO₂e/t");
  });
});

describe("formatIntensity", () => {
  it("always shows one decimal", () => {
    expect(formatIntensity(12)).toBe("12.0 tCO₂e/t");
    expect(formatIntensity(1.234, "kgCO₂e/kg")).toBe("1.2 kgCO₂e/kg");
  });
});

describe("formatNumber", () => {
  it("formats with separators and fixed decimals", () => {
    expect(formatNumber(1234567.891, 2)).toBe("1,234,567.89");
    expect(formatNumber(undefined)).toBe("—");
  });
});

describe("formatDelta", () => {
  it("marks a decrease in emissions as good, with a down arrow", () => {
    const delta = formatDelta(95.2, 100);
    expect(delta).toMatchObject({ text: "▼ 4.8%", direction: "down", tone: "good" });
    expect(delta?.pct).toBeCloseTo(-4.8, 5);
  });
  it("marks an increase in emissions as bad, with an up arrow", () => {
    expect(formatDelta(110, 100)).toMatchObject({ text: "▲ 10.0%", tone: "bad", direction: "up" });
  });
  it("flips the tone when higher is better", () => {
    expect(formatDelta(110, 100, { lowerIsBetter: false })).toMatchObject({ tone: "good" });
  });
  it("is neutral when the change rounds to zero", () => {
    expect(formatDelta(100.01, 100)).toMatchObject({ text: "0.0%", tone: "neutral", direction: "flat" });
  });
  it("returns null without a usable baseline", () => {
    expect(formatDelta(10, 0)).toBeNull();
    expect(formatDelta(10, null)).toBeNull();
    expect(formatDelta(undefined, 10)).toBeNull();
  });
  it("uses the size of a negative baseline", () => {
    expect(formatDelta(-50, -100)).toMatchObject({ text: "▲ 50.0%" });
  });
});

describe("dates", () => {
  it("formats months as 'Sep 2025'", () => {
    expect(formatMonth("2025-09")).toBe("Sep 2025");
    expect(formatMonth("2025-09-30")).toBe("Sep 2025");
    expect(formatMonth(new Date(2025, 0, 15))).toBe("Jan 2025");
    expect(formatMonth("nonsense")).toBe("—");
  });
  it("formats days as '14 Sep 2025'", () => {
    expect(formatDate("2025-09-14")).toBe("14 Sep 2025");
    expect(formatDate(null)).toBe("—");
  });
  it("shows a dash for dates the calendar doesn't have", () => {
    expect(formatDate("2025-02-30")).toBe("—");
    expect(formatDate("2025-13-01")).toBe("—");
    expect(formatMonth("2025-00")).toBe("—");
    expect(formatDate("2024-02-29")).toBe("29 Feb 2024");
  });
  it("labels reporting years by year_type", () => {
    expect(formatReportingYear(2025, "CY")).toBe("CY 2025");
    expect(formatReportingYear(2025, "FY")).toBe("FY 2025-26");
    expect(formatReportingYear(2099, "FY")).toBe("FY 2099-00");
    expect(formatReportingYear(2025, "FY", 1)).toBe("FY 2025");
  });
});
