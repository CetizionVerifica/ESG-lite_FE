import { describe, expect, it } from "vitest";
import type { GhgDetailsRow, GhgReportTablesResponse, OverviewRow } from "../../services/ghgreportService";
import {
  categoryOptions,
  exportSheets,
  fileStem,
  pdfParams,
  findings,
  recommendedActions,
  scopeDetails,
  scopeDistribution,
  clientSites,
  locationRows,
  readPeriod,
  reportFigures,
  requestPayload,
  shortPeriodLabel,
  switchCalendar,
  topCategories,
  withFrequency,
  writePeriod,
  yearOptions,
} from "./logic";

const row = (scope: string, category: string, bySite: [number, string, number][]): OverviewRow => ({
  scope,
  category,
  bySite: bySite.map(([siteId, siteName, value]) => ({ siteId, siteName, value })),
  total: bySite.reduce((a, [, , v]) => a + v, 0),
});

function tables(selected: OverviewRow[], compare: OverviewRow[]): GhgReportTablesResponse {
  const totals = (rows: OverviewRow[]) => {
    const t = { scope1: 0, scope2: 0, scope3: 0, total: 0 };
    for (const r of rows) {
      const k = ({ "Scope 1": "scope1", "Scope 2": "scope2", "Scope 3": "scope3" } as const)[r.scope as "Scope 1"];
      if (!k) continue;
      t[k] += r.total;
      t.total += r.total;
    }
    return t;
  };
  return {
    filters: { siteIds: [1, 2, 3], categoryIds: null, yearType: "CY", year: 2025, compareYear: 2024 },
    ranges: {},
    totals: { "2025": totals(selected), "2024": totals(compare) },
    tables: {
      table1_emissionsByScope_twoYears: [],
      table_overviewByLocations_selectedYear: { year: 2025, rows: selected },
      table_overviewByLocations_compareYear: { year: 2024, rows: compare },
    },
  };
}

const sites = [
  { site_id: 1, name: "Hidd" },
  { site_id: 2, name: "Sitra" },
  { site_id: 3, name: "Askar" },
];

const data = tables(
  [
    row("Scope 1", "Diesel", [[1, "Hidd", 30]]),
    row("Scope 2", "Electricity", [[1, "Hidd", 50], [2, "Sitra", 20]]),
    row("", "Renewable Electricity", [[2, "Sitra", 5]]),
  ],
  [row("Scope 1", "Diesel", [[1, "Hidd", 40]]), row("Scope 2", "Electricity", [[1, "Hidd", 60]])],
);

describe("period in the URL", () => {
  const now = new Date(2025, 4, 15);

  it("defaults to the calendar year containing today", () => {
    expect(readPeriod(new URLSearchParams(), now)).toEqual({ yearType: "CY", year: 2025, frequency: "yearly" });
  });

  it("reads FY months and quarters, falling back to the start of the year", () => {
    expect(readPeriod(new URLSearchParams("cal=FY&freq=month"), now, 4)).toEqual({ yearType: "FY", year: 2026, frequency: "monthly", month: 4 });
    expect(readPeriod(new URLSearchParams("cal=FY&freq=quarter&year=2025&quarter=9"), now, 4)).toEqual({ yearType: "FY", year: 2025, frequency: "quarterly", quarter: 1 });
    expect(readPeriod(new URLSearchParams("freq=month&month=6&year=2023"), now)).toEqual({ yearType: "CY", year: 2023, frequency: "monthly", month: 6 });
  });

  it("round-trips and keeps other params", () => {
    const p = { yearType: "FY" as const, year: 2025, frequency: "quarterly" as const, quarter: 3 };
    const params = writePeriod(new URLSearchParams("site=1&month=4"), p);
    expect(params.get("site")).toBe("1");
    expect(params.has("month")).toBe(false);
    expect(readPeriod(params, now)).toEqual(p);
  });

  it("goes back to the start of the year on a calendar switch", () => {
    expect(switchCalendar({ yearType: "CY", year: 2025, frequency: "monthly", month: 7 }, "FY", 4)).toEqual({ yearType: "FY", year: 2025, frequency: "monthly", month: 4 });
    expect(withFrequency({ yearType: "CY", year: 2025, frequency: "yearly" }, "quarterly")).toEqual({ yearType: "CY", year: 2025, frequency: "quarterly", quarter: 1 });
  });

  it("lists ten years and keeps an older one from a link", () => {
    const years = yearOptions("FY", now, 4, 2010);
    expect(years[0]).toEqual({ value: 2026, label: "FY 2025-26" });
    expect(years).toHaveLength(11);
    expect(years[years.length - 1].value).toBe(2010);
  });

  it("labels columns briefly", () => {
    expect(shortPeriodLabel({ yearType: "FY", year: 2025, frequency: "quarterly", quarter: 2 }, 4)).toBe("Q2 FY 2024-25");
    expect(shortPeriodLabel({ yearType: "CY", year: 2025, frequency: "monthly", month: 6 })).toBe("June 2025");
  });
});

