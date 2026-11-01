import { describe, expect, it } from "vitest";
import type { TargetWallItem } from "../../../lib/insights/contracts";
import { targetWallData } from "../../../test/msw/insightsData";
import { pctText, statusColor } from "./shared";
import { axisMax, nameWidth, rightLabel, valueText, wallAria, wallClick, wallHeight, wallOption, wallTable, wallTooltip } from "./targetWallLogic";
import { testTheme as t } from "./testTheme";

const items = targetWallData(true).items;
type S = { id: string; data: unknown[]; label?: { width?: number; formatter?: unknown } };
type Opt = { series: S[]; yAxis: Array<{ data: string[]; inverse: boolean }>; xAxis: { max: number }; tooltip: { formatter: (p: unknown) => string } };

describe("targetWallLogic (IN-2 H)", () => {
  it("percent words and status colours", () => {
    expect(pctText(58)).toBe("58%");
    expect(pctText(8.5)).toBe("8.5%");
    expect(pctText(-4)).toBe("−4%");
    expect(pctText(-0.01)).toBe("0%");
    expect(pctText(null)).toBe("—");
    expect(statusColor("off_track", t)).toBe("bad");
    expect(statusColor("at_risk", t)).toBe("warn");
    expect(statusColor("on_track", t)).toBe("good");
    expect(statusColor("reached", t)).toBe("good");
    expect(statusColor("no_data", t)).toBe("muted");
  });

  it("right label: progress and expected, or no data", () => {
    expect(rightLabel(items[0])).toBe("39% · expected 45%");
    expect(rightLabel({ ...items[0], expected_pct: null })).toBe("39%");
    expect(rightLabel({ ...items[0], progress_pct: null })).toBe("No data yet");
  });

  it("values with units", () => {
    expect(valueText(41_280, "tCO2e")).toBe("41,280.000 tCO₂e");
    expect(valueText(41_280.4, "tCO2e")).toBe("41,280.400 tCO₂e");
    expect(valueText(46.6, "%")).toBe("46.6%");
    expect(valueText(2.2, "per million hours")).toBe("2.2 per million hours");
    expect(valueText(0.617, "tCO2e/t")).toBe("0.62 tCO₂e/t");
    expect(valueText(1, "per million hours")).toBe("1 per million hours");
  });

  it("bullet bars keep the server's order: track to 100, status-coloured progress, ink tick, letters, end labels", () => {
    const o = wallOption(items, t, 600) as unknown as Opt;
    expect(o.yAxis.map((y) => y.data)).toEqual([
      ["sbti-near-term", "kpi-41", "kpi-12"],
      ["sbti-near-term", "kpi-41", "kpi-12"],
    ]);
    expect(o.yAxis.every((y) => y.inverse)).toBe(true);
    expect((o.series[1] as unknown as { yAxisIndex: number }).yAxisIndex).toBe(1);
    expect(o.series.map((s) => s.id)).toEqual(["track", "progress", "expected", "letters", "ends"]);
    const [track, progress, expected, letters, ends] = o.series;
    expect(track.data).toEqual([100, 100, 100]);
    expect(progress.data).toEqual([
      { value: 38.5, itemStyle: { color: "warn", borderRadius: 3 } },
      { value: 20, itemStyle: { color: "bad", borderRadius: 3 } },
      { value: 72, itemStyle: { color: "good", borderRadius: 3 } },
    ]);
    expect(expected.data).toEqual([
      [45, 0],
      [60, 1],
      [60, 2],
    ]);
    expect((letters.data as Array<{ pillar: string; label: { formatter: string } }>).map((d) => [d.pillar, d.label.formatter])).toEqual([
      ["environment", "E"],
      ["social", "S"],
      ["environment", "E"],
    ]);
    expect((ends.data as Array<{ label: { formatter: string } }>)[1].label.formatter).toBe("20% · expected 60%");
    expect((track.label!.formatter as (p: { dataIndex: number }) => string)({ dataIndex: 1 })).toBe("Lost-time injury frequency rate");
    expect(o.tooltip.formatter([{ dataIndex: 1 }])).toContain("<b>Off track</b>: 20% of the way, expected 60% by now");
  });

  it("missing progress and expected stay empty, not zero", () => {
    const item: TargetWallItem = { ...items[0], progress_pct: null, expected_pct: null, status: "no_data", latest: null };
    const o = wallOption([item], t) as unknown as Opt;
    expect((o.series[1].data[0] as { value: unknown }).value).toBe("-");
    expect(o.series[2].data).toEqual([]);
    expect(wallTooltip(item)).toContain("<b>No data</b>: no data yet");
    expect(wallTooltip(item)).toContain("Latest —");
  });

  it("the axis reaches past 100 only for a target beyond it; height grows with rows; names narrow on phones", () => {
    expect(axisMax(items)).toBe(100);
    expect(axisMax([{ ...items[0], progress_pct: 120 }])).toBe(120);
    expect(wallHeight(3)).toBeGreaterThan(wallHeight(1));
    expect(wallHeight(0)).toBe(wallHeight(1));
    expect(nameWidth(330)).toBe(160);
    expect(nameWidth(1000)).toBe(320);
    expect(nameWidth(100)).toBe(80);
    expect((wallOption(items, t, 330) as unknown as Opt).series[0].label?.width).toBe(160);
  });

  it("clicks: a pillar letter filters, anything else opens the target", () => {
    expect(wallClick({ seriesId: "letters", dataIndex: 1, data: { pillar: "social" } }, items)).toEqual({ pillar: "social" });
    expect(wallClick({ seriesId: "track", dataIndex: 0 }, items)).toEqual({ link: "/targets" });
    expect(wallClick({ seriesId: "progress", dataIndex: 1 }, items)).toEqual({ link: "/kpi/targets?kpi=41" });
    expect(wallClick({ seriesId: "expected", dataIndex: 0, data: [60, 2] }, items)).toEqual({ link: "/kpi/targets?kpi=12" });
    expect(wallClick({ seriesId: "track", dataIndex: 9 }, items)).toBeNull();
  });

  it("aria sentence and table", () => {
    expect(wallAria([])).toBe("No targets to show.");
    expect(wallAria(items)).toBe(
      "3 targets, worst first. Scope 1 and 2 emissions (SBTi near term): at risk, 39% of the way, expected 45%; Lost-time injury frequency rate: off track, 20% of the way, expected 60%; Renewable electricity share: on track, 72% of the way, expected 60%.",
    );
    expect(wallAria([...items, items[0]])).toContain("; and 1 more.");
    const tb = wallTable(items);
    expect(tb.columns.map((c) => c.header)).toEqual(["Target", "Pillar", "Source", "Progress", "Expected", "Status", "Baseline", "Target value", "Latest"]);
    expect(tb.rows[0]).toEqual({
      name: "Scope 1 and 2 emissions (SBTi near term)",
      pillar: "E · Environment",
      source: "SBTi target",
      progress: "39%",
      expected: "45%",
      status: "At risk",
      baseline: "51,020.000 tCO₂e (2021)",
      target: "29,590.000 tCO₂e (2030)",
      latest: "41,280.000 tCO₂e (2026)",
    });
  });
});
