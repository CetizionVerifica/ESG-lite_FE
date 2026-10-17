import ReactECharts from "echarts-for-react";
import { formatWithUnit } from "../../../lib/kpi/units";
import { useChartTheme } from "../../../theme";
import { cn } from "../../../ui";
import { type SparkPoint, sparkSummary } from "./spark";

/**
 * A one-series trend line for KPI cards and targets (ECharts, the repo's chart
 * approach, coloured from the theme): no axes, a tooltip per point on hover,
 * and an accessible summary for screen readers.
 */
export function Sparkline({ name, points, unit, height = 44, className }: { name: string; points: SparkPoint[]; unit: string | null; height?: number; className?: string }) {
  const theme = useChartTheme();
  const color = theme.color[0];
  if (points.filter((p) => p.value !== null).length < 2) return <p className={cn("text-xs text-muted", className)}>Not enough values for a trend yet.</p>;
  return (
    <div role="img" aria-label={sparkSummary(name, points, unit)} className={className} style={{ height }}>
      <ReactECharts
        theme={theme}
        notMerge
        style={{ height: "100%", width: "100%" }}
        opts={{ renderer: "svg" }}
        option={{
          grid: { left: 4, right: 6, top: 6, bottom: 4 },
          tooltip: {
            trigger: "axis",
            confine: true,
            axisPointer: { type: "line" },
            formatter: (params: unknown) => {
              const p = (Array.isArray(params) ? params[0] : params) as { dataIndex: number };
              const point = points[p.dataIndex];
              return point ? `${point.label} · ${formatWithUnit(point.value, unit)}` : "";
            },
          },
          xAxis: { type: "category", show: false, boundaryGap: false, data: points.map((p) => p.label) },
          yAxis: { type: "value", show: false, scale: true },
          series: [
            {
              name,
              type: "line",
              data: points.map((p) => p.value),
              smooth: false,
              showSymbol: false,
              connectNulls: false,
              lineStyle: { width: 2, color },
              itemStyle: { color },
              areaStyle: { color, opacity: 0.1 },
            },
          ],
        }}
      />
    </div>
  );
}
