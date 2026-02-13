// import React, { useMemo } from "react";
// import ReactECharts from "echarts-for-react";
// import type { GhgReportTablesResponse, GhgReportDetailsResponse } from "../../services/ghgreportService";

// function formatPeriodLabel(
//   yearType: "CY" | "FY",
//   year: number,
//   ranges?: Record<string, { startDate: string; endDate: string }>
// ) {
//   if (!ranges || !ranges[String(year)]) return `${yearType} ${year}`;
//   const { startDate, endDate } = ranges[String(year)];
//   const fmtMY = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", year: "numeric" });
//   return yearType === "FY"
//     ? `FY ${year} (${fmtMY(startDate)} – ${fmtMY(endDate)})`
//     : `CY ${year} (${fmtMY(startDate)} – ${fmtMY(endDate)})`;
// }

// function num(v: any) {
//   const n = Number(v);
//   return Number.isFinite(n) ? n : 0;
// }

// function r2(n: number) {
//   return Number((n || 0).toFixed(2));
// }

// const Card = ({
//   title,
//   subtitle,
//   children,
//   isDark,
// }: {
//   title: string;
//   subtitle?: string;
//   children: React.ReactNode;
//   isDark?: boolean;
// }) => {
//   const card = isDark ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200";
//   const titleCls = isDark ? "text-slate-100" : "text-gray-900";
//   const subCls = isDark ? "text-slate-300" : "text-gray-600";
//   return (
//     <div className={`rounded-lg border shadow-sm ${card}`}>
//       <div className="px-4 py-3 border-b border-inherit">
//         <div className={`font-semibold ${titleCls}`}>{title}</div>
//         {subtitle ? <div className={`text-xs mt-1 ${subCls}`}>{subtitle}</div> : null}
//       </div>
//       <div className="p-4">{children}</div>
//     </div>
//   );
// };

// type Props = {
//   tablesData: GhgReportTablesResponse;
//   detailsData: GhgReportDetailsResponse;
//   isDark?: boolean;
// };

// type GroupKeyMode = "CATEGORY_FUEL" | "CATEGORY_ONLY";

// function buildGroupedBarOption(args: {
//   rows: any[];
//   scopeTitle: string;
//   selectedLabel: string;
//   isDark?: boolean;
//   groupKeyMode: GroupKeyMode;
//   compactHeight?: boolean;
// }) {
//   const { rows, scopeTitle, selectedLabel, isDark, groupKeyMode, compactHeight } = args;

//   const textColor = isDark ? "#e2e8f0" : "#111827";
//   const axisColor = isDark ? "#94a3b8" : "#6b7280";
//   const gridLine = isDark ? "rgba(148,163,184,0.25)" : "rgba(107,114,128,0.25)";

//   // Professional color palette with good contrast
//   const colorPalette = [
//     "#3b82f6", // blue
//     "#10b981", // emerald
//     "#8b5cf6", // violet
//     "#f59e0b", // amber
//     "#ec4899", // pink
//     "#14b8a6", // teal
//     "#f97316", // orange
//     "#6366f1", // indigo
//     "#06b6d4", // cyan
//     "#84cc16", // lime
//   ];

//   const siteSet = new Set<string>();
//   rows.forEach((r) => siteSet.add(String(r.siteName || "")));
//   const sites = Array.from(siteSet).filter(Boolean).sort((a, b) => a.localeCompare(b));

//   const keyOf = (r: any) => {
//     const cat = String(r.categoryName || "");
//     const fuel = String(r.fuelType || "");
//     if (groupKeyMode === "CATEGORY_ONLY") return cat || "Unknown Category";
//     const left = cat || "Unknown Category";
//     const right = fuel && fuel !== "Unknown" ? fuel : "Unknown";
//     return `${left} • ${right}`;
//   };

//   const keySet = new Set<string>();
//   rows.forEach((r) => keySet.add(keyOf(r)));
//   const keys = Array.from(keySet).filter(Boolean).sort((a, b) => a.localeCompare(b));

//   // Build matrices for both emissions and consumption
//   const emissionsMatrix = new Map<string, Map<string, number>>();
//   const consumptionMatrix = new Map<string, Map<string, { value: number; unit: string }>>();
  
//   for (const k of keys) {
//     emissionsMatrix.set(k, new Map());
//     consumptionMatrix.set(k, new Map());
//   }
  
//   // DEV: log first row to confirm exact field paths — remove after confirming unit field name
//   if (rows.length > 0) {
//     console.warn("[GhgReportCharts] First detail row shape:", JSON.stringify(rows[0], null, 2));
//   }

//   for (const r of rows) {
//     const k = keyOf(r);
//     const s = String(r.siteName || "");
//     const e = r2(num(r.selected?.emissions));
//     const consumption = r2(num(r.selected?.consumption));

