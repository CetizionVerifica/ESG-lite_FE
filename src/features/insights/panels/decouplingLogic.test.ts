import { describe, expect, it } from "vitest";
import { MOCK_EVENTS, decouplingData } from "../../../test/msw/insightsData";
import { decouplingAria, decouplingOption, decouplingTable, decouplingTooltip, endLabel, eventMarks, rawDecimals, seriesStyle } from "./decouplingLogic";
import { testTheme as t } from "./testTheme";

type Line = { id: string; data: unknown[]; lineStyle: { color: string; type: string }; areaStyle?: unknown; endLabel: { formatter: string }; markLine?: { data: Array<{ xAxis: string; label: { formatter: string } }> } };
type Opt = { series: Line[]; xAxis: { data: string[] }; tooltip: { formatter: (p: unknown) => string } };

describe("decouplingLogic (IN-2 B)", () => {
  it("end labels are the server's headline changes", () => {
    expect(endLabel(decouplingData, "output")).toBe("+42%");
    expect(endLabel(decouplingData, "emissions")).toBe("−19%");
    expect(endLabel(decouplingData, "intensity")).toBe("−43%");
  });

  it("three lines: output brand, emissions pillar E with a light area, intensity muted dashed", () => {
    expect(seriesStyle("output", t)).toEqual({ color: "brand", dashed: false, area: false });
    const o = decouplingOption(decouplingData, t) as unknown as Opt;
    expect(o.xAxis.data).toEqual(["2021", "2022", "2023", "2024", "2025", "2026"]);
    const [out, em, int] = o.series;
    expect(out.id).toBe("output");
    expect(out.data).toEqual([100, 108.2, 117.5, 126.1, 134.9, 142.0]);
    expect(out.lineStyle).toMatchObject({ color: "brand", type: "solid" });
    expect(em.lineStyle.color).toBe("pillar-e");
    expect(em.areaStyle).toBeTruthy();
    expect(int.lineStyle).toMatchObject({ color: "muted", type: "dashed" });
    expect(out.endLabel.formatter).toBe("+42%");
    expect(out.markLine?.data[0]).toMatchObject({ xAxis: "2021", label: { formatter: "Base year 2021" } });
    expect(em.markLine).toBeUndefined();
  });

  it("draws events on the chart's years as marks with their label", () => {
    expect(eventMarks(decouplingData, undefined)).toEqual([]);
    const marks = eventMarks(decouplingData, [...MOCK_EVENTS, { id: 9, date: "2019-01-01", label: "Too early", kind: "other", site_id: null }]);
    expect(marks).toEqual([
      { xAxis: "2023", name: "Rooftop solar at Pune" },
      { xAxis: "2024", name: "Nagpur kiln upgrade" },
      { xAxis: "2025", name: "New grid factors (CEA v20)" },
    ]);
    const o = decouplingOption(decouplingData, t, MOCK_EVENTS) as unknown as Opt;
    expect(o.series[0].markLine?.data).toHaveLength(4);
  });

  it("tooltip lists each index with its raw value and unit", () => {
    const tip = decouplingTooltip(decouplingData, 5);
    expect(tip).toContain("<b>2026</b>");
    expect(tip).toContain("Output: <b>142.0</b> (66,880 t)");
    expect(tip).toContain("Emissions: <b>80.9</b> (41,280.000 tCO₂e)");
    expect(tip).toContain("Intensity: <b>57.0</b> (0.617 tCO₂e/t)");
    expect(decouplingTooltip(decouplingData, 0)).toContain("2021 · base year");
    expect(decouplingTooltip(decouplingData, 99)).toBe("");
    const o = decouplingOption(decouplingData, t) as unknown as Opt;
    expect(o.tooltip.formatter([{ dataIndex: 1 }])).toContain("<b>2022</b>");
  });

  it("nulls stay gaps (no data), not zero", () => {
    const data = { ...decouplingData, series: decouplingData.series.map((s) => (s.key === "output" ? { ...s, index: [100, null, 117.5, 126.1, 134.9, 142.0], raw: [47_100, null, 55_340, 59_390, 63_540, 66_880] } : s)) };
    const o = decouplingOption(data, t) as unknown as Opt;
    expect(o.series[0].data[1]).toBeNull();
    expect(decouplingTooltip(data, 1)).toContain("Output: <b>—</b> (no data)");
    expect(decouplingTable(data).rows[1].output_index).toBeNull();
  });

  it("raw decimals: three for small values, none otherwise", () => {
    expect(rawDecimals([1.083, 0.617])).toBe(3);
    expect(rawDecimals([47_100, null])).toBe(0);
    expect(rawDecimals([null])).toBe(0);
  });

  it("aria sentence in words and the table with units", () => {
    expect(decouplingAria(decouplingData)).toBe("Since 2021, output is up 42%, emissions down 19% and intensity down 43% (indexed, 2021 = 100).");
    const tb = decouplingTable(decouplingData);
    expect(tb.columns.map((c) => c.header)).toEqual(["Year", "Output index", "Emissions index", "Intensity index", "Output (t)", "Emissions (tCO₂e)", "Intensity (tCO₂e/t)"]);
    expect(tb.rows[0]).toEqual({ year: "2021 (base)", output_index: 100, emissions_index: 100, intensity_index: 100, output_raw: 47_100, emissions_raw: 51_020, intensity_raw: 1.083 });
    expect(tb.columns.find((c) => c.id === "intensity_raw")?.decimals).toBe(3);
    // #209: tCO₂e at 3 decimals however large; output keeps the display rule.
    expect(tb.columns.find((c) => c.id === "emissions_raw")?.decimals).toBe(3);
    expect(tb.columns.find((c) => c.id === "output_raw")?.decimals).toBe(0);
  });
});
