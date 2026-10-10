import { describe, expect, it } from "vitest";
import { type ColumnConfig, type ColumnEntity, createEmissionCalculator, toFormModel } from "../../lib/emissions";
import type { EmissionData } from "../../services/emissionService";
import { buildUpdate, canEdit, monthBounds, editIssue, editedDate, monthEndDate, prefillSelects, rowFromEntry, saveErrorMessage } from "./edit";

const col = (pk_id: number, column_name: string, column_type = "select"): ColumnEntity => ({ pk_id, column_name, column_type });

// Waste: Activity Type → Type of Waste → Disposal Method.
const waste: ColumnConfig = {
  pk_id: 1,
  config_name: "Waste",
  columns: [col(1, "activity_type"), col(2, "type_of_waste"), col(3, "disposal_method"), col(4, "quantity", "number")],
  column_options: {
    "1": [
      { id: "m", label: "Metal" },
      { id: "p", label: "Paper" },
    ],
  },
  column_dependencies: { type_of_waste: "activity_type", disposal_method: "type_of_waste" },
  dependent_options: {
    type_of_waste: { Metal: [{ id: "am", label: "Any metals" }], Paper: [{ id: "bk", label: "Books" }] },
    disposal_method: {
      "Metal|Any metals": [
        { id: "ol", label: "Open loop" },
        { id: "lf", label: "Landfill" },
      ],
    },
  },
  emission_category_mapping: { "Metal|Any metals|Open loop": "Metal: open loop recycling" },
};
const model = toFormModel(waste);

const entry = (over: Partial<EmissionData> = {}): EmissionData => ({
  pk_id: 7,
  activity_data: { emission_category: "Metal: open loop recycling", quantity: "1200", category_name: "Waste", _ecmKey: "" },
  extra_data: { po: "PO-1" },
  total_emission: 0.02,
  unit: "kg CO2e",
  date_of_reporting: "2025-09-15T00:00:00.000Z",
  reporting_period: "monthly",
  activity_data_unit: "kg",
  status: "rejected",
  created_at: "2025-10-01",
  updated_at: "2025-10-01",
  site: { site_id: 1, name: "Pune" },
  category: { category_id: 3, category_name: "Waste" },
  ...over,
});

const factors = [{ emission_factor_id: 1, emission_category_name: "Metal: open loop recycling", factor_value: 21.3, denominator_unit: "tonne", year: 2024 }];
const calc = createEmissionCalculator({ emissionFactors: factors, targetYear: 2024, columns: model.columns, emissionCategoryMapping: model.mapping });

describe("rowFromEntry", () => {
  it("refills the selects from the stored emission category, down the chain", () => {
    const row = rowFromEntry(model, entry());
    expect(row).toMatchObject({ activity_type: "m", type_of_waste: "am", disposal_method: "ol", quantity: "1200", activity_data_unit: "kg" });
    expect(row._ecmKey).toBe("Metal|Any metals|Open loop");
    expect(row._extra_data).toEqual({ po: "PO-1" });
  });

  it("leaves bookkeeping keys out", () => {
    expect(rowFromEntry(model, entry())).not.toHaveProperty("category_name");
  });

  it("keeps selections the entry already has", () => {
    const row = prefillSelects(model, {
      id: 1,
      emission_category: "Metal: open loop recycling",
      activity_type: "m",
      type_of_waste: "am",
      disposal_method: "lf",
    });
    expect(row.disposal_method).toBe("lf");
  });

  it("does nothing for a category that isn't in the mapping", () => {
    const row = rowFromEntry(model, entry({ activity_data: { emission_category: "Something else", quantity: "5" } }));
    expect(row.activity_type).toBe("");
  });
});

describe("period", () => {
  it("keeps the entry's own date while the month is unchanged", () => {
    expect(editedDate(entry(), "2025-09")).toBe("2025-09-15");
  });

  it("moves to the new month's end", () => {
    expect(editedDate(entry(), "2024-02")).toBe("2024-02-29");
    expect(monthEndDate("2025-11")).toBe("2025-11-30");
  });

  it("keeps a monthly entry in its own year, up to this month", () => {
    expect(monthBounds(entry(), new Date(2026, 9, 9))).toEqual({ min: "2025-01", max: "2025-12" });
    expect(monthBounds(entry({ date_of_reporting: "2026-02-28" }), new Date(2026, 9, 9))).toEqual({ min: "2026-01", max: "2026-10" });
  });

  it("never moves a yearly entry", () => {
    expect(editedDate(entry({ reporting_period: "yearly", date_of_reporting: "2026-03-31" }), "2025-01")).toBe("2026-03-31");
  });
});

describe("editIssue", () => {
  const row = rowFromEntry(model, entry());

  it("needs a note on what changed for a rejected entry", () => {
    expect(editIssue(row, calc, "rejected", " ")?.field).toBe("reason");
    expect(editIssue(row, calc, "rejected", "Fixed the weight")).toBeNull();
  });

  it("doesn't need a note for a pending entry", () => {
    expect(editIssue(row, calc, "pending", "")).toBeNull();
  });

  it("stops on a unit the factor can't take", () => {
    expect(editIssue({ ...row, activity_data_unit: "kWh" }, calc, "pending", "")?.field).toBe("activity_data_unit");
  });

  it("stops without an emission category", () => {
    expect(editIssue({ ...row, emission_category: "" }, calc, "pending", "")?.field).toBe("emission_category");
  });
});

describe("buildUpdate", () => {
  it("sends what was entered, the unit, the date and a trimmed reason", () => {
    const row = { ...rowFromEntry(model, entry()), quantity: "1500", weight__multiplier: "2" };
    const body = buildUpdate(row, "2025-09-30", "  Fixed the weight ");
    expect(body.activity_data).toEqual({
      emission_category: "Metal: open loop recycling",
      quantity: "1500",
      activity_type: "m",
      type_of_waste: "am",
      disposal_method: "ol",
    });
    expect(body).toMatchObject({ activity_data_unit: "kg", date_of_reporting: "2025-09-30", reason: "Fixed the weight", extra_data: { po: "PO-1" } });
  });

  it("leaves an empty reason out", () => {
    expect(buildUpdate(rowFromEntry(model, entry()), "2025-09-30", "").reason).toBeUndefined();
  });
});

describe("helpers", () => {
  it("only pending and rejected entries can be edited", () => {
    expect([canEdit({ status: "pending" }), canEdit({ status: "rejected" }), canEdit({ status: "approved" })]).toEqual([true, true, false]);
  });

  it("uses the server's message when there is one", () => {
    expect(saveErrorMessage({ response: { data: { message: "No emission factor found" } } })).toBe("No emission factor found");
    expect(saveErrorMessage(new Error("x"))).toMatch(/Couldn't save/);
  });
});
