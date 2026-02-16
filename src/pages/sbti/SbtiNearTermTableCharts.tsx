import React, { useRef, useMemo } from "react";
import ReactECharts from "echarts-for-react";
import {
  NearTermTargetResponse,
  NearTermTable1Row,
  NearTermTable2Row,
  NearTermTable3Row,
} from "../../services/sbtiService";

type Props = {
  data: NearTermTargetResponse;
  isDark: boolean;
};

const fmtNum = (n: number | null | undefined, digits = 3) => {
  if (n === null || n === undefined) return "-";
  const x = Number(n);
  if (!Number.isFinite(x)) return "-";
  return x.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};

const fmtPct = (n: number | null | undefined, digits = 2) => {
  if (n === null || n === undefined) return "-";
  const x = Number(n);
  if (!Number.isFinite(x)) return "-";
  return `${x.toFixed(digits)}%`;
};

const cardClass = "bg-white rounded-lg shadow p-4";
const cardClassDark = "bg-slate-800 rounded-lg shadow p-4";

const COLORS = {
  scope1: "#3b82f6",
  scope2: "#10b981",
  scope3: "#f59e0b",
  total: "#8b5cf6",
  target: "#8b5cf6",
  reached: "#16a34a",
  notReached: "#dc2626",
  noData: "#94a3b8",
  bar1: "#0ea5e9",
  trend: "#f97316",
};

