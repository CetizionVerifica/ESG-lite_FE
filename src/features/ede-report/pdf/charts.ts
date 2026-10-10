import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import type { PdfTheme } from "../../../theme";
import type { EdeReportResponse } from "../../../services/reportService";
import type { ReportPeriod } from "../../../ui";
import { type SiteRef, intensityGrid, monthLabel, monthlyGrid } from "../logic";

export type EdePdfCharts = { share?: string; monthly?: string; renewables?: string; saved?: string; intensity: { unit: string; src?: string }[] };

const W = 900;
const H = 420;

/** Renders one chart off screen in print colours and returns it as a PNG data URL. */
function png(option: EChartsOption, t: PdfTheme, height = H): string | undefined {
  const el = document.createElement("div");
  const chart = echarts.init(el, null, { renderer: "canvas", width: W, height, devicePixelRatio: 2 });
  try {
    chart.setOption({
      animation: false,
      backgroundColor: t.colors.paper,
      textStyle: { color: t.colors.ink, fontFamily: "Helvetica, Arial, sans-serif" },
      color: t.colors.series,
      ...option,
    });
    return chart.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: t.colors.paper });
  } catch {
    return undefined;
  } finally {
    chart.dispose();
  }
}

function axes(t: PdfTheme, categories: string[]) {
  const line = { lineStyle: { color: t.colors.line } };
  return {
    xAxis: { type: "category" as const, data: categories, axisLine: line, axisLabel: { color: t.colors.muted, hideOverlap: true } },
    yAxis: { type: "value" as const, axisLabel: { color: t.colors.muted }, splitLine: { lineStyle: { color: t.colors.line, type: "dashed" as const } } },
  };
}

/** The report's charts, each site in the same series colour as on screen. */
export function renderCharts(data: EdeReportResponse, period: ReportPeriod, sites: SiteRef[], colorIndex: Map<number, number>, t: PdfTheme): EdePdfCharts {
  const colorOf = (siteId: number) => t.colors.series[colorIndex.get(siteId) ?? 0];
  const legend = { bottom: 0, textStyle: { color: t.colors.ink } };
  const out: EdePdfCharts = { intensity: [] };

  const share = data.bySite.filter((r) => r.total > 0);
  if (share.length)
    out.share = png(
      {
        legend,
        series: [
          {
            type: "pie",
            radius: ["48%", "72%"],
            center: ["50%", "45%"],
            label: { color: t.colors.ink, formatter: "{b}: {d}%" },
            data: share.map((r) => ({ name: r.siteName, value: r.total, itemStyle: { color: colorOf(r.siteId) } })),
          },
        ],
      },
      t,
    );

  const grid = monthlyGrid(data, period, sites);
  const monthly = grid.series.filter((s) => s.values.some((v) => v !== 0));
  if (monthly.length)
    out.monthly = png(
      {
        legend,
        grid: { left: 8, right: 8, top: 16, bottom: 36, containLabel: true },
        ...axes(
          t,
          grid.months.map((m) => monthLabel(m)),
        ),
        series: monthly.map((s) => ({
          name: s.siteName,
          type: "bar",
          stack: "total",
          barMaxWidth: 36,
          itemStyle: { color: colorOf(s.siteId) },
          data: s.values,
        })),
      },
      t,
    );

  const bars = (rows: { siteId: number; siteName: string; value: number }[], unit: string) => {
    const shown = rows.filter((r) => r.value !== 0);
    if (!shown.length) return undefined;
    return png(
      {
        grid: { left: 8, right: 8, top: 28, bottom: 8, containLabel: true },
        ...axes(
          t,
          shown.map((r) => r.siteName),
        ),
        series: [
          {
            type: "bar",
            barMaxWidth: 56,
            label: { show: true, position: "top", color: t.colors.ink, formatter: `{c} ${unit}` },
            data: shown.map((r) => ({ value: Number(r.value.toFixed(unit === "kWh" ? 0 : 3)), itemStyle: { color: colorOf(r.siteId) } })),
          },
        ],
      },
      t,
      320,
    );
  };
  out.renewables = bars(
    data.renewableKwhBySite.map((r) => ({ siteId: r.siteId, siteName: r.siteName, value: Number(r.kwh) || 0 })),
    "kWh",
  );
  out.saved = bars(
    data.savedBySite.map((r) => ({ siteId: r.siteId, siteName: r.siteName, value: Number(r.saved) || 0 })),
    "tCO2e",
  );

  // One intensity chart per production unit, so lines on an axis always share it.
  const ig = intensityGrid(data, period, sites);
  for (const g of ig.groups) {
    const base = axes(
      t,
      ig.months.map((m) => monthLabel(m)),
    );
    out.intensity.push({
      unit: g.unit,
      src: png(
        {
          legend,
          grid: { left: 8, right: 8, top: 28, bottom: 36, containLabel: true },
          ...base,
          yAxis: { ...base.yAxis, name: `tCO2e/${g.unit}`, nameTextStyle: { color: t.colors.muted } },
          series: g.rows.map((r) => ({
            name: r.site.siteName,
            type: "line",
            connectNulls: false,
            symbolSize: 6,
            itemStyle: { color: colorOf(r.site.siteId) },
            data: r.values,
          })),
        },
        t,
      ),
    });
  }
  return out;
}