//     // Try every possible location the unit might live on the row object
//     const unit = String(
//       r.selected?.consumptionUnit ||
//       r.selected?.unit ||
//       r.consumptionUnit ||
//       r.unit ||
//       r.selected?.activityUnit ||
//       r.activityUnit ||
//       ""
//     );

//     if (!k || !s) continue;

//     if (!emissionsMatrix.has(k)) emissionsMatrix.set(k, new Map());
//     if (!consumptionMatrix.has(k)) consumptionMatrix.set(k, new Map());

//     emissionsMatrix.get(k)!.set(s, (emissionsMatrix.get(k)!.get(s) || 0) + e);

//     const existing = consumptionMatrix.get(k)!.get(s);
//     if (existing) {
//       consumptionMatrix.get(k)!.set(s, {
//         value: existing.value + consumption,
//         unit: existing.unit || unit
//       });
//     } else {
//       consumptionMatrix.get(k)!.set(s, { value: consumption, unit });
//     }
//   }

//   const series = sites.map((site, index) => ({
//     name: site,
//     type: "bar" as const,
//     barWidth: 16,
//     barGap: "30%",
//     itemStyle: {
//       borderRadius: [4, 4, 0, 0],
//       color: colorPalette[index % colorPalette.length],
//       shadowColor: isDark ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.12)",
//       shadowBlur: 6,
//       shadowOffsetY: 3,
//     },
//     emphasis: {
//       focus: "series" as const,
//       itemStyle: {
//         shadowBlur: 10,
//         shadowOffsetY: 4,
//         brightness: 1.15,
//       }
//     },
//     label: {
//       show: true,
//       position: "top" as const,
//       color: textColor,
//       fontSize: 11,
//       fontWeight: 600,
//       distance: 5,
//       formatter: (p: any) => p.value > 0 ? `${p.value}` : "",
//     },
//     data: keys.map((k) => r2(emissionsMatrix.get(k)?.get(site) || 0)),
//   }));

//   const showZoom = keys.length > 8;

//   return {
//     backgroundColor: "transparent",
//     color: colorPalette,
//     tooltip: {
//       trigger: "axis",
//       axisPointer: { 
//         type: "shadow",
//         shadowStyle: {
//           color: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"
//         }
//       },
//       backgroundColor: isDark ? "rgba(15,23,42,0.96)" : "rgba(255,255,255,0.96)",
//       borderColor: isDark ? "#475569" : "#e5e7eb",
//       borderWidth: 1,
//       padding: [12, 16],
//       textStyle: {
//         color: textColor,
//         fontSize: 13,
//       },
//       formatter: (params: any) => {
//         // Use dataIndex to get the EXACT key (axis label may be truncated)
//         const dataIndex = params?.[0]?.dataIndex ?? 0;
//         const exactKey = keys[dataIndex] ?? params?.[0]?.name ?? "";

//         // Header with category name
//         let html = `<div style="font-weight: 700; font-size: 14px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid ${isDark ? '#334155' : '#e5e7eb'}; color: ${isDark ? '#f1f5f9' : '#0f172a'};">${exactKey}</div>`;

//         // Table header
//         html += `<table style="width: 100%; border-collapse: collapse; min-width: 320px;">`;
//         html += `<thead><tr style="border-bottom: 1px solid ${isDark ? '#334155' : '#e5e7eb'};">`;
//         html += `<th style="text-align: left; padding: 4px 8px 4px 0; font-size: 11px; font-weight: 600; color: ${isDark ? '#94a3b8' : '#64748b'};">SITE</th>`;
//         html += `<th style="text-align: right; padding: 4px 8px; font-size: 11px; font-weight: 600; color: ${isDark ? '#94a3b8' : '#64748b'};">EMISSIONS</th>`;
//         html += `<th style="text-align: right; padding: 4px 0 4px 8px; font-size: 11px; font-weight: 600; color: ${isDark ? '#94a3b8' : '#64748b'};">CONSUMPTION</th>`;
//         html += `</tr></thead>`;
//         html += `<tbody>`;

//         // Data rows
//         for (const p of params || []) {
//           if (!p.value || p.value === 0) continue;

//           // Look up consumption using the EXACT key and site name
//           const consumption = consumptionMatrix.get(exactKey)?.get(p.seriesName);
//           const hasConsumption = consumption && consumption.value > 0;

//           html += `<tr style="border-bottom: 1px solid ${isDark ? 'rgba(51,65,85,0.5)' : 'rgba(229,231,235,0.5)'};">`;

//           // Site name with color indicator
//           html += `<td style="padding: 6px 8px 6px 0;">`;
//           html += `<span style="display: inline-block; width: 12px; height: 12px; border-radius: 3px; background: ${p.color}; margin-right: 8px; vertical-align: middle;"></span>`;
//           html += `<span style="font-weight: 500; color: ${isDark ? '#e2e8f0' : '#1e293b'};">${p.seriesName}</span>`;
//           html += `</td>`;

