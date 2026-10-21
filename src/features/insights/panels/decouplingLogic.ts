// IN-2 · Decoupling (05-ux §4 B): shapes the server's indexed series into
// three lines (output brand, emissions pillar E with a light area, intensity
// muted dashed), end labels from the server's headline changes, a base-year
// marker and optional event marks; plus the table, the aria sentence and the
// legend entries. The server's `index`, `raw` and `headline` are shown as sent.
import type { EChartsOption } from "echarts";
import type { Decoupling, DecouplingSeriesKey, EventRef } from "../../../lib/insights/contracts";
import { changeText, unitText } from "../../../lib/insights/labels";
import { entrance } from "../../../lib/insights/motion";
import { formatNumber } from "../../../ui/format";
import type { ChartTableColumn } from "../../../ui";
import type { ChartTheme } from "../../../theme";
import { esc } from "./shared";

type Series = Decoupling["series"][number];

/** The headline field holding each series' change since the base year. */
export const HEADLINE_KEY: Record<DecouplingSeriesKey, keyof Decoupling["headline"]> = {
  output: "output_change_pct",
  emissions: "emissions_change_pct",
  intensity: "intensity_change_pct",
};

/** Legend swatch classes (token colours; dashed for intensity). */
export const SERIES_SWATCH: Record<DecouplingSeriesKey, { className: string; dash: boolean }> = {
  output: { className: "text-brand", dash: false },
  emissions: { className: "text-pillar-e", dash: false },
  intensity: { className: "text-muted", dash: true },
};

/** "+42%" / "−19%": the server's headline change for a series. */
export function endLabel(data: Decoupling, key: DecouplingSeriesKey): string {
  return changeText(data.headline[HEADLINE_KEY[key]], null)?.short ?? "";
}

/** Chart colour and line style per series. */
export function seriesStyle(key: DecouplingSeriesKey, t: ChartTheme): { color: string; dashed: boolean; area: boolean } {
  if (key === "output") return { color: t.ui.brand, dashed: false, area: false };
  if (key === "emissions") return { color: t.pillars.environment, dashed: false, area: true };
  return { color: t.ui.muted, dashed: true, area: false };
}

/** Decimals for a raw column: three for small values (intensity), none otherwise. A display rule. */
export function rawDecimals(values: (number | null)[]): number {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!nums.length) return 0;
  return Math.max(...nums.map(Math.abs)) < 10 ? 3 : 0;
}

/** Event marks on the x axis: events whose year is on the chart, labelled with their own words. */
export function eventMarks(data: Decoupling, events: EventRef[] | undefined): { xAxis: string; name: string }[] {
  if (!events?.length) return [];
  const years = new Set(data.years.map(String));
  return events.filter((e) => years.has(e.date.slice(0, 4))).map((e) => ({ xAxis: e.date.slice(0, 4), name: e.label }));
}

/** Tooltip HTML for one year: each series' index and its raw value with units. */
export function decouplingTooltip(data: Decoupling, i: number): string {
  const year = data.years[i];
  if (year === undefined) return "";
  const lines = data.series.map((s) => {
    const idx = s.index[i];
    const raw = s.raw[i];
    const rawText = raw === null || raw === undefined ? "no data" : `${formatNumber(raw, rawDecimals(s.raw))} ${esc(unitText(s.unit))}`;
    return `${esc(s.label)}: <b>${idx === null || idx === undefined ? "—" : formatNumber(idx, 1)}</b> (${rawText})`;
  });
  return [`<b>${year}${year === data.base_year ? " · base year" : ""}</b>`, ...lines].join("<br/>");
}

/** The line chart option. */
/** Event labels sit above the plot, horizontally; long ones are shortened (the table and tooltip have them in full). */
export const shortLabel = (s: string, max = 18) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** `compactMarks`: phones draw event lines without their labels (the tooltip and table have them). */
export function decouplingOption(data: Decoupling, t: ChartTheme, events?: EventRef[], compactMarks = false): EChartsOption {
  const years = data.years.map(String);
  const marks = eventMarks(data, events);
  const series = data.series.map((s: Series, idx) => {
    const st = seriesStyle(s.key, t);
    return {
      type: "line" as const,
      id: s.key,
      name: s.label,
      data: s.index,
      connectNulls: false,
      showSymbol: true,
      symbolSize: 5,
      color: st.color,
      lineStyle: { color: st.color, width: 2, type: st.dashed ? ("dashed" as const) : ("solid" as const) },
      itemStyle: { color: st.color },
      ...(st.area ? { areaStyle: { color: st.color, opacity: 0.12 } } : {}),
      endLabel: { show: true, formatter: endLabel(data, s.key), color: st.color, fontWeight: 600 as const },
      ...(idx === 0
        ? {
            markLine: {
              silent: true,
              symbol: ["none", "none"],
              data: [
                { xAxis: String(data.base_year), name: "Base year", lineStyle: { color: t.ui.muted, type: "dotted" as const }, label: { formatter: `Base year ${data.base_year}`, position: "end" as const, color: t.ui.muted, fontSize: 10 } },
                ...marks.map((m) => ({ xAxis: m.xAxis, name: m.name, lineStyle: { color: t.ui.accent, type: "dashed" as const }, label: { show: !compactMarks, formatter: shortLabel(m.name), position: "end" as const, color: t.ui.ink, fontSize: 10 } })),
              ],
            },
          }
        : {}),
    };
  });
  return {
    ...entrance(series.length),
    grid: { left: 8, right: 56, top: 40, bottom: 8, containLabel: true },
    tooltip: { trigger: "axis", formatter: (ps: unknown) => decouplingTooltip(data, (ps as { dataIndex: number }[])[0]?.dataIndex ?? -1) },
    xAxis: { type: "category", data: years, boundaryGap: false },
    yAxis: { type: "value", scale: true }, // "Indexed, base year = 100" is the subtitle
    series,
  } as EChartsOption;
}

/** "Since 2021, output is up 42%, emissions down 19.1% and intensity down 43% (indexed, 2021 = 100)." */
export function decouplingAria(data: Decoupling): string {
  const word = (key: DecouplingSeriesKey) => changeText(data.headline[HEADLINE_KEY[key]], null)?.words ?? "not known";
  return `Since ${data.base_year}, output is ${word("output")}, emissions ${word("emissions")} and intensity ${word("intensity")} (indexed, ${data.base_year} = 100).`;
}

/** Table view: year, the three indexes, then each raw value with its unit. */
export function decouplingTable(data: Decoupling): { columns: ChartTableColumn[]; rows: Array<Record<string, string | number | null>> } {
  const columns: ChartTableColumn[] = [
    { id: "year", header: "Year" },
    ...data.series.map((s) => ({ id: `${s.key}_index`, header: `${s.label} index`, numeric: true, decimals: 1 })),
    ...data.series.map((s) => ({ id: `${s.key}_raw`, header: `${s.label} (${unitText(s.unit)})`, numeric: true, decimals: rawDecimals(s.raw) })),
  ];
  const rows = data.years.map((year, i) => {
    const row: Record<string, string | number | null> = { year: year === data.base_year ? `${year} (base)` : String(year) };
    for (const s of data.series) {
      row[`${s.key}_index`] = s.index[i] ?? null;
      row[`${s.key}_raw`] = s.raw[i] ?? null;
    }
    return row;
  });
  return { columns, rows };
}

/** The note under the chart when output is a combined index (I7). */
export const COMBINED_NOTE = "Output is a combined index: each site's output is indexed in its own unit and weighted by its base-year emissions.";
