import { describe, expect, it } from "vitest";
import {
  calendarYearOf,
  previousReportPeriod,
  quarterSpan,
  reportMonthOptions,
  reportPeriodLabel,
  reportQuarterOptions,
  reportYearContaining,
  reportYearLabel,
  reportingMonths,
} from "./reportPeriod";

describe("reportingMonths", () => {
  it("runs Jan–Dec for a calendar year", () => {
    const m = reportingMonths("CY", 2025);
    expect(m[0]).toEqual({ year: 2025, month: 1 });
    expect(m[11]).toEqual({ year: 2025, month: 12 });
  });

  it("starts the FY in the year before the one it ends in", () => {
    const m = reportingMonths("FY", 2025, 4);
    expect(m[0]).toEqual({ year: 2024, month: 4 });
    expect(m[8]).toEqual({ year: 2024, month: 12 });
    expect(m[11]).toEqual({ year: 2025, month: 3 });
  });

  it("treats a January FY start as a calendar year", () => {
    expect(reportingMonths("FY", 2025, 1)[0]).toEqual({ year: 2025, month: 1 });
  });
});

describe("labels", () => {
  it("names the year", () => {
    expect(reportYearLabel("CY", 2025)).toBe("CY 2025");
    expect(reportYearLabel("FY", 2025, 4)).toBe("FY 2024-25");
    expect(reportYearLabel("FY", 2025, 7)).toBe("FY 2024-25");
    expect(reportYearLabel("FY", 2025, 1)).toBe("FY 2025");
  });

  it("names quarters by their months, using the company's FY start", () => {
    expect(quarterSpan("FY", 2025, 2, 4)).toBe("Jul–Sep 2024");
    expect(quarterSpan("FY", 2025, 4, 4)).toBe("Jan–Mar 2025");
    expect(quarterSpan("FY", 2025, 1, 7)).toBe("Jul–Sep 2024");
    expect(quarterSpan("FY", 2025, 3, 11)).toBe("May–Jul 2025");
    expect(quarterSpan("FY", 2025, 1, 12)).toBe("Dec 2024 – Feb 2025");
    expect(quarterSpan("CY", 2025, 1)).toBe("Jan–Mar 2025");
  });

  it("labels a whole period", () => {
    expect(reportPeriodLabel({ yearType: "CY", year: 2025, frequency: "yearly" })).toBe("CY 2025");
    expect(reportPeriodLabel({ yearType: "FY", year: 2025, frequency: "monthly", month: 6 }, 4)).toBe("June 2024");
    expect(reportPeriodLabel({ yearType: "FY", year: 2025, frequency: "monthly", month: 2 }, 4)).toBe("February 2025");
    expect(reportPeriodLabel({ yearType: "FY", year: 2025, frequency: "quarterly", quarter: 2 }, 4)).toBe("Q2 FY 2024-25 (Jul–Sep 2024)");
    // A month or quarter that's missing falls back to the year.
    expect(reportPeriodLabel({ yearType: "CY", year: 2025, frequency: "monthly" })).toBe("CY 2025");
  });

  it("finds the calendar year of a month", () => {
    expect(calendarYearOf("FY", 2025, 4, 4)).toBe(2024);
    expect(calendarYearOf("FY", 2025, 3, 4)).toBe(2025);
    expect(calendarYearOf("CY", 2025, 12)).toBe(2025);
  });
});

describe("periods", () => {
  it("compares with the same period a year earlier", () => {
    expect(previousReportPeriod({ yearType: "FY", year: 2025, frequency: "quarterly", quarter: 3 })).toEqual({
      yearType: "FY",
      year: 2024,
      frequency: "quarterly",
      quarter: 3,
    });
  });

  it("finds the reporting year a date falls in", () => {
    expect(reportYearContaining("CY", new Date(2025, 4, 1))).toBe(2025);
    expect(reportYearContaining("FY", new Date(2025, 4, 1), 4)).toBe(2026);
    expect(reportYearContaining("FY", new Date(2025, 1, 1), 4)).toBe(2025);
    expect(reportYearContaining("FY", new Date(2025, 1, 1), 1)).toBe(2025);
  });

  it("lists picker options in reporting order", () => {
    const months = reportMonthOptions("FY", 2025, 4);
    expect(months[0]).toEqual({ value: 4, label: "Apr 2024" });
    expect(months[11]).toEqual({ value: 3, label: "Mar 2025" });
    expect(reportQuarterOptions("FY", 2025, 4)[0]).toEqual({ value: 1, label: "Q1 (Apr–Jun 2024)" });
  });
});
