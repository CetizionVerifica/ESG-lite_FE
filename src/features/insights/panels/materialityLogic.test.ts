import { describe, expect, it } from "vitest";
import { materialityData } from "../../../test/msw/insightsData";
import type { ChartTheme } from "../../../theme";
import {
  ACT_HERE,
  ADD_SCORES_LINK,
  BUBBLE_MAX,
  BUBBLE_MIN,
  TABLE_COLUMNS,
  ariaSentence,
  bubbleSize,
  canAddScores,
  clickedLink,
  countsText,
  inActHere,
  materialityOption,
  notScoredText,
  pointLabel,
  splitPoints,
  statusColor,
  statusesPresent,
  tableRows,
  tooltipHtml,
  tooltipLines,
  type MaterialityPoint,
} from "./materialityLogic";

const t = {
  status: { good: "good", goodSoft: "good-soft", warn: "warn", warnSoft: "warn-soft", bad: "bad", badSoft: "bad-soft", info: "info", infoSoft: "info-soft" },
  ui: { ink: "ink", muted: "muted", line: "line", panel: "panel", tint: "tint", brand: "brand", onBrand: "on-brand", accent: "accent" },
} as unknown as ChartTheme;

const scored = materialityData(true).points;
const unscored = materialityData(false).points;

type Series = { name: string; symbol?: string; itemStyle?: { color: string }; data: { value: number[]; name: string; symbolSize: number; point: MaterialityPoint }[]; markArea?: { data: unknown; label: { formatter: string } } };

