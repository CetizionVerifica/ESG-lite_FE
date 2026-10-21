import { describe, expect, it } from "vitest";
import { PLANETPULSE, buildTheme, chartTheme } from "../../../theme";
import { completenessData } from "../../../test/msw/insightsData";
import { cellAt, cellWords, completenessAria, completenessOption, completenessRows, heatStep, shortMonth } from "./completenessLogic";

const t = chartTheme(buildTheme(PLANETPULSE, "night", "dark"));

describe("heatStep", () => {
  it("buckets the server's % on the five-step ramp; null stays blank", () => {
    expect([0, 49.9, 50, 74, 75, 89.9, 90, 99.5, 100].map(heatStep)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4]);
    expect(heatStep(null)).toBeNull();
  });
});

describe("completenessOption", () => {
  const o = completenessOption(completenessData, t);
  const series = (o.series as { type: string; data: { value: [number, number, number]; row: number; col: number; itemStyle: { color: string }; label: { color: string } }[] }[])[0];

  it("draws only the months that are due (future months blank, not 0)", () => {
    expect(series.type).toBe("heatmap");
    // 3 sites × 9 due months; Oct–Dec are null.
    expect(series.data).toHaveLength(27);
    expect(series.data.some((d) => d.col >= 9)).toBe(false);
  });

  it("colours each cell from the heat ramp and prints the % in the matching on-heat colour", () => {
    const pune = series.data.find((d) => d.row === 1 && d.col === 8)!; // Nagpur Sep: 52
    expect(pune.value).toEqual([8, 1, 52]);
    expect(pune.itemStyle.color).toBe(t.heat[1]);
    expect(pune.label.color).toBe(t.onHeat[1]);
    const full = series.data.find((d) => d.row === 0 && d.col === 0)!;
    expect(full.itemStyle.color).toBe(t.heat[4]);
  });

  it("labels the axes with short months and the server's site names", () => {
    expect((o.xAxis as { data: string[] }).data.slice(0, 3)).toEqual(["Jan", "Feb", "Mar"]);
    expect((o.yAxis as { data: string[] }).data).toEqual(completenessData.rows.map((r) => r.site));
    expect(shortMonth("2026-09")).toBe("Sep");
  });
});

describe("completeness table, cell and words", () => {
  it("one row per site and month, server counts as 'n of m', blank months 'Not due'", () => {
    const rows = completenessRows(completenessData);
    expect(rows).toHaveLength(36);
    expect(rows[8]).toEqual({ site: completenessData.rows[0].site, month: "Sep 2026", pct: "70%", emissions: "18 of 25", kpi: null, cell: { row: 0, col: 8 } });
    expect(rows[9]).toMatchObject({ month: "Oct 2026", pct: "Not due", emissions: null });
  });

  it("finds the clicked cell and words its counts", () => {
    const hit = cellAt(completenessData, { row: 1, col: 8 })!;
    expect(hit.site_id).toBe(completenessData.rows[1].site_id);
    expect(hit.cell.month).toBe("2026-09");
    expect(cellWords(hit.cell)).toEqual({ emissions: "13 of 25 emission entries approved", kpi: null });
    expect(cellWords({ ...hit.cell, kpi_expected: 4, kpi_approved: 1 }).kpi).toBe("1 of 4 KPI values approved");
    expect(cellAt(completenessData, { row: 9, col: 0 })).toBeNull();
  });

  it("summarises in one sentence", () => {
    expect(completenessAria(completenessData)).toBe("Data completeness for 3 sites by month, Jan 2026 to Dec 2026: 11 site-months are not complete yet.");
  });
});

describe("completeness heatmap needs a visualMap (ECharts)", () => {
  it("maps the five heat steps, hidden", async () => {
    const { completenessOption: build } = await import("./completenessLogic");
    const { completenessData } = await import("../../../test/msw/insightsData");
    const { testTheme } = await import("./testTheme");
    const vm = (build(completenessData, testTheme as never) as { visualMap: { show: boolean; dimension: number; pieces: { color: string }[] } }).visualMap;
    expect(vm.show).toBe(false);
    expect(vm.dimension).toBe(2);
    expect(vm.pieces.map((p) => p.color)).toEqual(testTheme.heat);
  });
});
