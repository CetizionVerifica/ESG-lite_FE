// IN-5 · The emissions bridge (05-ux §4 D): option, table rows and words for
// the waterfall. Every figure is the server's (`from`, `to`, each step's
// `value` and `inputs`); this file only shapes them. The server guarantees the
// steps add up to `to − from` exactly (I8); the FE never checks or recomputes it.
import type { EChartsOption } from "echarts";
import type { Bridge, Driver } from "../../../lib/insights/contracts";
import { DRIVER_LABEL } from "../../../lib/insights/labels";
import { entrance, morph } from "../../../lib/insights/motion";
import type { ChartTheme } from "../../../theme";
import { formatNumber } from "../../../ui/format";

export type BridgeStep = Bridge["steps"][number];
export type BarKind = "from" | "increase" | "decrease" | "to";

/** The driver's plain words: the server's `label`, else the shared fallback. */
export const driverLabel = (step: Pick<BridgeStep, "driver" | "label">) => step.label?.trim() || DRIVER_LABEL[step.driver];

/** "+5,900" / "−6,200" / "0" (a true minus sign, whole tonnes). */
export function signed(v: number): string {
  const n = formatNumber(Math.abs(v), 0);
  if (n === "0") return "0";
  return `${v > 0 ? "+" : "−"}${n}`;
}

export const kindOf = (v: number): "increase" | "decrease" => (v > 0 ? "increase" : "decrease");

/** Word for the tooltip and table (colour is never alone). */
export const KIND_WORD: Record<BarKind, string> = { from: "Total", to: "Total", increase: "Increase", decrease: "Decrease" };

/**
 * Stable ids for linked views: the totals carry their year (so the Pathway
 * bars of the same year can morph into them), the steps their driver.
 */
export const barGroupId = (bar: { kind: BarKind; year?: number; driver?: Driver }) => (bar.kind === "from" || bar.kind === "to" ? `year:${bar.year}` : `driver:${bar.driver}`);

export interface WaterfallBar {
  id: string;
  kind: BarKind;
  /** Axis label. */
  name: string;
  /** The server's figure for this bar: a total, or a step's change. */
  value: number;
  /** Bar label: the total, or the signed change. */
  label: string;
  /** Layout only: where the floating bar starts (the transparent helper stack). */
  base: number;
  /** Layout only: the drawn bar's height. */
  height: number;
  driver?: Driver;
}

/**
 * The waterfall's bars. `base` and `height` are chart geometry, not reported
 * figures: to draw a waterfall, each step's bar floats on a transparent helper
 * bar whose height is where the previous bar ended. They are positions on the
 * axis, built from the server's step values in order, and never shown as
 * numbers. Labels, the table and the tooltip only ever show server values.
 */
export function waterfallBars(data: Bridge): WaterfallBar[] {
  const bars: WaterfallBar[] = [
    { id: barGroupId({ kind: "from", year: data.from.year }), kind: "from", name: String(data.from.year), value: data.from.value, label: formatNumber(data.from.value, 0), base: 0, height: data.from.value },
  ];
  let level = data.from.value; // drawing position only
  for (const s of data.steps) {
    const kind = kindOf(s.value);
    const base = kind === "increase" ? level : level + s.value;
    bars.push({ id: barGroupId({ kind, driver: s.driver }), kind, name: driverLabel(s), value: s.value, label: signed(s.value), base, height: Math.abs(s.value), driver: s.driver });
    level += s.value;
  }
  bars.push({ id: barGroupId({ kind: "to", year: data.to.year }), kind: "to", name: String(data.to.year), value: data.to.value, label: formatNumber(data.to.value, 0), base: 0, height: data.to.value });
  return bars;
}

/** Bar colour by kind: totals in brand, increases bad, decreases good (05-ux §4 D). */
export function barColor(kind: BarKind, t: Pick<ChartTheme, "ui" | "status">): string {
  if (kind === "increase") return t.status.bad;
  if (kind === "decrease") return t.status.good;
  return t.ui.brand;
}

