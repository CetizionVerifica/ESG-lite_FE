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

    const series = sites.map((siteName) => {
      const values = months.map((m) => {
        const row = monthlyBySite.find((r) => r.month === m && r.siteName === siteName);
        return row ? Number(row.total) || 0 : 0;
      });

      return {
        name: siteName,
        type: "bar",
        data: values,
        barWidth: 18,
        barMaxWidth: 26,
        label: {
          show: true,
          position: "top",
          color: textColor,
          formatter: (p: any) => `${Number(p.value).toFixed(2)}`,
        },
      };
    });

    const xLabels = months.map((m) => {
      const [yy, mm] = m.split("-");
      const d = new Date(Number(yy), Number(mm) - 1, 1);
      return d.toLocaleDateString("en-US", { month: "long" });
    });

    return {
      title: { text: "Monthly Emissions (tCO2e)", left: "center", textStyle: { color: textColor, fontSize: 14 } },
      tooltip: { trigger: "axis" },
      legend: { bottom: 0, textStyle: { color: textColor } },
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
      series,
    };
  }, [monthlyBySite, textColor, axisLineColor, splitLineColor]);

  const intensityOptions = useMemo(() => {
    const rows = [...intensityMonthly].sort((a, b) => a.month.localeCompare(b.month));

    const x = rows.map((r) => {
      const [yy, mm] = r.month.split("-");
      const d = new Date(Number(yy), Number(mm) - 1, 1);
      return d.toLocaleDateString("en-US", { month: "short" });
    });

    const emissions = rows.map((r) => Number(r.emissions) || 0);
    const intensity = rows.map((r) => Number(r.intensity) || 0);
    const unit = rows[0]?.unit || "unit";

    return {
      title: { text: "Monthly Emission Intensity Trend", left: "center", textStyle: { color: textColor, fontSize: 14 } },
      tooltip: { trigger: "axis" },
      legend: { bottom: 0, textStyle: { color: textColor } },
      grid: { left: "3%", right: "3%", bottom: "15%", containLabel: true },
      xAxis: {
        type: "category",
        data: x,
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
      series: [
        {
          name: "Emissions",
          type: "bar",
          data: emissions,
          yAxisIndex: 0,
          barWidth: 26,
          barMaxWidth: 34,
          label: {
            show: true,
            position: "top",
            color: textColor,
            formatter: (p: any) => `${Number(p.value).toFixed(2)} tCO2e`,
          },
        },
        { name: "Intensity", type: "line", data: intensity, yAxisIndex: 1, smooth: true },
      ],
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
