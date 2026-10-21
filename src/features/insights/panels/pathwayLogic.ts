// IN-4 · Pathway (05-ux §4 C): option and table shaping only. Every figure is
// the server's (`actual`, `pathway`, `levers`, `gap_band`); nothing here sums,
// subtracts or derives a value. IN-5 morphs this chart into the bridge
// waterfall with `universalTransition`, so series ids and per-year group ids
// are stable and exported.
import type { EChartsOption } from "echarts";
import type { ChartTableColumn } from "../../../ui";
import { formatEmissions, formatNumber, formatPercent } from "../../../ui/format";
import type { EventRef, Pathway, YearType } from "../../../lib/insights/contracts";
import { entrance, morph } from "../../../lib/insights/motion";
import type { ChartTheme } from "../../../theme";

/** Stable series ids (IN-5 morphs from these). */
export const PATHWAY_IDS = {
  s1: "pathway-s1",
  s2: "pathway-s2",
  s3: "pathway-s3",
  pathway: "pathway-line",
  lever: "pathway-lever",
} as const;

/** The bars' stack name: the three scope bars of one year are one column. */
export const PATHWAY_STACK = "actual";

/** One year's group id: bars keep their identity by year through a morph. */
export const yearGroupId = (year: number) => `year-${year}`;

export const SCOPE_LABEL = { s1: "Scope 1", s2: "Scope 2", s3: "Scope 3" } as const;
type ScopeKey = keyof typeof SCOPE_LABEL;
const SCOPES: ScopeKey[] = ["s1", "s2", "s3"];

/**
 * The reporting year an event falls in: the calendar year for CY; for FY the
 * start year (April–March, as `src/ui/period.ts`: FY 2025 = FY 2025-26).
 */
export function eventYear(date: string, yearType: YearType): number | null {
  const m = /^(\d{4})-(\d{2})-\d{2}/.exec(date);
  if (!m) return null;
  const y = Number(m[1]);
  const month = Number(m[2]);
  return yearType === "FY" && month < 4 ? y - 1 : y;
}

/** The events on the chart's years, by year, in date order. */
export function eventsByYear(events: EventRef[], years: number[], yearType: YearType): Map<number, EventRef[]> {
  const out = new Map<number, EventRef[]>();
  for (const e of [...events].sort((a, b) => a.date.localeCompare(b.date))) {
    const y = eventYear(e.date, yearType);
    if (y === null || !years.includes(y)) continue;
    out.set(y, [...(out.get(y) ?? []), e]);
  }
  return out;
}

/** The renewable share lever, when the server sends one. */
export const renewableLever = (data: Pathway) => data.levers.find((l) => l.key === "renewable_share") ?? null;

/** The server's gap for a year (`gap_band`), or null when it lists none. */
export const gapFor = (data: Pathway, year: number) => data.gap_band.find((g) => g.year === year)?.gap ?? null;

/** Years where the server says actual is above the pathway. */
export const gapYears = (data: Pathway) => data.gap_band.filter((g) => g.gap > 0).map((g) => g.year);

export interface PathwayOptionOpts {
  yearType: YearType;
}

