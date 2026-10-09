import { describe, expect, it } from "vitest";
import type { LongTermChartResponse, NearTermTargetResponse } from "../../services/sbtiService";
import {
  baseYearOptions,
  exportSheets,
  fromNearTerm,
  fromNetZero,
  isNoBaseData,
  latestScored,
  milestonesIn,
  readSetup,
  rulesCheck,
  targetYearOf,
  writeSetup,
  yearsLeft,
} from "./logic";

const NOW = new Date(2026, 9, 9);

// Shaped like the backend's answer for S1 600 + S2 400 (+ S3 100), 4.2%/yr, 2024→2029.
function near(over: Partial<NearTermTargetResponse> = {}): NearTermTargetResponse {
  const rate = 0.042;
  const base = 1000;
  const years = [2024, 2025, 2026, 2027, 2028, 2029];
  const target = (n: number) => Number((base * (1 - rate) ** n).toFixed(3));
  return {
    heading: "Near-Term Target",
    method: "ABSOLUTE_CONTRACTION",
    annualRate: rate,
    baseYear: 2024,
    targetYear: 2029,
    horizonYears: 5,
    scope3Share: 9.09,
    scope3TargetRequired: false,
    scope1And2CoveragePct: 90.91,
    scope1And2CoverageValid: false,
    baseTotals: { scope1: 600, scope2: 400, scope3: 100, total: 1100 },
    targetBoundaryBase: base,
    tables: {
      table1: years.map((year, n) => ({
        year,
        n,
        calculation: "",
        targetEmission: target(n),
        reducedBy: n ? Number((target(n - 1) - target(n)).toFixed(3)) : null,
        reducedByPct: n ? 4.2 : null,
      })),
      table2: years.map((year, n) => ({
        year,
        n,
        scope1Target: Number((600 * (1 - rate) ** n).toFixed(3)),
        scope2Target: Number((400 * (1 - rate) ** n).toFixed(3)),
        scope3Target: null,
        totalTarget: target(n),
        reducedBy: null,
        reducedByPct: null,
      })),
      table3: [
        { year: 2024, actualScope1: 600, actualScope2: 400, actualScope3: null, actualTotal: 1000, targetTotal: 1000, variance: 0, variancePct: 0, status: "Base Year" },
        { year: 2025, actualScope1: 550, actualScope2: 390, actualScope3: null, actualTotal: 940, targetTotal: 958, variance: -18, variancePct: -1.88, status: "Reached" },
        { year: 2026, actualScope1: 600, actualScope2: 380, actualScope3: null, actualTotal: 980, targetTotal: 917.764, variance: 62.236, variancePct: 6.78, status: "Not Reached" },
        { year: 2027, actualScope1: 0, actualScope2: 0, actualScope3: null, actualTotal: 0, targetTotal: 879.218, variance: 0, variancePct: null, status: "No Data" },
      ],
    },
    ...over,
  };
}

describe("setup in the URL", () => {
  it("defaults to near-term, 10 years, 1.5°C, last year as base", () => {
    expect(readSetup(new URLSearchParams(), NOW)).toEqual({ baseYear: 2025, kind: "near", horizon: 10, pathway: "15c", tab: "pathway" });
  });

  it("never takes a base year before 2015 or after this year", () => {
    expect(readSetup(new URLSearchParams("base=2014"), NOW).baseYear).toBe(2025);
    expect(readSetup(new URLSearchParams("base=2027"), NOW).baseYear).toBe(2025);
    expect(readSetup(new URLSearchParams("base=2015"), NOW).baseYear).toBe(2015);
    expect(baseYearOptions(NOW).slice(-1)[0]).toBe(2015);
    expect(baseYearOptions(NOW)[0]).toBe(2026);
  });

  it("round-trips and keeps other keys (sites)", () => {
    const p = writeSetup(new URLSearchParams("site=1,2"), { baseYear: 2020, kind: "netzero", horizon: 5, pathway: "wb2c", tab: "actual" });
    expect(p.get("site")).toBe("1,2");
    expect(readSetup(p, NOW)).toEqual({ baseYear: 2020, kind: "netzero", horizon: 5, pathway: "wb2c", tab: "actual" });
  });

  it("target year: base + horizon, or 2050", () => {
    expect(targetYearOf({ baseYear: 2020, kind: "near", horizon: 5 })).toBe(2025);
    expect(targetYearOf({ baseYear: 2020, kind: "netzero", horizon: 5 })).toBe(2050);
  });
});

describe("near-term model", () => {
  const m = fromNearTerm(near());

  it("keeps the backend's figures and rate in percent", () => {
    expect(m.annualRatePct).toBe(4.2);
    expect(m.boundaryBase).toBe(1000);
    expect(m.targetEmissions).toBe(m.pathway[5].target);
    expect(m.pathway[1].target).toBe(958);
  });

  it("total reduction is against the boundary base, not all scopes", () => {
    // 1 − 0.958^5 = 19.31%; the old page divided by 1,100 (all scopes) and showed 26.65%.
    expect(m.pathway[5].totalReductionPct).toBeCloseTo(19.31, 2);
    expect(m.scopes[5].totalReductionPct).toBeCloseTo(19.31, 2);
    expect(m.pathway[0].totalReductionPct).toBeNull();
  });

  it("no-data years have no actuals and no variance", () => {
    const row = m.actual.find((r) => r.year === 2027)!;
    expect(row).toMatchObject({ actual: null, s1: null, variance: null, status: "no-data" });
    expect(m.actual[0]).toMatchObject({ status: "base", actual: 1000, variance: null });
  });

  it("latest scored year is the last reached/not reached one", () => {
    expect(latestScored(m.actual)).toMatchObject({ year: 2026, status: "not-reached" });
    expect(latestScored(m.actual.slice(0, 1))).toBeNull();
  });
});

