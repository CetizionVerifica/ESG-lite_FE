import type { KpiEsgTrend } from "../../../../lib/kpi/contracts";
import { columnDecimals, formatWithUnit } from "../../../../lib/kpi/units";
import { ChartFrame } from "../../../../ui";
import { PillarBadge } from "../../components/PillarBadge";
import { changeWords, pointLabel, yRange } from "../logic";
import { ChangeChip } from "./ChangeChip";

/**
 * Wave E · One headline KPI over the year (or the last five years): a thin
 * line in its pillar colour on one axis, a crosshair and tooltip on hover, a
 * dashed target line when one is set (with a legend then), and a table view.
 */
export function TrendChart({ trend, vsLabel }: { trend: KpiEsgTrend; vsLabel: string }) {
  const points = trend.series;
  const known = points.filter((p) => p.value !== null).length;
  const targetValue = trend.target?.value ?? null;
  const decimals = trend.decimals ?? undefined;
  const fmt = (v: number | null) => formatWithUnit(v, trend.unit, decimals);
  const change = changeWords(trend.change_pct, trend.direction_good, vsLabel);
  const range = yRange(
    points.map((p) => p.value),
    targetValue,
  );
  return (
    <div data-testid="esg-trend" data-kpi={trend.code}>
      <ChartFrame
        title={trend.name}
        unit={trend.unit ?? undefined}
        height={150}
        empty={known === 0}
        emptyText="No approved values for this year yet."
        subtitle={
          <span className="flex flex-wrap items-center gap-1.5">
            <PillarBadge pillar={trend.pillar} />
            <span className="font-num text-sm font-semibold text-ink" data-testid="esg-trend-value">
              {fmt(trend.value)}
            </span>
            {change && <ChangeChip change={{ ...change, amount: `${change.amount} vs ${vsLabel}` }} />}
            {trend.target?.label && <span className="text-xs text-muted">Target: {trend.target.label}</span>}
          </span>
        }
        legend={
          targetValue !== null ? (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Legend">
              <li className="flex items-center gap-1.5">
                <svg width="18" height="6" aria-hidden className="text-ink">
                  <line x1="0" y1="3" x2="18" y2="3" stroke="currentColor" strokeWidth="2" />
                </svg>
                {trend.name}
              </li>
              <li className="flex items-center gap-1.5">
                <svg width="18" height="6" aria-hidden className="text-muted">
                  <line x1="0" y1="3" x2="18" y2="3" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
                </svg>
                Target {fmt(targetValue)}
              </li>
            </ul>
          ) : undefined
        }
        table={{
          columns: [
            { id: "period", header: "Period" },
            { id: "value", header: trend.unit ? `Value (${trend.unit})` : "Value", numeric: true, decimals: columnDecimals(trend.unit, trend.decimals ?? 0) },
            ...(targetValue !== null ? [{ id: "target", header: "Target", numeric: true, decimals: columnDecimals(trend.unit, trend.decimals ?? 0) }] : []),
          ],
          rows: points.map((p) => ({ period: pointLabel(p), value: p.value, ...(targetValue !== null ? { target: targetValue } : {}) })),
        }}
        option={(t) => {
          const color = t.pillars[trend.pillar];
          return {
            aria: { enabled: true, label: { description: `${trend.name}: ${known} values from ${pointLabel(points[0] ?? { label: "", period: "" })} to ${pointLabel(points[points.length - 1] ?? { label: "", period: "" })}. Latest ${fmt(trend.value)}.` } },
            grid: { left: 8, right: 12, top: 10, bottom: 4, containLabel: true },
            tooltip: {
              trigger: "axis",
              confine: true,
              axisPointer: { type: "cross", label: { show: false } },
              formatter: (params: unknown) => {
                const p = (Array.isArray(params) ? params[0] : params) as { dataIndex: number };
                const point = points[p?.dataIndex ?? -1];
                if (!point) return "";
                const target = targetValue !== null ? `<br/>Target ${fmt(targetValue)}` : "";
                return `${pointLabel(point)}<br/><b>${point.value === null ? "No approved value" : fmt(point.value)}</b>${target}`;
              },
            },
            xAxis: { type: "category", boundaryGap: false, data: points.map(pointLabel), axisLabel: { hideOverlap: true, fontSize: 10, formatter: (v: string) => v.replace(/ \d{4}$/, "") } },
            yAxis: { type: "value", splitNumber: 3, axisLabel: { fontSize: 10 }, ...(range ? { min: range.min, max: range.max } : {}) },
            series: [
              {
                name: trend.name,
                type: "line",
                data: points.map((p) => p.value),
                showSymbol: known < 3,
                symbolSize: 8,
                connectNulls: false,
                lineStyle: { width: 2, color },
                itemStyle: { color },
                emphasis: { focus: "series" },
                markLine:
                  targetValue !== null
                    ? { symbol: "none", silent: true, label: { show: false }, lineStyle: { type: "dashed", width: 1.5, color: t.tooltip.axisPointer.lineStyle.color }, data: [{ yAxis: targetValue, name: "Target" }] }
                    : undefined,
              },
            ],
          };
        }}
      />
    </div>
  );
}
