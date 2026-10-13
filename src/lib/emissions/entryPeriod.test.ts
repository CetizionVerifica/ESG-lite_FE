import { describe, expect, it } from "vitest";
import { editedDate, entryMonth, monthBounds, monthEndDate } from "./entryPeriod";

const today = new Date(2026, 9, 13); // 13 Oct 2026
const monthly = (date_of_reporting: string) => ({ date_of_reporting, reporting_period: "monthly" as const });

describe("monthEndDate", () => {
  it("gives the month's last day, leap years included", () => {
    expect(monthEndDate("2025-09")).toBe("2025-09-30");
    expect(monthEndDate("2024-02")).toBe("2024-02-29");
    expect(monthEndDate("2025-02")).toBe("2025-02-28");
  });
});

describe("editedDate", () => {
  it("keeps the stored date while the month is unchanged, else moves to the month's end", () => {
    expect(entryMonth(monthly("2025-09-15"))).toBe("2025-09");
    expect(editedDate(monthly("2025-09-15"), "2025-09")).toBe("2025-09-15");
    expect(editedDate(monthly("2025-09-15"), "2025-08")).toBe("2025-08-31");
  });

  it("keeps a yearly entry's period end", () => {
    expect(editedDate({ date_of_reporting: "2026-03-31", reporting_period: "yearly" }, "2025-01")).toBe("2026-03-31");
  });
});

describe("monthBounds", () => {
  it("is the entry's own year, up to this month", () => {
    expect(monthBounds(monthly("2025-09-30"), today)).toEqual({ min: "2025-01", max: "2025-12" });
    expect(monthBounds(monthly("2026-02-28"), today)).toEqual({ min: "2026-01", max: "2026-10" });
  });

  it("always includes the entry's own month, even one dated later than this month", () => {
    expect(monthBounds(monthly("2026-12-31"), today)).toEqual({ min: "2026-01", max: "2026-12" });
    expect(monthBounds(monthly("2027-01-31"), today)).toEqual({ min: "2027-01", max: "2027-01" });
  });
});
