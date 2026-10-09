import { describe, expect, it } from "vitest";
import { toFormModel } from "../../../lib/emissions/form";
import type { ColumnConfig, ColumnEntity } from "../../../lib/emissions/types";
import { billOf } from "../logic/bill";
import { editRow } from "./useEntryRows";

const col = (pk_id: number, column_name: string, column_type = "select"): ColumnEntity => ({ pk_id, column_name, column_type });
const waste: ColumnConfig = {
  pk_id: 1,
  config_name: "Waste",
  columns: [col(1, "activity_type"), col(2, "type_of_waste"), col(3, "quantity", "number"), col(4, "emission_category", "text")],
  column_options: { "1": [{ id: "m", label: "Metal" }, { id: "p", label: "Paper" }] },
  column_dependencies: { type_of_waste: "activity_type" },
  dependent_options: { type_of_waste: { Metal: [{ id: "am", label: "Any metals" }], Paper: [{ id: "bk", label: "Books" }] } },
  emission_category_mapping: { "Metal|Any metals": "Metal recycling" },
};

describe("editing a bill row", () => {
  it("drops the AI mark from the edited field and from values the edit cleared or re-derived", () => {
    const m = toFormModel(waste);
    const row = {
      id: 1,
      activity_type: "m",
      type_of_waste: "am",
      quantity: "120",
      emission_category: "Metal recycling",
      _bill: { ai: ["activity_type", "type_of_waste", "quantity", "emission_category"], confidence: null },
    };
    const next = editRow(m, row, "activity_type", "p");
    expect(next.type_of_waste).toBe("");
    expect(next.emission_category).toBe("");
    expect(billOf(next)?.ai).toEqual(["quantity"]);
  });
});
