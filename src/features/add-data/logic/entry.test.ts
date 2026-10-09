import { describe, expect, it } from "vitest";
import { createEmissionCalculator } from "../hooks/emissionCalc";
import {
  buildPayload,
  entryDate,
  entryFactorYear,
  formatEntryPeriodParam,
  parseEntryPeriod,
  periodTotalQuery,
  previousPeriod,
  rowIssue,
} from "./entry";

describe("entry period", () => {
  it("reads and writes ?period=", () => {
    expect(parseEntryPeriod("2025-09")).toEqual({ mode: "monthly", year: 2025, month: 9 });
    expect(parseEntryPeriod("CY2025")).toEqual({ mode: "yearly", yearType: "CY", year: 2025 });
    expect(parseEntryPeriod("FY2025")).toEqual({ mode: "yearly", yearType: "FY", year: 2025 });
    expect(parseEntryPeriod("2025-13")).toBeNull();
    expect(parseEntryPeriod("2025-Q3")).toBeNull();
    expect(parseEntryPeriod(null)).toBeNull();
    expect(formatEntryPeriodParam({ mode: "monthly", year: 2025, month: 2 })).toBe("2025-02");
    expect(formatEntryPeriodParam({ mode: "yearly", yearType: "FY", year: 2025 })).toBe("FY2025");
  });

  it("files months on their last day and years on the period end", () => {
    expect(entryDate({ mode: "monthly", year: 2024, month: 2 })).toBe("2024-02-29");
    expect(entryDate({ mode: "monthly", year: 2025, month: 9 })).toBe("2025-09-30");
    expect(entryDate({ mode: "yearly", yearType: "CY", year: 2025 })).toBe("2025-12-31");
    expect(entryDate({ mode: "yearly", yearType: "FY", year: 2025 })).toBe("2026-03-31");
  });

  it("uses the previous year's factors", () => {
    expect(entryFactorYear({ mode: "monthly", year: 2025, month: 1 })).toBe(2024);
    expect(entryFactorYear({ mode: "yearly", yearType: "FY", year: 2025 })).toBe(2025);
  });

  it("asks for the previous period like the legacy page", () => {
    expect(periodTotalQuery(previousPeriod({ mode: "monthly", year: 2025, month: 1 }))).toEqual({
      year: 2024, month: 12, reportingPeriod: "monthly", yearType: undefined,
    });
    expect(periodTotalQuery(previousPeriod({ mode: "yearly", yearType: "FY", year: 2025 }))).toEqual({
      year: 2025, month: undefined, reportingPeriod: "yearly", yearType: "FY",
    });
    expect(periodTotalQuery(previousPeriod({ mode: "yearly", yearType: "CY", year: 2025 }))).toMatchObject({ year: 2024 });
  });
});

describe("rows", () => {
  const calc = createEmissionCalculator({
    emissionFactors: [
      { emission_factor_id: 1, emission_category_name: "Diesel", factor_value: 2680, denominator_unit: "litre", year: 2024 },
      { emission_factor_id: 2, emission_category_name: "HGV [tonne.km]", factor_value: 100, denominator_unit: "tonne.km", year: 2024 },
    ],
    targetYear: 2024,
  });

  it("reports the first problem per field", () => {
    expect(rowIssue({ id: 1 }, calc)).toEqual({ field: "emission_category", message: "Choose what this row is" });
    expect(rowIssue({ id: 1, emission_category: "Diesel" }, calc)?.field).toBe("activity_data_unit");
    expect(rowIssue({ id: 1, emission_category: "Diesel", activity_data_unit: "kg", quantity: "5" }, calc)?.message).toBe(
      "The factor is per litre and kg can't be converted to it.",
    );
    expect(rowIssue({ id: 1, emission_category: "HGV [tonne.km]", activity_data_unit: "km", quantity: "5" }, calc)?.message).toBe(
      "This option is per tonne.km. Choose the [km] version of it, or switch the unit to tonne.km.",
    );
    expect(rowIssue({ id: 1, emission_category: "Diesel", activity_data_unit: "litre" }, calc)).toEqual({
      field: "values",
      message: "Enter activity data",
    });
    expect(rowIssue({ id: 1, emission_category: "Diesel", activity_data_unit: "gallon", quantity: "5" }, calc)).toBeNull();
  });

  it("builds the legacy page's payload", () => {
    const row = {
      id: 3,
      fuel: "7",
      quantity: "1600",
      quantity__multiplier: "2",
      quantity__distance: "800",
      emission_category: "Diesel",
      activity_data_unit: "litre",
      _ecmKey: "diesel",
      _isFeraRow: false,
      _extra_data: { po: "PO-1" },
    };
    expect(buildPayload(row, { siteId: 4, categoryId: 9, period: { mode: "monthly", year: 2025, month: 9 } })).toEqual({
      site_id: 4,
      category_id: 9,
      activity_data: { fuel: "7", quantity: "1600", emission_category: "Diesel" },
      extra_data: { po: "PO-1" },
      total_emission: 0,
      unit: "kg CO2e",
      date_of_reporting: "2025-09-30",
      activity_data_unit: "litre",
      reporting_period: "monthly",
      year_type: undefined,
    });
    const yearly = buildPayload({ ...row, date_of_reporting: "2025-05-02" }, { siteId: 4, categoryId: 9, period: { mode: "yearly", yearType: "FY", year: 2025 } });
    expect(yearly).toMatchObject({ date_of_reporting: "2026-03-31", reporting_period: "yearly", year_type: "FY" });
    const monthlyWithDate = buildPayload({ ...row, date_of_reporting: "2025-09-12" }, { siteId: 4, categoryId: 9, period: { mode: "monthly", year: 2025, month: 9 } });
    expect(monthlyWithDate.date_of_reporting).toBe("2025-09-12");
  });
});
