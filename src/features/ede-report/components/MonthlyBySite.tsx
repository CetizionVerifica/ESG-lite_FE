import { useState } from "react";
import { ChartFrame, SegmentedControl, formatEmissions } from "../../../ui";
import { monthLabel } from "../logic";

type Layout = "stacked" | "grouped";

type Props = {
  months: string[];
  series: { siteId: number; siteName: string; values: number[] }[];
  colorIndex: Map<number, number>;
};

/** Total Scope 1–3 tCO₂e per month, one series per site; stacked or side by side. */
export function MonthlyBySite({ months, series, colorIndex }: Props) {
  const [layout, setLayout] = useState<Layout>("stacked");
  const shown = series.filter((s) => s.values.some((v) => v !== 0));
  const labels = months.map(monthLabel);

  return (
    <ChartFrame
      title="Monthly emissions by site"
      unit="tCO₂e"
      height={320}
      empty={shown.length === 0}
      emptyText="No Scope 1–3 emissions in these months."
      exportName="ede-monthly-by-site"
      actions={
        <SegmentedControl<Layout>
          size="sm"
          label="Bars"
          value={layout}
          onChange={setLayout}
          options={[
            { value: "stacked", label: "Stacked" },
            { value: "grouped", label: "Grouped" },
          ]}
        />
      }
      table={{
        columns: [
          { id: "month", header: "Month" },
          ...shown.map((s) => ({
            id: `s${s.siteId}`,
            header: s.siteName,
            numeric: true,
            decimals: 3,
          })),
        ],
        rows: labels.map((month, i) => Object.fromEntries([["month", month], ...shown.map((s) => [`s${s.siteId}`, s.values[i]])])),
      }}
      option={(t) => ({
        grid: { left: 8, right: 8, top: 32, bottom: 4, containLabel: true },
        legend: { top: 0, type: "scroll" },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          valueFormatter: (v) => (typeof v === "number" ? formatEmissions(v) : "—"),
        },
        xAxis: {
          type: "category",
          data: labels,
          axisLabel: { hideOverlap: true },
        },
        yAxis: { type: "value" },
        series: shown.map((s) => ({
          name: s.siteName,
          type: "bar" as const,
          stack: layout === "stacked" ? "total" : undefined,
          barMaxWidth: layout === "stacked" ? 32 : 14,
          itemStyle: { color: t.color[colorIndex.get(s.siteId) ?? 0] },
          emphasis: { focus: "series" as const },
          data: s.values,
        })),
      })}
    />
  );
}
