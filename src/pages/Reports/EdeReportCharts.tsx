import React, { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import {
  SiteDonutRow,
  MonthlyBySiteRow,
  SavedBySiteRow,
  RenewableKwhBySiteRow,
  IntensityMonthlyRow,
} from "../../services/reportService";

type RefDiv = React.RefObject<HTMLDivElement | null>;

interface Props {
  siteDonut: SiteDonutRow[];
  monthlyBySite: MonthlyBySiteRow[];
  savedBySite: SavedBySiteRow[];
  renewableKwhBySite: RenewableKwhBySiteRow[];
  intensityMonthly: IntensityMonthlyRow[];
  isDark?: boolean;

  siteDonutRef: RefDiv;
  monthlyTrendRef: RefDiv;
  categoryPieRef: RefDiv;
  savedEmissionsRef: RefDiv;
  scope2Ref: RefDiv;
  intensityTrendRef: RefDiv;
}

const SITE_PALETTE = [
  "#4F6EDB",
  "#F59E0B",
  "#10B981",
  "#A855F7",
  "#EF4444",
  "#06B6D4",
  "#84CC16",
  "#FB7185",
  "#F97316",
  "#8B5CF6",
];

function siteColor(siteName: string) {
  let h = 0;
  for (let i = 0; i < siteName.length; i++) h = (h * 31 + siteName.charCodeAt(i)) >>> 0;
  return SITE_PALETTE[h % SITE_PALETTE.length];
}


const EdeReportCharts: React.FC<Props> = ({
  siteDonut,
  monthlyBySite,
  savedBySite,
  renewableKwhBySite,
  intensityMonthly,
  isDark = false,

  siteDonutRef,
  monthlyTrendRef,
  categoryPieRef,
  savedEmissionsRef,
  scope2Ref,
  intensityTrendRef,
}) => {
  const textColor = isDark ? "#e2e8f0" : "#333";
  const axisLineColor = isDark ? "#475569" : "#ccc";
  const splitLineColor = isDark ? "#334155" : "#eee";

  const percentageDonutOptions = useMemo(() => {
    const data = siteDonut.map((s) => ({ name: s.name, value: s.pct }));
    return {
      title: {
        text: "Percentage of Emission (S1 + S2 + S3) tCO2e",
        left: "center",
        textStyle: { color: textColor, fontSize: 14 },
      },
      tooltip: {
        trigger: "item",
        formatter: (p: any) => `${p.name}: <b>${Number(p.value).toFixed(2)}%</b>`,
      },
      legend: { bottom: 0, textStyle: { color: textColor } },
      series: [
        {
          type: "pie",
          radius: ["55%", "75%"],
          label: {
            color: textColor,
            formatter: (p: any) => `${Math.round(Number(p.value))}%`,
          },
          data,
        },
      ],
    };
  }, [siteDonut, textColor]);

  const totalDonutOptions = useMemo(() => {
    const data = siteDonut.map((s) => ({ name: s.name, value: s.value }));
    return {
      title: {
        text: "Emission (S1 + S2 + S3) tCO2e",
        left: "center",
        textStyle: { color: textColor, fontSize: 14 },
      },
      tooltip: {
        trigger: "item",
        formatter: (p: any) => `${p.name}: <b>${Number(p.value).toFixed(2)}</b> tCO2e`,
      },
      legend: { bottom: 0, textStyle: { color: textColor } },
      series: [
        {
          type: "pie",
          radius: ["55%", "75%"],
          label: {
            color: textColor,
            formatter: (p: any) => `${Number(p.value).toFixed(2)}`,
          },
          data,
        },
      ],
    };
  }, [siteDonut, textColor]);

  const renewableOptions = useMemo(() => {
    const x = renewableKwhBySite.map((r) => r.siteName);
    const y = renewableKwhBySite.map((r) => Number(r.kwh) || 0);
    const unit = renewableKwhBySite[0]?.unit || "kWh";

    console.log("unit", unit)
    return {
      title: {
        text: `Renewable Energy produced in ${unit} (Solar panel)`,
        left: "center",
        textStyle: { color: textColor, fontSize: 14 },
      },
      tooltip: { trigger: "axis" },
      grid: { left: "3%", right: "3%", bottom: "12%", containLabel: true },
      xAxis: {
        type: "category",
        data: x,
        axisLabel: { color: textColor },
        axisLine: { lineStyle: { color: axisLineColor } },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: textColor },
        axisLine: { lineStyle: { color: axisLineColor } },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
      series: [
        {
          type: "bar",
          data: y,
          barWidth: 45,
          barMaxWidth: 55,
          label: {
            show: true,
            position: "top",
            color: textColor,
            formatter: (p: any) => `${Number(p.value).toLocaleString()} ${unit}`,
          },
        },
      ],
    };
  }, [renewableKwhBySite, textColor, axisLineColor, splitLineColor]);

  const savedOptions = useMemo(() => {
    const x = savedBySite.map((r) => r.siteName);
    const y = savedBySite.map((r) => Number(r.saved) || 0);

    return {
      title: {
        text: "Emission saved in tCO2e",
        left: "center",
        textStyle: { color: textColor, fontSize: 14 },
      },
      tooltip: { trigger: "axis" },
      grid: { left: "3%", right: "3%", bottom: "12%", containLabel: true },
      xAxis: {
        type: "category",
        data: x,
        axisLabel: { color: textColor },
        axisLine: { lineStyle: { color: axisLineColor } },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: textColor },
        axisLine: { lineStyle: { color: axisLineColor } },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
      series: [
        {
          type: "bar",
          data: y,
          barWidth: 45,
          barMaxWidth: 55,
          label: {
            show: true,
            position: "top",
            color: textColor,
            formatter: (p: any) => `${Number(p.value).toFixed(2)} tCO2e`,
          },
        },
      ],
    };
  }, [savedBySite, textColor, axisLineColor, splitLineColor]);



const monthlyEmissionsOptions = useMemo(() => {
  const months = Array.from(new Set(monthlyBySite.map((r) => r.month))).sort();
  const sites = Array.from(new Set(monthlyBySite.map((r) => r.siteName))).sort();

  const xLabels = months.map((m) => {
    const [yy, mm] = m.split("-");
    const d = new Date(Number(yy), Number(mm) - 1, 1);
    return d.toLocaleDateString("en-US", { month: "short" }); 
  });

  const rowMap = new Map<string, number>();
  for (const r of monthlyBySite) {
    rowMap.set(`${r.siteName}||${r.month}`, Number(r.total) || 0);
  }

  const series = sites.map((siteName, sIdx) => {
const color = SITE_PALETTE[sIdx % SITE_PALETTE.length];

    return {
      name: siteName,
      type: "bar",
      data: months.map((m) => rowMap.get(`${siteName}||${m}`) ?? 0),

      barWidth: 14,
      barMaxWidth: 18,

      itemStyle: { color, opacity: 0.9 },
      emphasis: { focus: "series" },

      label: {
        show: true,
        position: "top",
        distance: 6,
        color: textColor,
        fontSize: 9,

        hideOverlap: true,

        offset: [0, (sIdx % 3) * 10],

        formatter: (p: any) => {
          const v = Number(p.value) || 0;
          return v > 0 ? v.toFixed(2) : "";
        },
      },
    };
  });

  return {
    title: {
      text: "Monthly Emissions (tCO2e)",
      left: "center",
      textStyle: { color: textColor, fontSize: 14 },
    },

    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: any[]) => {
        const monthLabel = params?.[0]?.axisValue ?? "";
        const lines: string[] = [`<b>${monthLabel}</b>`];

        params
          .slice()
          .sort((a, b) => String(a.seriesName).localeCompare(String(b.seriesName)))
          .forEach((p) => {
            const v = Number(p.value) || 0;
            lines.push(`${p.marker} ${p.seriesName}: <b>${v.toFixed(2)}</b> tCO2e`);
          });

        return lines.join("<br/>");
      },
    },

    legend: {
      bottom: 0,
      textStyle: { color: textColor },
      type: "scroll",
    },

    grid: { left: "3%", right: "3%", bottom: "15%", containLabel: true },

    xAxis: {
      type: "category",
      data: xLabels,
      axisLabel: { color: textColor },
      axisLine: { lineStyle: { color: axisLineColor } },
    },

    yAxis: {
      type: "value",
      axisLabel: { color: textColor },
      axisLine: { lineStyle: { color: axisLineColor } },
      splitLine: { lineStyle: { color: splitLineColor } },
    },

    labelLayout: {
      hideOverlap: true,
      moveOverlap: "shiftY", 
    },

    series,
  };
}, [monthlyBySite, textColor, axisLineColor, splitLineColor]);
const intensityOptions = useMemo(() => {
  const months = Array.from(new Set(intensityMonthly.map((r) => r.month))).sort();
  const sites = Array.from(new Set(intensityMonthly.map((r) => r.siteName))).sort();
  const unit = intensityMonthly[0]?.unit || "unit";

  const xLabels = months.map((m) => {
    const [yy, mm] = m.split("-");
    const d = new Date(Number(yy), Number(mm) - 1, 1);
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  });

  const rowMap = new Map<string, (typeof intensityMonthly)[number]>();
  for (const r of intensityMonthly) rowMap.set(`${r.siteName}||${r.month}`, r);

  const series: any[] = [];

  for (const siteName of sites) {
    const color = siteColor(siteName);

    const emissions = months.map((m) => {
      const row = rowMap.get(`${siteName}||${m}`);
      return row ? Number(row.emissions) || 0 : 0;
    });

    const intensity = months.map((m) => {
      const row = rowMap.get(`${siteName}||${m}`);
      return row ? Number(row.intensity) || 0 : null;
    });

    series.push({
      name: `${siteName} - Emissions`,
      type: "bar",
      data: emissions,
      yAxisIndex: 0,
      barWidth: 18,
      barMaxWidth: 26,
      itemStyle: { color, opacity: 0.9 },
      emphasis: { focus: "series" },
      label: {
        show: true,
        position: "top",
        color: textColor,
        formatter: (p: any) => (Number(p.value) ? `${Number(p.value).toFixed(2)}` : ""),
      },
    });

    series.push({
      name: `${siteName} - Intensity`,
      type: "line",
      data: intensity,
      yAxisIndex: 1,

      connectNulls: true,
      smooth: true,
      lineStyle: { width: 3, color },
      itemStyle: { color },

      symbol: "circle",
      symbolSize: 7,

      z: 5,
      zlevel: 2,

      emphasis: { focus: "series" },
    });
  }

  return {
    title: {
      text: "Monthly Emission Intensity Trend",
      left: "center",
      textStyle: { color: textColor, fontSize: 14 },
    },

    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: any[]) => {
        const monthLabel = params?.[0]?.axisValue ?? "";
        const bySite: Record<string, { emissions?: number; intensity?: number }> = {};

        for (const p of params) {
          const full = String(p.seriesName);
          const idx = full.lastIndexOf(" - ");
          const site = idx >= 0 ? full.slice(0, idx) : full;
          const metric = idx >= 0 ? full.slice(idx + 3) : "";

          if (!bySite[site]) bySite[site] = {};
          if (metric === "Emissions") bySite[site].emissions = Number(p.value) || 0;
          if (metric === "Intensity") bySite[site].intensity = Number(p.value) || 0;
        }

        const lines: string[] = [`<b>${monthLabel}</b>`];

        Object.keys(bySite)
          .sort()
          .forEach((site) => {
            const e = bySite[site].emissions ?? 0;
            const i = bySite[site].intensity ?? 0;
            lines.push(
              `<div style="margin-top:6px;"><b>${site}</b><br/>` +
                `Emissions: ${e.toFixed(2)} tCO2e<br/>` +
                `Intensity: ${i.toFixed(4)} tCO2e/${unit}</div>`
            );
          });

        return lines.join("");
      },
    },

    legend: {
      bottom: 0,
      textStyle: { color: textColor },
      type: "scroll",
    },

    grid: { left: "3%", right: "3%", bottom: "18%", containLabel: true },

    xAxis: {
      type: "category",
      data: xLabels,
      axisLabel: { color: textColor },
      axisLine: { lineStyle: { color: axisLineColor } },
    },

    yAxis: [
      {
        type: "value",
        name: "Emissions (tCO2e)",
        axisLabel: { color: textColor },
        axisLine: { lineStyle: { color: axisLineColor } },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
      {
        type: "value",
        name: `Intensity (tCO2e/${unit})`,
        axisLabel: { color: textColor },
        axisLine: { lineStyle: { color: axisLineColor } },
        splitLine: { show: false },
      },
    ],

    series,
  };
}, [intensityMonthly, textColor, axisLineColor, splitLineColor]);


  const chartWrapClass = isDark ? "bg-slate-800 rounded-lg p-3" : "bg-white rounded-lg p-3";

  return (
    <div className="space-y-6">
      <div ref={siteDonutRef} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={chartWrapClass}>
          <ReactECharts option={percentageDonutOptions} style={{ height: 320 }} opts={{ renderer: "svg" }} />
        </div>
        <div className={chartWrapClass}>
          <ReactECharts option={totalDonutOptions} style={{ height: 320 }} opts={{ renderer: "svg" }} />
        </div>
      </div>

      <div ref={categoryPieRef} className={chartWrapClass}>
        <ReactECharts option={renewableOptions} style={{ height: 320 }} opts={{ renderer: "svg" }} />
      </div>

      <div ref={monthlyTrendRef} className={chartWrapClass}>
        <ReactECharts option={monthlyEmissionsOptions} style={{ height: 360 }} opts={{ renderer: "svg" }} />
      </div>

      <div ref={savedEmissionsRef} className={chartWrapClass}>
        <ReactECharts option={savedOptions} style={{ height: 320 }} opts={{ renderer: "svg" }} />
      </div>

      <div ref={scope2Ref} className={chartWrapClass}>
        <ReactECharts
          option={savedOptions}
          style={{ height: 1, opacity: 0, pointerEvents: "none" }}
          opts={{ renderer: "svg" }}
        />
      </div>

      <div ref={intensityTrendRef} className={chartWrapClass}>
        <ReactECharts option={intensityOptions} style={{ height: 360 }} opts={{ renderer: "svg" }} />
      </div>
    </div>
  );
};

export default EdeReportCharts;
