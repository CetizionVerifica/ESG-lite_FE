import { describe, expect, it } from "vitest";
import { toFormModel } from "../../../lib/emissions/form";
import type { ColumnConfig, ColumnEntity } from "../../../lib/emissions/types";
import { buildPayload } from "./entry";
import { canChange, editOf, entriesQuery, entryInPeriod, rowFromEntry, type SavedEntry } from "./existing";

const col = (pk_id: number, column_name: string, column_type = "number"): ColumnEntity => ({ pk_id, column_name, column_type });
const config: ColumnConfig = { pk_id: 1, config_name: "Travel", columns: [col(1, "Mode", "text"), col(2, "Activity Data")] };
const sep = { mode: "monthly" as const, year: 2025, month: 9 };
const fy = { mode: "yearly" as const, yearType: "FY" as const, year: 2025 };
const entry = (over: Partial<SavedEntry> = {}): SavedEntry => ({
  pk_id: 5,
  activity_data: { mode: "Car", "Activity Data": 120, emission_category: "Car (petrol)" },
  extra_data: { trip: "Audit" },
  total_emission: 0.02,
  date_of_reporting: "2025-09-30T00:00:00.000Z",
  reporting_period: "monthly",
  activity_data_unit: "km",
  status: "rejected",
  review_comment: "Wrong unit",
  ...over,
});

describe("existing entries", () => {
  it("queries the month, or the year the period ends in", () => {
    expect(entriesQuery(sep)).toEqual({ year: 2025, month: 9 });
    expect(entriesQuery(fy)).toEqual({ year: 2026, month: null });
  });

  it("keeps monthly rows of the month and yearly rows on the period end", () => {
    expect(entryInPeriod(entry(), sep)).toBe(true);
    expect(entryInPeriod(entry({ date_of_reporting: "2025-08-31" }), sep)).toBe(false);
    expect(entryInPeriod(entry({ reporting_period: "yearly" }), sep)).toBe(false);
    const yearly = entry({ reporting_period: "yearly", year_type: "FY", date_of_reporting: "2026-03-31" });
    expect(entryInPeriod(yearly, fy)).toBe(true);
    expect(entryInPeriod({ ...yearly, year_type: "CY" }, fy)).toBe(false);
    expect(entryInPeriod(entry({ date_of_reporting: "2026-03-31" }), fy)).toBe(false);
  });

  it("offers Fix or Edit only while the entry can still change", () => {
    expect(canChange(entry())).toBe(true);
    expect(canChange(entry({ status: "pending" }))).toBe(true);
    expect(canChange(entry({ status: "approved" }))).toBe(false);
  });

  it("loads an entry as a row that edits it and saves the same activity data", () => {
    const model = toFormModel(config);
    const row = rowFromEntry(entry(), model, 3, sep);
    expect(row).toMatchObject({ id: 3, Mode: "Car", "Activity Data": "120", activity_data_unit: "km", date_of_reporting: "2025-09-30", _extra_data: { trip: "Audit" } });
    expect(editOf(row)).toBe(5);
    const payload = buildPayload(row, { siteId: 4, categoryId: 9, period: sep });
    expect(payload.activity_data).toEqual({ Mode: "Car", "Activity Data": "120", emission_category: "Car (petrol)" });
    expect(payload.date_of_reporting).toBe("2025-09-30");
  });

  it("loads a composite unit as 1 × the saved product", () => {
    const row = rowFromEntry(entry({ activity_data_unit: "passenger.km" }), toFormModel(config), 1, sep);
    expect(row).toMatchObject({ "Activity Data": "120", "Activity Data__multiplier": "1", "Activity Data__distance": "120" });
  });
});
