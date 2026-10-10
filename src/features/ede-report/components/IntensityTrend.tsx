import { useState } from "react";
import type { ReportPeriod } from "../../../ui";
import { ChartFrame, Select, formatEmissions, formatNumber } from "../../../ui";
import type { EdeReportResponse } from "../../../services/reportService";
import { type SiteRef, intensitySeries, intensitySites, monthLabel } from "../logic";

type Props = {
  data: EdeReportResponse;
  period: ReportPeriod;
  sites: SiteRef[];
  colorIndex: Map<number, number>;
};

/** One site at a time: monthly emissions as bars, intensity (tCO₂e per production unit) as a line on its own axis. */
export function IntensityTrend({ data, period, sites, colorIndex }: Props) {
  const withRows = intensitySites(data, sites);
  const [picked, setPicked] = useState<number | null>(null);
  const site = withRows.find((s) => s.siteId === picked) ?? withRows[0];
  const series = site ? intensitySeries(data, period, site) : null;
  const labels = series?.months.map(monthLabel) ?? [];
  const intensityUnit = `tCO₂e/${series?.unit ?? "unit"}`;

  return (
    <ChartFrame
      title="Intensity trend"
      unit={site ? `${site.siteName} · ${intensityUnit}` : undefined}
      subtitle="Intensity is the month's Scope 1–3 emissions divided by its approved production. Months without production have no intensity."
      height={320}
      empty={!series || series.emissions.every((v) => v === 0)}
      emptyText="No emissions with production for these sites."
      exportName="ede-intensity-trend"
      actions={
        withRows.length > 1 ? (
          <Select<number>
            label="Site"
            hideLabel
            className="w-48"
            value={site?.siteId ?? null}
            onChange={(v) => setPicked(v)}
            options={withRows.map((s) => ({
              value: s.siteId,
              label: s.siteName,
            }))}
          />
        ) : undefined
      }
      table={
        series
          ? {
              columns: [
                { id: "month", header: "Month" },
                {
                  id: "emissions",
                  header: "tCO₂e",
                  numeric: true,
                  decimals: 3,
                },
                {
                  id: "intensity",
                  header: intensityUnit,
                  numeric: true,
                  decimals: 4,
                },
              ],
              rows: labels.map((month, i) => ({
                month,
                emissions: series.emissions[i],
                intensity: series.intensity[i],
              })),
            }
          : undefined
      }
      option={(t) => ({
        grid: { left: 8, right: 8, top: 40, bottom: 4, containLabel: true },
        legend: { top: 0, data: ["Emissions", "Intensity"] },
        tooltip: { trigger: "axis" },
        xAxis: {
          type: "category",
          data: labels,
          axisLabel: { hideOverlap: true },
        },
        yAxis: [
          { type: "value", name: "tCO₂e" },
          { type: "value", name: intensityUnit, splitLine: { show: false } },
        ],
        series: [
          {
            name: "Emissions",
            type: "bar",
            barMaxWidth: 28,
            itemStyle: {
              color: t.color[site ? (colorIndex.get(site.siteId) ?? 0) : 0],
              opacity: 0.55,
            },
            tooltip: {
              valueFormatter: (v) => (typeof v === "number" ? formatEmissions(v) : "—"),
            },
            data: series?.emissions ?? [],
          },
          {
            name: "Intensity",
            type: "line",
            yAxisIndex: 1,
            connectNulls: false,
            symbolSize: 6,
            itemStyle: {
              color: t.color[site ? (colorIndex.get(site.siteId) ?? 0) : 0],
            },
            lineStyle: { width: 2 },
            tooltip: {
              valueFormatter: (v) => (typeof v === "number" ? `${formatNumber(v, 4)} ${intensityUnit}` : "—"),
            },
            data: series?.intensity ?? [],
          },
        ],
      })}
    />
  );
}
