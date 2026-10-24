import { describe, expect, it } from "vitest";
import type { KpiCoverage, KpiGap } from "../../../lib/kpi/contracts";
import { cardsByTopic, changeText, gapLink, gapsFor, missingText, periodShort, ringDash, ringDetail, ringSubtitle, yearOptions } from "./logic";

const cov = (c: Partial<KpiCoverage>): KpiCoverage => ({ framework: "GRI", version: null, required: 22, approved: 18, pending: 2, missing: 2, percent: 82, core: null, ...c });
const gap = (g: Partial<KpiGap>): KpiGap => ({ kpi_definition_id: 14, kpi_name: "Water discharged", site_id: 3, site_name: "Matola", periods_missing: ["2026-07", "2026-09"], owner_user_id: 15, owner_name: "João Mendes", link: null, frameworks: [], ...g });

describe("rings", () => {
  it("words each framework's ring", () => {
    expect(ringSubtitle(cov({ missing: 6 }))).toBe("6 gaps");
    expect(ringSubtitle(cov({ framework: "BRSR", missing: 1, core: { done: 7, total: 9 } }))).toBe("Core 7 of 9 · 1 gap");
    expect(ringSubtitle(cov({ framework: "ESRS", missing: 11, material_topics: 4 }))).toBe("4 material topics · 11 gaps");
    expect(ringDetail(cov({ excluded: 1 }))).toBe("GRI 82 percent ready: 18 approved, 2 pending, 2 missing of 22 required; 1 disclosure left out with a reason.");
  });

  it("draws the server's percent, kept inside the ring", () => {
    const { dash, circumference } = ringDash(50, 26);
    expect(dash).toBeCloseTo(circumference / 2);
    expect(ringDash(140, 26).dash).toBeCloseTo(circumference);
    expect(ringDash(Number.NaN, 26).dash).toBe(0);
  });
});

describe("gaps", () => {
  it("words the missing periods", () => {
    expect(missingText(gap({}))).toBe("Jul, Sep missing");
    expect(missingText(gap({ periods_missing: ["2026"] }))).toBe("2026 not entered");
    expect(missingText(gap({ periods_missing: ["2026-08"], pending: true }))).toBe("Aug pending review");
  });

  it("filters by a ring with the gap's frameworks, else the KPI's", () => {
    const list = [gap({ frameworks: ["GRI", "ESRS"] }), gap({ kpi_definition_id: 24, frameworks: [] })];
    const of = (id: number) => (id === 24 ? (["BRSR"] as const).slice() : []);
    expect(gapsFor(list, "BRSR", of).map((g) => g.kpi_definition_id)).toEqual([24]);
    expect(gapsFor(list, "ESRS", of)).toHaveLength(1);
    expect(gapsFor(list, null, of)).toHaveLength(2);
  });

  it("opens the server's link, else a Manager's close view", () => {
    expect(gapLink(gap({ link: "/kpi?period=2026-09" }), "Admin")).toBe("/kpi?period=2026-09");
    expect(gapLink(gap({}), "Manager")).toBe("/data/approvals?view=kpi&step=close&period=2026-09&site=3");
    expect(gapLink(gap({}), "Admin")).toBeNull();
  });
});

describe("cards", () => {
  it("words the change on last year", () => {
    expect(changeText({ change_pct: -6.6 }, 2026)).toBe("−7 % vs 2025");
    expect(changeText({ change_pct: 4 }, 2026)).toBe("+4 % vs 2025");
    expect(changeText({ change_pct: null }, 2026)).toBeNull();
  });

  it("groups by topic in order", () => {
    const card = (id: number, topic: "water" | "climate") => ({ kpi_definition_id: id, code: "", name: "", topic, source: null, unit: null, decimals: null, value: 1, previous: null, change_pct: null, series: [], target: null });
    expect(cardsByTopic([card(1, "climate"), card(2, "water"), card(3, "climate")]).map((g) => [g.label, g.cards.length])).toEqual([["Climate", 2], ["Water", 1]]);
  });

  it("labels periods and years", () => {
    expect(periodShort("2025-10")).toBe("Oct 2025");
    expect(periodShort("Q3")).toBe("Q3");
    expect(yearOptions(2026, 2026)).toEqual([2026, 2025]);
    expect(yearOptions(2024, 2026)).toEqual([2026, 2025, 2024, 2023]);
  });
});
