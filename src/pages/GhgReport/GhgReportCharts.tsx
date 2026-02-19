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

function buildScopePercentBarOption(args: {
  rows: any[];
  compareRows: any[];
  scopeLabel: string;
  compareLabel: string;
  selectedLabel: string;
  isDark?: boolean;
}) {
  const { rows, compareRows, compareLabel, selectedLabel, isDark } = args;
  const axisColor = isDark ? "#94a3b8" : "#52525b";
  const labelColor = isDark ? "#e2e8f0" : "#18181b";
  const gridLine = isDark ? "rgba(148,163,184,0.12)" : "rgba(0,0,0,0.06)";
  const bgStripe = isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.018)";

  const COMPARE_COLOR = {
    type: "linear" as const, x: 0, y: 0, x2: 1, y2: 0,
    colorStops: [
      { offset: 0, color: "#0f2a5c" },
      { offset: 0.5, color: "#1a56a8" },
      { offset: 1, color: "#5fa8e8" },
    ],
  };
  const SELECTED_COLOR = {
    type: "linear" as const, x: 0, y: 0, x2: 1, y2: 0,
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

  const allCats = Array.from(
    new Set([...selectedMap.keys(), ...compareMap.keys()])
  ).sort((a, b) => a.localeCompare(b));

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
            <div style="font-size:13px;font-weight:700;color:${labelColor};margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid ${isDark ? "#1e293b" : "#f4f4f5"}">${cat}</div>
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


const GhgReportCharts = ({ tablesData, detailsData, isDark }: Props) => {
  const compareYear = tablesData.filters.compareYear;
  const selectedYear = tablesData.filters.year;
  const compareLabel = formatPeriodLabel(tablesData.filters.yearType, compareYear, tablesData.ranges);
  const selectedLabel = formatPeriodLabel(tablesData.filters.yearType, selectedYear, tablesData.ranges);
  const textColor = isDark ? "#e2e8f0" : "#111827";
  const axisColor = isDark ? "#94a3b8" : "#6b7280";
  const gridLine = isDark ? "rgba(148,163,184,0.25)" : "rgba(107,114,128,0.25)";

  const COMPARE_COLOR = "#1e3a6e";
  const SELECTED_COLOR = "#5cb85c";

  const scopeBarOption = useMemo(() => {
    const t = tablesData.tables.table1_emissionsByScope_twoYears;

    const scopes = ["Scope 1", "Scope 2", "Scope 3"];

    const getVal = (scopeName: string, year: number) =>
      num(t.find((r: any) => r.scope === scopeName)?.values?.[String(year)]?.emissions);

    const compareTotal = scopes.reduce((sum, s) => sum + getVal(s, compareYear), 0);
    const selectedTotal = scopes.reduce((sum, s) => sum + getVal(s, selectedYear), 0);

    const comparePcts = scopes.map((s) => {
      const val = getVal(s, compareYear);
      return compareTotal > 0 ? r2((val / compareTotal) * 100) : 0;
    });

    const selectedPcts = scopes.map((s) => {
      const val = getVal(s, selectedYear);
      return selectedTotal > 0 ? r2((val / selectedTotal) * 100) : 0;
    });

    return {
      backgroundColor: "transparent",
      title: {
        text: `Emissions Comparison (%) - ${compareLabel.split(" (")[0]} vs ${selectedLabel.split(" (")[0]}`,
        left: "center",
        top: 8,
        textStyle: {
          color: textColor,
          fontSize: 14,
          fontWeight: 700,
        },
      },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: isDark ? "rgba(15,23,42,0.96)" : "rgba(255,255,255,0.96)",
        borderColor: isDark ? "#475569" : "#e5e7eb",
        borderWidth: 1,
        textStyle: { color: textColor, fontSize: 13 },
        formatter: (params: any) => {
          let html = `<div style="font-weight:700;margin-bottom:6px">${params?.[0]?.name}</div>`;
          for (const p of params || []) {
            html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
              <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${p.color}"></span>
              <span style="font-size:12px">${p.seriesName}: <b>${p.value}%</b></span>
            </div>`;
          }
          return html;
        },
      },
      legend: {
        bottom: 8,
        itemWidth: 16,
        itemHeight: 14,
        textStyle: { color: axisColor, fontSize: 12 },
        data: [
          { name: compareLabel.split(" (")[0], itemStyle: { color: COMPARE_COLOR } },
          { name: selectedLabel.split(" (")[0], itemStyle: { color: SELECTED_COLOR } },
        ],
      },
      grid: {
        left: 20,
        right: 20,
        top: 54,
        bottom: 52,
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: scopes,
        axisLabel: {
          color: axisColor,
          fontSize: 12,
          fontWeight: 500,
          interval: 0,
        },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: gridLine, width: 1.5 } },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 120,
        interval: 20,
        axisLabel: {
          color: axisColor,
          fontSize: 11,
          formatter: (v: number) => `${v.toFixed(2)}%`,
        },
        splitLine: { lineStyle: { color: gridLine, type: "dashed" as const, width: 1 } },
      },
      series: [
        {
          name: compareLabel.split(" (")[0],
          type: "bar",
          barWidth: 40,
          barGap: "20%",
          itemStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "#1e3a6e" },
                { offset: 1, color: "#4a90d9" },
              ],
            },
          },
          label: {
            show: true,
            position: "top" as const,
            color: textColor,
            fontSize: 11,
            fontWeight: 600,
            formatter: (p: any) => `${p.value}%`,
          },
          data: comparePcts,
        },
        {
          name: selectedLabel.split(" (")[0],
          type: "bar",
          barWidth: 40,
          barGap: "20%",
          itemStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "#5cb85c" },
                { offset: 1, color: "#a8e6a8" },
              ],
            },
          },
          label: {
            show: true,
            position: "top" as const,
            color: textColor,
            fontSize: 11,
            fontWeight: 600,
            formatter: (p: any) => `${p.value}%`,
          },
          data: selectedPcts,
        },
      ],
    };
  }, [tablesData, compareYear, selectedYear, compareLabel, selectedLabel, textColor, axisColor, gridLine, isDark]);

  const categoryBarOption = useMemo(() => {
    const allRows = detailsData.rows.filter(
      (r: any) => !EXCLUDED_CATEGORIES.includes(String(r.categoryName || ""))
    );

    const catSet = new Set<string>();
    allRows.forEach((r: any) => {
      if (r.categoryName) catSet.add(String(r.categoryName));
    });
    const categories = Array.from(catSet).filter(Boolean).sort((a, b) => a.localeCompare(b));

    const selectedByCat = new Map<string, number>();
    const compareByCat = new Map<string, number>();
    for (const r of allRows) {
      const cat = String(r.categoryName || "");
      if (!cat) continue;
      selectedByCat.set(cat, (selectedByCat.get(cat) || 0) + r2(num(r.selected?.emissions)));
      compareByCat.set(cat, (compareByCat.get(cat) || 0) + r2(num(r.compare?.emissions)));
    }

    const compareName = compareLabel.split(" (")[0];
    const selectedName = selectedLabel.split(" (")[0];

    const gridLineColor = isDark ? "rgba(148,163,184,0.12)" : "rgba(0,0,0,0.06)";
    const labelCol = isDark ? "#e2e8f0" : "#18181b";
    const axisCol = isDark ? "#94a3b8" : "#52525b";
    const mutedCol = isDark ? "#64748b" : "#a1a1aa";

    const COMPARE_GRADIENT = {
      type: "linear" as const, x: 0, y: 0, x2: 0, y2: 1,
      colorStops: [
        { offset: 0, color: "#0f2a5c" },
        { offset: 0.5, color: "#1a56a8" },
        { offset: 1, color: "#5fa8e8" },
      ],
    };
    const SELECTED_GRADIENT = {
      type: "linear" as const, x: 0, y: 0, x2: 0, y2: 1,
      colorStops: [
        { offset: 0, color: "#166534" },
        { offset: 0.5, color: "#16a34a" },
        { offset: 1, color: "#86efac" },
      ],
    };

    const compareData = categories.map((c) => r2(compareByCat.get(c) || 0));
    const selectedData = categories.map((c) => r2(selectedByCat.get(c) || 0));

    return {
      backgroundColor: "transparent",
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: isDark ? "rgba(9,14,28,0.97)" : "rgba(255,255,255,0.98)",
        borderColor: isDark ? "#334155" : "#e4e4e7",
        borderWidth: 1,
        padding: [14, 18],
        textStyle: { color: labelCol, fontSize: 13 },
        extraCssText: `box-shadow:0 8px 32px rgba(0,0,0,${isDark ? "0.5" : "0.12"});border-radius:10px;`,
        formatter: (params: any) => {
          const idx = params?.[0]?.dataIndex ?? 0;
          const cat = categories[idx] ?? params?.[0]?.name ?? "";
          const cmpVal = compareData[idx];
          const selVal = selectedData[idx];
          const accentC = isDark ? "#5fa8e8" : "#1a56a8";
          const accentS = isDark ? "#86efac" : "#16a34a";
          return `
            <div style="min-width:240px">
              <div style="font-size:13px;font-weight:700;color:${labelCol};margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid ${isDark ? "#1e293b" : "#f4f4f5"}">${cat}</div>
              <div style="display:flex;flex-direction:column;gap:8px">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:16px">
                  <div style="display:flex;align-items:center;gap:8px">
                    <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${accentC}"></span>
                    <span style="font-size:12px;color:${mutedCol}">${compareName}</span>
                  </div>
                  <span style="font-size:15px;font-weight:700;color:${labelCol}">${cmpVal} <span style="font-size:11px;font-weight:400;color:${mutedCol}">tCO₂e</span></span>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;gap:16px">
                  <div style="display:flex;align-items:center;gap:8px">
                    <span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:${accentS}"></span>
                    <span style="font-size:12px;color:${mutedCol}">${selectedName}</span>
                  </div>
                  <span style="font-size:15px;font-weight:700;color:${labelCol}">${selVal} <span style="font-size:11px;font-weight:400;color:${mutedCol}">tCO₂e</span></span>
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
      grid: { left: 16, right: 16, top: 12, bottom: 52, containLabel: true },
      xAxis: {
        type: "category",
        data: categories,
        axisLabel: {
          color: axisCol,
          fontSize: 11,
          fontWeight: 500,
          interval: 0,
          rotate: categories.length > 4 ? 18 : 0,
          overflow: "truncate",
          width: 150,
        },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: gridLineColor, width: 1.5 } },
      },
      yAxis: {
        type: "value",
        name: "tCO₂e",
        nameTextStyle: { color: axisCol, fontSize: 11, fontWeight: 600, padding: [0, 0, 0, 0] },
        axisLabel: { color: axisCol, fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: gridLineColor, type: "solid" as const, width: 1 } },
      },
      series: [
        {
          name: compareName,
          type: "bar" as const,
          barMaxWidth: 36,
          barGap: "20%",
          itemStyle: { color: COMPARE_GRADIENT, borderRadius: [4, 4, 0, 0] },
          emphasis: {
            focus: "series" as const,
            itemStyle: { shadowBlur: 12, shadowColor: "rgba(26,86,168,0.4)", shadowOffsetY: -3 },
          },
          label: {
            show: true,
            position: "top" as const,
            distance: 5,
            color: isDark ? "#93c5fd" : "#1a56a8",
            fontSize: 11,
            fontWeight: 700,
            formatter: (p: any) => (p.value > 0 ? `${p.value}` : ""),
          },
          data: compareData,
        },
        {
          name: selectedName,
          type: "bar" as const,
          barMaxWidth: 36,
          barGap: "20%",
          itemStyle: { color: SELECTED_GRADIENT, borderRadius: [4, 4, 0, 0] },
          emphasis: {
            focus: "series" as const,
            itemStyle: { shadowBlur: 12, shadowColor: "rgba(22,163,74,0.4)", shadowOffsetY: -3 },
          },
          label: {
            show: true,
            position: "top" as const,
            distance: 5,
            color: isDark ? "#86efac" : "#166534",
            fontSize: 11,
            fontWeight: 700,
            formatter: (p: any) => (p.value > 0 ? `${p.value}` : ""),
          },
          data: selectedData,
        },
      ],
    };
  }, [detailsData, compareLabel, selectedLabel, axisColor, isDark]);


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
        title={`Emissions Comparison (%) — ${compareLabel} vs ${selectedLabel}`}
        subtitle="Source: Table 1 (Emissions by Scope)."
        isDark={isDark}
      >
        <ReactECharts option={scopeBarOption} style={{ height: 360 }} notMerge />
      </Card>

      <Card
        title={`Emissions by Category — ${compareLabel.split(" (")[0]} vs ${selectedLabel.split(" (")[0]}`}
        subtitle={`${compareLabel} vs ${selectedLabel}`}
        isDark={isDark}
      >
        <ReactECharts option={categoryBarOption} style={{ height: 320 }} notMerge />
      </Card>

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

export default GhgReportCharts;