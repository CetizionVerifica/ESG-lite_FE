import { describe, expect, it } from "vitest";
import { readDashboard, readEsg, readReport } from "./kpiService";

describe("readDashboard", () => {
  it("reads the KPI-10 spec shape", () => {
    const d = readDashboard(
      {
        year: 2026,
        coverage: [{ framework: "brsr", version: "BRSR 2023", required: 14, approved: 10, pending: 2, missing: 2, percent: 74, core: { done: 7, total: 9 } }],
        gaps: [{ kpi: { id: 14, name: "Water discharged", frameworks: ["GRI"] }, site: { site_id: 3, name: "Matola" }, periods_missing: ["2026-09"], owner: { user_id: 15, name: "João Mendes" }, link: "/x" }],
        cards: [{ kpi: { id: 1, code: "GHG_SCOPE1", name: "Scope 1", topic: "climate", unit: "tCO₂e" }, value: 10, last_year: 12, change_pct: -16.7, series: [{ period: "2026-01", value: 1 }], target: { progress_pct: 30, status: "behind", label: "−40 % by 2030" } }],
        pending_not_in: { count: 3, value_ids: [1, 2, 3] },
      },
      2026,
    );
    expect(d.coverage[0]).toMatchObject({ framework: "BRSR", percent: 74, core: { done: 7, total: 9 }, missing: 2 });
    expect(d.gaps[0]).toMatchObject({ kpi_definition_id: 14, kpi_name: "Water discharged", site_id: 3, site_name: "Matola", owner_name: "João Mendes", link: "/x", frameworks: ["GRI"] });
    expect(d.cards[0]).toMatchObject({ kpi_definition_id: 1, name: "Scope 1", unit: "tCO₂e", previous: 12, target: { progress_pct: 30, status: "behind", label: "−40 % by 2030" } });
    expect(d.pending_not_in).toEqual({ count: 3, value_ids: [1, 2, 3], emissions: undefined });
  });

  it("reads the KPI-0 mock shape (frameworks, flat gaps, monthly)", () => {
    const d = readDashboard(
      {
        year: 2026,
        pending_count: 4,
        frameworks: [{ framework: "GRI", version: "GRI 2021+", percent: 82, gaps: 6, core: null }, { framework: "XYZ", percent: 1 }],
        cards: [{ kpi_definition_id: 5, code: "ENERGY_TOTAL", name: "Energy", topic: "energy", unit: "MWh", value: 1, previous: 2, change_pct: -50, monthly: [1, null, 3], target_progress_pct: null }],
        gaps: [{ kpi_definition_id: 15, kpi_name: "Waste", site_id: 1, site_name: "Bahrain", missing_periods: ["2026-09"], owner_user_id: 11, owner_name: "Ravi" }],
      },
      2026,
    );
    expect(d.coverage).toEqual([{ framework: "GRI", version: "GRI 2021+", required: 0, approved: 0, pending: 0, missing: 6, percent: 82, core: null, excluded: undefined, material_topics: null }]);
    expect(d.cards[0].series.map((p) => p.value)).toEqual([1, null, 3]);
    expect(d.cards[0].target).toBeNull();
    expect(d.gaps[0]).toMatchObject({ periods_missing: ["2026-09"], frameworks: [] });
    expect(d.pending_not_in.count).toBe(4);
  });
});

describe("readReport", () => {
  it("reads rows with id lists or objects, and omissions", () => {
    const r = readReport(
      {
        report: {
          framework: "GRI",
          version: "GRI 2021+",
          year: 2026,
          pending_ids: [7, 9],
          rows: [{ disclosure: { id: 104, code: "302-1", title: "Energy", section: "GRI 302" }, value: 12, display_unit: "GJ", previous_year: 10, where: "site", note: "n", kpis: [{ kpi_definition_id: 5 }], values: [{ id: 3 }, { id: 4 }] }],
          omissions: [{ disclosure_id: null, code: "E4", title: "Biodiversity", reason: "No site nearby", kind: "not_material" }],
        },
      },
      { framework: "GRI", year: 2026 },
    );
    expect(r.pending_count).toBe(2);
    expect(r.rows[0]).toMatchObject({ disclosure_id: 104, code: "302-1", unit: "GJ", previous: 10, notes: "n", kpi_definition_ids: [5], value_ids: [3, 4] });
    expect(r.omissions[0]).toMatchObject({ code: "E4", kind: "not_material" });
  });
});

