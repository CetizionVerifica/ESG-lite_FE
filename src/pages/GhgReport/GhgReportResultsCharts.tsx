import React, { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { GhgReportTablesResponse, GhgReportDetailsResponse } from "../../services/ghgreportService";

function formatPeriodLabel(
  yearType: "CY" | "FY",
  year: number,
  ranges?: Record<string, { startDate: string; endDate: string }>
) {
  if (!ranges || !ranges[String(year)]) return `${yearType} ${year}`;
  const { startDate, endDate } = ranges[String(year)];
  const fmtMY = (iso: string) =>
    new Date(iso).toLocaleString("en-US", { month: "short", year: "numeric" });
  return yearType === "FY"
    ? `FY ${year} (${fmtMY(startDate)} – ${fmtMY(endDate)})`
    : `CY ${year} (${fmtMY(startDate)} – ${fmtMY(endDate)})`;
}

function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function r2(n: number) {
  return Number((n || 0).toFixed(2));
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

type Props = {
  tablesData: GhgReportTablesResponse;
  detailsData: GhgReportDetailsResponse;
  isDark?: boolean;
};

const EXCLUDED_CATEGORIES = ["Renewable Electricity"];

const GhgReportResultsChart = ({ tablesData, detailsData, isDark }: Props) => {
  const compareYear = tablesData.filters.compareYear;
  const selectedYear = tablesData.filters.year;
  const compareLabel = formatPeriodLabel(tablesData.filters.yearType, compareYear, tablesData.ranges);
  const selectedLabel = formatPeriodLabel(tablesData.filters.yearType, selectedYear, tablesData.ranges);

  const { option, height } = useMemo(() => {
    const allRows = detailsData.rows.filter(
      (r: any) => !EXCLUDED_CATEGORIES.includes(String(r.categoryName || ""))
    );

    const selectedByCat = new Map<string, number>();
    const compareByCat = new Map<string, number>();

    for (const r of allRows) {
      const cat = String(r.categoryName || "");
      if (!cat) continue;
      selectedByCat.set(cat, (selectedByCat.get(cat) || 0) + r2(num(r.selected?.emissions)));
      compareByCat.set(cat, (compareByCat.get(cat) || 0) + r2(num(r.compare?.emissions)));
    }

    const categories = Array.from(new Set([...selectedByCat.keys(), ...compareByCat.keys()]))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    const compareTotal = Array.from(compareByCat.values()).reduce((a, b) => a + b, 0);
    const selectedTotal = Array.from(selectedByCat.values()).reduce((a, b) => a + b, 0);

    const comparePct = categories.map((c) => {
      const v = compareByCat.get(c) || 0;
      return compareTotal > 0 && v > 0 ? r2((v / compareTotal) * 100) : 0;
    });

    const selectedPct = categories.map((c) => {
      const v = selectedByCat.get(c) || 0;
      return selectedTotal > 0 && v > 0 ? r2((v / selectedTotal) * 100) : 0;
    });

    const compareAbs = categories.map((c) => r2(compareByCat.get(c) || 0));
    const selectedAbs = categories.map((c) => r2(selectedByCat.get(c) || 0));

    const compareName = compareLabel.split(" (")[0];
    const selectedName = selectedLabel.split(" (")[0];

    const axisCol = isDark ? "#94a3b8" : "#52525b";
    const labelCol = isDark ? "#e2e8f0" : "#18181b";
    const mutedCol = isDark ? "#64748b" : "#a1a1aa";
    const gridLineColor = isDark ? "rgba(148,163,184,0.12)" : "rgba(0,0,0,0.06)";
    const bgStripe = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.018)";

    const COMPARE_COLOR = {
      type: "linear" as const,
      x: 0,
      y: 0,
      x2: 1,
      y2: 0,
      colorStops: [
        { offset: 0, color: "#0f2a5c" },
        { offset: 0.5, color: "#1a56a8" },
        { offset: 1, color: "#5fa8e8" },
      ],
    };

    const SELECTED_COLOR = {
      type: "linear" as const,
      x: 0,
      y: 0,
      x2: 1,
      y2: 0,
      colorStops: [
        { offset: 0, color: "#166534" },
        { offset: 0.5, color: "#16a34a" },
        { offset: 1, color: "#86efac" },
      ],
    };

    const rowH = 44;
    const barHeight = Math.max(categories.length * rowH * 2, 220);

    const stripeMarkAreas = categories
      .filter((_, i) => i % 2 === 0)
      .map((cat) => [
        { yAxis: cat, itemStyle: { color: bgStripe } },
        { yAxis: cat },
      ]);

    return {
      height: barHeight + 70,
      option: {
        backgroundColor: "transparent",
        title: {
          text: `Emissions by Category (%) - ${compareName} vs ${selectedName}`,
          left: "center",
          top: 8,
          textStyle: { color: labelCol, fontSize: 14, fontWeight: 700 },
        },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "none" },
          backgroundColor: isDark ? "rgba(9,14,28,0.97)" : "rgba(255,255,255,0.98)",
          borderColor: isDark ? "#334155" : "#e4e4e7",
          borderWidth: 1,
          padding: [14, 18],
          textStyle: { color: labelCol, fontSize: 13 },
          extraCssText: `box-shadow: 0 8px 32px rgba(0,0,0,${isDark ? "0.5" : "0.12"}); border-radius: 10px;`,
          formatter: (params: any) => {
            const idx = params?.[0]?.dataIndex ?? 0;
            const cat = categories[idx] ?? "";
            const cPct = comparePct[idx];
            const sPct = selectedPct[idx];
            const cAbs = compareAbs[idx];
            const sAbs = selectedAbs[idx];
            const accentC = isDark ? "#5fa8e8" : "#1a56a8";
            const accentS = isDark ? "#86efac" : "#16a34a";
            return `
              <div style="min-width:280px">
                <div style="font-size:13px;font-weight:700;color:${labelCol};margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid ${
                  isDark ? "#1e293b" : "#f4f4f5"
                }">${cat}</div>
                <div style="display:flex;flex-direction:column;gap:10px">
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:16px">
                    <div style="display:flex;align-items:center;gap:8px">
                      <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${accentC}"></span>
                      <span style="font-size:12px;color:${mutedCol}">${compareName}</span>
                    </div>
                    <div style="display:flex;align-items:baseline;gap:10px">
                      <span style="font-size:15px;font-weight:700;color:${labelCol}">${cPct}%</span>
                      <span style="font-size:11px;color:${mutedCol}">${cAbs} tCO₂e</span>
                    </div>
                  </div>
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:16px">
                    <div style="display:flex;align-items:center;gap:8px">
                      <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${accentS}"></span>
                      <span style="font-size:12px;color:${mutedCol}">${selectedName}</span>
                    </div>
                    <div style="display:flex;align-items:baseline;gap:10px">
                      <span style="font-size:15px;font-weight:700;color:${labelCol}">${sPct}%</span>
                      <span style="font-size:11px;color:${mutedCol}">${sAbs} tCO₂e</span>
                    </div>
                  </div>
                </div>
              </div>`;
          },
        },
        legend: {
          bottom: 4,
          left: "center",
          itemWidth: 14,
          itemHeight: 14,
          borderRadius: 3,
          itemGap: 28,
          textStyle: { color: axisCol, fontSize: 12, fontWeight: 500 },
          data: [
            { name: compareName, icon: "roundRect", itemStyle: { color: isDark ? "#5fa8e8" : "#1a56a8" } },
            { name: selectedName, icon: "roundRect", itemStyle: { color: isDark ? "#86efac" : "#16a34a" } },
          ],
        },
        grid: { left: 16, right: 72, top: 56, bottom: 52, containLabel: true },
        xAxis: {
          type: "value",
          min: 0,
          max: 100,
          splitNumber: 5,
          axisLabel: { color: axisCol, fontSize: 11, formatter: (v: number) => `${v}%` },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: gridLineColor, type: "solid" as const, width: 1 } },
        },
        yAxis: {
          type: "category",
          data: categories,
          axisLabel: {
            color: labelCol,
            fontSize: 12,
            fontWeight: 600,
            width: 240,
            overflow: "truncate",
            lineHeight: 18,
            padding: [0, 12, 0, 0],
          },
          axisTick: { show: false },
          axisLine: { show: false },
          splitLine: { show: false },
        },
        series: [
          {
            name: compareName,
            type: "bar" as const,
            barWidth: 18,
            barCategoryGap: "40%",
            barGap: "20%",
            itemStyle: { color: COMPARE_COLOR, borderRadius: [0, 5, 5, 0] },
            emphasis: {
              focus: "series" as const,
              itemStyle: { shadowBlur: 12, shadowColor: "rgba(26,86,168,0.4)", shadowOffsetX: 3 },
            },
            label: {
              show: true,
              position: "right" as const,
              distance: 6,
              color: isDark ? "#93c5fd" : "#1a56a8",
              fontSize: 11,
              fontWeight: 700,
              formatter: (p: any) => (p.value > 0 ? `${p.value}%` : ""),
            },
            markArea: { silent: true, data: stripeMarkAreas },
            data: comparePct,
          },
          {
            name: selectedName,
            type: "bar" as const,
            barWidth: 18,
            barCategoryGap: "40%",
            barGap: "20%",
            itemStyle: { color: SELECTED_COLOR, borderRadius: [0, 5, 5, 0] },
            emphasis: {
              focus: "series" as const,
              itemStyle: { shadowBlur: 12, shadowColor: "rgba(22,163,74,0.4)", shadowOffsetX: 3 },
            },
            label: {
              show: true,
              position: "right" as const,
              distance: 6,
              color: isDark ? "#86efac" : "#166534",
              fontSize: 11,
              fontWeight: 700,
              formatter: (p: any) => (p.value > 0 ? `${p.value}%` : ""),
            },
            data: selectedPct,
          },
        ],
      },
    };
  }, [detailsData, compareLabel, selectedLabel, isDark]);

  return (
    <div className="grid grid-cols-1 gap-4">
      <Card
        title="RESULTS"
        subtitle={`Emissions by Category (%) — ${compareLabel.split(" (")[0]} vs ${selectedLabel.split(" (")[0]}`}
        isDark={isDark}
      >
        <ReactECharts option={option} style={{ height }} notMerge />
      </Card>
    </div>
  );
};

export default GhgReportResultsChart;
