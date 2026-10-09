import { describe, expect, it } from "vitest";
import { parsePeriod, periodContaining, periodLabel, periodRange, serializePeriod, shiftPeriod, type Period } from "./period";

const cases: Array<[string, Period, string]> = [
  ["2025-09", { kind: "month", year: 2025, month: 9 }, "Sep 2025"],
  ["2025-Q3", { kind: "quarter", year: 2025, quarter: 3 }, "Q3 2025"],
  ["CY2025", { kind: "cy", year: 2025 }, "CY 2025"],
  ["FY2025", { kind: "fy", startYear: 2025 }, "FY 2025-26"],
  ["2025-01-01_2025-06-30", { kind: "custom", from: "2025-01-01", to: "2025-06-30" }, "1 Jan – 30 Jun 2025"],
];

describe("period URL values", () => {
  it.each(cases)("round-trips %s", (value, period, label) => {
    expect(parsePeriod(value)).toEqual(period);
    expect(serializePeriod(period)).toBe(value);
    expect(periodLabel(period)).toBe(label);
  });

  it.each(["", "2025-13", "2025-Q5", "FY25", "2025-02-30_2025-03-01", "2025-06-30_2025-01-01", "junk"])(
    "rejects %j",
    (value) => expect(parsePeriod(value)).toBeNull(),
  );

  it("labels a custom range across years with both years", () => {
    expect(periodLabel({ kind: "custom", from: "2024-11-01", to: "2025-02-28" })).toBe("1 Nov 2024 – 28 Feb 2025");
  });
});

describe("periodRange", () => {
  it("covers whole months, quarters and years", () => {
    expect(periodRange({ kind: "month", year: 2024, month: 2 })).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(periodRange({ kind: "quarter", year: 2025, quarter: 4 })).toEqual({ from: "2025-10-01", to: "2025-12-31" });
    expect(periodRange({ kind: "cy", year: 2025 })).toEqual({ from: "2025-01-01", to: "2025-12-31" });
  });
  it("uses the fiscal start month for FY", () => {
    expect(periodRange({ kind: "fy", startYear: 2025 })).toEqual({ from: "2025-04-01", to: "2026-03-31" });
    expect(periodRange({ kind: "fy", startYear: 2025 }, 7)).toEqual({ from: "2025-07-01", to: "2026-06-30" });
    expect(periodRange({ kind: "fy", startYear: 2025 }, 1)).toEqual({ from: "2025-01-01", to: "2025-12-31" });
  });
});

describe("periodContaining", () => {
  const sep = new Date(2025, 8, 14);
  const feb = new Date(2026, 1, 3);
  it("finds the current month, quarter and year", () => {
    expect(periodContaining("month", sep)).toEqual({ kind: "month", year: 2025, month: 9 });
    expect(periodContaining("quarter", sep)).toEqual({ kind: "quarter", year: 2025, quarter: 3 });
    expect(periodContaining("cy", sep)).toEqual({ kind: "cy", year: 2025 });
  });
  it("puts months before the FY start in the previous FY", () => {
    expect(periodContaining("fy", sep)).toEqual({ kind: "fy", startYear: 2025 });
    expect(periodContaining("fy", feb)).toEqual({ kind: "fy", startYear: 2025 });
  });
});

describe("shiftPeriod", () => {
  it("steps across year boundaries", () => {
    expect(shiftPeriod({ kind: "month", year: 2025, month: 1 }, -1)).toEqual({ kind: "month", year: 2024, month: 12 });
    expect(shiftPeriod({ kind: "month", year: 2025, month: 12 }, 1)).toEqual({ kind: "month", year: 2026, month: 1 });
    expect(shiftPeriod({ kind: "quarter", year: 2025, quarter: 1 }, -1)).toEqual({ kind: "quarter", year: 2024, quarter: 4 });
    expect(shiftPeriod({ kind: "fy", startYear: 2025 }, 1)).toEqual({ kind: "fy", startYear: 2026 });
  });
  it("moves a custom range by its own length", () => {
    expect(shiftPeriod({ kind: "custom", from: "2025-01-01", to: "2025-01-10" }, 1)).toEqual({
      kind: "custom",
      from: "2025-01-11",
      to: "2025-01-20",
    });
  });
});