describe("net-zero model", () => {
  const r: LongTermChartResponse = {
    heading: "Long-Term Target",
    method: "",
    baseYear: 2025,
    targetYear: 2050,
    years: 25,
    annualRate: 0.0880682,
    baseEmissions: 1000,
    targetEmissions: 100,
    totalReductionPct: 90,
    scope3Share: 50,
    scope3TargetRequired: true,
    baseTotals: { scope1: 300, scope2: 200, scope3: 500, total: 1000 },
    rows: [
      { year: 2025, n: 0, targetEmission: 1000, scope1Target: 300, scope2Target: 200, scope3Target: 500, reducedBy: null, reducedByPct: null },
      { year: 2026, n: 1, targetEmission: 911.932, scope1Target: 273.58, scope2Target: 182.386, scope3Target: 455.966, reducedBy: 88.068, reducedByPct: 8.807 },
    ],
    actualVsTarget: [
      { year: 2025, actualScope1: 300, actualScope2: 200, actualScope3: 500, actualTotal: 1000, targetTotal: 1000, variance: 0, variancePct: 0, status: "Base Year" },
      { year: 2026, actualScope1: null, actualScope2: null, actualScope3: null, actualTotal: null, targetTotal: 911.932, variance: null, variancePct: null, status: "No Data" },
    ],
  };
  const m = fromNetZero(r);

  it("rate as percent, boundary includes Scope 3 when required", () => {
    expect(m.annualRatePct).toBe(8.81);
    expect(m.boundaryBase).toBe(1000);
    expect(m.scope12SharePct).toBe(50);
    expect(m.pathway[1].totalReductionPct).toBeCloseTo(8.81, 2);
    expect(m.scopes[1].target).toBeCloseTo(911.932, 3);
  });

  it("milestones inside the pathway", () => {
    expect(milestonesIn(m)).toEqual([2030, 2035, 2040, 2045, 2050]);
    expect(milestonesIn({ baseYear: 2025, targetYear: 2030 })).toEqual([2030]);
    expect(milestonesIn({ baseYear: 2018, targetYear: 2028 })).toEqual([]);
  });
});

describe("SBTi rules check", () => {
  it("evaluates base year, coverage, Scope 3, horizon and ambition", () => {
    const rules = rulesCheck({ model: fromNearTerm(near()), pathway: "15c", chosenSites: 2, totalSites: 2 });
    expect(rules.map((r) => [r.id, r.state])).toEqual([
      ["base-year", "ok"],
      ["coverage", "ok"],
      ["scope3", "ok"],
      ["horizon", "ok"],
      ["ambition", "ok"],
    ]);
    expect(rules[1].detail).toContain("90.9%");
  });

  it("warns when sites are left out, Scope 3 is required, or the pathway is WB2°C", () => {
    const m = fromNearTerm(near({ scope3Share: 62, scope3TargetRequired: true }));
    const rules = rulesCheck({ model: m, pathway: "wb2c", chosenSites: 1, totalSites: 3 });
    const state = Object.fromEntries(rules.map((r) => [r.id, r.state]));
    expect(state).toMatchObject({ coverage: "warn", scope3: "warn", ambition: "warn" });
    expect(rules.find((r) => r.id === "coverage")!.title).toBe("Covers Scope 1+2 of 1 of 3 sites");
    expect(rules.find((r) => r.id === "scope3")!.title).toBe("Scope 3 is 62%, so a Scope 3 target is required");
  });
});

describe("export and errors", () => {
  it("builds four sheets, Scope 3 columns only when required", () => {
    const sheets = exportSheets(fromNearTerm(near()), ["Hidd", "Sitra"], "15c");
    expect(sheets.map((s) => s.name)).toEqual(["Summary", "Pathway", "Scope-wise", "Actual vs target"]);
    expect(sheets[2].rows[0]).not.toContain("Scope 3 (tCO₂e)");
    expect(sheets[1].rows).toHaveLength(7);
    expect(sheets[0].rows).toContainEqual(["Sites", "Hidd, Sitra"]);
    expect(sheets[3].rows[4]).toEqual([2027, "", "", "", 879.218, "", "", "No data"]);
  });

  it("recognises the backend's no-base-data answer", () => {
    expect(isNoBaseData({ response: { status: 400, data: { message: "No approved emissions found for baseYear=2019." } } })).toBe(true);
    expect(isNoBaseData({ response: { status: 500, data: { message: "Internal server error" } } })).toBe(false);
    expect(isNoBaseData(null)).toBe(false);
  });

  it("years left never goes below zero", () => {
    expect(yearsLeft(2030, NOW)).toBe(4);
    expect(yearsLeft(2020, NOW)).toBe(0);
  });
});
