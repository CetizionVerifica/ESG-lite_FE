import { describe, expect, it } from "vitest";
import { PLANETPULSE, buildTheme, chartTheme } from "../../../theme";
import { MOCK_EVENTS, pathwayData } from "../../../test/msw/insightsData";
import { PATHWAY_IDS, PATHWAY_STACK, eventYear, eventsByYear, gapFor, pathwayAria, pathwayOption, pathwayTable, yearGroupId } from "./pathwayLogic";

const t = chartTheme(buildTheme(PLANETPULSE, "light", "light"));
const data = pathwayData(MOCK_EVENTS);

type AnySeries = Record<string, unknown> & { id: string; data: { value: number | null; groupId: string }[] };
const seriesOf = (o: ReturnType<typeof pathwayOption>) => o.series as AnySeries[];

describe("eventYear / eventsByYear", () => {
  it("puts an event in its calendar year, or in the FY that starts in April", () => {
    expect(eventYear("2025-06-01", "CY")).toBe(2025);
    expect(eventYear("2025-02-10", "CY")).toBe(2025);
    expect(eventYear("2025-02-10", "FY")).toBe(2024);
    expect(eventYear("2025-04-01", "FY")).toBe(2025);
    expect(eventYear("June 2025", "CY")).toBeNull();
  });

  it("groups events on the chart's years in date order and drops the rest", () => {
    const extra = [...MOCK_EVENTS, { id: 9, date: "2019-01-01", label: "Too early", kind: "other" as const, site_id: null }, { id: 10, date: "2023-01-05", label: "Earlier in 2023", kind: "other" as const, site_id: null }];
    const m = eventsByYear(extra, data.years, "CY");
    expect([...m.keys()]).toEqual([2023, 2024, 2025]);
    expect(m.get(2023)!.map((e) => e.label)).toEqual(["Earlier in 2023", "Rooftop solar at Pune"]);
  });
});

describe("pathwayOption", () => {
  const o = pathwayOption(data, t, { yearType: "CY" });
  const series = seriesOf(o);

  it("has stable series ids and per-year group ids (IN-5 morphs from them)", () => {
    expect(series.map((s) => s.id)).toEqual([PATHWAY_IDS.s1, PATHWAY_IDS.s2, PATHWAY_IDS.s3, PATHWAY_IDS.pathway, PATHWAY_IDS.lever]);
    for (const s of series) expect(s.data.map((d) => d.groupId)).toEqual(data.years.map(yearGroupId));
  });

  it("stacks the scope bars in scope colours with the server's values (null stays null)", () => {
    const bars = series.slice(0, 3);
    expect(bars.every((b) => b.type === "bar" && b.stack === PATHWAY_STACK)).toBe(true);
    expect(bars.map((b) => (b.itemStyle as { color: string }).color)).toEqual([t.scopes.s1, t.scopes.s2, t.scopes.s3]);
    expect(bars[0].data.map((d) => d.value)).toEqual(data.actual.s1);
    expect(bars[2].data[9].value).toBeNull();
  });

  it("draws the pathway dashed in ink with a target pin, and event lines with their labels", () => {
    const line = series[3];
    expect((line.lineStyle as { type: string; color: string }).type).toBe("dashed");
    expect((line.lineStyle as { color: string }).color).toBe(t.ui.ink);
    expect(line.data.map((d) => d.value)).toEqual(data.pathway);
    const pin = (line.markPoint as { symbol: string; data: { coord: unknown[] }[] });
    expect(pin.symbol).toBe("pin");
    expect(pin.data[0].coord).toEqual(["2030", 29_590]);
    const marks = (line.markLine as { data: { name: string; xAxis: string }[] }).data;
    expect(marks).toEqual([
      { name: "Rooftop solar at Pune", xAxis: "2023" },
      { name: "Nagpur kiln upgrade", xAxis: "2024" },
      { name: "New grid factors (CEA v20)", xAxis: "2025" },
    ]);
  });

  it("puts the renewable share on a right 0–100 % axis in the accent colour", () => {
    const lever = series[4];
    expect(lever.yAxisIndex).toBe(1);
    expect((lever.lineStyle as { color: string }).color).toBe(t.ui.accent);
    const axes = o.yAxis as { min?: number; max?: number; position?: string }[];
    expect(axes[1]).toMatchObject({ min: 0, max: 100, position: "right" });
  });

  it("shades whole year columns where the server lists a gap, in the soft bad colour", () => {
    const area = series[0].markArea as { itemStyle: { color: string }; data: [{ xAxis: string }, { xAxis: string }][] };
    expect(area.itemStyle.color).toBe(t.status.badSoft);
    expect(area.data.map(([a, b]) => [a.xAxis, b.xAxis])).toEqual([
      ["2025", "2025"],
      ["2026", "2026"],
    ]);
  });

  it("leaves out the lever axis, gap band, pin and event lines when there are none", () => {
    const bare = pathwayOption({ ...data, levers: [], gap_band: [], events: [], target_year: 2035 }, t, { yearType: "CY" });
    const s = seriesOf(bare);
    expect(s).toHaveLength(4);
    expect(s[0].markArea).toBeUndefined();
    expect(s[3].markPoint).toBeUndefined();
    expect(s[3].markLine).toBeUndefined();
    expect(bare.yAxis as unknown[]).toHaveLength(1);
  });
});

describe("pathwayTable / pathwayAria", () => {
  it("one row per year with the server's numbers, the lever as a %, the gap and the events", () => {
    const { columns, rows } = pathwayTable(data, "CY");
    expect(columns.map((c) => c.header)).toEqual(["Year", "Scope 1 (tCO₂e)", "Scope 2 (tCO₂e)", "Scope 3 (tCO₂e)", "Pathway (tCO₂e)", "Renewable share", "Above pathway (tCO₂e)", "Events"]);
    expect(rows).toHaveLength(10);
    expect(rows[4]).toEqual({ year: "2025", s1: 19_300, s2: 20_550, s3: 5_060, pathway: 42_980, renewable: "38%", gap: 1_930, events: "New grid factors (CEA v20)" });
    expect(rows[0].gap).toBeNull();
    expect(rows[9]).toMatchObject({ year: "2030", s1: null, renewable: null, events: null });
    expect(gapFor(data, 2026)).toBe(110);
  });

  it("summarises the chart in one sentence", () => {
    expect(pathwayAria(data, "CY")).toBe("Emissions by scope from 2021 to 2026 against a 4.2% a year pathway from 2021 to 2030; above the pathway in 2025 and 2026, with 3 events marked.");
    expect(pathwayAria({ ...data, gap_band: [], events: [] }, "CY")).toContain("not above the pathway in any year.");
  });
});
