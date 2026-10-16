import { describe, expect, it } from "vitest";
import type { Scope3Report, Scope3ReportRow } from "../../lib/scope3/report";
import { datasetText, dqWord, gwpText, methodMixText, rowLabel } from "../../lib/scope3/report";
import { coverageSentence, sbtiScope3Applies, scope3CoverageSet } from "../../lib/scope3/sbti";
import type { GhgCategoryNumber } from "../../lib/scope3/contracts";
import { type ReportFigures, dominantScope, exportSheets, findings, scope3Params, scope3Sheets } from "./logic";

const NAMES = [
  "Purchased goods and services",
  "Capital goods",
  "Fuel- and energy-related activities",
  "Upstream transportation and distribution",
  "Waste generated in operations",
  "Business travel",
  "Employee commuting",
  "Upstream leased assets",
  "Downstream transportation and distribution",
  "Processing of sold products",
  "Use of sold products",
  "End-of-life treatment of sold products",
  "Downstream leased assets",
  "Franchises",
  "Investments",
];

const blank = (n: GhgCategoryNumber | null): Scope3ReportRow => ({
  n,
  name: n === null ? "Unmapped" : NAMES[n - 1],
  direction: n === null ? null : n <= 8 ? "upstream" : "downstream",
  status: n === null ? null : "screening",
  reason: null,
  method_note: null,
  tco2e: 0,
  share_pct: 0,
  methods: {},
  primary_pct: 0,
  value_chain_pct: 0,
  proxy_pct: 0,
  dq: { overall: null, good_pct: 0, fair_pct: 0, poor_pct: 0 },
  datasets: [],
  gwp_sets: [],
  biogenic_tco2e: null,
  mapped_categories: [],
});

function report(over: Partial<Record<number | "u", Partial<Scope3ReportRow>>> = {}): Scope3Report {
  const rows = [...Array.from({ length: 15 }, (_, i) => blank((i + 1) as GhgCategoryNumber)), blank(null)].map((r) => ({
    ...r,
    ...(over[r.n ?? "u"] ?? {}),
  }));
  const total = rows.reduce((a, r) => a + r.tco2e, 0);
  return {
    company_id: 1,
    consolidation_approach: "equity_share",
    period: { label: "CY2025", year: 2025, year_type: "CY" },
    total_tco2e: total,
    gwp_sets: ["AR6"],
    tracked: { method: true, dq: true, data_type: true, proxy: false, biogenic: false, gases: false, total_kgco2e: false },
    rows,
  };
}

const sample = report({
  1: {
    status: "included",
    tco2e: 60,
    share_pct: 60,
    methods: { supplier_specific: 70, spend_based: 30 },
    value_chain_pct: 70,
    primary_pct: 70,
    dq: { overall: 1.6, good_pct: 40, fair_pct: 60, poor_pct: 0 },
    datasets: [{ dataset: "USEEIO", version: "v2", factor_type: "eeio_spend" }],
    gwp_sets: ["AR6"],
    method_note: "Spend for services",
    mapped_categories: [{ category_id: 3, name: "Steel" }],
  },
  4: { status: "included", tco2e: 11, share_pct: 11 },
  9: { status: "excluded", reason: "Customers collect at the gate" },
  11: { status: "included", tco2e: 20, share_pct: 20 },
  13: { status: "not_relevant", reason: "No leased-out assets" },
  u: { tco2e: 9, share_pct: 9, mapped_categories: [{ category_id: 9, name: "Misc" }] },
});

describe("Scope 3 labels (src/lib/scope3/report)", () => {
  it("words, mixes and datasets", () => {
    expect(dqWord(1.4)).toBe("Good");
    expect(dqWord(2)).toBe("Fair");
    expect(dqWord(2.6)).toBe("Poor");
    expect(dqWord(null)).toBeNull();
    const cat1 = sample.rows[0];
    expect(methodMixText(cat1)).toBe("Supplier's own figure 70%, From the amount spent 30%");
    expect(methodMixText({ ...cat1, methods: { unknown: 100 } })).toBe("Not recorded 100%");
    expect(datasetText(cat1)).toBe("USEEIO v2 (spend (eeio))");
    expect(datasetText(blank(2))).toBe("Factor dataset not recorded");
    expect(gwpText(["AR5", "AR6"])).toBe("AR5 and AR6");
    expect(gwpText([])).toBeNull();
    expect(rowLabel(cat1)).toBe("Category 1 · Purchased goods and services");
    expect(rowLabel(sample.rows[15])).toBe("Unmapped");
  });
});

