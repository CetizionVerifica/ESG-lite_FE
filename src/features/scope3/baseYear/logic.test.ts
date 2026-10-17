import { describe, expect, it } from "vitest";
import type { CompanyBaseYear, RecalcEvent } from "../../../lib/scope3/baseYear";
import { changesYear, draftErrors, draftFrom, historyEntries, isDirty, policyOnly, toBody, withYearType, yearOptions } from "./logic";

const NOW = new Date(2026, 9, 16);
const ROW: CompanyBaseYear = {
  id: 1,
  company_id: 1,
  scope: "Scope 3",
  base_year: 2023,
  year_type: "CY",
  significance_pct: 5,
  policy_note: null,
  rationale: "First year with supplier data",
  snapshot: { version: 1, frozen_at: "2026-01-01T00:00:00Z", base_year: 2023, year_type: "CY", total_tco2e: 10, categories: [], rows: 2 },
  updated_at: "2026-01-01T00:00:00Z",
};

describe("S3-14 base year form", () => {
  it("switching FY to CY drops a year CY doesn't offer yet", () => {
    const fy = withYearType(draftFrom(null, NOW), "FY", NOW, null);
    const fy2026 = { ...fy, base_year: 2026 };
    expect(withYearType(fy2026, "CY", NOW, null)).toMatchObject({ year_type: "CY", base_year: 2025 });
    expect(withYearType({ ...fy, base_year: 2020 }, "CY", NOW, null)).toMatchObject({ year_type: "CY", base_year: 2020 });
  });

  it("keeps the saved year in the list only for its own year type", () => {
    const savedFy = { ...ROW, base_year: 2026, year_type: "FY" as const };
    expect(yearOptions(NOW, "FY", savedFy)[0]).toBe(2026);
    expect(yearOptions(NOW, "CY", savedFy)).not.toContain(2026);
  });

  it("starts from last year and 5 % when none is set, else from the saved row", () => {
    expect(draftFrom(null, NOW)).toMatchObject({ base_year: 2025, year_type: "CY", significance_pct: 5, rationale: "" });
    expect(draftFrom(ROW, NOW)).toMatchObject({ base_year: 2023, rationale: "First year with supplier data" });
  });

  it("needs a rationale and a valid threshold; a new year needs a note", () => {
    expect(draftErrors({ ...draftFrom(null, NOW), significance_pct: 0 }, null)).toEqual({
      significance_pct: "Use a threshold between 0 and 100 %.",
      rationale: "Say why this year is the base year.",
    });
    const moved = { ...draftFrom(ROW, NOW), base_year: 2024 };
    expect(changesYear(moved, ROW)).toBe(true);
    expect(draftErrors(moved, ROW).note).toMatch(/5 characters/);
    expect(toBody({ ...moved, note: "Acquired site data starts in 2024" }, ROW)).toMatchObject({ base_year: 2024, note: "Acquired site data starts in 2024" });
  });

  it("policy-only edits save without a new freeze", () => {
    const d = { ...draftFrom(ROW, NOW), significance_pct: 10 };
    expect(isDirty(d, ROW)).toBe(true);
    expect(policyOnly(d, ROW)).toBe(true);
    expect(toBody(d, ROW)).not.toHaveProperty("note");
    expect(isDirty(draftFrom(ROW, NOW), ROW)).toBe(false);
  });

  it("turns decided recalculations into history entries, skipping the open proposal", () => {
    const base: RecalcEvent = {
      id: 1, reason: "error", status: "approved", affected_years: [2023], delta_tco2e: 0.8, note: "Invoice keyed twice",
      before: { total_tco2e: 10, categories: [] }, after: { total_tco2e: 10.8, categories: [] }, changes: [],
      delta_pct: 8, threshold_tco2e: 0.5, largest_category: 6, approved_by_name: "Asha Admin", decided_at: "2026-03-01T00:00:00Z", created_at: "2026-02-28T00:00:00Z",
    };
    const out = historyEntries([{ ...base, id: 2, status: "proposed" }, base]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ action: "approve", reason: "Invoice keyed twice", changed_at: "2026-03-01T00:00:00Z" });
    expect(out[0].changed_fields.reason.new).toBe("Correction of errors");
    expect(out[0].changed_fields.total_tco2e).toEqual({ old: 10, new: 10.8 });
    expect(out[0].changed_by?.name).toBe("Asha Admin");
  });
});