describe("readEsg (wave E)", () => {
  it("reads the spec shape as it comes", () => {
    const esg = readEsg(
      {
        year: 2026,
        year_type: "CY",
        label: "2026",
        filters: { site: null, pillar: "social", topic: null },
        pillars: [{ pillar: "social", label: "Social", kpis: 10, approved: 7, pending: 1, missing: 2, not_due: 0, coverage_pct: 70, change: { approved_pct_vs_last_year: -5 }, topics: [{ topic: "training", label: "Training", kpis: 1, approved: 1, pending: 0, missing: 0, coverage_pct: 100 }] }],
        trends: [{ pillar: "social", topic: "health_safety", kpi_definition_id: 26, code: "LTIFR", name: "Lost-time injury rate", unit: null, decimals: 2, direction_good: "down", series: [{ period: "2026-01", period_start: "2026-01-01", label: "Jan 2026", value: 0.48 }], value: 0.38, previous: 0.52, change_pct: -26.9, target: { progress_pct: 82, status: "behind", label: "Below 0.35" } }],
        sites: [{ site_id: 1, name: "Bahrain plant", pillars: { environment: 80, social: 100, governance: null } }],
        movers: [{ kpi_definition_id: 26, name: "Lost-time injury rate", pillar: "social", change_pct: -26.9, direction_good: "down", good: true }],
        pending_not_in: { count: 6, link: "/data/approvals?view=kpi" },
      },
      2026,
    );
    expect(esg.filters.pillar).toBe("social");
    expect(esg.pillars[0]).toMatchObject({ pillar: "social", coverage_pct: 70, change: { approved_pct_vs_last_year: -5 } });
    expect(esg.pillars[0].topics[0]).toMatchObject({ topic: "training", coverage_pct: 100 });
    expect(esg.trends[0]).toMatchObject({ direction_good: "down", target: { status: "behind", label: "Below 0.35", value: null } });
    expect(esg.sites[0].pillars).toEqual({ environment: 80, social: 100, governance: null });
    expect(esg.movers[0].good).toBe(true);
    expect(esg.pending_not_in).toEqual({ count: 6, link: "/data/approvals?view=kpi" });
  });

  it("is tolerant: wrapped, unknown pillars dropped, labels and counts filled in, bare series numbers", () => {
    const esg = readEsg(
      {
        esg: {
          pillars: [{ pillar: "economic" }, { pillar: "environment", topics: [{ topic: "water" }, { topic: "nope" }] }],
          trends: [{ topic: "water", kpi_definition_id: 13, name: "Water withdrawn", series: [1, null, 3], direction_good: "sideways" }],
          movers: [{ kpi_definition_id: 1, name: "Energy", pillar: "environment", change_pct: -10, direction_good: "down" }, { kpi_definition_id: 2, change_pct: null }],
          pending_not_in: 3,
        },
      },
      2025,
    );
    expect(esg.year).toBe(2025);
    expect(esg.label).toBe("2025");
    expect(esg.pillars).toHaveLength(1);
    expect(esg.pillars[0]).toMatchObject({ label: "Environment", kpis: 0, coverage_pct: null, change: { approved_pct_vs_last_year: null } });
    expect(esg.pillars[0].topics.map((t) => t.label)).toEqual(["Water"]);
    expect(esg.trends[0]).toMatchObject({ pillar: "environment", direction_good: null, target: null });
    expect(esg.trends[0].series.map((p) => p.value)).toEqual([1, null, 3]);
    expect(esg.movers).toEqual([{ kpi_definition_id: 1, name: "Energy", pillar: "environment", change_pct: -10, direction_good: "down", good: true }]);
    expect(esg.pending_not_in).toEqual({ count: 3, link: null });
    expect(esg.sites).toEqual([]);
  });
});
