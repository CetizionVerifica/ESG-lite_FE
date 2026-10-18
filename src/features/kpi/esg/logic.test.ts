import { describe, expect, it } from "vitest";
import type { KpiEsgPillar, KpiEsgTrend } from "../../../lib/kpi/contracts";
import { approvedText, changeWords, coverageChangeWords, filterNote, heatStep, kpiState, leftText, moverWords, noHeadlinesText, pillarsShown, topicHover, topicRows, trendsByPillar, yRange } from "./logic";

const pillar = (p: Partial<KpiEsgPillar> & Pick<KpiEsgPillar, "pillar">): KpiEsgPillar => ({
  label: p.pillar,
  kpis: 0,
  approved: 0,
  pending: 0,
  missing: 0,
  not_due: 0,
  coverage_pct: null,
  change: { approved_pct_vs_last_year: null },
  topics: [],
  ...p,
});

describe("ESG dashboard words", () => {
  it("words a pillar card", () => {
    expect(approvedText({ approved: 34, kpis: 40, not_due: 0 })).toBe("34 of 40 KPIs approved");
    expect(approvedText({ approved: 12, kpis: 18, not_due: 1 })).toBe("12 of 17 KPIs approved");
    expect(leftText({ missing: 2, pending: 3, not_due: 1, kpis: 18, approved: 12 })).toBe("2 missing · 3 pending · 1 not due yet");
    expect(leftText({ missing: 0, pending: 0, not_due: 0, kpis: 3, approved: 3 })).toBe("All approved");
    expect(leftText({ missing: 0, pending: 0, not_due: 0, kpis: 0, approved: 0 })).toBe("Choose some in KPI setup");
    expect(approvedText({ approved: 0, kpis: 0, not_due: 0 })).toBe("No KPIs yet");
    // Midal 2025: Social at 0 %.
    expect(approvedText({ approved: 0, kpis: 6, not_due: 0 })).toBe("0 of 6 KPIs approved");
    expect(leftText({ missing: 6, pending: 0, not_due: 0, kpis: 6, approved: 0 })).toBe("6 missing");
  });

  it("says better or worse with an arrow and a word, from the good direction", () => {
    expect(changeWords(-7.04, "down", "2025")).toMatchObject({ arrow: "down", amount: "−7 %", word: "Better", tone: "good", sentence: "Down 7 % on 2025: better." });
    expect(changeWords(4.5, "down", "2025")).toMatchObject({ arrow: "up", amount: "+4.5 %", word: "Worse", tone: "bad" });
    expect(changeWords(12, "up", "2025")).toMatchObject({ word: "Better", tone: "good" });
    expect(changeWords(3.8, null, "2025")).toMatchObject({ arrow: "up", word: null, tone: "neutral", sentence: "Up 3.8 % on 2025." });
    expect(changeWords(0, "down", "2025")).toMatchObject({ arrow: "flat", word: null, amount: "±0 %" });
    expect(changeWords(null, "down", "2025")).toBeNull();
  });

  it("reads a pillar's coverage change in percentage points", () => {
    expect(coverageChangeWords(26)).toMatchObject({ amount: "+26 pp on last year", word: "Better", sentence: "26 percentage points more covered than last year." });
    expect(coverageChangeWords(-1)).toMatchObject({ amount: "−1 pp on last year", word: "Worse", sentence: "1 percentage point less covered than last year." });
    expect(coverageChangeWords(0)).toMatchObject({ word: null, sentence: "Same coverage as last year." });
    expect(coverageChangeWords(null)).toBeNull();
  });

  it("words movers from the server's good, and keeps an unknown direction neutral (not bad)", () => {
    expect(moverWords({ name: "Energy", change_pct: -28.6, direction_good: "down", good: true }, "2025")).toMatchObject({ word: "Better", tone: "good", sentence: "Energy: Down 28.6 % on 2025: better." });
    expect(moverWords({ name: "Waste", change_pct: 12, direction_good: "down", good: false }, "2025")).toMatchObject({ word: "Worse", tone: "bad" });
    expect(moverWords({ name: "Employees", change_pct: 3.8, direction_good: null, good: false }, "2025")).toMatchObject({ word: null, tone: "neutral", sentence: "Employees: Up 3.8 % on 2025." });
  });

  it("words a topic bar's hover", () => {
    expect(topicHover({ label: "Water", approved: 5, kpis: 6, missing: 1, pending: 0 })).toBe("Water · 5 of 6 approved · 1 missing");
    expect(topicHover({ label: "Energy", approved: 2, kpis: 4, missing: 1, pending: 1 })).toBe("Energy · 2 of 4 approved · 1 missing · 1 pending");
  });

  it("puts coverage in five heat steps; null is nothing expected", () => {
    expect([0, 19, 20, 59, 60, 79.9, 80, 100].map(heatStep)).toEqual([1, 1, 2, 3, 4, 4, 5, 5]);
    expect(heatStep(null)).toBeNull();
  });

  it("groups trends by pillar in E, S, G order and follows the pillar filter", () => {
    const t = (code: string, p: KpiEsgTrend["pillar"]) => ({ code, pillar: p }) as KpiEsgTrend;
    const trends = [t("BOARD", "governance"), t("GHG", "environment"), t("LTIFR", "social"), t("WATER", "environment")];
    // Governance with no headlines still gets its group (and an empty state).
    expect(trendsByPillar(trends.slice(1), null).map((g) => [g.pillar, g.trends.length])).toEqual([
      ["environment", 2],
      ["social", 1],
      ["governance", 0],
    ]);
    expect(noHeadlinesText("governance")).toBe("No governance KPIs tracked yet.");
    expect(trendsByPillar(trends, null).map((g) => [g.pillar, g.trends.map((x) => x.code)])).toEqual([
      ["environment", ["GHG", "WATER"]],
      ["social", ["LTIFR"]],
      ["governance", ["BOARD"]],
    ]);
    expect(trendsByPillar(trends, "social").map((g) => g.pillar)).toEqual(["social"]);
    expect(filterNote("social")).toBe("Showing Social only");
    expect(filterNote(null)).toBeNull();
  });

  it("finds a topic in every pillar it appears in", () => {
    const topic = { kpis: 1, approved: 1, pending: 0, missing: 0, coverage_pct: 100 };
    const pillars = [
      pillar({ pillar: "social", topics: [{ topic: "diversity", label: "Diversity", ...topic, kpis: 3 }] }),
      pillar({ pillar: "governance", topics: [{ topic: "diversity", label: "Diversity", ...topic }] }),
    ];
    expect(topicRows(pillars, "diversity").map((r) => [r.pillar, r.kpis])).toEqual([
      ["social", 3],
      ["governance", 1],
    ]);
    expect(pillarsShown(pillars, "governance").map((p) => p.pillar)).toEqual(["governance"]);
  });

  it("gives each KPI in the drawer a state: missing, pending, approved or nothing yet", () => {
    const gaps = [
      { kpi_definition_id: 1, pending: false },
      { kpi_definition_id: 2, pending: true },
    ];
    expect(kpiState(1, { value: 5 }, gaps, new Set())).toBe("missing");
    expect(kpiState(2, undefined, gaps, new Set())).toBe("pending");
    expect(kpiState(3, { value: 5 }, gaps, new Set([3]))).toBe("pending");
    expect(kpiState(4, { value: 5 }, gaps, new Set())).toBe("approved");
    expect(kpiState(5, { value: null }, gaps, new Set())).toBe("none");
  });

  it("gives a trend chart a round y range that holds the target", () => {
    expect(yRange([498, 541, null], null)).toEqual({ min: 490, max: 550 });
    expect(yRange([0.37, 0.48], 0.35)).toEqual({ min: 0.35, max: 0.48 });
    expect(yRange([10, 25], 30)).toEqual({ min: 10, max: 30 });
    expect(yRange([null], null)).toBeNull();
  });
});
