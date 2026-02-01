import { useMemo } from "react";
import { EmissionData } from "../../../services/emissionService";
import { EmissionIntensityData } from "../../../services/productionDataService";
import { Site, KPIData, SiteEmissionsMap } from "../types";
import { getMonthLabels } from "../utils/dateUtils";

interface UseChartOptionsProps {
  filteredEmissions: EmissionData[];
  approvedEmissions: EmissionData[];
  emissions: EmissionData[];
  kpis: KPIData;
  availableSites: Site[];
  allSitesEmissions: SiteEmissionsMap;
  approvedSitesEmissions: SiteEmissionsMap;
  comparisonYear: number;
  selectedComparisonYears: number[];
  yoySelectedSite: number | null;
  selectedYear: number | null;
  isDark?: boolean;
  intensityData?: EmissionIntensityData | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EChartsOption = Record<string, any>;

interface ChartOptions {
  categoryChartOptions: EChartsOption;
  statusChartOptions: EChartsOption;
  siteComparisonOptions: EChartsOption;
  yearOverYearOptions: EChartsOption;
  monthlyTrendOptions: EChartsOption;
  savedEmissionsChartOptions: EChartsOption;
  scope2ChartOptions: EChartsOption;
  intensityTrendChartOptions: EChartsOption;
  hasCategoryData: boolean;
  hasMonthlyTrendData: boolean;
  hasSavedEmissionsData: boolean;
  hasScope2Data: boolean;
  hasIntensityData: boolean;
}

export function useChartOptions({
  filteredEmissions,
  approvedEmissions,
  availableSites,
  approvedSitesEmissions,
  comparisonYear,
  selectedComparisonYears,
  yoySelectedSite,
  selectedYear,
  isDark = false,
  intensityData,
}: UseChartOptionsProps): ChartOptions {
  // Dark theme colors
  const textColor = isDark ? "#e2e8f0" : "#333";
  const subTextColor = isDark ? "#94a3b8" : "#666";
  const axisLineColor = isDark ? "#475569" : "#ccc";
  const splitLineColor = isDark ? "#334155" : "#eee";
  const bgColor = isDark ? "#1e293b" : "#fff";
  // Chart: Emissions by Category (Pie Chart) - Only scoped emissions (excludes null scope like Renewable Electricity)
  const categoryChartOptions = useMemo(() => {
    const categoryData: { [key: string]: number } = {};
    approvedEmissions.forEach((e) => {
      // Exclude categories with null scope (like Renewable Electricity) from category chart
      const categoryScope = e.category?.scope;
      if (categoryScope === null || categoryScope === undefined) {
        return; // Skip null-scope categories
      }
      const catName = e.category?.category_name || "Unknown";
      const emissionValue = Number(e.total_emission) || 0;
      categoryData[catName] = (categoryData[catName] || 0) + emissionValue;
    });

    const data = Object.entries(categoryData).map(([name, value]) => ({
      name,
      value: parseFloat(Number(value).toFixed(2)),
    }));

    return {
      tooltip: {
        trigger: "item",
        backgroundColor: isDark ? "#334155" : "#fff",
        borderColor: isDark ? "#475569" : "#ccc",
        textStyle: { color: textColor },
        formatter: (params: { name: string; value: number; percent: number }) => {
          return `${params.name}<br/>Emissions: <b>${params.value.toFixed(2)}</b> tCO2e<br/>Share: <b>${params.percent.toFixed(1)}%</b>`;
        },
      },
      legend: {
        orient: "vertical",
        left: "left",
        top: "center",
        textStyle: { color: textColor },
      },
      series: [
        {
          name: "Emissions by Category",
          type: "pie",
          radius: ["40%", "70%"],
          center: ["60%", "50%"],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 10,
            borderColor: bgColor,
            borderWidth: 2,
          },
          label: {
            show: true,
            position: "outside",
            formatter: (params: { name: string; value: number }) => {
              return `${params.value.toFixed(2)}`;
            },
            fontSize: 12,
            color: textColor,
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 14,
              fontWeight: "bold",
            },
          },
          labelLine: {
            show: true,
            length: 10,
            length2: 10,
            lineStyle: { color: subTextColor },
          },
          data,
        },
      ],
    };
  }, [approvedEmissions, isDark, textColor, subTextColor, bgColor]);

  // Chart: Status Distribution (Donut Chart)
  const statusChartOptions = useMemo(() => {
    // Calculate status counts from filteredEmissions
    const pendingCount = filteredEmissions.filter((e) => e.status === "pending").length;
    const approvedCount = filteredEmissions.filter((e) => e.status === "approved").length;
    const rejectedCount = filteredEmissions.filter((e) => e.status === "rejected").length;

    const data = [
      { name: "Pending", value: pendingCount, itemStyle: { color: "#facc15" } },
      { name: "Approved", value: approvedCount, itemStyle: { color: "#22c55e" } },
      { name: "Rejected", value: rejectedCount, itemStyle: { color: "#ef4444" } },
    ].filter((d) => d.value > 0);

    return {
      tooltip: {
        trigger: "item",
        backgroundColor: isDark ? "#334155" : "#fff",
        borderColor: isDark ? "#475569" : "#ccc",
        textStyle: { color: textColor },
        formatter: "{b}: {c} ({d}%)",
      },
      legend: {
        orient: "horizontal",
        bottom: "0%",
        textStyle: { color: textColor },
      },
      series: [
        {
          name: "Status",
          type: "pie",
          radius: ["50%", "70%"],
          center: ["50%", "45%"],
          avoidLabelOverlap: false,
          label: {
            show: true,
            position: "center",
            formatter: `{a|${filteredEmissions.length}}\n{b|Total}`,
            rich: {
              a: {
                fontSize: 24,
                fontWeight: "bold",
                color: textColor,
              },
              b: {
                fontSize: 12,
                color: subTextColor,
                padding: [5, 0, 0, 0],
              },
            },
          },
          emphasis: {
            label: {
              show: true,
              fontSize: 14,
              fontWeight: "bold",
            },
          },
          data,
        },
      ],
    };
  }, [filteredEmissions, isDark, textColor, subTextColor]);

  // Chart: Site Comparison (Bar Chart) - Only approved emissions
  const siteComparisonOptions = useMemo(() => {
    const siteData: { name: string; value: number }[] = [];

    availableSites.forEach((site) => {
      const siteEmissions = approvedSitesEmissions[site.site_id] || [];
      const yearEmissions = siteEmissions.filter((e) => {
        const emissionYear = new Date(e.date_of_reporting).getFullYear();
        return emissionYear === comparisonYear;
      });
      const total = yearEmissions.reduce(
        (sum, e) => sum + (Number(e.total_emission) || 0),
        0
      );
      siteData.push({
        name: site.name,
        value: parseFloat(total.toFixed(2)),
      });
    });

    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: isDark ? "#334155" : "#fff",
        borderColor: isDark ? "#475569" : "#ccc",
        textStyle: { color: textColor },
        axisPointer: {
          type: "shadow",
        },
        formatter: (params: { name: string; value: number }[]) => {
          const item = params[0];
          return `${item.name}<br/>Emissions: <b>${item.value.toFixed(2)}</b> tCO2e`;
        },
      },
      grid: {
        left: "3%",
        right: "4%",
        bottom: "15%",
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: siteData.map((d) => d.name),
        axisTick: {
          alignWithLabel: true,
        },
        axisLabel: {
          rotate: 30,
          fontSize: 11,
          color: textColor,
        },
        axisLine: { lineStyle: { color: axisLineColor } },
      },
      yAxis: {
        type: "value",
        name: "Emissions (tCO2e)",
        nameTextStyle: { color: subTextColor },
        axisLabel: {
          formatter: "{value}",
          color: textColor,
        },
        axisLine: { lineStyle: { color: axisLineColor } },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
      series: [
        {
          name: "Total Emissions",
          type: "bar",
          barWidth: "50%",
          data: siteData.map((d) => d.value),
          itemStyle: {
            color: "#10b981",
            borderRadius: [4, 4, 0, 0],
          },
          label: {
            show: true,
            position: "top",
            formatter: (params: { value: number }) => params.value.toFixed(2),
            fontSize: 10,
            color: textColor,
          },
        },
      ],
    };
  }, [availableSites, approvedSitesEmissions, comparisonYear, isDark, textColor, subTextColor, axisLineColor, splitLineColor]);

  // Chart: Year-over-Year Monthly Comparison (Line Chart) - Only approved emissions
  const yearOverYearOptions = useMemo(() => {
    const months = getMonthLabels();
    const colors = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];

    const siteEmissions = yoySelectedSite ? approvedSitesEmissions[yoySelectedSite] || [] : [];

    const series = selectedComparisonYears.map((year, index) => {
      const monthlyData = new Array(12).fill(0);

      siteEmissions.forEach((e) => {
        const emissionDate = new Date(e.date_of_reporting);
        if (emissionDate.getFullYear() === year) {
          const monthIndex = emissionDate.getMonth();
          monthlyData[monthIndex] += Number(e.total_emission) || 0;
        }
      });

      return {
        name: String(year),
        type: "line",
        data: monthlyData.map((v) => parseFloat(v.toFixed(2))),
        smooth: true,
        itemStyle: {
          color: colors[index % colors.length],
        },
        lineStyle: {
          width: 2,
        },
        symbol: "circle",
        symbolSize: 6,
      };
    });

    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: isDark ? "#334155" : "#fff",
        borderColor: isDark ? "#475569" : "#ccc",
        textStyle: { color: textColor },
        formatter: (params: { seriesName: string; value: number; marker: string; axisValue: string }[]) => {
          let result = `${params[0]?.axisValue || ""}<br/>`;
          params.forEach((p) => {
            result += `${p.marker} ${p.seriesName}: <b>${p.value.toFixed(2)}</b> tCO2e<br/>`;
          });
          return result;
        },
      },
      legend: {
        data: selectedComparisonYears.map(String),
        bottom: 0,
        textStyle: { color: textColor },
      },
      grid: {
        left: "3%",
        right: "4%",
        bottom: "15%",
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: months,
        boundaryGap: false,
        axisLabel: { color: textColor },
        axisLine: { lineStyle: { color: axisLineColor } },
      },
      yAxis: {
        type: "value",
        name: "Emissions (tCO2e)",
        nameTextStyle: { color: subTextColor },
        axisLabel: {
          formatter: "{value}",
          color: textColor,
        },
        axisLine: { lineStyle: { color: axisLineColor } },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
      series,
    };
  }, [approvedSitesEmissions, yoySelectedSite, selectedComparisonYears, isDark, textColor, subTextColor, axisLineColor, splitLineColor]);

  // Chart: Monthly Emissions Trend (Bar Chart) - Shows NET emissions (gross - saved)
  const monthlyTrendOptions = useMemo(() => {
    const monthlyGross: { [key: string]: number } = {};
    const monthlySaved: { [key: string]: number } = {};

    const months: string[] = [];

    if (selectedYear) {
      // When a year is selected, show all 12 months of that year
      for (let i = 0; i < 12; i++) {
        const key = `${selectedYear}-${String(i + 1).padStart(2, "0")}`;
        months.push(key);
        monthlyGross[key] = 0;
        monthlySaved[key] = 0;
      }
    } else {
      // When no year is selected, show the last 6 months
      const today = new Date();
      for (let i = 5; i >= 0; i--) {
        const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        months.push(key);
        monthlyGross[key] = 0;
        monthlySaved[key] = 0;
      }
    }

    // Calculate gross (scoped) and saved (null scope) emissions per month
    approvedEmissions.forEach((e) => {
      const month = e.date_of_reporting.substring(0, 7);
      if (monthlyGross[month] !== undefined) {
        const emissionValue = Number(e.total_emission) || 0;
        const categoryScope = e.category?.scope;

        if (categoryScope === null || categoryScope === undefined) {
          // Null scope = saved emissions (to be discounted)
          monthlySaved[month] += emissionValue;
        } else {
          // Scoped emissions (Scope 1, 2, 3)
          monthlyGross[month] += emissionValue;
        }
      }
    });

    const xAxisData = months.map((m) => {
      const [year, month] = m.split("-");
      const date = new Date(parseInt(year), parseInt(month) - 1);
      return selectedYear
        ? date.toLocaleDateString("en-US", { month: "short" })
        : date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    });

    // Net emissions = Gross - Saved
    const netData = months.map((m) => parseFloat((monthlyGross[m] - monthlySaved[m]).toFixed(2)));

    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: isDark ? "#334155" : "#fff",
        borderColor: isDark ? "#475569" : "#ccc",
        textStyle: { color: textColor },
        axisPointer: {
          type: "shadow",
        },
        formatter: (params: { name: string; value: number; marker: string }[]) => {
          const item = params[0];
          const monthKey = months[xAxisData.indexOf(item.name)];
          const gross = monthlyGross[monthKey] || 0;
          const saved = monthlySaved[monthKey] || 0;
          return `${item.name}${selectedYear ? ` ${selectedYear}` : ""}<br/>` +
            `${item.marker} Net Emissions: <b>${item.value.toFixed(2)}</b> tCO2e<br/>` +
            `<span style="color:#6b7280">Gross: ${gross.toFixed(2)} | Saved: ${saved.toFixed(2)}</span>`;
        },
      },
      grid: {
        left: "3%",
        right: "4%",
        bottom: "3%",
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: xAxisData,
        axisTick: {
          alignWithLabel: true,
        },
        axisLabel: { color: textColor },
        axisLine: { lineStyle: { color: axisLineColor } },
      },
      yAxis: {
        type: "value",
        name: "Net Emissions (tCO2e)",
        nameTextStyle: { color: subTextColor },
        axisLabel: {
          formatter: "{value}",
          color: textColor,
        },
        axisLine: { lineStyle: { color: axisLineColor } },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
      series: [
        {
          name: "Net Emissions",
          type: "bar",
          barWidth: "60%",
          data: netData,
          itemStyle: {
            color: "#3b82f6",
            borderRadius: [4, 4, 0, 0],
          },
        },
      ],
    };
  }, [approvedEmissions, selectedYear, isDark, textColor, subTextColor, axisLineColor, splitLineColor]);

  // Check if category chart has data
  const hasCategoryData = useMemo(() => {
    return (categoryChartOptions.series?.[0]?.data?.length || 0) > 0;
  }, [categoryChartOptions]);

  // Check if monthly trend chart has data
  const hasMonthlyTrendData = useMemo(() => {
    return filteredEmissions.length > 0;
  }, [filteredEmissions]);

  // Chart: Emissions Saved (Bar Chart) - For categories with null scope (e.g., Renewable Electricity)
  const savedEmissionsChartOptions = useMemo(() => {
    // Filter approved emissions for categories with null scope
    const savedEmissions = approvedEmissions.filter((e) => {
      const categoryScope = e.category?.scope;
      return categoryScope === null || categoryScope === undefined;
    });

    const monthlyData: { [key: string]: number } = {};
    const months: string[] = [];

    if (selectedYear) {
      // When a year is selected, show all 12 months of that year
      for (let i = 0; i < 12; i++) {
        const key = `${selectedYear}-${String(i + 1).padStart(2, "0")}`;
        months.push(key);
        monthlyData[key] = 0;
      }
    } else {
      // When no year is selected, show the last 6 months
      const today = new Date();
      for (let i = 5; i >= 0; i--) {
        const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        months.push(key);
        monthlyData[key] = 0;
      }
    }

    savedEmissions.forEach((e) => {
      const month = e.date_of_reporting.substring(0, 7);
      if (monthlyData[month] !== undefined) {
        monthlyData[month] += Number(e.total_emission) || 0;
      }
    });

    const xAxisData = months.map((m) => {
      const [year, month] = m.split("-");
      const date = new Date(parseInt(year), parseInt(month) - 1);
      return selectedYear
        ? date.toLocaleDateString("en-US", { month: "short" })
        : date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    });

    const seriesData = months.map((m) => parseFloat(Number(monthlyData[m]).toFixed(2)));

    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: isDark ? "#334155" : "#fff",
        borderColor: isDark ? "#475569" : "#ccc",
        textStyle: { color: textColor },
        axisPointer: {
          type: "shadow",
        },
        formatter: (params: { name: string; value: number; marker: string }[]) => {
          const item = params[0];
          return `${item.name}${selectedYear ? ` ${selectedYear}` : ""}<br/>${item.marker} Saved: <b>${item.value.toFixed(2)}</b> tCO2e`;
        },
      },
      grid: {
        left: "3%",
        right: "4%",
        bottom: "3%",
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: xAxisData,
        axisTick: {
          alignWithLabel: true,
        },
        axisLabel: { color: textColor },
        axisLine: { lineStyle: { color: axisLineColor } },
      },
      yAxis: {
        type: "value",
        name: "Saved (tCO2e)",
        nameTextStyle: { color: subTextColor },
        axisLabel: {
          formatter: "{value}",
          color: textColor,
        },
        axisLine: { lineStyle: { color: axisLineColor } },
        splitLine: { lineStyle: { color: splitLineColor } },
      },
      series: [
        {
          name: "Emissions Saved",
          type: "bar",
          barWidth: "60%",
          data: seriesData,
          itemStyle: {
            color: "#10b981", // Green color to indicate positive/saved
            borderRadius: [4, 4, 0, 0],
          },
        },
      ],
    };
  }, [approvedEmissions, selectedYear, isDark, textColor, subTextColor, axisLineColor, splitLineColor]);

  // Check if saved emissions chart has data
  const hasSavedEmissionsData = useMemo(() => {
    return approvedEmissions.some((e) => {
      const categoryScope = e.category?.scope;
      return categoryScope === null || categoryScope === undefined;
    });
  }, [approvedEmissions]);

  // Chart: Scope 2 (Purchased Electricity) Monthly Trend with Activity Data
  const scope2ChartOptions = useMemo(() => {
    // Filter approved emissions for Scope 2 only
    const scope2Emissions = approvedEmissions.filter((e) => {
      const categoryScope = e.category?.scope;
      return categoryScope === "Scope 2";
    });

    const monthlyEmissions: { [key: string]: number } = {};
    const monthlyActivity: { [key: string]: number } = {};
    const months: string[] = [];
    let activityUnit = "kWh"; // Default unit

    if (selectedYear) {
      for (let i = 0; i < 12; i++) {
        const key = `${selectedYear}-${String(i + 1).padStart(2, "0")}`;
        months.push(key);
        monthlyEmissions[key] = 0;
        monthlyActivity[key] = 0;
      }
    } else {
      const today = new Date();
      for (let i = 5; i >= 0; i--) {
        const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        months.push(key);
        monthlyEmissions[key] = 0;
        monthlyActivity[key] = 0;
      }
    }

    scope2Emissions.forEach((e) => {
      const month = e.date_of_reporting.substring(0, 7);
      if (monthlyEmissions[month] !== undefined) {
        monthlyEmissions[month] += Number(e.total_emission) || 0;

        // Extract activity data value from known keys
        if (e.activity_data) {
          const data = e.activity_data as Record<string, unknown>;
          // Look for activity value in specific keys (in order of priority)
          const activityKeys = ["activity_value", "activity", "Activity Data", "value", "quantity"];
          let activityValue: number | null = null;

          for (const key of activityKeys) {
            if (data[key] !== undefined && data[key] !== null) {
              const val = Number(data[key]);
              if (!isNaN(val) && val > 0) {
                activityValue = val;
                break;
              }
            }
          }

          if (activityValue) {
            monthlyActivity[month] += activityValue;
          }
        }

        // Get activity unit if available
        if (e.activity_data_unit) {
          activityUnit = e.activity_data_unit;
        }
      }
    });

    const xAxisData = months.map((m) => {
      const [year, month] = m.split("-");
      const date = new Date(parseInt(year), parseInt(month) - 1);
      return selectedYear
        ? date.toLocaleDateString("en-US", { month: "short" })
        : date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    });

    const emissionsData = months.map((m) => parseFloat(Number(monthlyEmissions[m]).toFixed(2)));
    const activityData = months.map((m) => parseFloat(Number(monthlyActivity[m]).toFixed(2)));

    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: isDark ? "#334155" : "#fff",
        borderColor: isDark ? "#475569" : "#ccc",
        textStyle: { color: textColor },
        axisPointer: {
          type: "cross",
        },
        formatter: (params: { seriesName: string; name: string; value: number; marker: string; axisValue: string }[]) => {
          let result = `${params[0]?.axisValue || ""}${selectedYear ? ` ${selectedYear}` : ""}<br/>`;
          params.forEach((p) => {
            if (p.seriesName === "Emissions") {
              result += `${p.marker} ${p.seriesName}: <b>${p.value.toFixed(2)}</b> tCO2e<br/>`;
            } else {
              result += `${p.marker} ${p.seriesName}: <b>${p.value.toLocaleString()}</b> ${activityUnit}<br/>`;
            }
          });
          return result;
        },
      },
      legend: {
        data: ["Emissions", "Consumption"],
        bottom: 0,
        textStyle: { color: textColor },
      },
      grid: {
        left: "3%",
        right: "4%",
        bottom: "12%",
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: xAxisData,
        axisTick: {
          alignWithLabel: true,
        },
        axisLabel: { color: textColor },
        axisLine: { lineStyle: { color: axisLineColor } },
      },
      yAxis: [
        {
          type: "value",
          name: "Emissions (tCO2e)",
          position: "left",
          nameTextStyle: { color: subTextColor },
          axisLabel: {
            formatter: "{value}",
            color: textColor,
          },
          axisLine: { lineStyle: { color: "#22c55e" } },
          splitLine: { lineStyle: { color: splitLineColor } },
        },
        {
          type: "value",
          name: `Consumption (${activityUnit})`,
          position: "right",
          nameTextStyle: { color: subTextColor },
          axisLabel: {
            formatter: "{value}",
            color: textColor,
          },
          axisLine: { lineStyle: { color: "#3b82f6" } },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: "Emissions",
          type: "bar",
          yAxisIndex: 0,
          barWidth: "40%",
          data: emissionsData,
          itemStyle: {
            color: "#22c55e",
            borderRadius: [4, 4, 0, 0],
          },
        },
        {
          name: "Consumption",
          type: "line",
          yAxisIndex: 1,
          data: activityData,
          smooth: true,
          symbol: "circle",
          symbolSize: 8,
          itemStyle: {
            color: "#3b82f6",
          },
          lineStyle: {
            width: 2,
          },
        },
      ],
    };
  }, [approvedEmissions, selectedYear, isDark, textColor, subTextColor, axisLineColor, splitLineColor]);

  // Check if Scope 2 chart has data
  const hasScope2Data = useMemo(() => {
    return approvedEmissions.some((e) => e.category?.scope === "Scope 2");
  }, [approvedEmissions]);

  // Chart: Monthly Emission Intensity Trend (Line Chart with dual axis)
  const intensityTrendChartOptions = useMemo(() => {
    const monthlyData = intensityData?.monthlyData || [];

    // Sort by month
    const sortedData = [...monthlyData].sort((a, b) => a.month.localeCompare(b.month));

    const xAxisData = sortedData.map((d) => {
      const date = new Date(d.month);
      return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    });

    const intensityValues = sortedData.map((d) => parseFloat(d.intensity.toFixed(4)));
    const emissionsValues = sortedData.map((d) => parseFloat(d.emissions.toFixed(2)));
    const productionValues = sortedData.map((d) => parseFloat(d.production.toFixed(2)));

    // Get unit from intensityData
    const unit = intensityData?.productionByUnit?.[0]?.unit || "unit";

    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: isDark ? "#334155" : "#fff",
        borderColor: isDark ? "#475569" : "#ccc",
        textStyle: { color: textColor },
        axisPointer: {
          type: "cross",
        },
        formatter: (params: { seriesName: string; name: string; value: number; marker: string }[]) => {
          let result = `${params[0]?.name || ""}<br/>`;
          params.forEach((p) => {
            if (p.seriesName === "Intensity") {
              result += `${p.marker} ${p.seriesName}: <b>${p.value.toFixed(4)}</b> tCO2e/${unit}<br/>`;
            } else if (p.seriesName === "Emissions") {
              result += `${p.marker} ${p.seriesName}: <b>${p.value.toFixed(2)}</b> tCO2e<br/>`;
            } else if (p.seriesName === "Production") {
              result += `${p.marker} ${p.seriesName}: <b>${p.value.toLocaleString()}</b> ${unit}<br/>`;
            }
          });
          return result;
        },
      },
      legend: {
        data: ["Intensity", "Emissions", "Production"],
        bottom: 0,
        textStyle: { color: textColor },
      },
      grid: {
        left: "3%",
        right: "4%",
        bottom: "15%",
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: xAxisData,
        boundaryGap: false,
        axisLabel: { color: textColor },
        axisLine: { lineStyle: { color: axisLineColor } },
      },
      yAxis: [
        {
          type: "value",
          name: `Intensity (tCO2e/${unit})`,
          position: "left",
          nameTextStyle: { color: subTextColor },
          axisLabel: {
            formatter: (value: number) => value.toFixed(4),
            color: textColor,
          },
          axisLine: { lineStyle: { color: "#8b5cf6" } },
          splitLine: { lineStyle: { color: splitLineColor } },
        },
        {
          type: "value",
          name: "Emissions / Production",
          position: "right",
          nameTextStyle: { color: subTextColor },
          axisLabel: {
            formatter: "{value}",
            color: textColor,
          },
          axisLine: { lineStyle: { color: "#3b82f6" } },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: "Intensity",
          type: "line",
          yAxisIndex: 0,
          data: intensityValues,
          smooth: true,
          symbol: "circle",
          symbolSize: 8,
          itemStyle: {
            color: "#8b5cf6",
          },
          lineStyle: {
            width: 3,
          },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: isDark ? "rgba(139, 92, 246, 0.3)" : "rgba(139, 92, 246, 0.2)" },
                { offset: 1, color: "rgba(139, 92, 246, 0)" },
              ],
            },
          },
        },
        {
          name: "Emissions",
          type: "bar",
          yAxisIndex: 1,
          data: emissionsValues,
          barWidth: "30%",
          itemStyle: {
            color: isDark ? "rgba(59, 130, 246, 0.7)" : "rgba(59, 130, 246, 0.6)",
            borderRadius: [4, 4, 0, 0],
          },
        },
        {
          name: "Production",
          type: "line",
          yAxisIndex: 1,
          data: productionValues,
          smooth: true,
          symbol: "diamond",
          symbolSize: 6,
          itemStyle: {
            color: "#10b981",
          },
          lineStyle: {
            width: 2,
            type: "dashed",
          },
        },
      ],
    };
  }, [intensityData, isDark, textColor, subTextColor, axisLineColor, splitLineColor]);

  // Check if intensity data has monthly data
  const hasIntensityData = useMemo(() => {
    return (intensityData?.monthlyData?.length || 0) > 0;
  }, [intensityData]);

  return {
    categoryChartOptions,
    statusChartOptions,
    siteComparisonOptions,
    yearOverYearOptions,
    monthlyTrendOptions,
    savedEmissionsChartOptions,
    scope2ChartOptions,
    intensityTrendChartOptions,
    hasCategoryData,
    hasMonthlyTrendData,
    hasSavedEmissionsData,
    hasScope2Data,
    hasIntensityData,
  };
}
