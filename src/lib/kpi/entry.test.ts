import { describe, expect, it } from "vitest";
import { breakdownPayload, breakdownTitle, checkBreakdown, compareToLast, dueText, fillQuestion, lastPeriodText, parseAmount, periodText } from "./entry";

describe("KPI entry words", () => {
  it("names periods plainly", () => {
    expect(periodText("2026-09-01", "monthly")).toBe("September 2026");
    expect(periodText("2026-07-01", "quarterly")).toBe("Q3 2026");
    expect(periodText("2026-04-01", "quarterly", "FY")).toBe("Apr–Jun 2026");
    expect(periodText("2026-01-01", "annual")).toBe("2026");
    expect(periodText("2026-04-01", "annual", "FY")).toBe("FY 2026-27");
    expect(lastPeriodText("2026-09-01", "monthly")).toBe("Last September");
    expect(lastPeriodText("2026-07-01", "quarterly")).toBe("Q3 last year");
    expect(lastPeriodText("2026-01-01", "annual")).toBe("Last year");
  });

  it("fills the question with the site and period", () => {
    expect(fillQuestion("How much water did {site} take in during {period}?", "Bahrain plant", "September 2026")).toBe("How much water did Bahrain plant take in during September 2026?");
    expect(fillQuestion("How many employees did {site} have?", null, "2026")).toBe("How many employees did the company have?");
  });

  it("labels due dates (D16)", () => {
    expect(dueText("2026-10-15", "2026-10-12")).toBe("Due 15 Oct");
    expect(dueText("2026-10-15", "2026-10-15")).toBe("Due 15 Oct");
    expect(dueText("2026-10-15", "2026-10-16")).toBe("Overdue · due 15 Oct");
  });

  it("parses typed amounts", () => {
    expect(parseAmount("1,200")).toBe(1200);
    expect(parseAmount(" 12.5 ")).toBe(12.5);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
  });
});

describe("change on last year and the nudge (05-ux principle 8)", () => {
  it("shows the change in the canonical unit", () => {
    const c = compareToLast({ value: 1200, unit: "m³" }, { value: 1050, unit: "m³" }, "m³", "Last September");
    expect(c.changeText).toBe("+14 %");
    expect(c.nudge).toBeNull();
    expect(compareToLast({ value: 1.2, unit: "ML" }, { value: 1050, unit: "m³" }, "m³", "Last September").changeText).toBe("+14 %");
  });

  it("asks, without blocking, when it's 2× or more or less than half", () => {
    expect(compareToLast({ value: 3150, unit: "m³" }, { value: 1050, unit: "m³" }, "m³", "Last September").nudge).toBe("This is 3× last September. Is that right?");
    expect(compareToLast({ value: 2625, unit: "m³" }, { value: 1050, unit: "m³" }, "m³", "Last September").nudge).toBe("This is 2.5× last September. Is that right?");
    expect(compareToLast({ value: 400, unit: "m³" }, { value: 1050, unit: "m³" }, "m³", "Last September").nudge).toBe("This is less than half of last September. Is that right?");
  });

  it("says nothing without a last value or when it was zero", () => {
    expect(compareToLast({ value: 5, unit: null }, null, null, "Last year")).toEqual({ changeText: null, changePct: null, ratio: null, nudge: null });
    expect(compareToLast({ value: 5, unit: null }, { value: 0, unit: null }, null, "Last year").changeText).toBeNull();
  });
});

describe("breakdown sum (KPI_BREAKDOWN_SUM ±0.5 %)", () => {
  it("adds up, or says by how much it doesn't", () => {
    expect(checkBreakdown(1200, { groundwater: 700, surface: 500 }, "m³")).toMatchObject({ state: "ok", text: "Adds up to 1,200 m³." });
    expect(checkBreakdown(1200, { groundwater: 700, surface: 450 }, "m³")).toMatchObject({ state: "short", diff: 50, text: "The split is 50 m³ short of the total." });
    expect(checkBreakdown(1200, { groundwater: 800, surface: 500 }, "m³")).toMatchObject({ state: "over", diff: 100 });
    expect(checkBreakdown(1000, { a: 997 }, "t")).toMatchObject({ state: "ok" });
    expect(checkBreakdown(1200, {}, "m³")).toEqual({ state: "empty" });
  });

  it("sends numbers only", () => {
    expect(breakdownPayload({ groundwater: 700, surface: null, third_party: undefined })).toEqual({ groundwater: 700 });
    expect(breakdownPayload({ groundwater: null })).toBeNull();
    expect(breakdownTitle(["source"])).toBe("Split by source");
  });
});