/** Tooltip lines: name, value with unit, and the word. */
export function barTooltip(bar: WaterfallBar): string {
  if (bar.kind === "from" || bar.kind === "to") return `${bar.name} total: ${formatNumber(bar.value, 0)} tCO₂e`;
  return `${bar.name}: ${bar.label} tCO₂e (${bar.kind})`;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The ECharts option. Two stacked bar series: the transparent helper and the value bars. */
export function bridgeOption(data: Bridge, t: ChartTheme): EChartsOption {
  const bars = waterfallBars(data);
  return {
    // motion.ts types its easing as a string; IN-8 passes ECharts easing names.
    ...(entrance(1) as Pick<EChartsOption, "animation" | "animationDuration" | "animationEasing" | "animationDelay">),
    grid: { left: 8, right: 8, top: 28, bottom: 8, containLabel: true },
    tooltip: { trigger: "item", formatter: (p: unknown) => escapeHtml(barTooltip(bars[(p as { dataIndex: number }).dataIndex])) },
    xAxis: {
      type: "category",
      data: bars.map((b) => b.name),
      axisTick: { show: false },
      axisLabel: { interval: 0, width: 76, overflow: "break", color: t.ui.muted },
    },
    yAxis: { type: "value", name: "tCO₂e", nameTextStyle: { color: t.ui.muted }, axisLabel: { color: t.ui.muted }, splitLine: { lineStyle: { color: t.ui.line } } },
    series: [
      {
        id: "bridge-helper",
        name: "helper",
        type: "bar",
        stack: "bridge",
        silent: true,
        tooltip: { show: false },
        emphasis: { disabled: true },
        itemStyle: { color: "transparent", borderColor: "transparent" },
        data: bars.map((b) => ({ value: b.base, groupId: b.id })),
        ...morph(),
      },
      {
        id: "bridge-values",
        name: "Change in emissions",
        type: "bar",
        stack: "bridge",
        barMaxWidth: 48,
        label: { show: true, position: "top", color: t.ui.ink, formatter: (p: unknown) => bars[(p as { dataIndex: number }).dataIndex].label },
        data: bars.map((b) => ({ value: b.height, name: b.name, groupId: b.id, itemStyle: { color: barColor(b.kind, t) } })),
        ...morph(),
      },
    ],
  };
}

export const BRIDGE_COLUMNS = [
  { id: "step", header: "Step" },
  { id: "change", header: "Change (tCO₂e)" },
  { id: "kind", header: "Increase or decrease" },
];

/** Table view rows: totals and each step, server values with sign and a word. */
export function bridgeTableRows(data: Bridge): Array<{ step: string; change: string; kind: string }> {
  return waterfallBars(data).map((b) =>
    b.kind === "from" || b.kind === "to" ? { step: `${b.name} total`, change: formatNumber(b.value, 0), kind: KIND_WORD[b.kind] } : { step: b.name, change: b.label, kind: KIND_WORD[b.kind] },
  );
}

/** "Emissions went from 44,910 tCO₂e in 2025 to 41,280 tCO₂e in 2026; the biggest driver was cleaner electricity (−2,449 tCO₂e)." */
export function bridgeAriaLabel(data: Bridge): string {
  const head = `Emissions went from ${formatNumber(data.from.value, 0)} tCO₂e in ${data.from.year} to ${formatNumber(data.to.value, 0)} tCO₂e in ${data.to.year}`;
  // Picks the step with the largest server value by size; nothing is computed.
  const biggest = data.steps.reduce<BridgeStep | null>((best, s) => (!best || Math.abs(s.value) > Math.abs(best.value) ? s : best), null);
  if (!biggest) return `${head}.`;
  const name = driverLabel(biggest);
  return `${head}; the biggest driver was ${name.charAt(0).toLowerCase()}${name.slice(1)} (${signed(biggest.value)} tCO₂e).`;
}

// ---------------------------------------------------------------------------
// CalcDrawer: the drivers' inputs in readable words
// ---------------------------------------------------------------------------

/** Readable names for input keys (01-contracts §3 and IN-5 Build 2). Unknown keys show as sent. */
const INPUT_NAME: Record<string, string> = {
  output: "Output",
  q: "Output",
  s1_intensity: "Scope 1 emissions per unit of output (tCO₂e)",
  i: "Emissions per unit of output (tCO₂e)",
  i1: "Scope 1 emissions per unit of output (tCO₂e)",
  kwh_per_t: "Electricity per tonne (kWh)",
  kwh_per_q: "Electricity per unit of output (kWh)",
  t_per_kwh: "Electricity emission factor (tCO₂e per kWh)",
  s1: "Scope 1 emissions (tCO₂e)",
  s2: "Scope 2 emissions (tCO₂e)",
  s3: "Scope 3 emissions (tCO₂e)",
  e: "Emissions (tCO₂e)",
  kwh: "Electricity (kWh)",
  l: "Log-mean of the two years' emissions, L",
  ln_ratio: "Log of the driver's ratio, ln(driverᵀ / driver⁰)",
  ln: "Log of the driver's ratio, ln(driverᵀ / driver⁰)",
};

/** "Output (2025)" for `output_from`, "Output (2026)" for `Q_T`, "Log-mean …" for `L`; unknown keys as sent. */
export function inputName(key: string, years: { from: number; to: number }): string {
  const k = key.toLowerCase();
  const suffix: [RegExp, number][] = [
    [/_from$|_0$|0$|⁰$/, years.from],
    // "QT" / "I1T": a short symbol with a T for the later year.
    [/_to$|_t$|ᵀ$|(?<=^[a-z][0-9]?)t$/, years.to],
  ];
  for (const [re, year] of suffix) {
    const base = k.replace(re, "");
    if (base !== k && INPUT_NAME[base]) return `${INPUT_NAME[base]} (${year})`;
  }
  return INPUT_NAME[k] ?? key;
}

/** Input values: whole numbers from 100, more decimals for small factors (display only). */
export function inputValue(v: number): string {
  const a = Math.abs(v);
  if (a === 0 || a >= 100) return formatNumber(v, 0);
  if (a >= 1) return formatNumber(v, 2);
  return formatNumber(v, Math.min(8, Math.ceil(-Math.log10(a)) + 2));
}

export function inputRows(step: BridgeStep, years: { from: number; to: number }): Array<{ key: string; name: string; value: string }> {
  return Object.entries(step.inputs).map(([key, v]) => ({ key, name: inputName(key, years), value: inputValue(v) }));
}