/** The ECharts option: stacked scope bars, dashed pathway, lever line on a right 0–100 % axis, gap band, target pin, event lines. */
export function pathwayOption(data: Pathway, t: ChartTheme, opts: PathwayOptionOpts): EChartsOption {
  const cats = data.years.map(String);
  const lever = renewableLever(data);
  const events = eventsByYear(data.events, data.years, opts.yearType);
  const gaps = gapYears(data);
  const targetIdx = data.years.indexOf(data.target_year);
  const tonnes = (v: unknown) => (typeof v === "number" ? formatEmissions(v) : "—");
  const pct = (v: unknown) => (typeof v === "number" ? formatPercent(v, 0) : "—");

  const bars = SCOPES.map((s, i) => ({
    id: PATHWAY_IDS[s],
    name: SCOPE_LABEL[s],
    type: "bar" as const,
    stack: PATHWAY_STACK,
    barMaxWidth: 28,
    itemStyle: { color: t.scopes[s] },
    emphasis: { focus: "series" as const },
    tooltip: { valueFormatter: tonnes },
    data: data.years.map((year, k) => ({ value: data.actual[s][k] ?? null, groupId: yearGroupId(year) })),
    ...morph(),
    // The gap band shades whole year columns (bar series place a markArea on the category band).
    ...(i === 0 && gaps.length
      ? {
          markArea: {
            silent: true,
            itemStyle: { color: t.status.badSoft },
            label: { show: false },
            data: gaps.map((y) => [{ xAxis: String(y), name: "Above pathway" }, { xAxis: String(y) }]),
          },
        }
      : {}),
  }));

  const pathwayLine = {
    id: PATHWAY_IDS.pathway,
    name: "Pathway",
    type: "line" as const,
    z: 3,
    symbol: "circle",
    symbolSize: 4,
    lineStyle: { color: t.ui.ink, type: "dashed" as const, width: 2 },
    itemStyle: { color: t.ui.ink },
    tooltip: { valueFormatter: tonnes },
    data: data.years.map((year, k) => ({ value: data.pathway[k] ?? null, groupId: yearGroupId(year) })),
    ...(targetIdx >= 0
      ? {
          markPoint: {
            symbol: "pin",
            symbolSize: 30,
            itemStyle: { color: t.ui.brand },
            label: { show: true, position: "top" as const, color: t.ui.ink, fontSize: 11, formatter: `Target ${data.target_year}` },
            data: [{ name: "Target year", coord: [String(data.target_year), data.pathway[targetIdx]] }],
          },
        }
      : {}),
    ...(events.size
      ? {
          markLine: {
            symbol: ["none", "none"],
            lineStyle: { color: t.ui.muted, type: "dotted" as const, width: 1 },
            label: { show: true, position: "insideEndTop" as const, color: t.ui.muted, fontSize: 10, formatter: "{b}" },
            tooltip: { show: true, formatter: "{b}" },
            data: [...events.entries()].flatMap(([year, list]) => list.map((e) => ({ name: e.label, xAxis: String(year) }))),
          },
        }
      : {}),
  };

  const leverLine = lever
    ? [
        {
          id: PATHWAY_IDS.lever,
          name: lever.label,
          type: "line" as const,
          yAxisIndex: 1,
          z: 4,
          symbol: "circle",
          symbolSize: 5,
          lineStyle: { color: t.ui.accent, width: 2 },
          itemStyle: { color: t.ui.accent },
          tooltip: { valueFormatter: pct },
          data: data.years.map((year, k) => ({ value: lever.values[k] ?? null, groupId: yearGroupId(year) })),
        },
      ]
    : [];

  const series = [...bars, pathwayLine, ...leverLine];
  return {
    ...entrance(series.length),
    grid: { left: 8, right: lever ? 8 : 16, top: 28, bottom: 8, containLabel: true },
    legend: { show: false },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    xAxis: { type: "category", data: cats },
    yAxis: [
      { type: "value", name: "tCO₂e", axisLabel: { formatter: (v: number) => formatNumber(v, 0) } },
      ...(lever ? [{ type: "value" as const, name: "%", min: 0, max: 100, position: "right" as const, splitLine: { show: false }, axisLabel: { formatter: "{value}%" } }] : []),
    ],
    series,
  } as EChartsOption;
}

export const PATHWAY_COLUMNS: ChartTableColumn[] = [
  { id: "year", header: "Year" },
  { id: "s1", header: "Scope 1 (tCO₂e)", numeric: true },
  { id: "s2", header: "Scope 2 (tCO₂e)", numeric: true },
  { id: "s3", header: "Scope 3 (tCO₂e)", numeric: true },
  { id: "pathway", header: "Pathway (tCO₂e)", numeric: true },
  { id: "renewable", header: "Renewable share" },
  { id: "gap", header: "Above pathway (tCO₂e)", numeric: true },
  { id: "events", header: "Events" },
];

/** Table view rows: one per year, server values only. */
export function pathwayTable(data: Pathway, yearType: YearType): { columns: ChartTableColumn[]; rows: Record<string, string | number | null>[] } {
  const lever = renewableLever(data);
  const events = eventsByYear(data.events, data.years, yearType);
  return {
    columns: PATHWAY_COLUMNS,
    rows: data.years.map((year, k) => ({
      year: String(year),
      s1: data.actual.s1[k] ?? null,
      s2: data.actual.s2[k] ?? null,
      s3: data.actual.s3[k] ?? null,
      pathway: data.pathway[k] ?? null,
      renewable: lever && typeof lever.values[k] === "number" ? formatPercent(lever.values[k], 0) : null,
      gap: gapFor(data, year),
      events: events.get(year)?.map((e) => e.label).join("; ") ?? null,
    })),
  };
}

/** "and" list: "2025 and 2026", "2023, 2024 and 2025". */
const andList = (xs: (string | number)[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** One sentence for screen readers. */
export function pathwayAria(data: Pathway, yearType: YearType): string {
  const reported = data.years.filter((_, k) => SCOPES.some((s) => data.actual[s][k] !== null && data.actual[s][k] !== undefined));
  const span = reported.length ? `Emissions by scope from ${reported[0]} to ${reported[reported.length - 1]}` : "No emissions reported yet";
  const gaps = gapYears(data);
  const gapText = gaps.length ? `; above the pathway in ${andList(gaps)}` : "; not above the pathway in any year";
  const n = eventsByYear(data.events, data.years, yearType);
  const count = [...n.values()].reduce((a, l) => a + l.length, 0);
  const eventText = count ? `, with ${count} event${count === 1 ? "" : "s"} marked` : "";
  return `${span} against a ${formatNumber(data.annual_rate_pct, 1)}% a year pathway from ${data.base_year} to ${data.target_year}${gapText}${eventText}.`;
}