function DownloadButton({ onDownload, isDark }: { onDownload: () => void; isDark: boolean }) {
  return (
    <button
      onClick={onDownload}
      title="Download chart as PNG"
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        isDark
          ? "bg-slate-700 hover:bg-slate-600 text-slate-300"
          : "bg-gray-100 hover:bg-gray-200 text-gray-600"
      }`}
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      Download
    </button>
  );
}

function Table1({
  rows,
  baseTotal,
  isDark,
}: {
  rows: NearTermTable1Row[];
  baseTotal: number;
  isDark: boolean;
}) {
  const th = isDark ? "text-slate-300 bg-slate-700" : "text-gray-600 bg-gray-50";
  const border = isDark ? "border-slate-700" : "border-gray-100";
  const rowHover = isDark ? "hover:bg-slate-700/50" : "hover:bg-gray-50";
  const baseRow = isDark ? "bg-slate-700/40" : "bg-blue-50/60";

  return (
    <div className={isDark ? cardClassDark : cardClass}>
      <div className="font-semibold mb-3 text-sm">Table 1: Total Emissions Target Pathway</div>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className={th}>
              <th className="text-left py-2 px-3 font-medium rounded-tl">Year</th>
              <th className="text-left py-2 px-3 font-medium">N</th>
              {/* <th className="text-left py-2 px-3 font-medium">Calculation</th> */}
              <th className="text-right py-2 px-3 font-medium">Target emissions(tCO₂e)</th>
              <th className="text-right py-2 px-3 font-medium">Reduction emission (tCO₂e)</th>
              <th className="text-right py-2 px-3 font-medium">Reduced YoY %</th>
              <th className="text-right py-2 px-3 font-medium rounded-tr">Total Reduction %</th>
            </tr>
          </thead>
          <tbody className={isDark ? "text-slate-100" : "text-gray-900"}>
            {rows.map((r) => {
              const vsBasePct =
                baseTotal > 0 && r.n > 0
                  ? ((baseTotal - r.targetEmission) / baseTotal) * 100
                  : null;
              const isBase = r.n === 0;
              return (
                <tr
                  key={r.year}
                  className={`border-b ${border} ${rowHover} transition-colors ${isBase ? baseRow : ""}`}
                >
                  <td className="py-2 px-3 font-medium">
                    {r.year}
                    {isBase && (
                      <span className="ml-2 text-xs font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                        Base
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3">{r.n}</td>
                  {/* <td className="py-2 px-3 font-mono text-xs">{r.calculation}</td> */}
                  <td className="py-2 px-3 text-right font-semibold">{fmtNum(r.targetEmission)}</td>
                  <td className="py-2 px-3 text-right">{r.reducedBy != null ? fmtNum(r.reducedBy) : "—"}</td>
                  <td className="py-2 px-3 text-right">{r.reducedByPct != null ? fmtPct(r.reducedByPct) : "—"}</td>
                  <td className="py-2 px-3 text-right">{vsBasePct != null ? fmtPct(vsBasePct) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Table2({
  rows,
  base,
  showScope3,
  isDark,
}: {
  rows: NearTermTable2Row[];
  base: { scope1: number; scope2: number; scope3: number; total: number };
  showScope3: boolean;
  isDark: boolean;
}) {
  const th = isDark ? "text-slate-300 bg-slate-700" : "text-gray-600 bg-gray-50";
  const border = isDark ? "border-slate-700" : "border-gray-100";
  const rowHover = isDark ? "hover:bg-slate-700/50" : "hover:bg-gray-50";
  const baseRow = isDark ? "bg-slate-700/40" : "bg-blue-50/60";

  return (
    <div className={isDark ? cardClassDark : cardClass}>
      <div className="font-semibold mb-3 text-sm">Table 2: Scope-wise Target Pathway</div>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className={th}>
              <th className="text-left py-2 px-3 font-medium rounded-tl">Year</th>
              <th className="text-left py-2 px-3 font-medium">N</th>
              <th className="text-right py-2 px-3 font-medium">Scope 1 (tCO₂e)</th>
              <th className="text-right py-2 px-3 font-medium">Scope 2 (tCO₂e)</th>
              {showScope3 && (
                <th className="text-right py-2 px-3 font-medium">Scope 3 (tCO₂e)</th>
              )}
              <th className="text-right py-2 px-3 font-medium">Target Emission(tCO₂e)</th>
              <th className="text-right py-2 px-3 font-medium">Reduction emission(tCO₂e)</th>
              <th className="text-right py-2 px-3 font-medium">Reduced YoY %</th>
              <th className="text-right py-2 px-3 font-medium rounded-tr">Total Reduction %</th>
            </tr>
          </thead>
          <tbody className={isDark ? "text-slate-100" : "text-gray-900"}>
            {rows.map((r) => {
              const vsBasePct =
                base.total > 0 && r.n > 0
                  ? ((base.total - r.totalTarget) / base.total) * 100
                  : null;
              const isBase = r.n === 0;
              return (
                <tr
                  key={r.year}
                  className={`border-b ${border} ${rowHover} transition-colors ${isBase ? baseRow : ""}`}
                >
                  <td className="py-2 px-3 font-medium">
                    {r.year}
                    {isBase && (
                      <span className="ml-2 text-xs font-semibold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">
                        Base
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3">{r.n}</td>
                  <td className="py-2 px-3 text-right">{fmtNum(r.scope1Target)}</td>
                  <td className="py-2 px-3 text-right">{fmtNum(r.scope2Target)}</td>
                  {showScope3 && (
                    <td className="py-2 px-3 text-right">
                      {r.scope3Target != null ? fmtNum(r.scope3Target) : "—"}
                    </td>
                  )}
                  <td className="py-2 px-3 text-right font-semibold">{fmtNum(r.totalTarget)}</td>
                  <td className="py-2 px-3 text-right">{r.reducedBy != null ? fmtNum(r.reducedBy) : "—"}</td>
                  <td className="py-2 px-3 text-right">{r.reducedByPct != null ? fmtPct(r.reducedByPct) : "—"}</td>
                  <td className="py-2 px-3 text-right">{vsBasePct != null ? fmtPct(vsBasePct) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Table3({
  rows,
  showScope3,
  isDark,
}: {
  rows: NearTermTable3Row[];
  showScope3: boolean;
  isDark: boolean;
}) {
  const th = isDark ? "text-slate-300 bg-slate-700" : "text-gray-600 bg-gray-50";
  const border = isDark ? "border-slate-700" : "border-gray-100";
  const rowHover = isDark ? "hover:bg-slate-700/50" : "hover:bg-gray-50";

  const statusBadge = (status: NearTermTable3Row["status"]) => {
    if (status === "Base Year")
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
          Base Year
        </span>
      );
    if (status === "Reached")
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
          Reached
        </span>
      );
    if (status === "Not Reached")
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
          Not Reached
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
        No Data
      </span>
    );
  };

  return (
    <div className={isDark ? cardClassDark : cardClass}>
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold text-sm">Table 3: Actual vs Target (Reached or Not)</div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
          isDark ? "bg-slate-700 text-slate-300" : "bg-gray-100 text-gray-500"
        }`}>
          Comparing {showScope3 ? "Scope 1 + 2 + 3" : "Scope 1 + 2 only"}
        </span>
      </div>
      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className={th}>
              <th className="text-left py-2 px-3 font-medium rounded-tl">Year</th>
              <th className="text-right py-2 px-3 font-medium">Actual Scope 1</th>
              <th className="text-right py-2 px-3 font-medium">Actual Scope 2</th>
              {showScope3 && <th className="text-right py-2 px-3 font-medium">Actual Scope 3</th>}
              <th className="text-right py-2 px-3 font-medium">
                Actual Total
                <span className="block text-xs font-normal opacity-60">
                  {showScope3 ? "S1+S2+S3" : "S1+S2"}
                </span>
              </th>
              <th className="text-right py-2 px-3 font-medium">Target emission(tCO₂e)</th>
              <th className="text-right py-2 px-3 font-medium">Variance (tCO₂e)</th>
              <th className="text-right py-2 px-3 font-medium">Variance %</th>
              <th className="text-left py-2 px-3 font-medium rounded-tr">Status</th>
            </tr>
          </thead>
          <tbody className={isDark ? "text-slate-100" : "text-gray-900"}>
            {rows.map((r) => {
              const hasData = r.status !== "No Data" && r.status !== "Base Year";
              const isBase = r.status === "Base Year";
              return (
                <tr
                  key={r.year}
                  className={`border-b ${border} ${rowHover} transition-colors ${isBase ? (isDark ? "bg-slate-700/40" : "bg-blue-50/60") : ""}`}
                >
                  <td className="py-2 px-3 font-medium">{r.year}</td>
                  <td className="py-2 px-3 text-right">{isBase ? fmtNum(r.actualScope1) : hasData ? fmtNum(r.actualScope1) : "—"}</td>
                  <td className="py-2 px-3 text-right">{isBase ? fmtNum(r.actualScope2) : hasData ? fmtNum(r.actualScope2) : "—"}</td>
                  {showScope3 && (
                    <td className="py-2 px-3 text-right">
                      {(isBase || hasData) && r.actualScope3 != null ? fmtNum(r.actualScope3) : "—"}
                    </td>
                  )}
                  <td className="py-2 px-3 text-right font-semibold">
                    {(isBase || hasData) ? fmtNum(r.actualTotal) : "—"}
                  </td>
                  <td className="py-2 px-3 text-right">{fmtNum(r.targetTotal)}</td>
                  <td className="py-2 px-3 text-right">
                    {hasData ? (
                      <span className={r.variance > 0 ? "text-red-500" : r.variance < 0 ? "text-green-500" : ""}>
                        {r.variance > 0 ? "+" : ""}{fmtNum(r.variance)}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {hasData && r.variancePct != null ? (
                      <span className={r.variancePct > 0 ? "text-red-500" : r.variancePct < 0 ? "text-green-500" : ""}>
                        {r.variancePct > 0 ? "+" : ""}{fmtPct(r.variancePct)}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="py-2 px-3">{statusBadge(r.status)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function chartTheme(isDark: boolean) {
  return {
    text: isDark ? "#e2e8f0" : "#111827",
    subtext: isDark ? "#cbd5e1" : "#374151",
    axis: isDark ? "#94a3b8" : "#6b7280",
    line: isDark ? "#475569" : "#d1d5db",
    split: isDark ? "#1e293b" : "#f1f5f9",
    border: isDark ? "#334155" : "#e2e8f0",
    tooltipBg: isDark ? "rgba(15,23,42,0.95)" : "rgba(255,255,255,0.98)",
  };
}

function commonOption(isDark: boolean) {
  const t = chartTheme(isDark);
  return {
    backgroundColor: "transparent",
    animation: true,
    textStyle: { color: t.text, fontFamily: "inherit" },
    grid: { left: 64, right: 24, top: 52, bottom: 44 },
    tooltip: {
      trigger: "axis",
      backgroundColor: t.tooltipBg,
      borderColor: t.border,
      borderWidth: 1,
      textStyle: { color: t.text, fontSize: 12 },
      axisPointer: { type: "cross", crossStyle: { color: t.axis } },
    },
    legend: {
      top: 8,
      right: 0,
      textStyle: { color: t.subtext, fontSize: 12 },
      itemWidth: 12,
      itemHeight: 8,
      icon: "roundRect",
    },
    xAxis: {
      type: "category",
      axisLabel: { color: t.axis, fontSize: 11 },
      axisLine: { lineStyle: { color: t.line } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: t.axis, fontSize: 11 },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: t.split, type: "dashed" } },
    },
  };
}

export default function SbtiNearTermTableCharts({ data, isDark }: Props) {
  const t1 = data.tables.table1;
  const t2 = data.tables.table2;
  const t3 = data.tables.table3;
  const showScope3 = data.scope3TargetRequired;

  const chart1Ref = useRef<any>(null);
  const chart2Ref = useRef<any>(null);
  const chart3Ref = useRef<any>(null);

  const downloadChart = (ref: React.RefObject<any>, filename: string) => {
    const instance = ref.current?.getEchartsInstance?.();
    if (!instance) return;
    const url = instance.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: isDark ? "#1e293b" : "#ffffff" });
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.png`;
    a.click();
  };

  const years1 = useMemo(() => t1.map((r) => String(r.year)), [t1]);
  const years2 = useMemo(() => t2.map((r) => String(r.year)), [t2]);
  const years3 = useMemo(() => t3.map((r) => String(r.year)), [t3]);

  const table1Chart = useMemo(() => {
    const base = commonOption(isDark);
    const t = chartTheme(isDark);
    const targetYear = data.targetYear;
    const nearIdx = t1.findIndex((r) => r.year === targetYear);

    return {
      ...base,
      title: {
        text: "Total Target Emissions Pathway(tCO2e) ",
        left: 0,
        top: 4,
        textStyle: { color: t.text, fontSize: 14, fontWeight: 600 },
      },
      legend: { show: false },
      tooltip: {
        ...base.tooltip,
        formatter: (params: any[]) => {
          const p = params[0];
          return `<div style="font-weight:600;margin-bottom:4px">${p.axisValue}</div>
            <div>${p.marker} Target: <b>${Number(p.value).toFixed(3)} tCO₂e</b></div>`;
        },
      },
      xAxis: { ...base.xAxis, data: years1 },
      series: [
        {
          name: "Target Emission",
          type: "bar",
          barWidth: 32,
          data: t1.map((r) => Number(r.targetEmission)),
          itemStyle: {
            borderRadius: [6, 6, 0, 0],
            color: {
              type: "linear",
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: "#0ea5e9" },
                { offset: 1, color: "#38bdf8" },
              ],
            },
          },
          label: {
            show: true,
            position: "inside",
            formatter: (p: any) => Number(p.value).toFixed(1),
            fontSize: 10,
            color: "#fff",
            fontWeight: 600,
          },
          markLine: {
            symbol: ["none", "none"],
            silent: true,
            data: nearIdx >= 0
              ? [{
                  xAxis: String(targetYear),
                  lineStyle: { type: "dashed", color: COLORS.trend, width: 2 },
                  label: { show: true, formatter: "Near-term Target", color: COLORS.trend, fontWeight: 700, position: "insideEndTop" },
                }]
              : [],
          },
        },
        {
          name: "Trend",
          type: "line",
          smooth: true,
          symbol: "circle",
          symbolSize: 7,
          data: t1.map((r) => Number(r.targetEmission)),
          lineStyle: { width: 2, color: COLORS.trend },
          itemStyle: { color: COLORS.trend, borderWidth: 2, borderColor: "#fff" },
          label: {
            show: true,
            position: "top",
            formatter: (p: any) => Number(p.value).toFixed(1),
            fontSize: 10,
            color: t.subtext,
            fontWeight: 600,
          },
        },
      ],
    };
  }, [isDark, years1, t1, data.targetYear]);

  const table2Chart = useMemo(() => {
    const base = commonOption(isDark);
    const t = chartTheme(isDark);

    const series: any[] = [
      {
        name: "Scope 1",
        type: "bar",
        stack: "scopes",
        barWidth: 32,
        data: t2.map((r) => Number(r.scope1Target)),
        itemStyle: { color: COLORS.scope1 },
        label: {
          show: true,
          position: "inside",
          formatter: (p: any) => Number(p.value).toFixed(1),
          fontSize: 10,
          color: "#fff",
          fontWeight: 600,
        },
      },
      {
        name: "Scope 2",
        type: "bar",
        stack: "scopes",
        data: t2.map((r) => Number(r.scope2Target)),
        itemStyle: {
          color: COLORS.scope2,
          borderRadius: showScope3 ? [0, 0, 0, 0] : [6, 6, 0, 0],
        },
        label: {
          show: true,
          position: "inside",
          formatter: (p: any) => Number(p.value).toFixed(2),
          fontSize: 10,
          color: "#fff",
          fontWeight: 600,
        },
      },
    ];

    if (showScope3) {
      series.push({
        name: "Scope 3",
        type: "bar",
        stack: "scopes",
        data: t2.map((r) => (r.scope3Target != null ? Number(r.scope3Target) : 0)),
        itemStyle: { color: COLORS.scope3, borderRadius: [6, 6, 0, 0] },
        label: {
          show: true,
          position: "inside",
          formatter: (p: any) => Number(p.value).toFixed(1),
          fontSize: 10,
          color: "#fff",
          fontWeight: 600,
        },
      });
    }

    series.push({
      name: "Total",
      type: "line",
      smooth: true,
      symbol: "circle",
      symbolSize: 7,
      data: t2.map((r) => Number(r.totalTarget)),
      lineStyle: { width: 3, color: COLORS.total },
      itemStyle: { color: COLORS.total, borderWidth: 2, borderColor: "#fff" },
      label: {
        show: true,
        position: "top",
        formatter: (p: any) => Number(p.value).toFixed(1),
        fontSize: 10,
        color: t.subtext,
        fontWeight: 700,
      },
    });

    return {
      ...base,
      title: {
        text: "Scope-wise Emission Targets (tCO2e)",
        left: 0,
        top: 4,
        textStyle: { color: t.text, fontSize: 14, fontWeight: 600 },
      },
      tooltip: {
        ...base.tooltip,
        formatter: (params: any[]) => {
          let html = `<div style="font-weight:600;margin-bottom:6px">${params[0].axisValue}</div>`;
          params.forEach((p) => {
            if (p.seriesName === "Total") {
              html += `<div style="margin-top:4px;border-top:1px solid #e5e7eb;padding-top:4px">${p.marker} <b>Total: ${Number(p.value).toFixed(3)} tCO₂e</b></div>`;
            } else {
              html += `<div>${p.marker} ${p.seriesName}: ${Number(p.value).toFixed(3)} tCO₂e</div>`;
            }
          });
          return html;
        },
      },
      xAxis: { ...base.xAxis, data: years2 },
      series,
    };
  }, [isDark, years2, t2, showScope3]);

  const table3Chart = useMemo(() => {
    const base = commonOption(isDark);
    const t = chartTheme(isDark);

    const statusColor = (s: NearTermTable3Row["status"]) => {
      if (s === "Reached") return COLORS.reached;
      if (s === "Not Reached") return COLORS.notReached;
      if (s === "Base Year") return COLORS.scope1;
      return COLORS.noData;
    };

    return {
      ...base,
      title: {
        text: "Actual vs Target (tCO2e)",
        left: 0,
        top: 4,
        textStyle: { color: t.text, fontSize: 14, fontWeight: 600 },
      },
      tooltip: {
        ...base.tooltip,
        formatter: (params: any[]) => {
          let html = `<div style="font-weight:600;margin-bottom:6px">${params[0].axisValue}</div>`;
          params.forEach((p) => {
            html += `<div>${p.marker} ${p.seriesName}: <b>${p.value != null && Number(p.value) > 0 ? Number(p.value).toFixed(3) : "No Data"} tCO₂e</b></div>`;
          });
          return html;
        },
      },
      xAxis: { ...base.xAxis, data: years3 },
      series: [
        {
          name: "Target",
          type: "line",
          smooth: true,
          symbol: "circle",
          symbolSize: 6,
          data: t3.map((r) => Number(r.targetTotal)),
          lineStyle: { width: 3, color: COLORS.target, type: "dashed" },
          itemStyle: { color: COLORS.target, borderWidth: 2, borderColor: "#fff" },
          label: {
            show: true,
            position: "top",
            formatter: (p: any) => Number(p.value).toFixed(1),
            fontSize: 10,
            color: t.subtext,
            fontWeight: 600,
          },
        },
        {
          name: "Actual",
          type: "bar",
          barWidth: 32,
          data: t3.map((r) => ({
            value: r.status !== "No Data" ? Number(r.actualTotal) : null,
            itemStyle: {
              borderRadius: [6, 6, 0, 0],
              color: statusColor(r.status),
            },
          })),
          label: {
            show: false,
            position: "top",
            formatter: (p: any) => p.value != null ? Number(p.value).toFixed(1) : "",
            fontSize: 10,
            color: t.subtext,
            fontWeight: 600,
          },
        },
      ],
    };
  }, [isDark, years3, t3]);

  const chartWrap = isDark
    ? "bg-slate-800 border border-slate-700 rounded-lg p-4"
    : "bg-white border border-gray-100 rounded-lg p-4 shadow-sm";

  const alertClass = isDark
    ? "bg-amber-900/30 border border-amber-700/50 text-amber-300"
    : "bg-amber-50 border border-amber-200 text-amber-800";

  return (
    <div className="space-y-10">

      {!showScope3 && (
        <div className={`flex items-start gap-3 px-4 py-3 rounded-lg text-sm ${alertClass}`}>
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
          </svg>
          <div>
            <span className="font-semibold">Scope 3 target not required — </span>
            Scope 3 emissions account for <span className="font-semibold">{data.scope3Share}%</span> of total emissions,
            which is below the 40% SBTi threshold. Scope 3 reduction target is optional and has been excluded from all calculations below.
          </div>
        </div>
      )}

      <div className="space-y-4">
        <Table1 rows={t1} baseTotal={data.baseTotals.total} isDark={isDark} />
        <div className={`${chartWrap}`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-medium ${isDark ? "text-slate-400" : "text-gray-500"}`}>Total Emissions Pathway</span>
            <DownloadButton onDownload={() => downloadChart(chart1Ref, "total-emissions-pathway")} isDark={isDark} />
          </div>
          <ReactECharts ref={chart1Ref} option={table1Chart} style={{ height: 360, width: "100%" }} />
        </div>
      </div>

      <div className="space-y-4">
        <Table2 rows={t2} base={data.baseTotals} showScope3={showScope3} isDark={isDark} />
        <div className={chartWrap}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-medium ${isDark ? "text-slate-400" : "text-gray-500"}`}>Scope-wise Emission Targets</span>
            <DownloadButton onDownload={() => downloadChart(chart2Ref, "scopewise-emission-targets")} isDark={isDark} />
          </div>
          <ReactECharts ref={chart2Ref} option={table2Chart} style={{ height: 380, width: "100%" }} />
        </div>
      </div>

      <div className="space-y-4">
        <Table3 rows={t3} showScope3={showScope3} isDark={isDark} />
        <div className={chartWrap}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs font-medium ${isDark ? "text-slate-400" : "text-gray-500"}`}>Actual vs Target</span>
            <DownloadButton onDownload={() => downloadChart(chart3Ref, "actual-vs-target")} isDark={isDark} />
          </div>
          <ReactECharts ref={chart3Ref} option={table3Chart} style={{ height: 360, width: "100%" }} />
        </div>
      </div>

    </div>
  );
}