import React, { forwardRef, useMemo } from "react";
import ReactECharts from "echarts-for-react";
import type { GhgReportTablesResponse, GhgReportDetailsResponse } from "../../../services/ghgreportService";
import { EXCLUDED_CATEGORIES, formatPeriodLabel, num, r2 } from "./PdfShared";

export type GhgPdfChartRefs = {
 scopeComparisonRef: React.RefObject<HTMLDivElement | null>;
  categoryAbsRef: React.RefObject<HTMLDivElement | null>;
  scope1Ref: React.RefObject<HTMLDivElement | null>;
  scope2Ref: React.RefObject<HTMLDivElement | null>;
  scope3Ref: React.RefObject<HTMLDivElement | null>;
  resultsPctRef: React.RefObject<HTMLDivElement | null>;
};

function buildScopePercentBarOption(args: {
  rows: any[];
  compareRows: any[];
  compareLabel: string;
  selectedLabel: string;
}) {
  const { rows, compareRows, compareLabel, selectedLabel } = args;

  const axisColor = "#52525b";
  const labelColor = "#18181b";
  const gridLine = "rgba(0,0,0,0.06)";
  const bgStripe = "rgba(0,0,0,0.018)";

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

  const compareName = compareLabel.split(" (")[0];
  const selectedName = selectedLabel.split(" (")[0];

  const rowH = 52;
  const barHeight = Math.max(allCats.length * rowH * 2, 220);

  const stripeMarkAreas = allCats
    .filter((_, i) => i % 2 === 0)
    .map((cat) => [
      { yAxis: cat, itemStyle: { color: bgStripe } },
      { yAxis: cat },
    ]);

  return {
    backgroundColor: "transparent",
    legend: {
      bottom: 4,
      left: "center",
      itemWidth: 14,
      itemHeight: 14,
      borderRadius: 3,
      itemGap: 28,
      textStyle: { color: axisColor, fontSize: 12, fontWeight: 500 },
      data: [
        { name: compareName, icon: "roundRect", itemStyle: { color: "#1a56a8" } },
        { name: selectedName, icon: "roundRect", itemStyle: { color: "#16a34a" } },
      ],
    },
    grid: { left: 16, right: 72, top: 12, bottom: 52, containLabel: true },
    xAxis: {
      type: "value",
      min: 0,
      max: 100,
      splitNumber: 5,
      axisLabel: { color: axisColor, fontSize: 11, formatter: (v: number) => `${v}%` },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: gridLine, type: "solid" as const, width: 1 } },
    },
    yAxis: {
      type: "category",
      data: allCats,
      axisLabel: {
        color: labelColor,
        fontSize: 12,
        fontWeight: 600,
        width: 260,
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
        label: {
          show: true,
          position: "right" as const,
          distance: 6,
          color: "#1a56a8",
          fontSize: 11,
          fontWeight: 700,
          formatter: (p: any) => (p.value > 0 ? `${p.value}%` : ""),
        },
        markArea: { silent: true, data: stripeMarkAreas },
        data: comparePcts,
      },
      {
        name: selectedName,
        type: "bar" as const,
        barWidth: 18,
        barCategoryGap: "40%",
        barGap: "20%",
        itemStyle: { color: SELECTED_COLOR, borderRadius: [0, 5, 5, 0] },
        label: {
          show: true,
          position: "right" as const,
          distance: 6,
          color: "#166534",
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

function buildResultsPctOption(args: {
  detailsData: GhgReportDetailsResponse;
  compareName: string;
  selectedName: string;
}) {
  const { detailsData, compareName, selectedName } = args;

  const rows = (detailsData.rows || []).filter(
    (r: any) => !EXCLUDED_CATEGORIES.includes(String(r.categoryName || ""))
  );

  const selectedByCat = new Map<string, number>();
  const compareByCat = new Map<string, number>();

  for (const r of rows as any[]) {
    const cat = String((r as any).categoryName || "");
    if (!cat) continue;
    selectedByCat.set(cat, (selectedByCat.get(cat) || 0) + r2(num((r as any).selected?.emissions)));
    compareByCat.set(cat, (compareByCat.get(cat) || 0) + r2(num((r as any).compare?.emissions)));
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

  const axisCol = "#52525b";
  const labelCol = "#18181b";
  const gridLineColor = "rgba(0,0,0,0.06)";
  const bgStripe = "rgba(0,0,0,0.018)";

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

  const stripeMarkAreas = categories
    .filter((_, i) => i % 2 === 0)
    .map((cat) => [
      { yAxis: cat, itemStyle: { color: bgStripe } },
      { yAxis: cat },
    ]);

  const rowH = 44;
  const barHeight = Math.max(categories.length * rowH * 2, 260);

  return {
    backgroundColor: "transparent",
    legend: {
      bottom: 4,
      left: "center",
      itemWidth: 14,
      itemHeight: 14,
      borderRadius: 3,
      itemGap: 28,
      textStyle: { color: axisCol, fontSize: 12, fontWeight: 500 },
      data: [
        { name: compareName, icon: "roundRect", itemStyle: { color: "#1a56a8" } },
        { name: selectedName, icon: "roundRect", itemStyle: { color: "#16a34a" } },
      ],
    },
    grid: { left: 16, right: 72, top: 12, bottom: 52, containLabel: true },
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
        width: 300,
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
        label: {
          show: true,
          position: "right" as const,
          distance: 6,
          color: "#1a56a8",
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
        label: {
          show: true,
          position: "right" as const,
          distance: 6,
          color: "#166534",
          fontSize: 11,
          fontWeight: 700,
          formatter: (p: any) => (p.value > 0 ? `${p.value}%` : ""),
        },
        data: selectedPct,
      },
    ],
    _barHeight: barHeight,
  };
}

export const GhgPdfHiddenCharts = forwardRef(function GhgPdfHiddenCharts(
  {
    tablesData,
    detailsData,
    refs,
  }: {
    tablesData: GhgReportTablesResponse;
    detailsData: GhgReportDetailsResponse;
    refs: GhgPdfChartRefs;
  },
  _ref
) {
  const compareYear = tablesData.filters.compareYear;
  const selectedYear = tablesData.filters.year;
  const compareLabel = formatPeriodLabel(tablesData.filters.yearType, compareYear);
  const selectedLabel = formatPeriodLabel(tablesData.filters.yearType, selectedYear);

  const compareName = compareLabel.split(" (")[0];
  const selectedName = selectedLabel.split(" (")[0];

  const scopeComparisonOption = useMemo(() => {
    const t: any[] = (tablesData.tables as any).table1_emissionsByScope_twoYears || [];
    const scopes = ["Scope 1", "Scope 2", "Scope 3"];

    const getVal = (scopeName: string, year: number) =>
      num(t.find((r: any) => r.scope === scopeName)?.values?.[String(year)]?.emissions);

    const compareTotal = scopes.reduce((sum, s) => sum + getVal(s, compareYear), 0);
    const selectedTotal = scopes.reduce((sum, s) => sum + getVal(s, selectedYear), 0);

    const comparePcts = scopes.map((s) => (compareTotal > 0 ? r2((getVal(s, compareYear) / compareTotal) * 100) : 0));
    const selectedPcts = scopes.map((s) => (selectedTotal > 0 ? r2((getVal(s, selectedYear) / selectedTotal) * 100) : 0));

    return {
      backgroundColor: "transparent",
      title: {
        text: `Emissions Comparison (%) - ${compareName} vs ${selectedName}`,
        left: "center",
        top: 8,
        textStyle: { color: "#111827", fontSize: 14, fontWeight: 700 },
      },
      legend: {
        bottom: 8,
        itemWidth: 16,
        itemHeight: 14,
        textStyle: { color: "#6b7280", fontSize: 12 },
        data: [
          { name: compareName, itemStyle: { color: "#1e3a6e" } },
          { name: selectedName, itemStyle: { color: "#5cb85c" } },
        ],
      },
      grid: { left: 20, right: 20, top: 54, bottom: 52, containLabel: true },
      xAxis: {
        type: "category",
        data: scopes,
        axisLabel: { color: "#6b7280", fontSize: 12, fontWeight: 500, interval: 0 },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "rgba(107,114,128,0.25)", width: 1.5 } },
      },
      yAxis: {
        type: "value",
        min: 0,
        max: 120,
        interval: 20,
        axisLabel: { color: "#6b7280", fontSize: 11, formatter: (v: number) => `${v.toFixed(2)}%` },
        splitLine: { lineStyle: { color: "rgba(107,114,128,0.25)", type: "dashed" as const, width: 1 } },
      },
      series: [
        {
          name: compareName,
          type: "bar",
          barWidth: 40,
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
          label: { show: true, position: "top" as const, color: "#111827", fontSize: 11, fontWeight: 600, formatter: (p: any) => `${p.value}%` },
          data: comparePcts,
        },
        {
          name: selectedName,
          type: "bar",
          barWidth: 40,
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
          label: { show: true, position: "top" as const, color: "#111827", fontSize: 11, fontWeight: 600, formatter: (p: any) => `${p.value}%` },
          data: selectedPcts,
        },
      ],
    };
  }, [tablesData, compareYear, selectedYear, compareName, selectedName]);

  const categoryAbsOption = useMemo(() => {
    const allRows = (detailsData.rows || []).filter((r: any) => !EXCLUDED_CATEGORIES.includes(String(r.categoryName || "")));

    const cats = Array.from(new Set(allRows.map((r: any) => String(r.categoryName || "")).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    );

    const selectedByCat = new Map<string, number>();
    const compareByCat = new Map<string, number>();

    for (const r of allRows as any[]) {
      const cat = String((r as any).categoryName || "");
      if (!cat) continue;
      selectedByCat.set(cat, (selectedByCat.get(cat) || 0) + r2(num((r as any).selected?.emissions)));
      compareByCat.set(cat, (compareByCat.get(cat) || 0) + r2(num((r as any).compare?.emissions)));
    }

    const compareData = cats.map((c) => r2(compareByCat.get(c) || 0));
    const selectedData = cats.map((c) => r2(selectedByCat.get(c) || 0));

    const gridLineColor = "rgba(0,0,0,0.06)";

    const COMPARE_GRADIENT = {
      type: "linear" as const,
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        { offset: 0, color: "#0f2a5c" },
        { offset: 0.5, color: "#1a56a8" },
        { offset: 1, color: "#5fa8e8" },
      ],
    };

    const SELECTED_GRADIENT = {
      type: "linear" as const,
      x: 0,
      y: 0,
      x2: 0,
      y2: 1,
      colorStops: [
        { offset: 0, color: "#166534" },
        { offset: 0.5, color: "#16a34a" },
        { offset: 1, color: "#86efac" },
      ],
    };

    return {
      backgroundColor: "transparent",
      legend: {
        bottom: 4,
        left: "center",
        itemWidth: 14,
        itemHeight: 14,
        borderRadius: 3,
        itemGap: 28,
        textStyle: { color: "#52525b", fontSize: 12, fontWeight: 500 },
        data: [
          { name: compareName, icon: "roundRect", itemStyle: { color: "#1a56a8" } },
          { name: selectedName, icon: "roundRect", itemStyle: { color: "#16a34a" } },
        ],
      },
      grid: { left: 16, right: 16, top: 12, bottom: 52, containLabel: true },
      xAxis: {
        type: "category",
        data: cats,
        axisLabel: {
          color: "#52525b",
          fontSize: 11,
          fontWeight: 500,
          interval: 0,
          rotate: cats.length > 4 ? 18 : 0,
          overflow: "truncate",
          width: 150,
        },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: gridLineColor, width: 1.5 } },
      },
      yAxis: {
        type: "value",
        name: "tCO₂e",
        nameTextStyle: { color: "#52525b", fontSize: 11, fontWeight: 600, padding: [0, 0, 0, 0] },
        axisLabel: { color: "#52525b", fontSize: 11 },
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
          label: {
            show: true,
            position: "top" as const,
            distance: 5,
            color: "#1a56a8",
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
          label: {
            show: true,
            position: "top" as const,
            distance: 5,
            color: "#166534",
            fontSize: 11,
            fontWeight: 700,
            formatter: (p: any) => (p.value > 0 ? `${p.value}` : ""),
          },
          data: selectedData,
        },
      ],
    };
  }, [detailsData, compareName, selectedName]);

  const scope1Option = useMemo(() => {
    const rows = (detailsData.rows || []).filter((r: any) => r.scope === "Scope 1");
    const compareRows = rows.map((r: any) => ({ ...r, selected: { emissions: num(r.compare?.emissions) } }));
    return buildScopePercentBarOption({ rows, compareRows, compareLabel, selectedLabel });
  }, [detailsData, compareLabel, selectedLabel]);

  const scope2Option = useMemo(() => {
    const rows = (detailsData.rows || []).filter((r: any) => r.scope === "Scope 2");
    const compareRows = rows.map((r: any) => ({ ...r, selected: { emissions: num(r.compare?.emissions) } }));
    return buildScopePercentBarOption({ rows, compareRows, compareLabel, selectedLabel });
  }, [detailsData, compareLabel, selectedLabel]);

  const scope3Option = useMemo(() => {
    const rows = (detailsData.rows || []).filter((r: any) => r.scope === "Scope 3");
    const compareRows = rows.map((r: any) => ({ ...r, selected: { emissions: num(r.compare?.emissions) } }));
    return buildScopePercentBarOption({ rows, compareRows, compareLabel, selectedLabel });
  }, [detailsData, compareLabel, selectedLabel]);

  const resultsPctOption = useMemo(() => {
    return buildResultsPctOption({ detailsData, compareName, selectedName });
  }, [detailsData, compareName, selectedName]);

  const hiddenWrapStyle: React.CSSProperties = {
    position: "fixed",
    left: -10000,
    top: 0,
    width: 1000,
    background: "#fff",
    padding: 12,
    zIndex: -1,
    opacity: 0,
    pointerEvents: "none",
  };

  return (
    <div style={hiddenWrapStyle} aria-hidden>
      <div ref={refs.scopeComparisonRef} style={{ width: 976, background: "#fff" }}>
        <ReactECharts option={scopeComparisonOption} style={{ height: 360, width: "100%" }} notMerge />
      </div>

      <div ref={refs.categoryAbsRef} style={{ width: 976, marginTop: 10, background: "#fff" }}>
        <ReactECharts option={categoryAbsOption} style={{ height: 340, width: "100%" }} notMerge />
      </div>

      <div ref={refs.scope1Ref} style={{ width: 976, marginTop: 10, background: "#fff" }}>
        <ReactECharts option={scope1Option} style={{ height: (scope1Option as any)._barHeight + 60, width: "100%" }} notMerge />
      </div>

      <div ref={refs.scope2Ref} style={{ width: 976, marginTop: 10, background: "#fff" }}>
        <ReactECharts option={scope2Option} style={{ height: (scope2Option as any)._barHeight + 60, width: "100%" }} notMerge />
      </div>

      <div ref={refs.scope3Ref} style={{ width: 976, marginTop: 10, background: "#fff" }}>
        <ReactECharts option={scope3Option} style={{ height: (scope3Option as any)._barHeight + 60, width: "100%" }} notMerge />
      </div>

      <div ref={refs.resultsPctRef} style={{ width: 976, marginTop: 10, background: "#fff" }}>
        <ReactECharts option={resultsPctOption} style={{ height: (resultsPctOption as any)._barHeight + 70, width: "100%" }} notMerge />
      </div>
    </div>
  );
});