describe("request", () => {
  it("sends only the period field the frequency needs, and categories when picked", () => {
    expect(requestPayload({ siteIds: [1], categoryIds: [], period: { yearType: "CY", year: 2025, frequency: "monthly", month: 6, quarter: 2 } })).toEqual({
      siteIds: [1],
      yearType: "CY",
      year: 2025,
      frequency: "monthly",
      month: 6,
    });
    expect(requestPayload({ siteIds: [1, 2], categoryIds: [10], period: { yearType: "FY", year: 2025, frequency: "yearly" } })).toEqual({
      siteIds: [1, 2],
      yearType: "FY",
      year: 2025,
      frequency: "yearly",
      categoryIds: [10],
    });
  });
});

describe("sites and categories", () => {
  const list = [
    { site_id: 1, name: "Hidd", company: { company_id: 7, name: "Midal" }, categories: [{ category_id: 10, category_name: "Diesel" }] },
    { site_id: 2, name: "Sitra", company: { company_id: 7, name: "Midal" }, categories: [{ category_id: 20, category_name: "Electricity" }, { category_id: 10, category_name: "Diesel" }] },
    { site_id: 3, name: "Other", company: { company_id: 8, name: "Else" }, categories: [] },
  ];

  it("offers the chosen sites' categories once each", () => {
    expect(categoryOptions(list, [])).toEqual([{ value: 10, label: "Diesel" }, { value: 20, label: "Electricity" }]);
    expect(categoryOptions(list, [1])).toEqual([{ value: 10, label: "Diesel" }]);
  });

  it("keeps the picked client's sites", () => {
    expect(clientSites(list, 7).map((s) => s.site_id)).toEqual([1, 2]);
    expect(clientSites(list, null)).toEqual([]);
  });
});

describe("figures", () => {
  const f = reportFigures(data, sites);

  it("totals the scopes and compares with last year", () => {
    expect(f.selected).toEqual({ "Scope 1": 30, "Scope 2": 70, "Scope 3": 0, total: 100 });
    expect(f.previous.total).toBe(100);
    expect(f.yoy).toBe(0);
  });

  it("keeps renewables out of the totals and reports them as saved", () => {
    expect(f.renewable).toBe(5);
  });

  it("counts coverage against the sites asked for, using Scope 1–3 rows", () => {
    // Sitra has Scope 2 data; Askar has none.
    expect(f.coverage).toEqual({ percent: 67, withData: 2, selected: 3, missing: ["Askar"] });
  });

  it("names the largest source with its share", () => {
    expect(f.largestSource).toEqual({ name: "Electricity", value: 70, share: 70 });
  });

  it("has no YoY when last year is empty, and is empty with no rows", () => {
    const g = reportFigures(tables([], []), sites);
    expect(g.yoy).toBeNull();
    expect(g.empty).toBe(true);
    expect(g.largestSource).toBeNull();
  });
});

describe("review fixes", () => {
  it("counts only scope-less renewables as saved", () => {
    const d = tables([row("Scope 3", "Solar panels purchased", [[1, "Hidd", 7]]), row("", "Renewable Electricity", [[1, "Hidd", 2]])], []);
    expect(reportFigures(d, sites).renewable).toBe(2);
  });

  it("merges categories that differ only in case", () => {
    const d = tables([row("Scope 1", "Natural Gas", [[1, "Hidd", 5]]), row("Scope 1", "natural gas", [[2, "Sitra", 4]])], [row("Scope 1", "NATURAL GAS", [[1, "Hidd", 3]])]);
    expect(topCategories(d)).toEqual([{ category: "Natural Gas", scope: "Scope 1", previous: 3, selected: 9, change: 200 }]);
    expect(reportFigures(d, sites).largestSource).toEqual({ name: "Natural Gas", value: 9, share: 100 });
  });
});

describe("tables", () => {
  it("lists categories largest first with the change", () => {
    expect(topCategories(data)).toEqual([
      { category: "Electricity", scope: "Scope 2", previous: 60, selected: 70, change: (10 / 60) * 100 },
      { category: "Diesel", scope: "Scope 1", previous: 40, selected: 30, change: -25 },
    ]);
  });

  it("splits each site by scope for both years, including sites without data", () => {
    const rows = locationRows(data, sites);
    expect(rows.map((r) => r.site)).toEqual(["Hidd", "Sitra", "Askar"]);
    expect(rows[0].selected).toEqual({ "Scope 1": 30, "Scope 2": 50, "Scope 3": 0, total: 80 });
    expect(rows[0].previous.total).toBe(100);
    expect(rows[1].selected.total).toBe(20);
    expect(rows[2].selected.total).toBe(0);
  });
});

