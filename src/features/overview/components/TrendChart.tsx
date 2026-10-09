import { useState } from "react";
import type { OverviewMonth } from "../../../services/overviewService";
import { useTheme } from "../../../theme";
import { ChartFrame, SegmentedControl, formatEmissions } from "../../../ui";
import { shortMonth, trendTable } from "../logic";

type Measure = "net" | "gross";

const YEARLY = "Yearly filing";

/**
 * Monthly net (or gross) emissions, with approved yearly filings as a
 * separate hatched bar: they cover the whole year, so they aren't spread
 * over months.
 */
export function TrendChart(props: { trend: OverviewMonth[] | undefined; yearlyTotal: number; loading: boolean; error: string | null; onRetry: () => void }) {
  const { trend = [], yearlyTotal, loading, error, onRetry } = props;
  const { tokens } = useTheme();
  const [measure, setMeasure] = useState<Measure>("net");
  // Yearly filings hold every category, renewables included, so they have no
  // net figure: the bar shows in the Gross view only.
  const hasYearly = yearlyTotal > 0 && measure === "gross";
  const empty = !trend.some((t) => t.gross !== 0 || t.saved !== 0) && !(yearlyTotal > 0);
  const months = trend.map((t) => shortMonth(t.month));
  const values = trend.map((t) => t[measure]);
  const label = measure === "net" ? "Net" : "Gross";

  return (
    <ChartFrame
      title={`Monthly ${label.toLowerCase()} emissions`}
      unit="tCO₂e"
      subtitle={
        yearlyTotal > 0
          ? measure === "gross"
            ? "Yearly filings (all categories) are their own bar, not spread over months."
            : "Yearly filings aren't in the net view; switch to Gross to see them."
          : undefined
      }
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={empty}
      emptyText="Nothing approved in these months yet."
      exportName="overview-monthly-trend"
      actions={
        <SegmentedControl<Measure>
          size="sm"
          label="Measure"
          value={measure}
          onChange={setMeasure}
          options={[
            { value: "net", label: "Net" },
            { value: "gross", label: "Gross" },
          ]}
        />
      }
      table={{
        columns: [
          { id: "month", header: "Month" },
          { id: "gross", header: "Gross tCO₂e", numeric: true, decimals: 3 },
          { id: "saved", header: "Saved tCO₂e", numeric: true, decimals: 3 },
          { id: "net", header: "Net tCO₂e", numeric: true, decimals: 3 },
        ],
        rows: trendTable(trend, yearlyTotal),
      }}
      option={{
        grid: { left: 8, right: 8, top: 16, bottom: 4, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          valueFormatter: (v) => (typeof v === "number" ? formatEmissions(v) : "—"),
        },
        xAxis: { type: "category", data: hasYearly ? [...months, YEARLY] : months },
        yAxis: { type: "value" },
        series: [
          {
            name: label,
            type: "bar",
            barMaxWidth: 28,
            itemStyle: { color: tokens.brand },
            data: hasYearly ? [...values, null] : values,
          },
          ...(hasYearly
            ? [
                {
                  name: YEARLY,
                  type: "bar" as const,
                  barMaxWidth: 28,
                  barGap: "-100%",
                  itemStyle: {
                    color: tokens.tint,
                    borderColor: tokens.brand,
                    borderWidth: 1,
                    decal: { symbol: "rect", color: tokens.brand, dashArrayX: [1, 0], dashArrayY: [2, 5], rotation: -Math.PI / 4 },
                  },
                  data: [...months.map(() => null), yearlyTotal],
                },
              ]
            : []),
        ],
      }}
    />
  );
}
