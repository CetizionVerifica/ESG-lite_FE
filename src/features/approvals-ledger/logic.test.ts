import { describe, expect, it } from "vitest";
import type { EmissionData } from "../../services/emissionService";
import {
  type ColumnConfig,
  activityFields,
  activitySummary,
  effectiveStatus,
  humanize,
  listParams,
  mergeFera,
  optionLabel,
  periodQuery,
  quantityOf,
  reportOptions,
  rowPeriodLabel,
  scopeNumber,
} from "./logic";

function row(over: Partial<EmissionData> = {}): EmissionData {
  return {
    pk_id: 1,
    activity_data: {},
    total_emission: 1.5,
    unit: "tCO2e",
    date_of_reporting: "2025-09-30",
    status: "pending",
    created_at: "2025-10-02T08:00:00Z",
    updated_at: "2025-10-02T08:00:00Z",
    site: { site_id: 1, name: "Hidd" },
    category: { category_id: 10, category_name: "Diesel", scope: "Scope 1" },
    ...over,
  };
}

const fuelConfig: ColumnConfig = {
  columns: [
    { pk_id: 5, column_name: "fuel_type", column_type: "select" },
    { pk_id: 6, column_name: "grade", column_type: "select" },
    { pk_id: 7, column_name: "quantity", column_type: "number" },
  ],
  column_options: { "5": [{ id: 1, label: "Diesel" }, { id: 2, label: "Petrol" }] },
  column_dependencies: { grade: "fuel_type" },
  dependent_options: { grade: { Diesel: [{ id: 11, label: "Ultra low sulphur" }], Petrol: [{ id: 11, label: "95 RON" }] } },
};

describe("listParams", () => {
  const base = { siteIds: [1, 2], categoryId: null, period: null, search: "", status: null, sort: null, page: 0, pageSize: 50 };

  it("always asks for pending on the approvals tab, oldest first is passed through", () => {
    const p = listParams({ ...base, tab: "approvals", status: "approved", sort: { id: "submitted", dir: "asc" } });
    expect(p).toMatchObject({ status: "pending", sort: "created_at", order: "asc", page: 1, limit: 50, siteIds: [1, 2] });
  });

  it("maps ledger sort, search and period", () => {
    const p = listParams({ ...base, tab: "ledger", status: "rejected", search: "  boiler ", sort: { id: "tco2e", dir: "desc" }, period: { kind: "month", year: 2025, month: 9 }, page: 2 });
    expect(p).toMatchObject({ status: "rejected", search: "boiler", sort: "total_emission", order: "desc", year: 2025, month: 9, page: 3 });
  });

  it("drops sorts the server can't do", () => {
    expect(listParams({ ...base, tab: "ledger", sort: { id: "activity", dir: "asc" } })).toMatchObject({ sort: null, order: null });
  });
});

describe("periodQuery", () => {
  it("handles month, calendar year and any period", () => {
    expect(periodQuery({ kind: "month", year: 2025, month: 3 })).toEqual({ year: 2025, month: 3 });
    expect(periodQuery({ kind: "cy", year: 2024 })).toEqual({ year: 2024, month: null });
    expect(periodQuery(null)).toEqual({ year: null, month: null });
  });
});

describe("mergeFera", () => {
  const parent = row({ pk_id: 1, fera_linked_id: 2 });
  const fera = row({ pk_id: 2, category: { category_id: 99, category_name: "FERA" }, total_emission: 0.2, fera_linked_id: 1 });
  const other = row({ pk_id: 3 });

  it("hides FERA rows and hangs them on their parent", () => {
    const m = mergeFera([parent, fera, other], false);
    expect(m.rows.map((r) => r.pk_id)).toEqual([1, 3]);
    expect(m.feraOf.get(1)?.pk_id).toBe(2);
    expect(m.feraOf.has(3)).toBe(false);
  });

  it("keeps FERA rows when looking at the FERA category", () => {
    expect(mergeFera([parent, fera], true).rows).toHaveLength(2);
  });

  it("keeps a FERA row whose parent isn't in the list", () => {
    expect(mergeFera([fera, other], false).rows.map((r) => r.pk_id)).toEqual([2, 3]);
  });

  it("keeps a pending FERA row of an approved parent as its own row", () => {
    const approved = row({ pk_id: 1, fera_linked_id: 2, status: "approved" });
    const m = mergeFera([approved, fera], false);
    expect(m.rows.map((r) => r.pk_id)).toEqual([1, 2]);
    expect(m.feraOf.has(1)).toBe(false);
  });
});