describe("scope3CoverageSet (SBTi 67 %)", () => {
  it("picks the fewest categories, largest first, and reports their share", () => {
    const set = scope3CoverageSet([
      { n: 1, tco2e: 50 },
      { n: 4, tco2e: 11 },
      { n: 11, tco2e: 10 },
      { n: 6, tco2e: 29 },
    ]);
    expect(set).toEqual({ categories: [1, 6], coverage_pct: 79, reached: true });
    const three = scope3CoverageSet([
      { n: 1, tco2e: 40 },
      { n: 4, tco2e: 16 },
      { n: 11, tco2e: 15 },
      { n: 6, tco2e: 10 },
      { n: 7, tco2e: 10 },
      { n: 5, tco2e: 9 },
    ]);
    expect(three.categories).toEqual([1, 4, 11]);
    expect(coverageSentence(three)).toBe("Categories 1, 4 and 11 cover 71 %.");
  });
  it("Unmapped counts in the total but can't be picked", () => {
    const set = scope3CoverageSet([
      { n: 1, tco2e: 30 },
      { n: null, tco2e: 70 },
    ]);
    expect(set).toEqual({ categories: [1], coverage_pct: 30, reached: false });
    expect(coverageSentence(set)).toMatch(/map the Unmapped entries/);
    expect(scope3CoverageSet([])).toEqual({ categories: [], coverage_pct: 0, reached: false });
  });
  it("applies when Scope 3 is at least 40 % of the total", () => {
    expect(sbtiScope3Applies(40, 100)).toBe(true);
    expect(sbtiScope3Applies(39.9, 100)).toBe(false);
    expect(sbtiScope3Applies(0, 0)).toBe(false);
  });
});

const figures = (s1: number, s2: number, s3: number): ReportFigures => ({
  year: 2025,
  compareYear: 2024,
  selected: { "Scope 1": s1, "Scope 2": s2, "Scope 3": s3, total: s1 + s2 + s3 },
  previous: { "Scope 1": 0, "Scope 2": 0, "Scope 3": 0, total: 0 },
  yoy: null,
  renewable: 0,
  coverage: { percent: 100, withData: 1, selected: 1, missing: [] },
  largestSource: null,
  empty: false,
});

describe("Findings can name Scope 3 (includes the S3-4 fix)", () => {
  it("the largest of the three scopes dominates; ties keep the old order", () => {
    expect(dominantScope(figures(10, 20, 70))).toEqual({ scope: "Scope 3", value: 70 });
    expect(findings(figures(10, 20, 70), [], "CY 2025", "CY 2024")).toContain(
      "Scope 3 (value chain) dominates the footprint at 70.0%, indicating the highest-leverage reduction pathway.",
    );
    expect(dominantScope(figures(40, 40, 40)).scope).toBe("Scope 2");
    expect(dominantScope(figures(50, 20, 30)).scope).toBe("Scope 1");
  });
});

describe("Scope 3 XLSX sheets", () => {
  it("one row per category plus Unmapped and the total, with reasons and Not tracked", () => {
    const [byCat, method] = scope3Sheets(sample);
    expect(byCat.name).toBe("Scope 3 by category");
    expect(byCat.rows[0][0]).toBe("Category");
    const body = byCat.rows.slice(1, 17);
    expect(body).toHaveLength(16);
    expect(body[0]).toEqual([
      "Category 1 · Purchased goods and services",
      "Included",
      "",
      60,
      60,
      "Supplier's own figure 70%, From the amount spent 30%",
      70,
      70,
      1.6,
      "Not tracked",
      "Steel",
    ]);
    expect(body[8][2]).toBe("Customers collect at the gate");
    expect(body[15][0]).toBe("Unmapped");
    expect(body[15][1]).toBe("Needs a category");
    expect(byCat.rows[17][0]).toBe("Total Scope 3");
    expect(byCat.rows[17][3]).toBe(100);
    expect(String(byCat.rows[19][0])).toMatch(/excluding biogenic CO₂/);

    expect(method.name).toBe("Scope 3 methodology");
    expect(method.rows[0]).toEqual(["Organisational boundary", "Equity share approach"]);
    expect(method.rows[1]).toEqual(["GWP values", "IPCC AR6, 100-year"]);
    const cat1 = method.rows.find((r) => r[0] === "Category 1 · Purchased goods and services");
    expect(cat1?.[5]).toBe("Spend for services");
  });
  it("hides Not recorded fields behind the tracked flags", () => {
    const r = { ...sample, tracked: { ...sample.tracked, method: false, data_type: false } };
    const row = scope3Sheets(r)[0].rows[1];
    expect(row[5]).toBe("Not recorded");
    expect(row[6]).toBe("Not recorded");
    expect(row[7]).toBe("Not recorded");
  });
  it("exportSheets adds both Scope 3 sheets before Findings when given the report", () => {
    const args = {
      figures: figures(1, 1, 1),
      categories: [],
      locations: [],
      details: null,
      findings: [],
      actions: [],
      prevLabel: "CY 2024",
      selLabel: "CY 2025",
    };
    expect(exportSheets(args).map((s) => s.name)).not.toContain("Scope 3 by category");
    const names = exportSheets({ ...args, scope3: sample }).map((s) => s.name);
    expect(names.slice(-3)).toEqual(["Scope 3 by category", "Scope 3 methodology", "Findings"]);
  });
  it("the Scope 3 query is the PDF query without download", () => {
    const q = { siteIds: [1, 2], categoryIds: [], period: { yearType: "CY" as const, year: 2025, frequency: "yearly" as const } };
    const p = scope3Params(q as never);
    expect(p.download).toBeUndefined();
    expect(p.siteIds).toBe("1,2");
    expect(p.year).toBe("2025");
  });
});
