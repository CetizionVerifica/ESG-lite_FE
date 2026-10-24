import { describe, expect, it } from "vitest";
import { filedAs, periodLockTitle } from "./periodLock";

describe("periodLockTitle (#246)", () => {
  it("names the clash: monthly entries, yearly data, or the other calendar", () => {
    expect(periodLockTitle("yearly", { conflicting_period: "monthly" })).toBe("Filed monthly for this year");
    expect(periodLockTitle("yearly", { conflicting_period: "yearly", conflicting_year_type: "CY" })).toBe("Filed under CY for this year");
    expect(periodLockTitle("yearly", { conflicting_period: "yearly", conflicting_year_type: "FY" })).toBe("Filed under FY for this year");
    expect(periodLockTitle("monthly", { conflicting_period: "yearly", conflicting_year_type: "CY" })).toBe("Filed yearly for this period");
  });

  it("filedAs says how the period is filed instead", () => {
    expect(filedAs("yearly", { conflicting_period: "monthly" })).toBe("monthly");
    expect(filedAs("yearly", { conflicting_period: "yearly", conflicting_year_type: "CY" })).toBe("under CY");
    expect(filedAs("monthly", { conflicting_period: "yearly", conflicting_year_type: "FY" })).toBe("yearly");
  });

  it("an API without the conflict keeps the old titles", () => {
    expect(periodLockTitle("yearly", null)).toBe("Filed monthly for this year");
    expect(periodLockTitle("monthly", undefined)).toBe("Filed yearly for this period");
  });
});