//           // Emissions value
//           html += `<td style="text-align: right; padding: 6px 8px; font-weight: 700; color: ${isDark ? '#f1f5f9' : '#0f172a'}; font-size: 13px;">`;
//           html += `${p.value} <span style="font-weight: 400; color: ${isDark ? '#94a3b8' : '#64748b'}; font-size: 11px;">tCO₂e</span>`;
//           html += `</td>`;

//           // Consumption value — value + unit badge always together
//           html += `<td style="text-align: right; padding: 6px 0 6px 8px; white-space: nowrap;">`;
//           if (hasConsumption) {
//             html += `<span style="font-weight: 600; color: ${isDark ? '#cbd5e1' : '#334155'}; font-size: 13px;">${r2(consumption!.value)}</span>`;
//             if (consumption!.unit) {
//               html += ` <span style="display: inline-block; background: ${isDark ? '#1e3a5f' : '#dbeafe'}; color: ${isDark ? '#93c5fd' : '#1d4ed8'}; font-size: 10px; font-weight: 600; padding: 1px 5px; border-radius: 4px; vertical-align: middle;">${consumption!.unit}</span>`;
//             }
//           } else {
//             html += `<span style="color: ${isDark ? '#475569' : '#94a3b8'}; font-size: 11px;">—</span>`;
//           }
//           html += `</td>`;

//           html += `</tr>`;
//         }

//         html += `</tbody></table>`;

//         // Total row if multiple sites
//         if (params && params.filter((p: any) => p.value > 0).length > 1) {
//           const totalEmissions = params.reduce((sum: number, p: any) => sum + (p.value || 0), 0);
//           let totalConsumption = 0;
//           let totalUnit = "";

//           params.forEach((p: any) => {
//             const consumption = consumptionMatrix.get(exactKey)?.get(p.seriesName);
//             if (consumption && consumption.value > 0) {
//               totalConsumption += consumption.value;
//               if (!totalUnit) totalUnit = consumption.unit;
//             }
//           });

//           html += `<div style="margin-top: 10px; padding-top: 8px; border-top: 2px solid ${isDark ? '#475569' : '#cbd5e1'}; display: flex; justify-content: space-between; align-items: center;">`;
//           html += `<span style="font-weight: 700; color: ${isDark ? '#f1f5f9' : '#0f172a'};">TOTAL</span>`;
//           html += `<span style="font-weight: 700; color: ${isDark ? '#f1f5f9' : '#0f172a'}; white-space: nowrap;">${r2(totalEmissions)} tCO₂e`;
//           if (totalConsumption > 0) {
//             html += ` <span style="color: ${isDark ? '#94a3b8' : '#64748b'}; font-weight: 500;">| ${r2(totalConsumption)}</span>`;
//             // if (totalUnit) {
//             //   html += ` <span style="display: inline-block; background: ${isDark ? '#1e3a5f' : '#dbeafe'}; color: ${isDark ? '#93c5fd' : '#1d4ed8'}; font-size: 10px; font-weight: 600; padding: 1px 5px; border-radius: 4px; vertical-align: middle;">${totalUnit}</span>`;
//             // }
//           }
//           html += `</span>`;
//           html += `</div>`;
//         }

//         return html;
//       },
//     },
//     legend: {
//       type: "scroll",
//       top: 0,
//       textStyle: { 
//         color: axisColor,
//         fontSize: 12,
//         fontWeight: 500,
//       },
//       itemGap: 20,
//       itemWidth: 20,
//       itemHeight: 14,
//     },
//     grid: {
//       left: 50,
//       right: 20,
//       top: compactHeight ? 48 : 56,
//       bottom: showZoom ? 85 : 70,
//       containLabel: true,
//     },
//     xAxis: {
//       type: "category",
//       data: keys,
//       axisLabel: {
//         color: axisColor,
//         interval: 0,
//         rotate: keys.length > 6 ? 30 : 0,
//         width: 140,
//         overflow: "truncate",
//         fontSize: 11,
//         fontWeight: 500,
//       },
//       axisTick: { show: false },
//       axisLine: { 
//         lineStyle: { 
//           color: gridLine,
//           width: 1.5,
//         } 
//       },
//     },
//     yAxis: {
//       type: "value",
//       name: "Emissions (tCO₂e)",
//       nameTextStyle: { 
//         color: axisColor,
//         fontSize: 12,
//         fontWeight: 600,
//         padding: [0, 0, 0, 0],
//       },
//       axisLabel: { 
//         color: axisColor,
//         fontSize: 11,
//         fontWeight: 500,
//       },
//       splitLine: { 
//         lineStyle: { 
//           color: gridLine,
//           type: "dashed" as const,
//           width: 1,
//         } 
//       },
//     },
//     dataZoom: showZoom
//       ? [
//           { 
//             type: "slider", 
//             height: 22, 
//             bottom: 40,
//             handleStyle: {
//               color: isDark ? "#64748b" : "#94a3b8",
//               borderColor: isDark ? "#475569" : "#cbd5e1",
//             },
//             dataBackground: {
//               lineStyle: {
//                 color: isDark ? "#475569" : "#cbd5e1",
//               },
//               areaStyle: {
//                 color: isDark ? "#334155" : "#e2e8f0",
//               }
//             },
//             selectedDataBackground: {
//               lineStyle: {
//                 color: isDark ? "#64748b" : "#94a3b8",
//               },
//               areaStyle: {
//                 color: isDark ? "#475569" : "#cbd5e1",
//               }
//             },
//             borderColor: isDark ? "#475569" : "#cbd5e1",
//             textStyle: {
//               color: axisColor,
//             }
//           },
//           { type: "inside" },
//         ]
//       : undefined,
//     series,
//   };
// }