describe("materiality logic (IN-7)", () => {
  it("sizes bubbles from the server's weight (1–10 → 14–50 px), clamped", () => {
    expect(bubbleSize(1)).toBe(BUBBLE_MIN);
    expect(bubbleSize(10)).toBe(BUBBLE_MAX);
    expect(bubbleSize(5.5)).toBe(32);
    expect(bubbleSize(0)).toBe(BUBBLE_MIN);
    expect(bubbleSize(42)).toBe(BUBBLE_MAX);
    expect(bubbleSize(null)).toBe(BUBBLE_MIN);
    expect(bubbleSize(Number.NaN)).toBe(BUBBLE_MIN);
  });

  it("labels a point with the topic and its lower-case status word", () => {
    expect(pointLabel(scored[0])).toBe("Climate · at risk");
    expect(pointLabel(scored[2])).toBe("Own workforce · off track");
    expect(countsText(scored[0])).toBe("6 KPIs · 3 on track · 1 off track");
    expect(countsText({ kpis: 1, on_track: 0, off_track: 1 })).toBe("1 KPI · 0 on track · 1 off track");
  });

  it("splits placed and unplaced points and finds the act-here corner (≥ 7, ≥ 7)", () => {
    const mixed = [scored[0], { ...scored[1], impact: null }, scored[2]];
    const { placed, unplaced } = splitPoints(mixed);
    expect(placed.map((p) => p.label)).toEqual(["Climate", "Own workforce"]);
    expect(unplaced.map((p) => p.label)).toEqual(["Water"]);
    expect(inActHere({ impact: ACT_HERE, financial: ACT_HERE })).toBe(true);
    expect(inActHere({ impact: 7.5, financial: 6 })).toBe(false);
    expect(notScoredText(unplaced)).toBe("Not scored yet: Water.");
    expect(notScoredText(unscored)).toBe("Not scored yet: Climate, Water, Own workforce and Business conduct.");
    expect(notScoredText([])).toBeNull();
  });

  it("builds one series per status present, worst first, with status colours, symbols and labels", () => {
    const opt = materialityOption(scored, t) as { series: Series[]; legend: { data: string[] }; xAxis: { name: string; min: number; max: number }; yAxis: { name: string; max: number } };
    const [corner, ...series] = opt.series;
    expect(series.map((s) => s.name)).toEqual(["Off track", "At risk", "On track", "No data"]);
    expect(opt.legend.data).toEqual(["Off track", "At risk", "On track", "No data"]);
    expect(series.map((s) => s.itemStyle?.color)).toEqual(["bad", "warn", "good", "muted"]);
    expect(series.map((s) => s.symbol)).toEqual(["diamond", "triangle", "circle", "emptyCircle"]);
    const climate = series[1].data[0];
    expect(climate.value).toEqual([9, 8.5, 6]);
    expect(climate.name).toBe("Climate · at risk");
    expect(climate.symbolSize).toBe(bubbleSize(6));
    expect(climate.point.link).toBe("/kpi/esg?topic=climate");
    expect(opt.xAxis).toMatchObject({ name: "Impact on people and planet", min: 0, max: 10 });
    expect(opt.yAxis).toMatchObject({ name: "Financial effect", min: 0, max: 10 });
    expect(corner.name).toBe("Act here");
    expect(corner.data).toEqual([]);
    expect(corner.markArea?.label.formatter).toBe("Act here");
    expect(corner.markArea?.data).toEqual([[{ name: "Act here", xAxis: 7, yAxis: 7 }, { xAxis: 10, yAxis: 10 }]]);
  });

  it("leaves unscored points off the chart and hides the legend with one status", () => {
    const opt = materialityOption([scored[0], { ...scored[2], financial: null }], t) as { series: Series[]; legend: { show: boolean } };
    expect(opt.series.slice(1).map((s) => s.name)).toEqual(["At risk"]);
    expect(opt.legend.show).toBe(false);
    expect(statusesPresent(scored)).toEqual(["off_track", "at_risk", "on_track", "no_data"]);
    expect(statusColor(t, "reached")).toBe("good");
  });

  it("writes the tooltip (topic, status, KPIs, on track, off track) and escapes server text", () => {
    expect(tooltipLines(scored[2])).toEqual(["Own workforce", "Off track", "KPIs: 9", "On track: 4", "Off track: 3"]);
    expect(tooltipHtml({ ...scored[0], label: "R&D <x>" })).toBe("<strong>R&amp;D &lt;x&gt;</strong><br/>At risk<br/>KPIs: 6<br/>On track: 3<br/>Off track: 1");
    const opt = materialityOption(scored, t) as { tooltip: { formatter: (p: unknown) => string } };
    expect(opt.tooltip.formatter({ data: { point: scored[1] } })).toContain("<strong>Water</strong>");
    expect(opt.tooltip.formatter({ data: {} })).toBe("");
  });

  it("reads the clicked bubble's server link only", () => {
    expect(clickedLink({ data: { point: scored[0] } })).toBe("/kpi/esg?topic=climate");
    expect(clickedLink({ componentType: "markArea" })).toBeNull();
    expect(clickedLink(null)).toBeNull();
  });

  it("table rows carry every column in the server's order", () => {
    expect(TABLE_COLUMNS.map((c) => c.header)).toEqual(["Topic", "ESRS topic", "Impact", "Financial", "Weight", "Status", "KPIs", "On track", "Off track"]);
    expect(tableRows(scored)[2]).toEqual({ topic: "Own workforce", code: "S1", impact: 7.5, financial: 6, weight: 9, status: "Off track", kpis: 9, on_track: 4, off_track: 3 });
    expect(tableRows(unscored)[0]).toMatchObject({ impact: null, financial: null });
  });

  it("summarises the chart in one sentence from the server's statuses", () => {
    // Fixture: Climate (9, 8.5) at risk is the only topic in the corner.
    expect(ariaSentence(scored)).toBe("4 material topics; none off track in the act-here corner, 1 at risk: Climate.");
    const moved = scored.map((p) => (p.esrs_topic === "S1" ? { ...p, financial: 8 } : p));
    expect(ariaSentence(moved)).toBe("4 material topics; 1 off track in the act-here corner: Own workforce.");
    expect(ariaSentence([scored[1]])).toBe("1 material topic; none off track or at risk in the act-here corner.");
    expect(ariaSentence([scored[0], { ...scored[1], impact: null }])).toBe("2 material topics; none off track in the act-here corner, 1 at risk: Climate; 1 not scored yet.");
  });

  it("lets only Admins and Superadmins add scores, in KPI setup's materiality step", () => {
    expect(ADD_SCORES_LINK).toBe("/kpi/setup?step=topics");
    expect(canAddScores("Admin")).toBe(true);
    expect(canAddScores("Superadmin")).toBe(true);
    expect(canAddScores("Manager")).toBe(false);
    expect(canAddScores(null)).toBe(false);
  });
});
