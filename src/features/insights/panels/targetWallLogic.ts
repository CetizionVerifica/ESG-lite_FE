// IN-2 · Target wall (05-ux §4 H): shapes the server's items (already sorted
// worst first) into bullet bars — a soft track to 100 % (the target), the
// progress bar in the status colour and an ink tick at the expected point —
// with the pillar letter and name above each bar and "58% · expected 70%" at
// its end. Plus tooltip, table and aria words. Progress, expected and status
// are the server's.
import type { EChartsOption } from "echarts";
import type { TargetSource, TargetWallItem } from "../../../lib/insights/contracts";
import { STATUS_WORD, unitText } from "../../../lib/insights/labels";
import { entrance } from "../../../lib/insights/motion";
import { PILLAR_LABEL, PILLAR_LETTER } from "../../../lib/kpi/labels";
import { formatNumber, formatTonnes } from "../../../ui/format";
import type { ChartTableColumn } from "../../../ui";
import type { ChartTheme } from "../../../theme";
import { esc, pctText, statusColor } from "./shared";

/** Vertical pitch of one row (label line + bar), px. */
export const ROW_PX = 52;
const TOP_PX = 30;
const TRACK_W = 14;
const PROGRESS_W = 6;

/** Chart height: grows with the number of targets. */
export const wallHeight = (n: number) => TOP_PX + Math.max(n, 1) * ROW_PX + 8;

export const SOURCE_LABEL: Record<TargetSource, string> = { sbti: "SBTi target", kpi: "KPI target" };

/** "58% · expected 70%"; "No data yet" without progress. */
export function rightLabel(item: TargetWallItem): string {
  if (item.progress_pct === null) return "No data yet";
  return item.expected_pct === null ? pctText(item.progress_pct) : `${pctText(item.progress_pct)} · expected ${pctText(item.expected_pct)}`;
}

/** "41,280.400 tCO₂e" / "46.6%" / "2.2 per million hours". */
export function valueText(v: number, unit: string): string {
  // #209: tCO₂e always to 3 decimals, as the server stores it.
  if (unit === "tCO2e") return `${formatTonnes(v)} ${unitText(unit)}`;
  // As many decimals as the value has, up to two (none from 100).
  const whole = (x: number) => Math.abs(x - Math.round(x)) < 1e-9;
  const decimals = Math.abs(v) >= 100 || whole(v) ? 0 : whole(v * 10) ? 1 : 2;
  const n = formatNumber(v, decimals);
  return unit === "%" ? `${n}%` : `${n} ${unitText(unit)}`;
}

const yearValue = (p: { year: number; value: number } | null, unit: string) => (p ? `${valueText(p.value, unit)} (${p.year})` : "—");

/** Tooltip HTML for one target, with its status word. */
export function wallTooltip(item: TargetWallItem | undefined): string {
  if (!item) return "";
  return [
    `<b>${esc(item.name)}</b>`,
    `${PILLAR_LETTER[item.pillar]} · ${esc(PILLAR_LABEL[item.pillar])} · ${SOURCE_LABEL[item.source]}`,
    `<b>${STATUS_WORD[item.status]}</b>: ${item.progress_pct === null ? "no data yet" : `${pctText(item.progress_pct)} of the way`}${item.expected_pct === null ? "" : `, expected ${pctText(item.expected_pct)} by now`}`,
    `Baseline ${esc(yearValue(item.baseline, item.unit))} → target ${esc(yearValue(item.target, item.unit))}`,
    `Latest ${esc(yearValue(item.latest, item.unit))}`,
  ].join("<br/>");
}

/** The x-axis end: 100 % (the target) or further when a target is past it. A display scale. */
export function axisMax(items: TargetWallItem[]): number {
  return Math.max(100, ...items.flatMap((i) => [i.progress_pct ?? 0, i.expected_pct ?? 0]));
}

