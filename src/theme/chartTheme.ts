import { useMemo } from "react";
import type { ThemeTokens } from "./tokens";
import { useTheme } from "./useTheme";

/** Font stacks for canvas text; ECharts can't resolve CSS variables. */
const UI_FONT = '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
const NUM_FONT = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace';

/** Colours for Scope 1/2/3 series, always in this order. */
export interface ScopeColors {
  s1: string;
  s2: string;
  s3: string;
}

/**
 * ECharts theme object built from the theme tokens. Pass it as
 * `<ReactECharts theme={chartTheme} />`; series colours default to the
 * categorical --t-series-* palette, scope charts use `chartTheme.scopes`.
 */
export function chartTheme(t: ThemeTokens) {
  const axis = {
    axisLine: { show: true, lineStyle: { color: t.line } },
    axisTick: { show: false, lineStyle: { color: t.line } },
    axisLabel: { color: t.muted, fontFamily: UI_FONT },
    splitLine: { show: true, lineStyle: { color: t.line, type: "dashed" as const } },
    splitArea: { show: false },
    nameTextStyle: { color: t.muted },
  };
  return {
    color: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => t[`series-${i}` as keyof ThemeTokens]),
    backgroundColor: "transparent",
    textStyle: { color: t.ink, fontFamily: UI_FONT },
    title: {
      textStyle: { color: t.ink, fontFamily: UI_FONT, fontWeight: 600 },
      subtextStyle: { color: t.muted, fontFamily: UI_FONT },
    },
    legend: {
      textStyle: { color: t.muted, fontFamily: UI_FONT },
      inactiveColor: t.line,
      pageTextStyle: { color: t.muted },
    },
    tooltip: {
      backgroundColor: t.panel,
      borderColor: t.line,
      borderWidth: 1,
      textStyle: { color: t.ink, fontFamily: NUM_FONT },
      axisPointer: {
        lineStyle: { color: t.muted },
        crossStyle: { color: t.muted },
        label: { backgroundColor: t.ink, color: t.panel },
      },
    },
    categoryAxis: { ...axis, splitLine: { show: false } },
    valueAxis: { ...axis, axisLine: { show: false } },
    timeAxis: { ...axis, splitLine: { show: false } },
    logAxis: { ...axis, axisLine: { show: false } },
    line: { symbol: "circle", symbolSize: 5, lineStyle: { width: 2 } },
    bar: { itemStyle: { borderRadius: 2 } },
    pie: { itemStyle: { borderColor: t.panel, borderWidth: 1 } },
    markLine: { lineStyle: { color: t.muted } },
    dataZoom: {
      borderColor: t.line,
      fillerColor: t.tint,
      handleStyle: { color: t.panel, borderColor: t.muted },
      textStyle: { color: t.muted },
    },
    /** Not read by ECharts: colours for Scope 1/2/3 series. */
    scopes: { s1: t.s1, s2: t.s2, s3: t.s3 } as ScopeColors,
  };
}

export type ChartTheme = ReturnType<typeof chartTheme>;

/**
 * The ECharts theme for the current pack and look. The object only changes
 * when the theme does, so charts re-initialise on a theme switch and not on
 * every render.
 */
export function useChartTheme(): ChartTheme {
  const { tokens } = useTheme();
  return useMemo(() => chartTheme(tokens), [tokens]);
}