describe("optionLabel", () => {
  it("resolves ids through the column's options", () => {
    expect(optionLabel(fuelConfig, "fuel_type", "1", {})).toBe("Diesel");
  });

  it("resolves dependent ids under the parent's label", () => {
    expect(optionLabel(fuelConfig, "grade", "11", { fuel_type: "2" })).toBe("95 RON");
    expect(optionLabel(fuelConfig, "grade", "11", { fuel_type: "1" })).toBe("Ultra low sulphur");
  });

  it("falls back to any dependent list, then the raw value", () => {
    expect(optionLabel(fuelConfig, "grade", "11", {})).toBe("Ultra low sulphur");
    expect(optionLabel(fuelConfig, "fuel_type", "Kerosene", {})).toBe("Kerosene");
    expect(optionLabel(undefined, "fuel_type", "1", {})).toBe("1");
  });
});

describe("activityFields", () => {
  const r = row({
    activity_data: { quantity: "120.5", grade: "11", fuel_type: "1", category_name: "Diesel", note: "", extra_field: "Site B" },
    activity_data_unit: "litre",
  });

  it("orders by the form, resolves labels and skips bookkeeping and empty values", () => {
    const f = activityFields(r, fuelConfig);
    expect(f.map((x) => [x.label, x.value])).toEqual([
      ["Fuel type", "Diesel"],
      ["Grade", "Ultra low sulphur"],
      ["Quantity", "120.5"],
      ["Extra field", "Site B"],
    ]);
    expect(quantityOf(f)).toBe(120.5);
    expect(activitySummary(f)).toEqual({ text: "Diesel · Ultra low sulphur", more: 2 });
  });

  it("still lists raw values before the config has loaded", () => {
    const f = activityFields(r, undefined);
    expect(f.map((x) => x.value)).toContain("1");
    expect(quantityOf(f)).toBe(120.5);
  });
});

describe("rowPeriodLabel", () => {
  it("labels monthly and yearly rows", () => {
    expect(rowPeriodLabel(row())).toBe("Sep 2025");
    expect(rowPeriodLabel(row({ reporting_period: "yearly", year_type: "CY", date_of_reporting: "2024-12-31" }))).toBe("CY 2024");
    expect(rowPeriodLabel(row({ reporting_period: "yearly", year_type: "FY", date_of_reporting: "2025-03-31" }))).toBe("FY 2024-25");
  });
});

describe("small helpers", () => {
  it("prefers the optimistic status", () => {
    expect(effectiveStatus(row(), new Map([[1, "approved"]]))).toBe("approved");
    expect(effectiveStatus(row(), new Map())).toBe("pending");
  });

  it("reads scopes and humanizes keys", () => {
    expect(scopeNumber("Scope 2")).toBe(2);
    expect(scopeNumber(null)).toBeNull();
    expect(humanize("fuelType")).toBe("Fuel type");
  });
});

describe("reportOptions", () => {
  it("offers the month, its calendar year and its financial year", () => {
    expect(reportOptions({ kind: "month", year: 2025, month: 2 })).toEqual([
      { kind: "month", label: "Feb 2025 (month)", year: 2025, month: 2 },
      { kind: "year", label: "Calendar year 2025", year: 2025, yearType: "CY" },
      { kind: "year", label: "FY 2024-25", year: 2025, yearType: "FY" },
    ]);
    expect(reportOptions({ kind: "month", year: 2025, month: 9 })[2]).toMatchObject({ label: "FY 2025-26", year: 2026 });
  });

  it("offers the year for a calendar year and nothing for any period", () => {
    expect(reportOptions({ kind: "cy", year: 2024 })).toEqual([{ kind: "year", label: "Calendar year 2024", year: 2024, yearType: "CY" }]);
    expect(reportOptions(null)).toEqual([]);
  });
});
