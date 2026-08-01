import React, { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { PeriodBreakdown } from "../../services/ghgreportService";

type Props = {
  periodBreakdown?: PeriodBreakdown;
  isDark?: boolean;
};

function r2(n: number) {
  return Number((n || 0).toFixed(2));
}

// The ECharts tooltip is built as an HTML string, which bypasses React's own
// escaping — so any server-provided text interpolated into it must be escaped.
function esc(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

const Card = ({
  title,
  subtitle,
  children,
  isDark,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  isDark?: boolean;
}) => {
  const card = isDark ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200";
  const titleCls = isDark ? "text-slate-100" : "text-gray-900";
  const subCls = isDark ? "text-slate-300" : "text-gray-600";
  return (
    <div className={`rounded-xl border p-4 ${card}`}>
      <div className="mb-3">
        <h3 className={`text-sm font-semibold ${titleCls}`}>{title}</h3>
        {subtitle ? <p className={`text-xs mt-0.5 ${subCls}`}>{subtitle}</p> : null}
      </div>
      <div>{children}</div>
    </div>
  );
};

const GhgReportPeriodChart = ({ periodBreakdown, isDark }: Props) => {
  const frequency = periodBreakdown?.frequency ?? "yearly";
  const periods = useMemo(() => periodBreakdown?.periods ?? [], [periodBreakdown]);

  const option = useMemo(() => {
    const axisCol = isDark ? "#94a3b8" : "#52525b";
    const labelCol = isDark ? "#e2e8f0" : "#18181b";
    const gridLineColor = isDark ? "rgba(148,163,184,0.12)" : "rgba(0,0,0,0.06)";

    const categories = periods.map((p) => p.label);
    const totals = periods.map((p) => r2(p.total));
    const isLine = frequency === "monthly";

    const AREA_COLOR = {
      type: "linear" as const,
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        { offset: 0, color: isDark ? "rgba(20,184,166,0.35)" : "rgba(13,148,136,0.28)" },
        { offset: 1, color: isDark ? "rgba(20,184,166,0.02)" : "rgba(13,148,136,0.02)" },
      ],
    };

    const BAR_COLOR = {
      type: "linear" as const,
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        { offset: 0, color: "#0d9488" },
        { offset: 1, color: "#047857" },
      ],
    };

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        backgroundColor: isDark ? "rgba(9,14,28,0.97)" : "rgba(255,255,255,0.98)",
        borderColor: isDark ? "#334155" : "#e4e4e7",
        borderWidth: 1,
        padding: [12, 16],
        textStyle: { color: labelCol, fontSize: 13 },
        extraCssText: `box-shadow: 0 8px 32px rgba(0,0,0,${isDark ? "0.5" : "0.12"}); border-radius: 10px;`,
        formatter: (params: any) => {
          const idx = params?.[0]?.dataIndex ?? 0;
          const p = periods[idx];
          if (!p) return "";
          const line = (name: string, v: number) =>
            `<div style="display:flex;justify-content:space-between;gap:16px"><span style="color:${axisCol}">${name}</span><span style="font-weight:700;color:${labelCol}">${r2(
              v
            )} tCO₂e</span></div>`;
          return `
            <div style="min-width:200px">
              <div style="font-size:13px;font-weight:700;color:${labelCol};margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid ${
            isDark ? "#1e293b" : "#f4f4f5"
          }">${esc(p.label)}</div>
              <div style="display:flex;flex-direction:column;gap:6px">
                ${line("Scope 1", p.scope1)}
                ${line("Scope 2", p.scope2)}
                ${line("Scope 3", p.scope3)}
                <div style="margin-top:4px;padding-top:6px;border-top:1px solid ${
                  isDark ? "#1e293b" : "#f4f4f5"
                }">${line("Total", p.total)}</div>
              </div>
            </div>`;
        },
      },
      grid: { left: 16, right: 24, top: 24, bottom: 48, containLabel: true },
      xAxis: {
        type: "category",
        data: categories,
        axisLabel: {
          color: axisCol,
          fontSize: 11,
          interval: 0,
          rotate: categories.length > 6 ? 40 : 0,
        },
        axisLine: { lineStyle: { color: gridLineColor } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        name: "tCO₂e",
        nameTextStyle: { color: axisCol, fontSize: 11 },
        axisLabel: { color: axisCol, fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: gridLineColor } },
      },
      series: [
        {
          name: "tCO₂e",
          type: isLine ? ("line" as const) : ("bar" as const),
          smooth: isLine,
          showSymbol: true,
          symbolSize: 7,
          barWidth: "46%",
          itemStyle: isLine
            ? { color: "#0d9488" }
            : { color: BAR_COLOR, borderRadius: [5, 5, 0, 0] },
          lineStyle: isLine ? { color: "#0d9488", width: 2.5 } : undefined,
          areaStyle: isLine ? { color: AREA_COLOR } : undefined,
          emphasis: { focus: "series" as const },
          data: totals,
        },
      ],
    };
  }, [periods, frequency, isDark]);

  if (!periodBreakdown || frequency === "yearly" || periods.length === 0) {
    // Yearly: the annual total is already shown elsewhere, so no period chart.
    return null;
  }

  const unitWord = frequency === "monthly" ? "month" : "quarter";
  const freqLabel = frequency === "monthly" ? "Monthly" : "Quarterly";

  const tableWrap = isDark ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200";
  const headCls = isDark ? "text-slate-300 border-slate-700" : "text-gray-500 border-gray-200";
  const cellCls = isDark ? "text-slate-100 border-slate-700/60" : "text-gray-800 border-gray-100";

  return (
    <div className="grid grid-cols-1 gap-4">
      <Card
        title="EMISSIONS BY PERIOD"
        subtitle={`${freqLabel} breakdown — total tCO₂e per ${unitWord}`}
        isDark={isDark}
      >
        <ReactECharts option={option} style={{ height: 320 }} notMerge />

        <div className={`mt-4 overflow-x-auto rounded-lg border ${tableWrap}`}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                {["Period", "Scope 1", "Scope 2", "Scope 3", "Total"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-3 py-2 border-b text-xs font-semibold uppercase tracking-wide ${headCls} ${
                      i === 0 ? "text-left" : "text-right"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.label}>
                  <td className={`px-3 py-2 border-b text-left font-medium ${cellCls}`}>{p.label}</td>
                  <td className={`px-3 py-2 border-b text-right ${cellCls}`}>{r2(p.scope1).toLocaleString()}</td>
                  <td className={`px-3 py-2 border-b text-right ${cellCls}`}>{r2(p.scope2).toLocaleString()}</td>
                  <td className={`px-3 py-2 border-b text-right ${cellCls}`}>{r2(p.scope3).toLocaleString()}</td>
                  <td className={`px-3 py-2 border-b text-right font-semibold ${cellCls}`}>{r2(p.total).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default GhgReportPeriodChart;
