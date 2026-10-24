// IN-7 · Materiality × performance (05-ux §4 F): shapes the server's points
// into the scatter option, the table rows and the words. Positions, weights,
// statuses and counts are the server's; nothing here computes a figure. The
// "act here" corner and the bubble size are display geometry only.
import type { EChartsOption } from "echarts";
import { TARGET_STATUS_ORDER, type Materiality, type TargetStatus } from "../../../lib/insights/contracts";
import { STATUS_TONE, STATUS_WORD } from "../../../lib/insights/labels";
import { entrance } from "../../../lib/insights/motion";
import { formatNumber } from "../../../ui/format";
import type { ChartTableColumn } from "../../../ui/ChartFrame";
import type { ChartTheme } from "../../../theme";

export type MaterialityPoint = Materiality["points"][number];
export type PlacedPoint = MaterialityPoint & { impact: number; financial: number };

/** Scores run 0–10 on both axes. */
export const AXIS_MAX = 10;
/** The "Act here" corner: impact ≥ 7 and financial effect ≥ 7 (05-ux §4 F). */
export const ACT_HERE = 7;
export const X_NAME = "Impact on people and planet";
export const Y_NAME = "Financial effect";
export const ACT_HERE_LABEL = "Act here";

/** A point the server scored on both axes. */
export const isPlaced = (p: MaterialityPoint): p is PlacedPoint => p.impact !== null && p.financial !== null;

/** Split the server's points into the ones to plot and the ones still waiting for scores. */
export function splitPoints(points: MaterialityPoint[]): { placed: PlacedPoint[]; unplaced: MaterialityPoint[] } {
  const placed: PlacedPoint[] = [];
  const unplaced: MaterialityPoint[] = [];
  for (const p of points) (isPlaced(p) ? placed : unplaced).push(p);
  return { placed, unplaced };
}

/** Whether a placed point sits in the "Act here" corner (a position check, not a figure). */
export const inActHere = (p: Pick<PlacedPoint, "impact" | "financial">) => p.impact >= ACT_HERE && p.financial >= ACT_HERE;

/** Bubble diameter in px from the server's `weight` (normalised 1–10): 14 px at 1, 50 px at 10. Display geometry only. */
export const BUBBLE_MIN = 14;
export const BUBBLE_MAX = 50;
export function bubbleSize(weight: number | null | undefined): number {
  const w = typeof weight === "number" && Number.isFinite(weight) ? Math.min(10, Math.max(1, weight)) : 1;
  return Math.round(BUBBLE_MIN + ((w - 1) / 9) * (BUBBLE_MAX - BUBBLE_MIN));
}

/** "Climate · at risk": the topic and its status word, so colour is never the only signal. */
export const pointLabel = (p: Pick<MaterialityPoint, "label" | "status">) => `${p.label} · ${STATUS_WORD[p.status].toLowerCase()}`;

/** A second, shape-based signal per status (besides colour and the word). */
export const STATUS_SYMBOL: Record<TargetStatus, string> = {
  off_track: "diamond",
  at_risk: "triangle",
  on_track: "circle",
  reached: "roundRect",
  no_data: "emptyCircle",
};

/** The status colour from the chart theme: good / warn / bad, or muted for no data. */
export function statusColor(t: Pick<ChartTheme, "status" | "ui">, status: TargetStatus): string {
  const tone = STATUS_TONE[status];
  return tone === "neutral" ? t.ui.muted : t.status[tone];
}