// const GhgReportCharts = ({ tablesData, detailsData, isDark }: Props) => {
//   const compareYear = tablesData.filters.compareYear;
//   const selectedYear = tablesData.filters.year;

//   const compareLabel = formatPeriodLabel(tablesData.filters.yearType, compareYear, tablesData.ranges);
//   const selectedLabel = formatPeriodLabel(tablesData.filters.yearType, selectedYear, tablesData.ranges);

//   const textColor = isDark ? "#e2e8f0" : "#111827";
//   const axisColor = isDark ? "#94a3b8" : "#6b7280";

//   const scopeTwoDonutsOption = useMemo(() => {
//     const t = tablesData.tables.table1_emissionsByScope_twoYears;

//     const scopeVals = (year: number) => {
//       const get = (name: string) => num(t.find((r: any) => r.scope === name)?.values?.[String(year)]?.emissions);
//       return [
//         { name: "Scope 1", value: r2(get("Scope 1")) },
//         { name: "Scope 2", value: r2(get("Scope 2")) },
//         { name: "Scope 3", value: r2(get("Scope 3")) },
//       ];
//     };

//     return {
//       backgroundColor: "transparent",
//       tooltip: {
//         trigger: "item",
//         formatter: (p: any) => `${p.name}: ${p.value} tCO₂e (${p.percent}%)`,
//       },
//       legend: { bottom: 0, textStyle: { color: axisColor } },
//       title: [
//         { text: compareLabel, left: "25%", top: 6, textAlign: "center", textStyle: { color: textColor, fontSize: 12 } },
//         { text: selectedLabel, left: "75%", top: 6, textAlign: "center", textStyle: { color: textColor, fontSize: 12 } },
//       ],
//       series: [
//         {
//           type: "pie",
//           radius: ["45%", "70%"],
//           center: ["25%", "52%"],
//           label: { color: textColor },
//           data: scopeVals(compareYear),
//         },
//         {
//           type: "pie",
//           radius: ["45%", "70%"],
//           center: ["75%", "52%"],
//           label: { color: textColor },
//           data: scopeVals(selectedYear),
//         },
//       ],
//     };
//   }, [tablesData, compareYear, selectedYear, compareLabel, selectedLabel, textColor, axisColor]);

//   const categoryPieOption = useMemo(() => {
//     const selectedOverview = tablesData.tables.table_overviewByLocations_selectedYear.rows;

//     const byCategory = selectedOverview
//       .map((r: any) => ({ name: String(r.category || "Unknown"), value: r2(num(r.total)) }))
//       .sort((a, b) => b.value - a.value);

//     const TOP = 6;
//     const top = byCategory.slice(0, TOP);
//     const rest = byCategory.slice(TOP);
//     const otherSum = rest.reduce((acc, x) => acc + x.value, 0);
//     const finalData = otherSum > 0 ? [...top, { name: "Other", value: r2(otherSum) }] : top;

//     return {
//       backgroundColor: "transparent",
//       tooltip: { trigger: "item", formatter: (p: any) => `${p.name}: ${p.value} tCO₂e (${p.percent}%)` },
//       legend: { type: "scroll", bottom: 0, textStyle: { color: axisColor } },
//       series: [
//         {
//           name: "Selected Year Categories",
//           type: "pie",
//           radius: ["45%", "72%"],
//           center: ["50%", "48%"],
//           label: { color: textColor },
//           data: finalData,
//         },
//       ],
//     };
//   }, [tablesData, axisColor, textColor]);

//   const scope1Option = useMemo(() => {
//     const rows = detailsData.rows.filter((r: any) => r.scope === "Scope 1");
//     return buildGroupedBarOption({
//       rows,
//       scopeTitle: "Direct GHG Emissions — Scope 1 (Details)",
//       selectedLabel,
//       isDark,
//       groupKeyMode: "CATEGORY_FUEL",
//       compactHeight: true,
//     });
//   }, [detailsData, selectedLabel, isDark]);

