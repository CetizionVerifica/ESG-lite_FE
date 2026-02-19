// GhgReportDetailedCharts.tsx
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

const EXCLUDED_CATEGORIES = ["Renewable Electricity"];

function buildScopePercentBarOption(args: {
  rows: any[];
  compareRows: any[];
  scopeLabel: string;
  compareLabel: string;
  selectedLabel: string;
  isDark?: boolean;
}) {
  const { rows, compareRows,  compareLabel, selectedLabel, isDark } = args;
  const axisColor = isDark ? "#94a3b8" : "#52525b";
  const labelColor = isDark ? "#e2e8f0" : "#18181b";
  const gridLine = isDark ? "rgba(148,163,184,0.12)" : "rgba(0,0,0,0.06)";
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

  const sumByCategory = (sourceRows: any[]) => {
    const m = new Map<string, number>();
    for (const r of sourceRows) {
      const cat = String(r.categoryName || "");
      if (!cat || EXCLUDED_CATEGORIES.includes(cat)) continue;
      m.set(cat, (m.get(cat) || 0) + r2(num(r.selected?.emissions)));
    }
    return m;
  };

  const selectedMap = sumByCategory(rows);
  const compareMap = sumByCategory(compareRows);

  const allCats = Array.from(new Set([...selectedMap.keys(), ...compareMap.keys()])).sort((a, b) =>
    a.localeCompare(b)
  );

  const selectedTotal = Array.from(selectedMap.values()).reduce((a, b) => a + b, 0);
  const compareTotal = Array.from(compareMap.values()).reduce((a, b) => a + b, 0);

  const comparePcts = allCats.map((cat) => {
    const raw = compareMap.get(cat) || 0;
    return compareTotal > 0 && raw > 0 ? r2((raw / compareTotal) * 100) : 0;
  });
  const selectedPcts = allCats.map((cat) => {
    const raw = selectedMap.get(cat) || 0;
    return selectedTotal > 0 && raw > 0 ? r2((raw / selectedTotal) * 100) : 0;
  });

  const compareAbsolute = allCats.map((cat) => r2(compareMap.get(cat) || 0));
  const selectedAbsolute = allCats.map((cat) => r2(selectedMap.get(cat) || 0));

  const compareName = compareLabel.split(" (")[0];
  const selectedName = selectedLabel.split(" (")[0];

  const rowH = 52;
  const barHeight = Math.max(allCats.length * rowH * 2, 160);

  const stripeMarkAreas = allCats
    .filter((_, i) => i % 2 === 0)
    .map((cat) => [
      { yAxis: cat, itemStyle: { color: bgStripe } },
      { yAxis: cat },
    ]);

  return {
    backgroundColor: "transparent",
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "none" },
      backgroundColor: isDark ? "rgba(9,14,28,0.97)" : "rgba(255,255,255,0.98)",
      borderColor: isDark ? "#334155" : "#e4e4e7",
      borderWidth: 1,
      padding: [14, 18],
      textStyle: { color: labelColor, fontSize: 13 },
      extraCssText: `box-shadow: 0 8px 32px rgba(0,0,0,${isDark ? "0.5" : "0.12"}); border-radius: 10px;`,
      formatter: (params: any) => {
        const idx = params?.[0]?.dataIndex ?? 0;
        const cat = allCats[idx] ?? "";
        const compareVal = comparePcts[idx];
        const selectedVal = selectedPcts[idx];
        const compareAbs = compareAbsolute[idx];
        const selectedAbs = selectedAbsolute[idx];
        const accentC = isDark ? "#5fa8e8" : "#1a56a8";
        const accentS = isDark ? "#86efac" : "#16a34a";
        const mutedC = isDark ? "#64748b" : "#a1a1aa";
        return `
          <div style="min-width:260px">
            <div style="font-size:13px;font-weight:700;color:${labelColor};margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid ${
          isDark ? "#1e293b" : "#f4f4f5"
        }">${cat}</div>
            <div style="display:flex;flex-direction:column;gap:8px">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:16px">
                <div style="display:flex;align-items:center;gap:8px">
                  <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${accentC}"></span>
                  <span style="font-size:12px;color:${mutedC}">${compareName}</span>
                </div>
                <div style="display:flex;align-items:baseline;gap:8px">
                  <span style="font-size:15px;font-weight:700;color:${labelColor}">${compareVal}%</span>
                  <span style="font-size:11px;color:${mutedC}">${compareAbs} tCO₂e</span>
                </div>
              </div>
              <div style="display:flex;align-items:center;justify-content:space-between;gap:16px">
                <div style="display:flex;align-items:center;gap:8px">
                  <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${accentS}"></span>
                  <span style="font-size:12px;color:${mutedC}">${selectedName}</span>
                </div>
                <div style="display:flex;align-items:baseline;gap:8px">
                  <span style="font-size:15px;font-weight:700;color:${labelColor}">${selectedVal}%</span>
                  <span style="font-size:11px;color:${mutedC}">${selectedAbs} tCO₂e</span>
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
      textStyle: { color: axisColor, fontSize: 12, fontWeight: 500 },
      data: [
        { name: compareName, icon: "roundRect", itemStyle: { color: isDark ? "#5fa8e8" : "#1a56a8" } },
        { name: selectedName, icon: "roundRect", itemStyle: { color: isDark ? "#86efac" : "#16a34a" } },
      ],
    },
    grid: {
      left: 16,
      right: 72,
      top: 12,
      bottom: 48,
      containLabel: true,
    },
    xAxis: {
      type: "value",
      min: 0,
      max: 100,
      splitNumber: 5,
      axisLabel: {
        color: axisColor,
        fontSize: 11,
        formatter: (v: number) => `${v}%`,
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: {
        lineStyle: {
          color: gridLine,
          type: "solid" as const,
          width: 1,
        },
      },
    },
    yAxis: {
      type: "category",
      data: allCats,
      inverse: false,
      axisLabel: {
        color: labelColor,
        fontSize: 12,
        fontWeight: 600,
        width: 190,
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
        itemStyle: {
          color: COMPARE_COLOR,
          borderRadius: [0, 5, 5, 0],
        },
        emphasis: {
          focus: "series" as const,
          itemStyle: {
            shadowBlur: 12,
            shadowColor: "rgba(26,86,168,0.4)",
            shadowOffsetX: 3,
          },
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
        markArea: {
          silent: true,
          data: stripeMarkAreas,
        },
        data: comparePcts,
      },
      {
        name: selectedName,
        type: "bar" as const,
        barWidth: 18,
        barCategoryGap: "40%",
        barGap: "20%",
        itemStyle: {
          color: SELECTED_COLOR,
          borderRadius: [0, 5, 5, 0],
        },
        emphasis: {
          focus: "series" as const,
          itemStyle: {
            shadowBlur: 12,
            shadowColor: "rgba(22,163,74,0.4)",
            shadowOffsetX: 3,
          },
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
        data: selectedPcts,
      },
    ],
    _barHeight: barHeight,
  };
}

type Props = {
  tablesData: GhgReportTablesResponse;
  detailsData: GhgReportDetailsResponse;
  isDark?: boolean;
};

const GhgReportDetailedCharts = ({ tablesData, detailsData, isDark }: Props) => {
  const compareYear = tablesData.filters.compareYear;
  const selectedYear = tablesData.filters.year;
  const compareLabel = formatPeriodLabel(tablesData.filters.yearType, compareYear, tablesData.ranges);
  const selectedLabel = formatPeriodLabel(tablesData.filters.yearType, selectedYear, tablesData.ranges);

  const scope1Option = useMemo(() => {
    const rows = detailsData.rows.filter((r: any) => r.scope === "Scope 1");
    const compareRows = rows.map((r: any) => ({
      ...r,
      selected: { emissions: num(r.compare?.emissions) },
    }));
    return buildScopePercentBarOption({
      rows,
      compareRows,
      scopeLabel: "Scope 1",
      compareLabel,
      selectedLabel,
      isDark,
    });
  }, [detailsData, compareLabel, selectedLabel, isDark]);

  const scope2Option = useMemo(() => {
    const rows = detailsData.rows.filter((r: any) => r.scope === "Scope 2");
    const compareRows = rows.map((r: any) => ({
      ...r,
      selected: { emissions: num(r.compare?.emissions) },
    }));
    return buildScopePercentBarOption({
      rows,
      compareRows,
      scopeLabel: "Scope 2",
      compareLabel,
      selectedLabel,
      isDark,
    });
  }, [detailsData, compareLabel, selectedLabel, isDark]);

  const scope3Option = useMemo(() => {
    const rows = detailsData.rows.filter((r: any) => r.scope === "Scope 3");
    const compareRows = rows.map((r: any) => ({
      ...r,
      selected: { emissions: num(r.compare?.emissions) },
    }));
    return buildScopePercentBarOption({
      rows,
      compareRows,
      scopeLabel: "Scope 3",
      compareLabel,
      selectedLabel,
      isDark,
    });
  }, [detailsData, compareLabel, selectedLabel, isDark]);

  return (
    <div className="grid grid-cols-1 gap-4">
      <Card
        title={`Scope 1 Emissions by Category (%) — ${compareLabel.split(" (")[0]} vs ${selectedLabel.split(" (")[0]}`}
        subtitle={`${selectedLabel} — Direct GHG Emissions`}
        isDark={isDark}
      >
        <ReactECharts option={scope1Option} style={{ height: (scope1Option as any)._barHeight + 60 }} notMerge />
      </Card>

      <Card
        title={`Scope 2 Emissions by Category (%) — ${compareLabel.split(" (")[0]} vs ${selectedLabel.split(" (")[0]}`}
        subtitle={`${selectedLabel} — Indirect GHG Emissions`}
        isDark={isDark}
      >
        <ReactECharts option={scope2Option} style={{ height: (scope2Option as any)._barHeight + 60 }} notMerge />
      </Card>

      <Card
        title={`Scope 3 Emissions by Category (%) — ${compareLabel.split(" (")[0]} vs ${selectedLabel.split(" (")[0]}`}
        subtitle={`${selectedLabel} — Indirect GHG Emissions`}
        isDark={isDark}
      >
        <ReactECharts option={scope3Option} style={{ height: (scope3Option as any)._barHeight + 60 }} notMerge />
      </Card>
    </div>
  );
};

export default GhgReportDetailedCharts;