/** "6 KPIs · 3 on track · 1 off track" */
export function countsText(p: Pick<MaterialityPoint, "kpis" | "on_track" | "off_track">): string {
  return `${formatNumber(p.kpis)} ${p.kpis === 1 ? "KPI" : "KPIs"} · ${formatNumber(p.on_track)} on track · ${formatNumber(p.off_track)} off track`;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** Tooltip lines: topic, status word, KPIs, on track, off track. */
export function tooltipLines(p: MaterialityPoint): string[] {
  return [p.label, STATUS_WORD[p.status], `KPIs: ${formatNumber(p.kpis)}`, `On track: ${formatNumber(p.on_track)}`, `Off track: ${formatNumber(p.off_track)}`];
}

export function tooltipHtml(p: MaterialityPoint): string {
  const [topic, ...rest] = tooltipLines(p).map(esc);
  return `<strong>${topic}</strong><br/>${rest.join("<br/>")}`;
}

/** One datum: [impact, financial, weight] plus the point itself for the tooltip and the click. */
export interface BubbleDatum {
  value: [number, number, number];
  name: string;
  symbolSize: number;
  point: MaterialityPoint;
}

/** Statuses in worst-first order, only those present (one series each). */
export function statusesPresent(points: MaterialityPoint[]): TargetStatus[] {
  return TARGET_STATUS_ORDER.filter((s) => points.some((p) => p.status === s));
}

/** The scatter option: one series per status, sized by weight, labelled "Topic · status", with the "Act here" corner. */
export function materialityOption(points: MaterialityPoint[], t: Pick<ChartTheme, "status" | "ui">): EChartsOption {
  const { placed } = splitPoints(points);
  const statuses = statusesPresent(placed);
  const series = statuses.map((status) => ({
    type: "scatter" as const,
    name: STATUS_WORD[status],
    symbol: STATUS_SYMBOL[status],
    itemStyle: { color: statusColor(t, status), opacity: 0.85, borderColor: t.ui.panel, borderWidth: 1 },
    emphasis: { focus: "series" as const, scale: 1.1 },
    cursor: "pointer",
    label: { show: true, position: "right" as const, formatter: "{b}", color: t.ui.ink, fontSize: 11 },
    labelLayout: { hideOverlap: true },
    data: placed.filter((p) => p.status === status).map<BubbleDatum>((p) => ({ value: [p.impact, p.financial, p.weight], name: pointLabel(p), symbolSize: bubbleSize(p.weight), point: p })),
  }));
  // The corner rides on its own empty series so hiding a status in the legend never hides it.
  const corner = {
    type: "scatter" as const,
    name: ACT_HERE_LABEL,
    data: [],
    silent: true,
    markArea: {
      silent: true,
      itemStyle: { color: t.status.badSoft, opacity: 0.6 },
      label: { show: true, position: "insideTopLeft" as const, formatter: ACT_HERE_LABEL, color: t.ui.ink, fontWeight: 600 as const },
      data: [[{ name: ACT_HERE_LABEL, xAxis: ACT_HERE, yAxis: ACT_HERE }, { xAxis: AXIS_MAX, yAxis: AXIS_MAX }]] as [{ name: string; xAxis: number; yAxis: number }, { xAxis: number; yAxis: number }][],
    },
  };
  const axis = (name: string) => ({ type: "value" as const, min: 0, max: AXIS_MAX, interval: 2, name, nameLocation: "middle" as const, nameGap: 28 });
  return {
    // motion.ts types its easing as a plain string; ECharts wants its own union.
    ...(entrance(series.length) as Pick<EChartsOption, "animation">),
    grid: { left: 36, right: 24, top: statuses.length > 1 ? 36 : 16, bottom: 36, containLabel: true },
    legend: statuses.length > 1 ? { top: 0, left: 0, data: statuses.map((s) => STATUS_WORD[s]), itemWidth: 12, itemHeight: 12 } : { show: false },
    tooltip: {
      trigger: "item",
      formatter: (params: unknown) => {
        const d = (params as { data?: Partial<BubbleDatum> }).data;
        return d?.point ? tooltipHtml(d.point) : "";
      },
    },
    xAxis: axis(X_NAME),
    yAxis: { ...axis(Y_NAME), nameGap: 30 },
    series: [corner, ...series],
  };
}

/** The link of a clicked bubble (the server's `link`), or null for anything else. */
export function clickedLink(params: unknown): string | null {
  const d = (params as { data?: Partial<BubbleDatum> } | null)?.data;
  return d?.point?.link ?? null;
}

export const TABLE_COLUMNS: ChartTableColumn[] = [
  { id: "topic", header: "Topic" },
  { id: "code", header: "ESRS topic" },
  { id: "impact", header: "Impact", numeric: true, decimals: 1 },
  { id: "financial", header: "Financial", numeric: true, decimals: 1 },
  { id: "weight", header: "Weight", numeric: true, decimals: 1 },
  { id: "status", header: "Status" },
  { id: "kpis", header: "KPIs", numeric: true },
  { id: "on_track", header: "On track", numeric: true },
  { id: "off_track", header: "Off track", numeric: true },
];

/** Table view rows, in the server's order; unscored topics show "—" for their scores. */
export function tableRows(points: MaterialityPoint[]): Array<Record<string, string | number | null>> {
  return points.map((p) => ({
    topic: p.label,
    code: p.esrs_topic,
    impact: p.impact,
    financial: p.financial,
    weight: p.weight,
    status: STATUS_WORD[p.status],
    kpis: p.kpis,
    on_track: p.on_track,
    off_track: p.off_track,
  }));
}

const list = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/**
 * One sentence for screen readers, from the server's statuses:
 * "4 material topics; 1 off track in the act-here corner: Own workforce."
 */
export function ariaSentence(points: MaterialityPoint[]): string {
  const n = points.length;
  const { placed, unplaced } = splitPoints(points);
  const corner = placed.filter(inActHere);
  const off = corner.filter((p) => p.status === "off_track");
  const risk = corner.filter((p) => p.status === "at_risk");
  const head = `${formatNumber(n)} material ${n === 1 ? "topic" : "topics"}`;
  let where: string;
  if (off.length) where = `${formatNumber(off.length)} off track in the act-here corner: ${list(off.map((p) => p.label))}`;
  else if (risk.length) where = `none off track in the act-here corner, ${formatNumber(risk.length)} at risk: ${list(risk.map((p) => p.label))}`;
  else where = "none off track or at risk in the act-here corner";
  const tail = unplaced.length ? `; ${formatNumber(unplaced.length)} not scored yet` : "";
  return `${head}; ${where}${tail}.`;
}

/** "Not scored yet: Water and Own workforce." */
export const notScoredText = (unplaced: MaterialityPoint[]) => (unplaced.length ? `Not scored yet: ${list(unplaced.map((p) => p.label))}.` : null);

/** KPI setup's "What matters to you" step, where the scores block lives (Admin and Superadmin only). */
export const ADD_SCORES_LINK = "/kpi/setup?step=topics";
export const canAddScores = (role: string | null | undefined) => role === "Admin" || role === "Superadmin";
