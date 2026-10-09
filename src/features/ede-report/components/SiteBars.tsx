import { ChartFrame } from "../../../ui";

type Props = {
  title: string;
  unit: string;
  subtitle?: string;
  rows: { siteId: number; siteName: string; value: number }[];
  colorIndex: Map<number, number>;
  format: (v: number) => string;
  emptyText: string;
  exportName: string;
};

/** One bar per site in the site's own colour (renewables produced, emissions saved). */
export function SiteBars({ title, unit, subtitle, rows, colorIndex, format, emptyText, exportName }: Props) {
  const shown = rows.filter((r) => r.value !== 0);
  return (
    <ChartFrame
      title={title}
      unit={unit}
      subtitle={subtitle}
      empty={shown.length === 0}
      emptyText={emptyText}
      exportName={exportName}
      table={{
        columns: [
          { id: "site", header: "Site" },
          {
            id: "value",
            header: unit,
            numeric: true,
            decimals: unit === "kWh" ? 0 : 3,
          },
        ],
        rows: shown.map((r) => ({ site: r.siteName, value: r.value })),
      }}
      option={(t) => ({
        grid: { left: 8, right: 8, top: 24, bottom: 4, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          valueFormatter: (v) => (typeof v === "number" ? format(v) : "—"),
        },
        xAxis: {
          type: "category",
          data: shown.map((r) => r.siteName),
          axisLabel: { interval: 0, hideOverlap: true },
        },
        yAxis: { type: "value" },
        series: [
          {
            type: "bar",
            barMaxWidth: 40,
            label: {
              show: true,
              position: "top",
              formatter: (p: { value?: unknown }) => (typeof p.value === "number" ? format(p.value) : ""),
            },
            data: shown.map((r) => ({
              value: r.value,
              itemStyle: { color: t.color[colorIndex.get(r.siteId) ?? 0] },
            })),
          },
        ],
      })}
    />
  );
}
