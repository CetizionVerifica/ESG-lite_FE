import { describe, expect, it } from "vitest";
import { readPeriod, supportedPeriod, writePeriod } from "./reportFilterModel";

describe("supportedPeriod", () => {
  const all = { fy: true, quarterly: true };
  const calendarOnly = { fy: false, quarterly: false };

  it("keeps a period the report supports", () => {
    const p = {
      yearType: "FY" as const,
      year: 2025,
      frequency: "quarterly" as const,
      quarter: 2,
    };
    expect(supportedPeriod(p, all)).toBe(p);
  });

  it("moves FY to CY and a quarter to the whole year", () => {
    expect(supportedPeriod({ yearType: "FY", year: 2025, frequency: "quarterly", quarter: 3 }, calendarOnly)).toEqual({
      yearType: "CY",
      year: 2025,
      frequency: "yearly",
    });
  });

  it("keeps a CY month as it is", () => {
    const p = {
      yearType: "CY" as const,
      year: 2024,
      frequency: "monthly" as const,
      month: 6,
    };
    expect(supportedPeriod(p, calendarOnly)).toEqual(p);
  });

  it("round-trips through the URL", () => {
    const now = new Date(2025, 5, 1);
    const p = readPeriod(new URLSearchParams("cal=CY&freq=month&year=2024&month=6"), now);
    expect(writePeriod(new URLSearchParams("site=3"), p).toString()).toBe("site=3&cal=CY&freq=month&year=2024&month=6");
  });
});
