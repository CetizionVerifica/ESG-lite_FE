import { describe, expect, it } from "vitest";
import type { EdeReportResponse } from "../../services/reportService";
import {
  edeFigures,
  intensityGrid,
  intensitySeries,
  intensitySites,
  monthlyGrid,
  normalize,
  overallTotals,
  pdfFileName,
  periodMonths,
  reportSites,
  requestPayload,
  siteColorIndex,
} from "./logic";

const year = {
  yearType: "CY" as const,
  year: 2025,
  frequency: "yearly" as const,
};
const june = {
  yearType: "CY" as const,
  year: 2025,
  frequency: "monthly" as const,
  month: 6,
};

const sample: EdeReportResponse = normalize({
  totals: { scope1: 10, scope2: 5, scope3: 1, total: 16 },
  bySite: [
    {
      siteId: 2,
      siteName: "Hidd",
      scope1: 6,
      scope2: 4,
      scope3: 0,
      total: 10,
      pctOfTotal: 62.5,
    },
    {
      siteId: 1,
      siteName: "Askar",
      scope1: 4,
      scope2: 1,
      scope3: 1,
      total: 6,
      pctOfTotal: 37.5,
    },
  ],
  monthlyBySite: [
    { month: "2025-01", siteId: 2, siteName: "Hidd", total: 4 },
    { month: "2025-03", siteId: 2, siteName: "Hidd", total: 6 },
    { month: "2025-03", siteId: 1, siteName: "Askar", total: 6 },
  ],
  savedBySite: [
    { siteId: 1, siteName: "Askar", saved: 0.5 },
    { siteId: 2, siteName: "Hidd", saved: 0 },
  ],
  renewableKwhBySite: [{ siteId: 1, siteName: "Askar", kwh: 1200, unit: "kWh" }],
  intensityMonthly: [
    {
      month: "2025-01",
      siteName: "Hidd",
      emissions: 4,
      production: 2,
      intensity: 2,
      unit: "t",
    },
    {
      month: "2025-03",
      siteName: "Hidd",
      emissions: 6,
      production: 0,
      intensity: 0,
      unit: "unit",
    },
  ],
});

describe("requestPayload", () => {
  it("asks for a calendar year", () => {
    expect(requestPayload({ siteIds: [1], categoryIds: [], period: year })).toEqual({ siteIds: [1], frequency: "yearly", year: 2025 });
  });
  it("asks for one month with categories", () => {
    expect(requestPayload({ siteIds: [1, 2], categoryIds: [7], period: june })).toEqual({
      siteIds: [1, 2],
      frequency: "monthly",
      year: 2025,
      month: 6,
      categoryIds: [7],
    });
  });
});

describe("figures", () => {
  it("sums renewables and savings across sites", () => {
    const f = edeFigures(sample);
    expect(f).toMatchObject({
      total: 16,
      scope1: 10,
      renewableKwh: 1200,
      saved: 0.5,
      empty: false,
    });
  });
  it("is empty when nothing came back", () => {
    expect(edeFigures(normalize({})).empty).toBe(true);
  });
  it("lists the PDF's overall totals", () => {
    expect(overallTotals(edeFigures(sample)).map((r) => r.value)).toEqual([10, 5, 1, 16, 1200, 0.5]);
  });
});

describe("sites and colours", () => {
  it("orders sites by name so colours don't depend on which chart lists them first", () => {
    const sites = reportSites(sample);
    expect(sites.map((s) => s.siteName)).toEqual(["Askar", "Hidd"]);
    expect([...siteColorIndex(sites)]).toEqual([
      [1, 0],
      [2, 1],
    ]);
  });
  it("wraps the palette after 8 sites", () => {
    const sites = Array.from({ length: 9 }, (_, i) => ({
      siteId: i,
      siteName: `S${i}`,
    }));
    expect(siteColorIndex(sites).get(8)).toBe(0);
  });
});