const detail = (scope: string, categoryName: string, siteName: string, prev: number, sel: number, fuelType = ""): GhgDetailsRow => ({
  scope,
  categoryId: categoryName.length,
  categoryName,
  fuelType,
  siteId: siteName.length,
  siteName,
  compare: { consumption: prev * 10, unit: "L", emissions: prev },
  selected: { consumption: sel * 10, unit: "L", emissions: sel },
});

describe("scope tabs", () => {
  const rows = [
    detail("Scope 1", "Diesel", "Hidd", 40, 30, "Diesel"),
    detail("Scope 1", "LPG", "Sitra", 0, 10, "LPG"),
    detail("Scope 1", "Diesel", "Sitra", 10, 0, "Diesel"),
    detail("Scope 2", "Electricity", "Hidd", 85, 70),
  ];

  it("keeps one scope's rows, largest this period first", () => {
    expect(scopeDetails(rows, "Scope 1").map((r) => `${r.categoryName}/${r.siteName}`)).toEqual(["Diesel/Hidd", "LPG/Sitra", "Diesel/Sitra"]);
    expect(scopeDetails(rows, "Scope 3")).toEqual([]);
  });

  it("gives each category's share of the scope in both periods", () => {
    expect(scopeDistribution(rows, "Scope 1")).toEqual([
      { category: "Diesel", previous: 50, selected: 30, previousPct: 100, selectedPct: 75 },
      { category: "LPG", previous: 0, selected: 10, previousPct: 0, selectedPct: 25 },
    ]);
  });
});

describe("findings", () => {
  const f = reportFigures(data, sites);

  it("follows the PDF's four rules", () => {
    expect(findings(f, locationRows(data, sites), "CY 2025", "CY 2024")).toEqual([
      "Total CY 2025 emissions were 100 tCO₂e (up 0.0% vs CY 2024).",
      "Hidd is the largest contributing site at 80 tCO₂e (80.0% of total).",
      "Scope 2 (purchased energy) dominates the footprint at 70.0%, indicating the highest-leverage reduction pathway.",
      "Electricity is the single largest emission source (70.0%).",
    ]);
  });

  it("drops actions the data already meets", () => {
    // Askar has no data; renewables are recorded.
    expect(recommendedActions(f)).toHaveLength(3);
    expect(recommendedActions(f)[0]).toMatch(/^Close data gaps/);
    expect(recommendedActions({ ...f, renewable: 0, coverage: { ...f.coverage, missing: [] } })).toEqual([
      "Prioritise Scope 2 reduction through renewable electricity procurement or on-site generation.",
      "Set a validated, science-based reduction target aligned to a 1.5 °C pathway.",
      "Begin capturing renewable-energy consumption to quantify avoided emissions.",
    ]);
  });
});

describe("downloads", () => {
  it("asks for the PDF with the same filters and no token", () => {
    const params = pdfParams({ siteIds: [1, 2], categoryIds: [10], period: { yearType: "FY", year: 2025, frequency: "quarterly", quarter: 2 } });
    expect(params).toEqual({ siteIds: "1,2", categoryIds: "10", yearType: "FY", year: "2025", frequency: "quarterly", quarter: "2", download: "1" });
    expect(Object.keys(params)).not.toContain("token");
  });

  it("names files after the period", () => {
    expect(fileStem("Q2 FY 2024-25 (Jul–Sep 2024)")).toBe("ghg-report-q2-fy-2024-25-jul-sep-2024");
  });

  it("exports each table as a sheet, details only once loaded", () => {
    const f = reportFigures(data, sites);
    const args = { figures: f, categories: topCategories(data), locations: locationRows(data, sites), prevLabel: "CY 2024", selLabel: "CY 2025" };
    const sheets = exportSheets({ ...args, details: null });
    expect(sheets.map((x) => x.name)).toEqual(["Table 1 by scope", "Top categories", "By location"]);
    expect(sheets[0].rows[2]).toEqual(["Scope 2", 60, 60, 70, 70]);
    expect(sheets[2].rows[1]).toEqual(["Hidd", 40, 30, 60, 50, 0, 0, 100, 80]);
    expect(exportSheets({ ...args, details: [] }).map((x) => x.name)).toContain("Scope details");
  });
});