//   const scope2Option = useMemo(() => {
//     const rows = detailsData.rows.filter((r: any) => r.scope === "Scope 2");
//     return buildGroupedBarOption({
//       rows,
//       scopeTitle: "Indirect GHG Emissions — Scope 2 (Details)",
//       selectedLabel,
//       isDark,
//       groupKeyMode: "CATEGORY_ONLY",
//       compactHeight: true,
//     });
//   }, [detailsData, selectedLabel, isDark]);

//   const scope3Option = useMemo(() => {
//     const rows = detailsData.rows.filter((r: any) => r.scope === "Scope 3");
//     return buildGroupedBarOption({
//       rows,
//       scopeTitle: "Indirect GHG Emissions — Scope 3 (Details)",
//       selectedLabel,
//       isDark,
//       groupKeyMode: "CATEGORY_FUEL",
//       compactHeight: true,
//     });
//   }, [detailsData, selectedLabel, isDark]);

//   return (
//     <div className="space-y-8">
//       <Card
//         isDark={isDark}
//         title={`Chart (Table 1): Emissions by Scope — ${compareLabel} vs ${selectedLabel}`}
//         subtitle="Source: Table 1 (Emissions by Scope)."
//       >
//         <ReactECharts option={scopeTwoDonutsOption} style={{ height: 340 }} />
//       </Card>

//       <Card
//         isDark={isDark}
//         title={`Chart (Overview Table): Total Emissions by Category — ${selectedLabel}`}
//         subtitle="Source: Overview by Locations (Selected Year)."
//       >
//         <ReactECharts option={categoryPieOption} style={{ height: 400 }} />
//       </Card>

//       <Card
//         isDark={isDark}
//         title={`Chart (Details Table): Direct GHG Emissions — Scope 1 — ${selectedLabel}`}
//         subtitle="Bars show emissions. Hover to see detailed breakdown including consumption values and units."
//       >
//         <ReactECharts option={scope1Option} style={{ height: 380 }} />
//       </Card>

//       <Card
//         isDark={isDark}
//         title={`Chart (Details Table): Indirect GHG Emissions — Scope 2 — ${selectedLabel}`}
//         subtitle="Bars show emissions. Hover to see detailed breakdown including consumption values and units."
//       >
//         <ReactECharts option={scope2Option} style={{ height: 360 }} />
//       </Card>

//       <Card
//         isDark={isDark}
//         title={`Chart (Details Table): Indirect GHG Emissions — Scope 3 — ${selectedLabel}`}
//         subtitle="Bars show emissions. Hover to see detailed breakdown including consumption values and units."
//       >
//         <ReactECharts option={scope3Option} style={{ height: 380 }} />
//       </Card>
//     </div>
//   );
// };

// export default GhgReportCharts;

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

type GroupKeyMode = "CATEGORY_FUEL" | "CATEGORY_ONLY";

