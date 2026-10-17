import { describe, expect, it } from "vitest";
import { readDashboard, readReport } from "./kpiService";

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
