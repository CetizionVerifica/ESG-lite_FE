
import { useRef, useMemo } from "react";
import ReactECharts from "echarts-for-react";
import { LongTermChartResponse } from "../../services/sbtiService";

type Props = {
  data: LongTermChartResponse;
  isDark: boolean;
};

const fmtNum = (n: number, digits = 2) =>
  n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

function DownloadButton({ onDownload, isDark }: { onDownload: () => void; isDark: boolean }) {
  return (
    <button
      onClick={onDownload}
      title="Download chart as PNG"
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        isDark ? "bg-slate-700 hover:bg-slate-600 text-slate-300" : "bg-gray-100 hover:bg-gray-200 text-gray-600"
      }`}
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      Download
    </button>
  );
}

const MILESTONE_YEARS = [2030, 2035, 2040, 2045, 2050];

const COLORS = {
  scope1: "#3b82f6",
  scope2: "#10b981",
  scope3: "#f59e0b",
  target: "#8b5cf6",
  reached: "#16a34a",
  notReached: "#dc2626",
  baseYear: "#3b82f6",
  noData: "#94a3b8",
};

export default function SbtiLongTermChart({ data, isDark }: Props) {
  const chart1Ref = useRef<any>(null);
  const chart2Ref = useRef<any>(null);
  const chart3Ref = useRef<any>(null);

  const downloadChart = (ref: React.RefObject<any>, filename: string) => {
    const instance = ref.current?.getEchartsInstance?.();
    if (!instance) return;
    const url = instance.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: isDark ? "#0f172a" : "#ffffff" });
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.png`;
    a.click();
  };

  const T = useMemo(() => ({
    text:       isDark ? "#f1f5f9" : "#0f172a",
    subtext:    isDark ? "#94a3b8" : "#64748b",
    axis:       isDark ? "#64748b" : "#94a3b8",
    split:      isDark ? "rgba(148,163,184,0.08)" : "rgba(0,0,0,0.04)",
    axisLine:   isDark ? "#1e293b" : "#e2e8f0",
    tooltipBg:  isDark ? "rgba(2,6,23,0.96)" : "rgba(255,255,255,0.98)",
    tooltipBdr: isDark ? "#334155" : "#e2e8f0",
  }), [isDark]);

  const years = useMemo(() => (data.rows || []).map((r) => String(r.year)), [data.rows]);

  const milestones = useMemo(() =>
    MILESTONE_YEARS.filter((y) => y >= data.baseYear)
      .map((y) => (data.rows || []).find((r) => r.year === y))
      .filter(Boolean) as typeof data.rows,
  [data.rows, data.baseYear]);

  const reductionPct = useMemo(() =>
    (data.rows || []).map((r) =>
      Number((((data.baseEmissions - r.targetEmission) / data.baseEmissions) * 100).toFixed(2))
    ),
  [data.rows, data.baseEmissions]);

  const xAxisBase = useMemo(() => ({
    type: "category" as const,
    data: years,
    axisLabel: {
      color: T.axis,
      fontSize: 11,
      fontFamily: "inherit",
      interval: (i: number, val: string) => {
        console.log(i)
        const y = Number(val);
        return y === data.baseYear || MILESTONE_YEARS.includes(y);
      },
    },
    axisLine: { lineStyle: { color: T.axisLine } },
    axisTick: { show: false },
    splitLine: { show: false },
  }), [T, years, data.baseYear]);

  const netZeroChart = useMemo(() => ({
    backgroundColor: "transparent",
    animation: true,
    grid: { left: 80, right: 48, top: 48, bottom: 56 },
    tooltip: {
      trigger: "axis",
      backgroundColor: T.tooltipBg,
      borderColor: T.tooltipBdr,
      borderWidth: 1,
      padding: [10, 14],
      textStyle: { color: T.text, fontSize: 12, fontFamily: "inherit" },
      formatter: (params: any[]) => {
        const bar = params.find((p: any) => p.seriesName === "Pathway");
        const idx = Number(bar?.dataIndex ?? 0);
        const row = data.rows[idx];
        const pct = reductionPct[idx];
        const isMil = MILESTONE_YEARS.includes(row?.year);
        return `
          <div style="font-weight:700;font-size:13px;margin-bottom:8px;color:${T.text}">${bar?.axisValue}</div>
          <div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:4px">
            <span style="color:${T.subtext}">Target</span>
            <b style="color:#10b981">${fmtNum(row?.targetEmission ?? 0, 2)} tCO₂e</b>
          </div>
          <div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:4px">
            <span style="color:${T.subtext}">Reduced from base</span>
            <b style="color:${pct >= 80 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#94a3b8"}">${pct}%</b>
          </div>
          ${row?.reducedBy != null ? `<div style="display:flex;justify-content:space-between;gap:24px"><span style="color:${T.subtext}">vs prev year</span><span style="color:${T.subtext}">−${fmtNum(row.reducedBy, 2)} tCO₂e</span></div>` : ""}
          ${isMil ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid ${T.tooltipBdr};color:#f59e0b;font-size:11px;font-weight:600">★ Milestone year</div>` : ""}
        `;
      },
    },
    legend: { show: false },
    xAxis: xAxisBase,
    yAxis: [
      {
        type: "value",
        axisLabel: { color: T.axis, fontSize: 11, fontFamily: "inherit", formatter: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v) },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: T.split } },
        min: 0,
      },
      {
        type: "value",
        min: 0, max: 100,
        axisLabel: { color: T.axis, fontSize: 11, fontFamily: "inherit", formatter: "{value}%" },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "Pathway",
        type: "bar",
        barMaxWidth: 18,
        data: data.rows.map((r) => r.targetEmission),
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          color: {
            type: "linear", x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "#10b981" },
              { offset: 1, color: isDark ? "#064e3b" : "#a7f3d0" },
            ],
          },
        },
        label: {
          show: false,
        },
        markLine: {
          silent: true,
          symbol: ["none", "none"],
          animation: false,
          data: [
            {
              yAxis: data.targetEmissions,
              lineStyle: { type: "dashed", color: "#ef4444", width: 1.5, opacity: 0.8 },
              label: {
                show: true,
                formatter: `Net-Zero: ${fmtNum(data.targetEmissions, 1)} tCO₂e`,
                color: "#ef4444",
                fontSize: 11,
                fontWeight: 700,
                position: "insideEndTop",
                fontFamily: "inherit",
              },
            },
          ],
        },
        markPoint: {
          symbol: "circle",
          symbolSize: 10,
          data: milestones.map((row) => ({
            coord: [String(row.year), row.targetEmission],
            itemStyle: { color: "#f59e0b", borderColor: isDark ? "#0f172a" : "#fff", borderWidth: 2 },
            label: {
              show: true,
              formatter: `${fmtNum(row.targetEmission, 1)}`,
              position: "top",
              distance: 8,
              color: T.subtext,
              fontSize: 10,
              fontWeight: 600,
              fontFamily: "inherit",
            },
          })),
        },
      },
      {
        name: "% Reduced",
        type: "line",
        yAxisIndex: 1,
        smooth: 0.3,
        symbol: "none",
        data: reductionPct,
        lineStyle: { width: 2, color: "#8b5cf6", type: "dashed" },
        itemStyle: { color: "#8b5cf6" },
      },
    ],
  }), [isDark, T, xAxisBase, years, data, milestones, reductionPct]);

  const scopeChart = useMemo(() => {
    const scopes: Array<{ key: "scope1Target" | "scope2Target" | "scope3Target"; name: string; colorTop: string; colorBot: string }> = [
      { key: "scope1Target", name: "Scope 1", colorTop: "#3b82f6", colorBot: isDark ? "#1e3a5f" : "#bfdbfe" },
      { key: "scope2Target", name: "Scope 2", colorTop: "#10b981", colorBot: isDark ? "#064e3b" : "#a7f3d0" },
    ];
    if (data.scope3TargetRequired) {
      scopes.push({ key: "scope3Target", name: "Scope 3", colorTop: "#f59e0b", colorBot: isDark ? "#451a03" : "#fde68a" });
    }

    const stackedSeries: any[] = scopes.map((s, i) => ({
      name: s.name,
      type: "bar",
      stack: "scopes",
      barMaxWidth: 18,
      data: data.rows.map((r) => (r as any)[s.key] ?? 0),
      itemStyle: {
        color: {
          type: "linear", x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: s.colorTop },
            { offset: 1, color: s.colorBot },
          ],
        },
        borderRadius: i === scopes.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0],
      },
      label: {
        show: false,
      },
    }));

    stackedSeries.push({
      name: "Total",
      type: "line",
      smooth: 0.3,
      symbol: "circle",
      symbolSize: 5,
      data: data.rows.map((r) => r.targetEmission),
      lineStyle: { width: 2.5, color: "#8b5cf6" },
      itemStyle: { color: "#8b5cf6", borderColor: isDark ? "#0f172a" : "#fff", borderWidth: 1.5 },
      label: {
        show: false,
      },
      markPoint: {
        symbol: "circle",
        symbolSize: 8,
        data: milestones.map((row) => ({
          coord: [String(row.year), row.targetEmission],
          itemStyle: { color: "#8b5cf6", borderColor: isDark ? "#0f172a" : "#fff", borderWidth: 2 },
          label: {
            show: true,
            formatter: `${fmtNum(row.targetEmission, 1)}`,
            position: "top",
            distance: 8,
            color: T.subtext,
            fontSize: 10,
            fontWeight: 600,
            fontFamily: "inherit",
          },
        })),
      },
    });

    return {
      backgroundColor: "transparent",
      animation: true,
      grid: { left: 80, right: 48, top: 16, bottom: 48 },
      tooltip: {
        trigger: "axis",
        backgroundColor: T.tooltipBg,
        borderColor: T.tooltipBdr,
        borderWidth: 1,
        padding: [10, 14],
        textStyle: { color: T.text, fontSize: 12, fontFamily: "inherit" },
        formatter: (params: any[]) => {
          let html = `<div style="font-weight:700;font-size:13px;margin-bottom:8px;color:${T.text}">${params[0].axisValue}</div>`;
          params.forEach((p) => {
            if (p.value != null && Number(p.value) > 0) {
              html += `<div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:3px">
                <span>${p.marker} ${p.seriesName}</span>
                <b>${fmtNum(Number(p.value), 2)} tCO₂e</b>
              </div>`;
            }
          });
          return html;
        },
      },
      legend: { show: false },
      xAxis: xAxisBase,
      yAxis: {
        type: "value",
        name: "tCO₂e",
        nameTextStyle: { color: T.subtext, fontSize: 10 },
        axisLabel: { color: T.axis, fontSize: 11, fontFamily: "inherit", formatter: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v) },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: T.split } },
        min: 0,
      },
      series: stackedSeries,
    };
  }, [isDark, T, xAxisBase, data, milestones]);

  const actualVsTargetChart = useMemo(() => {
    if (!data.actualVsTarget || data.actualVsTarget.length === 0) {
      return null;
    }

    const actualYears = data.actualVsTarget!.map((r) => String(r.year));

    // const statusColor = (status: string) => {
    //   if (status === "Base Year") return COLORS.baseYear;
    //   if (status === "Reached") return COLORS.reached;
    //   if (status === "Not Reached") return COLORS.notReached;
    //   return COLORS.noData;
    // };

    const actualSeries: any[] = [];

    actualSeries.push({
      name: "Actual Scope 1",
      type: "bar",
      stack: "actual",
      barMaxWidth: 18,
      data: data.actualVsTarget!.map((r) => r.actualScope1 ?? 0),
      itemStyle: {
        color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: COLORS.scope1 }, { offset: 1, color: isDark ? "#1e3a5f" : "#bfdbfe" }] },
      },
    });

    actualSeries.push({
      name: "Actual Scope 2",
      type: "bar",
      stack: "actual",
      data: data.actualVsTarget!.map((r) => r.actualScope2 ?? 0),
      itemStyle: {
        color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: COLORS.scope2 }, { offset: 1, color: isDark ? "#064e3b" : "#a7f3d0" }] },
        borderRadius: !data.scope3TargetRequired ? [4, 4, 0, 0] : [0, 0, 0, 0],
      },
    });

    if (data.scope3TargetRequired) {
      actualSeries.push({
        name: "Actual Scope 3",
        type: "bar",
        stack: "actual",
        data: data.actualVsTarget!.map((r) => r.actualScope3 ?? 0),
        itemStyle: {
          color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: COLORS.scope3 }, { offset: 1, color: isDark ? "#451a03" : "#fde68a" }] },
          borderRadius: [4, 4, 0, 0],
        },
      });
    }

    actualSeries.push({
      name: "Target",
      type: "line",
      smooth: 0.3,
      symbol: "circle",
      symbolSize: 5,
      data: data.actualVsTarget!.map((r) => r.targetTotal),
      lineStyle: { width: 2.5, color: COLORS.target, type: "dashed" },
      itemStyle: { color: COLORS.target, borderColor: isDark ? "#0f172a" : "#fff", borderWidth: 1.5 },
    });

    return {
      backgroundColor: "transparent",
      animation: true,
      grid: { left: 80, right: 48, top: 16, bottom: 48 },
      tooltip: {
  trigger: "axis",
  backgroundColor: T.tooltipBg,
  borderColor: T.tooltipBdr,
  borderWidth: 1,
  padding: [10, 14],
  textStyle: { color: T.text, fontSize: 12, fontFamily: "inherit" },
  formatter: (params: any[]) => {
    const year = params[0]?.axisValue;
    const row = data.actualVsTarget?.find((r) => String(r.year) === String(year));
    if (!row) return "";

    const statusColor = (status: string) => {
      if (status === "Base Year") return COLORS.baseYear;
      if (status === "Reached") return COLORS.reached;
      if (status === "Not Reached") return COLORS.notReached;
      return COLORS.noData;
    };

    let html = `<div style="font-weight:700;font-size:13px;margin-bottom:8px;color:${T.text}">${year}</div>`;

    if (row.status === "No Data") {
      html += `<div style="color:${T.subtext}">No emission data available for this year</div>`;
      html += `<div style="display:flex;justify-content:space-between;gap:24px;margin-top:6px">
        <span style="color:${T.subtext}">Target</span>
        <b style="color:${COLORS.target}">${fmtNum(row.targetTotal, 2)} tCO₂e</b>
      </div>`;
      html += `<div style="margin-top:6px;font-size:11px;font-weight:600;color:${statusColor(row.status)}">${row.status}</div>`;
      return html;
    }

    // --- Actual scope breakdown (what you asked) ---
    html += `<div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:3px">
      <span>${params.find((p:any)=>p.seriesName==="Actual Scope 1")?.marker ?? ""} <span style="color:${T.subtext}">Actual Scope 1</span></span>
      <b>${fmtNum(row.actualScope1 ?? 0, 2)} tCO₂e</b>
    </div>`;

    html += `<div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:3px">
      <span>${params.find((p:any)=>p.seriesName==="Actual Scope 2")?.marker ?? ""} <span style="color:${T.subtext}">Actual Scope 2</span></span>
      <b>${fmtNum(row.actualScope2 ?? 0, 2)} tCO₂e</b>
    </div>`;

    if (data.scope3TargetRequired) {
      html += `<div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:3px">
        <span>${params.find((p:any)=>p.seriesName==="Actual Scope 3")?.marker ?? ""} <span style="color:${T.subtext}">Actual Scope 3</span></span>
        <b>${fmtNum(row.actualScope3 ?? 0, 2)} tCO₂e</b>
      </div>`;
    }

    // --- Totals + target + variance ---
    html += `<div style="display:flex;justify-content:space-between;gap:24px;margin-top:6px;padding-top:6px;border-top:1px solid ${T.tooltipBdr}">
      <span style="color:${T.subtext}">Actual Total</span>
      <b>${fmtNum(row.actualTotal ?? 0, 2)} tCO₂e</b>
    </div>`;

    html += `<div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:3px">
      <span style="color:${T.subtext}">Target Total</span>
      <b style="color:${COLORS.target}">${fmtNum(row.targetTotal, 2)} tCO₂e</b>
    </div>`;

    if (row.variance != null) {
      const varColor = row.variance > 0 ? COLORS.notReached : COLORS.reached;
      html += `<div style="display:flex;justify-content:space-between;gap:24px;margin-top:4px">
        <span style="color:${T.subtext}">Variance</span>
        <b style="color:${varColor}">
          ${row.variance > 0 ? "+" : ""}${fmtNum(row.variance, 2)} tCO₂e
          ${row.variancePct != null ? ` (${row.variancePct > 0 ? "+" : ""}${fmtNum(row.variancePct, 1)}%)` : ""}
        </b>
      </div>`;
    }

    html += `<div style="margin-top:6px;font-size:11px;font-weight:600;color:${statusColor(row.status)}">${row.status}</div>`;
    return html;
  },
},
      legend: { show: false },
      xAxis: {
        type: "category",
        data: actualYears,
        axisLabel: { color: T.axis, fontSize: 11, fontFamily: "inherit", interval: 0 },
        axisLine: { lineStyle: { color: T.axisLine } },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: T.axis, fontSize: 11, fontFamily: "inherit", formatter: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v) },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: T.split } },
        min: 0,
      },
      series: actualSeries,
    };
  }, [isDark, T, data]);

  const cardClass = isDark
    ? "bg-slate-800 border border-slate-700 rounded-xl p-5"
    : "bg-white border border-gray-200 rounded-xl p-5 shadow-sm";
  const statCard = isDark
    ? "bg-slate-700/50 rounded-xl p-4 border border-slate-600/50"
    : "bg-white border border-gray-200 rounded-xl p-4 shadow-sm";
  const mutedText = isDark ? "text-slate-400" : "text-gray-500";
  const alertClass = isDark
    ? "bg-amber-900/30 border border-amber-700/50 text-amber-300"
    : "bg-amber-50 border border-amber-200 text-amber-800";

  const stats = [
    { label: "Base Emissions",    value: fmtNum(data.baseEmissions, 2),   unit: "tCO₂e", sub: `${data.baseYear} baseline`,    color: "text-blue-500",    icon: "📊" },
    { label: "Net-Zero Target",   value: fmtNum(data.targetEmissions, 2), unit: "tCO₂e", sub: "10% of base by 2050",           color: "text-emerald-500", icon: "🎯" },
    { label: "Annual Rate",       value: `${fmtNum(data.annualRate, 2)}%`, unit: "/ yr",  sub: "compounding reduction",        color: "text-violet-500",  icon: "📉" },
    { label: "Years to Net-Zero", value: String(data.years),               unit: "years", sub: `${data.baseYear} → 2050`,      color: "text-amber-500",   icon: "⏳" },
  ];

  return (
    <div className="space-y-5">

      {!data.scope3TargetRequired && (
        <div className={`flex items-start gap-3 px-4 py-3 rounded-lg text-sm ${alertClass}`}>
          <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
          </svg>
          <div>
            <span className="font-semibold">Scope 3 not required — </span>
            Scope 3 is <span className="font-semibold">{data.scope3Share}%</span> of total, below the 40% SBTi threshold. Excluded from all calculations.
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className={statCard}>
            <div className="flex items-center justify-between mb-2">
              <p className={`text-xs ${mutedText}`}>{s.label}</p>
              <span className="text-base">{s.icon}</span>
            </div>
            <p className={`text-xl font-bold leading-tight ${s.color}`}>
              {s.value}
              <span className={`text-xs font-normal ml-1 ${mutedText}`}>{s.unit}</span>
            </p>
            <p className={`text-xs mt-1 ${mutedText}`}>{s.sub}</p>
          </div>
        ))}
      </div>

      <div className={cardClass}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-sm font-semibold">Net-Zero Emission Pathway</p>
            <p className={`text-xs mt-0.5 ${mutedText}`}>{data.baseYear} → 2050  ·  90% reduction  ·  {fmtNum(data.annualRate, 2)}% annual rate</p>
          </div>
          <DownloadButton onDownload={() => downloadChart(chart1Ref, "net-zero-pathway")} isDark={isDark} />
        </div>
        <div className="flex items-center gap-4 mb-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-10 h-3 rounded-sm" style={{ background: "linear-gradient(to right, #10b981, #a7f3d0)" }} />
            <span className={`text-xs ${mutedText}`}>Emission target (tCO₂e)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-8 border-t-2 border-dashed border-purple-400" />
            <span className={`text-xs ${mutedText}`}>% reduced (right axis)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-8 border-t-2 border-dashed border-red-400" />
            <span className={`text-xs ${mutedText}`}>Net-Zero floor</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className={`text-xs ${mutedText}`}>Milestone</span>
          </div>
        </div>
        <ReactECharts ref={chart1Ref} option={netZeroChart} style={{ height: 400, width: "100%" }} />
      </div>

      <div className={cardClass}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-sm font-semibold">Scope-wise Net-Zero Pathway</p>
            <p className={`text-xs mt-0.5 ${mutedText}`}>Stacked bars per scope · Purple line = total trajectory with milestones</p>
          </div>
          <DownloadButton onDownload={() => downloadChart(chart2Ref, "scopewise-net-zero-pathway")} isDark={isDark} />
        </div>
        <div className="flex items-center gap-4 mb-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "linear-gradient(to bottom, #3b82f6, #bfdbfe)" }} />
            <span className={`text-xs ${mutedText}`}>Scope 1</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "linear-gradient(to bottom, #10b981, #a7f3d0)" }} />
            <span className={`text-xs ${mutedText}`}>Scope 2</span>
          </div>
          {data.scope3TargetRequired && (
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "linear-gradient(to bottom, #f59e0b, #fde68a)" }} />
              <span className={`text-xs ${mutedText}`}>Scope 3</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-8 border-t-2 border-purple-400" />
            <span className={`text-xs ${mutedText}`}>Total</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-purple-400" />
            <span className={`text-xs ${mutedText}`}>Milestone</span>
          </div>
        </div>
        <ReactECharts ref={chart2Ref} option={scopeChart} style={{ height: 400, width: "100%" }} />
      </div>

      {data.actualVsTarget && data.actualVsTarget.length > 0 && (
        <div className={cardClass}>
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm font-semibold">Actual vs Target Performance</p>
              <p className={`text-xs mt-0.5 ${mutedText}`}>Comparing actual emissions against long-term targets · Only years with data shown</p>
            </div>
            <DownloadButton onDownload={() => downloadChart(chart3Ref, "actual-vs-target-longterm")} isDark={isDark} />
          </div>
          <div className="flex items-center gap-4 mb-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "linear-gradient(to bottom, #3b82f6, #bfdbfe)" }} />
              <span className={`text-xs ${mutedText}`}>Actual Scope 1</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "linear-gradient(to bottom, #10b981, #a7f3d0)" }} />
              <span className={`text-xs ${mutedText}`}>Actual Scope 2</span>
            </div>
            {data.scope3TargetRequired && (
              <div className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ background: "linear-gradient(to bottom, #f59e0b, #fde68a)" }} />
                <span className={`text-xs ${mutedText}`}>Actual Scope 3</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span className="inline-block w-8 border-t-2 border-dashed border-purple-400" />
              <span className={`text-xs ${mutedText}`}>Target</span>
            </div>
          </div>
          <ReactECharts ref={chart3Ref} option={actualVsTargetChart} style={{ height: 400, width: "100%" }} />
        </div>
      )}

    </div>
  );
}