function buildGroupedBarOption(args: {
  rows: any[];
  scopeTitle: string;
  selectedLabel: string;
  isDark?: boolean;
  groupKeyMode: GroupKeyMode;
  compactHeight?: boolean;
}) {
  const { rows, scopeTitle, selectedLabel, isDark, groupKeyMode, compactHeight } = args;
  const textColor = isDark ? "#e2e8f0" : "#111827";
  const axisColor = isDark ? "#94a3b8" : "#6b7280";
  const gridLine = isDark ? "rgba(148,163,184,0.25)" : "rgba(107,114,128,0.25)";

  const colorPalette = [
    "#3b82f6",
    "#10b981",
    "#8b5cf6",
    "#f59e0b",
    "#ec4899",
    "#14b8a6",
    "#f97316",
    "#6366f1",
    "#06b6d4",
    "#84cc16",
  ];

  const siteSet = new Set<string>();
  rows.forEach((r) => siteSet.add(String(r.siteName || "")));
  const sites = Array.from(siteSet).filter(Boolean).sort((a, b) => a.localeCompare(b));

  const keyOf = (r: any) => {
    const cat = String(r.categoryName || "");
    const fuel = String(r.fuelType || "");
    if (groupKeyMode === "CATEGORY_ONLY") return cat || "Unknown Category";
    const left = cat || "Unknown Category";
    const right = fuel && fuel !== "Unknown" ? fuel : "Unknown";
    return `${left} • ${right}`;
  };

  const keySet = new Set<string>();
  rows.forEach((r) => keySet.add(keyOf(r)));
  const keys = Array.from(keySet).filter(Boolean).sort((a, b) => a.localeCompare(b));

  const emissionsMatrix = new Map<string, Map<string, number>>();
  const consumptionMatrix = new Map<string, Map<string, { value: number; unit: string }>>();

  for (const k of keys) {
    emissionsMatrix.set(k, new Map());
    consumptionMatrix.set(k, new Map());
  }

  if (rows.length > 0) {
    console.warn("[GhgReportCharts] First detail row shape:", JSON.stringify(rows[0], null, 2));
  }

  for (const r of rows) {
    const k = keyOf(r);
    const s = String(r.siteName || "");
    const e = r2(num(r.selected?.emissions));
    const consumption = r2(num(r.selected?.consumption));
    const unit = String(
      r.selected?.consumptionUnit ||
        r.selected?.unit ||
        r.consumptionUnit ||
        r.unit ||
        r.selected?.activityUnit ||
        r.activityUnit ||
        ""
    );
    if (!k || !s) continue;
    if (!emissionsMatrix.has(k)) emissionsMatrix.set(k, new Map());
    if (!consumptionMatrix.has(k)) consumptionMatrix.set(k, new Map());
    emissionsMatrix.get(k)!.set(s, (emissionsMatrix.get(k)!.get(s) || 0) + e);
    const existing = consumptionMatrix.get(k)!.get(s);
    if (existing) {
      consumptionMatrix.get(k)!.set(s, { value: existing.value + consumption, unit: existing.unit || unit });
    } else {
      consumptionMatrix.get(k)!.set(s, { value: consumption, unit });
    }
  }

  const series = sites.map((site, index) => ({
    name: site,
    type: "bar" as const,
    barWidth: 16,
    barGap: "30%",
    itemStyle: {
      borderRadius: [4, 4, 0, 0],
      color: colorPalette[index % colorPalette.length],
      shadowColor: isDark ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.12)",
      shadowBlur: 6,
      shadowOffsetY: 3,
    },
    emphasis: {
      focus: "series" as const,
      itemStyle: {
        shadowBlur: 10,
        shadowOffsetY: 4,
        brightness: 1.15,
      },
    },
    label: {
      show: true,
      position: "top" as const,
      color: textColor,
      fontSize: 11,
      fontWeight: 600,
      distance: 5,
      formatter: (p: any) => (p.value > 0 ? `${p.value}` : ""),
    },
    data: keys.map((k) => r2(emissionsMatrix.get(k)?.get(site) || 0)),
  }));

  const showZoom = keys.length > 8;

  return {
    backgroundColor: "transparent",
    color: colorPalette,
    tooltip: {
      trigger: "axis",
      axisPointer: {
        type: "shadow",
        shadowStyle: { color: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" },
      },
      backgroundColor: isDark ? "rgba(15,23,42,0.96)" : "rgba(255,255,255,0.96)",
      borderColor: isDark ? "#475569" : "#e5e7eb",
      borderWidth: 1,
      padding: [12, 16],
      textStyle: { color: textColor, fontSize: 13 },
      formatter: (params: any) => {
        const dataIndex = params?.[0]?.dataIndex ?? 0;
        const exactKey = keys[dataIndex] ?? params?.[0]?.name ?? "";
        let html = `<div style="font-weight:700;margin-bottom:8px;font-size:13px">${exactKey}</div>`;
        html += `<table style="border-collapse:collapse;width:100%">`;
        html += `<tr style="font-size:11px;opacity:0.7"><th style="text-align:left;padding:2px 8px 4px 0">SITE</th><th style="text-align:right;padding:2px 8px">EMISSIONS</th><th style="text-align:right;padding:2px 0">CONSUMPTION</th></tr>`;
        for (const p of params || []) {
          if (!p.value || p.value === 0) continue;
          const consumption = consumptionMatrix.get(exactKey)?.get(p.seriesName);
          const hasConsumption = consumption && consumption.value > 0;
          html += `<tr>`;
          html += `<td style="padding:3px 8px 3px 0;font-size:12px"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${p.color};margin-right:6px"></span>${p.seriesName}</td>`;
          html += `<td style="text-align:right;padding:3px 8px;font-size:12px;font-weight:600">${p.value} tCO₂e</td>`;
          html += `<td style="text-align:right;padding:3px 0;font-size:12px">`;
          if (hasConsumption) {
            html += `${r2(consumption!.value)}`;
            if (consumption!.unit) html += ` <span style="font-size:10px;opacity:0.7">${consumption!.unit}</span>`;
          } else {
            html += `—`;
          }
          html += `</td></tr>`;
        }
        if (params && params.filter((p: any) => p.value > 0).length > 1) {
          const totalEmissions = params.reduce((sum: number, p: any) => sum + (p.value || 0), 0);
          let totalConsumption = 0;
          let totalUnit = "";
          params.forEach((p: any) => {
            const consumption = consumptionMatrix.get(exactKey)?.get(p.seriesName);
            if (consumption && consumption.value > 0) {
              totalConsumption += consumption.value;
              if (!totalUnit) totalUnit = consumption.unit;
            }
          });
          html += `<tr style="border-top:1px solid rgba(128,128,128,0.3);margin-top:4px"><td style="padding:4px 8px 0 0;font-size:11px;font-weight:700">TOTAL</td><td style="text-align:right;padding:4px 8px 0;font-size:12px;font-weight:700">${r2(totalEmissions)} tCO₂e</td>`;
          if (totalConsumption > 0) {
            html += `<td style="text-align:right;padding:4px 0 0;font-size:12px;font-weight:700">${r2(totalConsumption)}</td>`;
          } else {
            html += `<td></td>`;
          }
          html += `</tr>`;
        }
        html += `</table>`;
        return html;
      },
    },
    legend: {
      type: "scroll",
      top: 0,
      textStyle: { color: axisColor, fontSize: 12, fontWeight: 500 },
      itemGap: 20,
      itemWidth: 20,
      itemHeight: 14,
    },
    grid: {
      left: 50,
      right: 20,
      top: compactHeight ? 48 : 56,
      bottom: showZoom ? 85 : 70,
      containLabel: true,
    },
    xAxis: {
      type: "category",
      data: keys,
      axisLabel: {
        color: axisColor,
        interval: 0,
        rotate: keys.length > 6 ? 30 : 0,
        width: 140,
        overflow: "truncate",
        fontSize: 11,
        fontWeight: 500,
      },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: gridLine, width: 1.5 } },
    },
    yAxis: {
      type: "value",
      name: "Emissions (tCO₂e)",
      nameTextStyle: { color: axisColor, fontSize: 12, fontWeight: 600 },
      axisLabel: { color: axisColor, fontSize: 11, fontWeight: 500 },
      splitLine: { lineStyle: { color: gridLine, type: "dashed" as const, width: 1 } },
    },
    dataZoom: showZoom
      ? [
          {
            type: "slider",
            height: 22,
            bottom: 40,
            handleStyle: {
              color: isDark ? "#64748b" : "#94a3b8",
              borderColor: isDark ? "#475569" : "#cbd5e1",
            },
            dataBackground: {
              lineStyle: { color: isDark ? "#475569" : "#cbd5e1" },
              areaStyle: { color: isDark ? "#334155" : "#e2e8f0" },
            },
            selectedDataBackground: {
              lineStyle: { color: isDark ? "#64748b" : "#94a3b8" },
              areaStyle: { color: isDark ? "#475569" : "#cbd5e1" },
            },
            borderColor: isDark ? "#475569" : "#cbd5e1",
            textStyle: { color: axisColor },
          },
          { type: "inside" },
        ]
      : undefined,
    series,
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
    const rows = tablesData.tables.table_overviewByLocations_selectedYear.rows;

    const siteSet = new Set<string>();
    rows.forEach((r: any) => {
      Object.keys(r.sites || {}).forEach((s) => siteSet.add(s));
    });
    const sites = Array.from(siteSet).filter(Boolean).sort((a, b) => a.localeCompare(b));

    const categories = Array.from(
      new Set(rows.map((r: any) => String(r.category || "Unknown")))
    ).filter(Boolean);

    const categoryMatrix = new Map<string, Map<string, number>>();
    for (const cat of categories) categoryMatrix.set(cat, new Map());

    for (const r of rows) {
      const cat = String(r.category || "Unknown");
      if (!categoryMatrix.has(cat)) categoryMatrix.set(cat, new Map());
      for (const [site, val] of Object.entries(r.sites || {})) {
        const prev = categoryMatrix.get(cat)!.get(site) || 0;
        categoryMatrix.get(cat)!.set(site, prev + r2(num(val)));
      }
    }

    const colorPalette = [
      "#3b82f6",
      "#10b981",
      "#8b5cf6",
      "#f59e0b",
      "#ec4899",
      "#14b8a6",
      "#f97316",
      "#6366f1",
    ];

    const series = sites.map((site, i) => ({
      name: site,
      type: "bar" as const,
      barMaxWidth: 40,
      barGap: "20%",
      itemStyle: {
        borderRadius: [4, 4, 0, 0],
        color: colorPalette[i % colorPalette.length],
      },
      emphasis: { focus: "series" as const },
      label: {
        show: true,
        position: "top" as const,
        color: isDark ? "#e2e8f0" : "#111827",
        fontSize: 11,
        fontWeight: 600,
        formatter: (p: any) => (p.value > 0 ? `${p.value}` : ""),
      },
      data: categories.map((cat) => r2(categoryMatrix.get(cat)?.get(site) || 0)),
    }));

    const totalBySite = new Map<string, number>();
    sites.forEach((site) => {
      const t = categories.reduce((sum, cat) => sum + (categoryMatrix.get(cat)?.get(site) || 0), 0);
      totalBySite.set(site, r2(t));
    });

    return {
      backgroundColor: "transparent",
      color: colorPalette,
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: isDark ? "rgba(15,23,42,0.96)" : "rgba(255,255,255,0.96)",
        borderColor: isDark ? "#475569" : "#e5e7eb",
        borderWidth: 1,
        padding: [12, 16],
        textStyle: { color: isDark ? "#e2e8f0" : "#111827", fontSize: 13 },
        formatter: (params: any) => {
          const cat = params?.[0]?.name ?? "";
          let html = `<div style="font-weight:700;margin-bottom:8px;font-size:13px">${cat}</div>`;
          html += `<table style="border-collapse:collapse;min-width:220px">`;
          html += `<tr style="font-size:11px;opacity:0.65"><th style="text-align:left;padding:2px 12px 4px 0">SITE</th><th style="text-align:right;padding:2px 0 4px">EMISSIONS (tCO₂e)</th></tr>`;
          let total = 0;
          for (const p of params || []) {
            if (p.value === 0) continue;
            total += p.value;
            html += `<tr>
              <td style="padding:3px 12px 3px 0;font-size:12px">
                <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${p.color};margin-right:6px;vertical-align:middle"></span>${p.seriesName}
              </td>
              <td style="text-align:right;padding:3px 0;font-size:12px;font-weight:600">${p.value}</td>
            </tr>`;
          }
          if (params.filter((p: any) => p.value > 0).length > 1) {
            html += `<tr style="border-top:1px solid rgba(128,128,128,0.3)">
              <td style="padding:4px 12px 0 0;font-size:11px;font-weight:700">TOTAL</td>
              <td style="text-align:right;padding:4px 0 0;font-size:12px;font-weight:700">${r2(total)}</td>
            </tr>`;
          }
          html += `</table>`;
          return html;
        },
      },
      legend: {
        type: "scroll",
        bottom: 0,
        itemWidth: 16,
        itemHeight: 14,
        itemGap: 20,
        textStyle: { color: axisColor, fontSize: 12, fontWeight: 500 },
      },
      grid: { left: 20, right: 20, top: 16, bottom: 52, containLabel: true },
      xAxis: {
        type: "category",
        data: categories,
        axisLabel: {
          color: axisColor,
          fontSize: 11,
          fontWeight: 500,
          interval: 0,
          rotate: categories.length > 4 ? 20 : 0,
          overflow: "truncate",
          width: 160,
        },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: isDark ? "rgba(148,163,184,0.25)" : "rgba(107,114,128,0.25)", width: 1.5 } },
      },
      yAxis: {
        type: "value",
        name: "tCO₂e",
        nameTextStyle: { color: axisColor, fontSize: 12, fontWeight: 600 },
        axisLabel: { color: axisColor, fontSize: 11 },
        splitLine: {
          lineStyle: {
            color: isDark ? "rgba(148,163,184,0.25)" : "rgba(107,114,128,0.25)",
            type: "dashed" as const,
            width: 1,
          },
        },
      },
      series,
    };
  }, [tablesData, axisColor, isDark]);

  const scope1Option = useMemo(() => {
    const rows = detailsData.rows.filter((r: any) => r.scope === "Scope 1");
    return buildGroupedBarOption({
      rows,
      scopeTitle: "Direct GHG Emissions — Scope 1 (Details)",
      selectedLabel,
      isDark,
      groupKeyMode: "CATEGORY_FUEL",
      compactHeight: true,
    });
  }, [detailsData, selectedLabel, isDark]);

  const scope2Option = useMemo(() => {
    const rows = detailsData.rows.filter((r: any) => r.scope === "Scope 2");
    return buildGroupedBarOption({
      rows,
      scopeTitle: "Indirect GHG Emissions — Scope 2 (Details)",
      selectedLabel,
      isDark,
      groupKeyMode: "CATEGORY_ONLY",
      compactHeight: true,
    });
  }, [detailsData, selectedLabel, isDark]);

  const scope3Option = useMemo(() => {
    const rows = detailsData.rows.filter((r: any) => r.scope === "Scope 3");
    return buildGroupedBarOption({
      rows,
      scopeTitle: "Indirect GHG Emissions — Scope 3 (Details)",
      selectedLabel,
      isDark,
      groupKeyMode: "CATEGORY_FUEL",
      compactHeight: true,
    });
  }, [detailsData, selectedLabel, isDark]);

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
        title={`Emissions by Category — ${selectedLabel}`}
        subtitle="Overview by category for the selected year."
        isDark={isDark}
      >
        <ReactECharts option={categoryBarOption} style={{ height: 320 }} notMerge />
      </Card>

      <Card
        title={`Direct GHG Emissions — Scope 1 (Details)`}
        subtitle={`${selectedLabel} — by Category & Fuel Type`}
        isDark={isDark}
      >
        <ReactECharts option={scope1Option} style={{ height: 340 }} notMerge />
      </Card>

      <Card
        title={`Indirect GHG Emissions — Scope 2 (Details)`}
        subtitle={`${selectedLabel} — by Category`}
        isDark={isDark}
      >
        <ReactECharts option={scope2Option} style={{ height: 340 }} notMerge />
      </Card>

      <Card
        title={`Indirect GHG Emissions — Scope 3 (Details)`}
        subtitle={`${selectedLabel} — by Category & Fuel Type`}
        isDark={isDark}
      >
        <ReactECharts option={scope3Option} style={{ height: 340 }} notMerge />
      </Card>
    </div>
  );
};

export default GhgReportCharts;