/** The bullet-bar option. Series ids: track, progress, expected, letters, ends. */
export function wallOption(items: TargetWallItem[], t: ChartTheme, chartWidth = 600): EChartsOption {
  const ids = items.map((i) => i.id);
  const labelY = -(TRACK_W / 2 + 12);
  return {
    ...entrance(3),
    grid: { left: 4, right: 4, top: TOP_PX, bottom: 8 },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, formatter: (ps: unknown) => wallTooltip(items[(ps as { dataIndex: number }[])[0]?.dataIndex ?? -1]) },
    xAxis: { type: "value", show: false, min: (v: { min: number }) => Math.min(0, v.min), max: axisMax(items) },
    // Two identical hidden row axes: the track (and the scatters) on the first, the progress bar on the second,
    // so each bar centres in its row on its own (no barGap arithmetic between widths).
    yAxis: [
      { type: "category", data: ids, inverse: true, show: false },
      { type: "category", data: ids, inverse: true, show: false },
    ],
    series: [
      {
        id: "track",
        type: "bar",
        name: "Target",
        data: items.map(() => 100),
        barWidth: TRACK_W,
        cursor: "pointer",
        itemStyle: { color: t.ui.tint, borderRadius: TRACK_W / 2 },
        emphasis: { disabled: true },
        // The row name above the bar, after the pillar letter.
        label: {
          show: true,
          // Relative to the bar's top-left: after the letter, centred 12 px above the bar.
          position: [22, -12],
          align: "left",
          verticalAlign: "middle",
          color: t.ui.ink,
          fontSize: 12,
          width: nameWidth(chartWidth),
          overflow: "truncate",
          formatter: (p: { dataIndex: number }) => items[p.dataIndex]?.name ?? "",
        },
        z: 1,
      },
      {
        id: "progress",
        type: "bar",
        name: "Progress",
        data: items.map((i) => ({ value: i.progress_pct ?? "-", itemStyle: { color: statusColor(i.status, t), borderRadius: PROGRESS_W / 2 } })),
        barWidth: PROGRESS_W,
        yAxisIndex: 1,
        cursor: "pointer",
        z: 2,
      },
      {
        id: "expected",
        type: "scatter",
        name: "Expected by now",
        data: items.map((i, idx) => (i.expected_pct === null ? null : [i.expected_pct, idx])).filter((d) => d !== null),
        symbol: "rect",
        symbolSize: [3, TRACK_W + 8],
        itemStyle: { color: t.ui.ink },
        cursor: "pointer",
        z: 3,
      },
      {
        id: "letters",
        type: "scatter",
        name: "Pillar",
        data: items.map((i, idx) => ({
          value: [0, idx],
          pillar: i.pillar,
          itemStyle: { color: t.ui.panel, borderColor: t.pillars[i.pillar], borderWidth: 1.5 },
          label: { formatter: PILLAR_LETTER[i.pillar] },
        })),
        symbol: "roundRect",
        symbolSize: 16,
        symbolOffset: [8, labelY],
        cursor: "pointer",
        label: { show: true, position: "inside", color: t.ui.ink, fontSize: 10, fontWeight: 600 },
        z: 4,
      },
      {
        id: "ends",
        type: "scatter",
        name: "Progress label",
        silent: true,
        data: items.map((i, idx) => ({ value: [100, idx], label: { formatter: rightLabel(i) } })),
        symbolSize: 0,
        label: { show: true, position: "left", distance: 0, offset: [0, labelY], color: t.ui.muted, fontSize: 11 },
        z: 4,
      },
    ],
  } as EChartsOption;
}

/** The row name's width for a chart this wide: it stops before the right label ("58% · expected 70%"), so narrow phones truncate it. */
export function nameWidth(chartWidth: number): number {
  return Math.max(80, Math.min(320, chartWidth - 170));
}

/** What a click on the chart does: a pillar letter filters the page; anything else opens the target. */
export function wallClick(params: { seriesId?: string; dataIndex?: number; data?: unknown }, items: TargetWallItem[]): { pillar: TargetWallItem["pillar"] } | { link: string } | null {
  if (params.seriesId === "letters") {
    const p = (params.data as { pillar?: TargetWallItem["pillar"] } | undefined)?.pillar;
    return p ? { pillar: p } : null;
  }
  if (params.seriesId === "expected") {
    const idx = (params.data as [number, number] | undefined)?.[1];
    const item = idx === undefined ? undefined : items[idx];
    return item ? { link: item.link } : null;
  }
  const item = params.dataIndex === undefined ? undefined : items[params.dataIndex];
  return item ? { link: item.link } : null;
}

/** One sentence for screen readers, worst first as the server sorted them. */
export function wallAria(items: TargetWallItem[]): string {
  if (!items.length) return "No targets to show.";
  const head = items.slice(0, 3).map((i) => `${i.name}: ${STATUS_WORD[i.status].toLowerCase()}, ${i.progress_pct === null ? "no data yet" : `${pctText(i.progress_pct)} of the way`}${i.expected_pct === null ? "" : `, expected ${pctText(i.expected_pct)}`}`);
  const more = items.length > 3 ? `; and ${items.length - 3} more` : "";
  return `${items.length} ${items.length === 1 ? "target" : "targets"}, worst first. ${head.join("; ")}${more}.`;
}

export const WALL_COLUMNS: ChartTableColumn[] = [
  { id: "name", header: "Target" },
  { id: "pillar", header: "Pillar" },
  { id: "source", header: "Source" },
  { id: "progress", header: "Progress" },
  { id: "expected", header: "Expected" },
  { id: "status", header: "Status" },
  { id: "baseline", header: "Baseline" },
  { id: "target", header: "Target value" },
  { id: "latest", header: "Latest" },
];

/** Table view: one row per target in the server's order. */
export function wallTable(items: TargetWallItem[]): { columns: ChartTableColumn[]; rows: Array<Record<string, string | number | null>> } {
  return {
    columns: WALL_COLUMNS,
    rows: items.map((i) => ({
      name: i.name,
      pillar: `${PILLAR_LETTER[i.pillar]} · ${PILLAR_LABEL[i.pillar]}`,
      source: SOURCE_LABEL[i.source],
      progress: pctText(i.progress_pct),
      expected: pctText(i.expected_pct),
      status: STATUS_WORD[i.status],
      baseline: yearValue(i.baseline, i.unit),
      target: yearValue(i.target, i.unit),
      latest: yearValue(i.latest, i.unit),
    })),
  };
}
