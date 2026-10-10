import { describe, expect, it } from "vitest";
import type { EmissionData } from "../../services/emissionService";
import {
  type LabelConfig,
  activityFields,
  breakdownRows,
  attachFera,
  categoriesFor,
  keyActivity,
  optionLabel,
  parseStatus,
  periodText,
  quantityOf,
  serverPeriod,
  toSupportedPeriod,
  userSites,
} from "./logic";

const entry = (over: Partial<EmissionData>): EmissionData => ({
  pk_id: 1,
  activity_data: {},
  total_emission: 1,
  unit: "tCO2e",
  date_of_reporting: "2025-09-30",
  status: "pending",
  created_at: "2025-10-01T08:00:00Z",
  updated_at: "2025-10-01T08:00:00Z",
  site: { site_id: 7, name: "Hidd plant" },
  category: { category_id: 1, category_name: "Diesel" },
  ...over,
});

describe("sites and categories", () => {
  it("reads one site or many from the auth user", () => {
    expect(userSites({ site: { site_id: 7, name: "Hidd", categories: [] } })).toEqual([{ site_id: 7, name: "Hidd", categories: [] }]);
    expect(userSites({ sites: [{ site_id: 1, name: "A" }, { site_id: 2, name: "B" }], site: { site_id: 9 } }).map((s) => s.site_id)).toEqual([1, 2]);
    expect(userSites(null)).toEqual([]);
  });

  it("merges categories of the chosen sites", () => {
    const sites = [
      { site_id: 1, name: "A", categories: [{ category_id: 2, category_name: "LPG" }, { category_id: 1, category_name: "Diesel" }] },
      { site_id: 2, name: "B", categories: [{ category_id: 1, category_name: "Diesel" }, { category_id: 3, category_name: "Waste" }] },
    ];
    expect(categoriesFor(sites, []).map((c) => c.category_name)).toEqual(["Diesel", "LPG", "Waste"]);
    expect(categoriesFor(sites, [2]).map((c) => c.category_name)).toEqual(["Diesel", "Waste"]);
  });
});

describe("period", () => {
  it("keeps month and CY, widens FY and quarter to the calendar year they end in", () => {
    expect(toSupportedPeriod({ kind: "month", year: 2025, month: 9 })).toEqual({ kind: "month", year: 2025, month: 9 });
    expect(toSupportedPeriod({ kind: "fy", startYear: 2025 })).toEqual({ kind: "cy", year: 2026 });
    expect(toSupportedPeriod({ kind: "quarter", year: 2025, quarter: 3 })).toEqual({ kind: "cy", year: 2025 });
    expect(toSupportedPeriod(null)).toBeNull();
  });

  it("maps to year/month query params", () => {
    expect(serverPeriod({ kind: "month", year: 2025, month: 9 })).toEqual({ year: 2025, month: 9 });
    expect(serverPeriod({ kind: "cy", year: 2025 })).toEqual({ year: 2025 });
    expect(serverPeriod(null)).toEqual({});
  });

  it("labels monthly and yearly rows", () => {
    expect(periodText(entry({ date_of_reporting: "2025-09-30T00:00:00.000Z" }))).toBe("Sep 2025");
    expect(periodText(entry({ date_of_reporting: "2026-03-31", reporting_period: "yearly", year_type: "FY" }))).toBe("FY 2025-26");
    expect(periodText(entry({ date_of_reporting: "2025-12-31", reporting_period: "yearly", year_type: "CY" }))).toBe("CY 2025");
  });
});

describe("rows", () => {
  it("shows a FERA row on its parent and keeps orphans", () => {
    const fera = { category_id: 99, category_name: "FERA" };
    const rows = [
      entry({ pk_id: 10 }),
      entry({ pk_id: 11, category: fera, fera_linked_id: 10, total_emission: 0.2 }),
      entry({ pk_id: 12, category: fera, fera_linked_id: 50, parent_category_name: "Petrol" }),
    ];
    const out = attachFera(rows);
    expect(out.map((r) => r.pk_id)).toEqual([10, 12]);
    expect(out[0].fera?.pk_id).toBe(11);
    expect(attachFera(rows, true)).toHaveLength(3);
  });

  it("finds the quantity the way the reports do", () => {
    expect(quantityOf({ emission_category: "Diesel", activity_value: "1000" })).toBe(1000);
    expect(quantityOf({ Quantity: "1,200.5" })).toBe(1200.5);
    expect(quantityOf({ consumption: "12.5", amount: "" })).toBe(12.5);
    expect(quantityOf({ "Units consumed": "25000" })).toBeNull();
    expect(quantityOf(null)).toBeNull();
  });

  it("reads the emission category and status", () => {
    expect(keyActivity(entry({ activity_data: { Emission_Category: " Diesel " } }))).toBe("Diesel");
    expect(keyActivity(entry({}))).toBeNull();
    expect(parseStatus("rejected")).toBe("rejected");
    expect(parseStatus("bogus")).toBeNull();
  });
});

describe("activity labels", () => {
  const config: LabelConfig = {
    columns: [
      { pk_id: 5, column_name: "Fuel type", column_type: "select" },
      { pk_id: 6, column_name: "Grade", column_type: "select" },
    ],
    column_options: { "5": [{ id: 1, label: "Diesel" }, { id: 2, label: "Petrol" }] },
    column_dependencies: { Grade: "Fuel type" },
    dependent_options: { Grade: { Diesel: [{ id: 7, label: "Ultra low sulphur" }], Petrol: [{ id: 7, label: "Super" }] } },
  };

  it("uses the parent's label to pick dependent options", () => {
    expect(optionLabel("Fuel type", "1", config, {})).toBe("Diesel");
    expect(optionLabel("Grade", "7", config, { "Fuel type": "2" })).toBe("Super");
    expect(optionLabel("Grade", "7", config, { "Fuel type": "1" })).toBe("Ultra low sulphur");
  });

  it("falls back to any dependent option, then the raw value", () => {
    expect(optionLabel("Grade", "7", config, {})).toBe("Ultra low sulphur");
    expect(optionLabel("Litres", "250", config, {})).toBe("250");
    expect(optionLabel("Fuel type", "1", undefined, {})).toBe("1");
  });

  it("lists entered fields without bookkeeping keys or blanks", () => {
    expect(
      activityFields({ "Fuel type": "2", Grade: "7", Litres: 250, _ecmKey: "x", fera_linked_id: 3, notes: "", meta: { a: 1 } }, config),
    ).toEqual([
      { key: "Fuel type", value: "Petrol" },
      { key: "Grade", value: "Super" },
      { key: "Litres", value: "250" },
      { key: "meta", value: '{"a":1}' },
    ]);
  });
});

describe("breakdownRows", () => {
  const groups = [
    { emission_category: "Diesel", entries: 2, total_emission: 1, consumption: 300, unit: "litre" },
    { emission_category: "Petrol", entries: 1, total_emission: 3, consumption: 100, unit: "litre" },
  ];

  it("orders by the chosen figure with shares", () => {
    expect(breakdownRows(groups, "emissions").map((r) => [r.label, r.share])).toEqual([["Petrol", 75], ["Diesel", 25]]);
    expect(breakdownRows(groups, "consumption").map((r) => [r.label, r.value, r.unit, r.share])).toEqual([
      ["Diesel", 300, "litre", 75],
      ["Petrol", 100, "litre", 25],
    ]);
  });

  it("gives no consumption shares across different units", () => {
    const mixed = [{ ...groups[0], unit: "kg" }, groups[1]];
    expect(breakdownRows(mixed, "consumption").map((r) => r.share)).toEqual([null, null]);
  });
});