describe("months", () => {
  it("covers every month of a year, and only the month asked for", () => {
    expect(periodMonths(year)).toHaveLength(12);
    expect(periodMonths(june)).toEqual(["2025-06"]);
  });
  it("fills months with no data with zero", () => {
    const g = monthlyGrid(sample, year, reportSites(sample));
    const hidd = g.series.find((s) => s.siteName === "Hidd")!;
    expect(hidd.values.slice(0, 4)).toEqual([4, 0, 6, 0]);
  });
  it("leaves intensity blank when the month has no production", () => {
    const s = intensitySeries(sample, year, { siteId: 2, siteName: "Hidd" });
    expect(s.unit).toBe("t");
    expect(s.intensity.slice(0, 3)).toEqual([2, null, null]);
    expect(s.emissions.slice(0, 3)).toEqual([4, 0, 6]);
  });
});

describe("intensity sites", () => {
  const rows = (siteId: number | undefined, siteName: string, emissions: number) => ({
    month: "2025-01",
    siteId,
    siteName,
    emissions,
    production: 1,
    intensity: emissions,
    unit: "t",
  });
  it("matches rows by site id, so two sites with one name stay apart", () => {
    const d = normalize({ intensityMonthly: [rows(1, "Plant", 5), rows(2, "Plant", 9)] });
    expect(intensitySeries(d, year, { siteId: 2, siteName: "Plant" }).emissions[0]).toBe(9);
  });
  it("falls back to the name when the backend sends no id", () => {
    const d = normalize({ intensityMonthly: [rows(undefined, "Hidd", 4)] });
    expect(intensitySeries(d, year, { siteId: 7, siteName: "Hidd" }).emissions[0]).toBe(4);
  });
  it("puts sites with emissions before a renewables-only site", () => {
    const d = normalize({ intensityMonthly: [rows(1, "Askar", 0), rows(2, "Hidd", 3)] });
    const sites = [
      { siteId: 1, siteName: "Askar" },
      { siteId: 2, siteName: "Hidd" },
    ];
    expect(intensitySites(d, sites).map((s) => s.siteName)).toEqual(["Hidd", "Askar"]);
  });
});

describe("pdfFileName", () => {
  it("follows EDE_Report_{company}_{period}.pdf", () => {
    expect(pdfFileName("Midal Cables W.L.L.", year)).toBe("EDE_Report_Midal_Cables_W_L_L_CY_2025.pdf");
    expect(pdfFileName(undefined, june)).toBe("EDE_Report_Company_June_2025.pdf");
  });
});

describe("intensityGrid", () => {
  const row = (siteId: number, siteName: string, month: string, production: number, unit: string) => ({
    month,
    siteId,
    siteName,
    emissions: 2,
    production,
    intensity: production > 0 ? 2 / production : 0,
    unit,
  });
  const sites = [
    { siteId: 1, siteName: "Askar" },
    { siteId: 2, siteName: "Hidd" },
    { siteId: 3, siteName: "Sitra" },
  ];
  it("groups sites by production unit, so each chart's axis has one unit", () => {
    const d = normalize({
      intensityMonthly: [row(1, "Askar", "2025-01", 4, "t"), row(2, "Hidd", "2025-03", 8, "km"), row(3, "Sitra", "2025-01", 2, "t")],
    });
    const g = intensityGrid(d, year, sites);
    expect(g.groups.map((x) => [x.unit, x.rows.map((r) => r.site.siteName)])).toEqual([
      ["t", ["Askar", "Sitra"]],
      ["km", ["Hidd"]],
    ]);
    expect(g.months).toHaveLength(12);
    const hidd = g.groups[1].rows[0].values;
    expect(hidd[2]).toBe(0.25);
    expect(hidd[0]).toBeNull();
  });
  it("leaves out sites without production", () => {
    const d = normalize({ intensityMonthly: [row(1, "Askar", "2025-01", 0, "t"), row(2, "Hidd", "2025-01", 5, "t")] });
    expect(intensityGrid(d, year, sites).groups.flatMap((x) => x.rows.map((r) => r.site.siteName))).toEqual(["Hidd"]);
  });
});
