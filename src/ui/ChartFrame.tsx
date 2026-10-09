import { useRef, useState, type ReactNode } from "react";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import { Download } from "lucide-react";
import { useChartTheme, type ChartTheme } from "../theme";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { SegmentedControl } from "./SegmentedControl";
import { SkeletonChart } from "./Skeleton";
import { cn } from "./cn";
import { formatNumber } from "./format";

export type ChartTableColumn = { id: string; header: string; numeric?: boolean; decimals?: number };

export type ChartFrameProps = {
  title: string;
  /** Small text beside the title, e.g. "tCO₂e". */
  unit?: string;
  subtitle?: ReactNode;
  /**
   * ECharts option. Colours, fonts and axes come from useChartTheme(); don't hard-code colours.
   * Pass a function to read the theme, e.g. Scope series: `itemStyle: { color: t.scopes.s1 }`.
   */
  option: EChartsOption | ((theme: ChartTheme) => EChartsOption);
  height?: number;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** True when there's no data to plot. */
  empty?: boolean;
  emptyText?: string;
  /** The same data as a table for the "Table" view (and screen readers). */
  table?: { columns: ChartTableColumn[]; rows: Array<Record<string, string | number | null>> };
  /** Enables PNG export with this file name (no extension). */
  exportName?: string;
  /** Custom legend under the chart, when the ECharts legend is off. */
  legend?: ReactNode;
  /** Extra controls in the header (e.g. a SegmentedControl). */
  actions?: ReactNode;
  className?: string;
};

/** Frame for every ECharts chart: title + unit, theme from tokens, loading/empty/error, table view, PNG export. */
export function ChartFrame({
  title,
  unit,
  subtitle,
  option,
  height = 280,
  loading,
  error,
  onRetry,
  empty,
  emptyText = "No data for this period.",
  table,
  exportName,
  legend,
  actions,
  className,
}: ChartFrameProps) {
  const theme = useChartTheme();
  const chartRef = useRef<ReactECharts>(null);
  const [view, setView] = useState<"chart" | "table">("chart");
  const ready = !loading && !error && !empty;
  const resolvedOption = typeof option === "function" ? option(theme) : option;

  const exportPng = () => {
    const inst = chartRef.current?.getEchartsInstance();
    if (!inst) return;
    const url = inst.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: theme.tooltip.backgroundColor });
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportName ?? "chart"}.png`;
    a.click();
  };

  let body: ReactNode;
  if (loading) body = <SkeletonChart className="h-full" />;
  else if (error) body = <EmptyState compact variant="error" title={error} action={onRetry && <Button size="sm" onClick={onRetry}>Try again</Button>} />;
  else if (empty) body = <EmptyState compact title={emptyText} />;
  else if (view === "table" && table)
    body = (
      <div className="h-full overflow-auto">
        <table className="w-full text-sm text-ink">
          <caption className="sr-only">{title}</caption>
          <thead className="sticky top-0 bg-panel">
            <tr>
              {table.columns.map((c) => (
                <th key={c.id} scope="col" className={cn("h-row px-2 text-xs font-medium text-muted", c.numeric ? "text-right" : "text-left")}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((r, i) => (
              <tr key={i} className="h-row border-t border-line">
                {table.columns.map((c) => {
                  const v = r[c.id];
                  return (
                    <td key={c.id} className={cn("px-2", c.numeric ? "text-right font-num tabular-nums" : "")}>
                      {c.numeric && typeof v === "number" ? formatNumber(v, c.decimals ?? 0) : v ?? "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  else
    body = (
      <ReactECharts
        ref={chartRef}
        option={resolvedOption}
        theme={theme}
        notMerge
        style={{ height: "100%", width: "100%" }}
        opts={{ renderer: "canvas" }}
      />
    );

  return (
    <figure className={cn("rounded-card border border-line bg-panel p-4", className)} aria-busy={loading || undefined}>
      <figcaption className="mb-3 flex flex-wrap items-start gap-2">
        {/* Keeps the title readable on phones: the controls wrap below it. */}
        <div className="min-w-[12rem] flex-1">
          <h3 className="text-sm font-semibold text-ink">
            {title}
            {unit && <span className="ml-1.5 text-xs font-normal text-muted">{unit}</span>}
          </h3>
          {subtitle && <div className="mt-0.5 text-xs text-muted">{subtitle}</div>}
        </div>
        {actions}
        {table && ready && (
          <SegmentedControl
            size="sm"
            label={`${title} view`}
            value={view}
            onChange={setView}
            options={[
              { value: "chart", label: "Chart" },
              { value: "table", label: "Table" },
            ]}
          />
        )}
        {exportName && ready && view === "chart" && (
          <Button size="sm" variant="ghost" onClick={exportPng} icon={<Download aria-hidden className="size-4" />}>
            PNG
          </Button>
        )}
      </figcaption>
      <div style={{ height }}>{body}</div>
      {legend && ready && view === "chart" && <div className="mt-3">{legend}</div>}
    </figure>
  );
}
