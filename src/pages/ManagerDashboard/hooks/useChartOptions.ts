import { useMemo } from "react";
import { EmissionData } from "../../../services/emissionService";
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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EChartsOption = Record<string, any>;

interface ChartOptions {
  categoryChartOptions: EChartsOption;
  statusChartOptions: EChartsOption;
  siteComparisonOptions: EChartsOption;
  yearOverYearOptions: EChartsOption;
  monthlyTrendOptions: EChartsOption;
  hasCategoryData: boolean;
  hasMonthlyTrendData: boolean;
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
}: UseChartOptionsProps): ChartOptions {
  // Chart: Emissions by Category (Pie Chart) - Only approved emissions
  const categoryChartOptions = useMemo(() => {
    const categoryData: { [key: string]: number } = {};
    approvedEmissions.forEach((e) => {
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
        formatter: (params: { name: string; value: number; percent: number }) => {
          return `${params.name}<br/>Emissions: <b>${params.value.toFixed(2)}</b> tCO2e<br/>Share: <b>${params.percent.toFixed(1)}%</b>`;
        },
      },
      legend: {
        orient: "vertical",
        left: "left",
        top: "center",
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
            borderColor: "#fff",
            borderWidth: 2,
          },
          label: {
            show: true,
            position: "outside",
            formatter: (params: { name: string; value: number }) => {
              return `${params.value.toFixed(2)}`;
            },
            fontSize: 12,
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
          },
          data,
        },
      ],
    };
  }, [approvedEmissions]);

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
        formatter: "{b}: {c} ({d}%)",
      },
      legend: {
        orient: "horizontal",
        bottom: "0%",
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
                color: "#333",
              },
              b: {
                fontSize: 12,
                color: "#666",
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
  }, [filteredEmissions]);

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
        },
      },
      yAxis: {
        type: "value",
        name: "Emissions (tCO2e)",
        axisLabel: {
          formatter: "{value}",
        },
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
          },
        },
      ],
    };
  }, [availableSites, approvedSitesEmissions, comparisonYear]);

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
      },
      yAxis: {
        type: "value",
        name: "Emissions (tCO2e)",
        axisLabel: {
          formatter: "{value}",
        },
      },
      series,
    };
  }, [approvedSitesEmissions, yoySelectedSite, selectedComparisonYears]);

  // Chart: Monthly Emissions Trend (Bar Chart) - Only approved emissions (filtered by category/year)
  const monthlyTrendOptions = useMemo(() => {
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

    // Use approvedEmissions which is already filtered by category and year
    approvedEmissions.forEach((e) => {
      const month = e.date_of_reporting.substring(0, 7);
      if (monthlyData[month] !== undefined) {
        monthlyData[month] += Number(e.total_emission) || 0;
      }
    });

    const xAxisData = months.map((m) => {
      const [year, month] = m.split("-");
      const date = new Date(parseInt(year), parseInt(month) - 1);
      // Show only month name when a specific year is selected, otherwise include year
      return selectedYear
        ? date.toLocaleDateString("en-US", { month: "short" })
        : date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    });

    const seriesData = months.map((m) => parseFloat(Number(monthlyData[m]).toFixed(2)));

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "shadow",
        },
        formatter: (params: { name: string; value: number; marker: string }[]) => {
          const item = params[0];
          return `${item.name}${selectedYear ? ` ${selectedYear}` : ""}<br/>${item.marker} Emissions: <b>${item.value.toFixed(2)}</b> tCO2e`;
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
      },
      yAxis: {
        type: "value",
        name: "Emissions (tCO2e)",
        axisLabel: {
          formatter: "{value}",
        },
      },
      series: [
        {
          name: "Total Emissions",
          type: "bar",
          barWidth: "60%",
          data: seriesData,
          itemStyle: {
            color: "#3b82f6",
            borderRadius: [4, 4, 0, 0],
          },
        },
      ],
    };
  }, [approvedEmissions, selectedYear]);

  // Check if category chart has data
  const hasCategoryData = useMemo(() => {
    return (categoryChartOptions.series?.[0]?.data?.length || 0) > 0;
  }, [categoryChartOptions]);

  // Check if monthly trend chart has data
  const hasMonthlyTrendData = useMemo(() => {
    return filteredEmissions.length > 0;
  }, [filteredEmissions]);

  return {
    categoryChartOptions,
    statusChartOptions,
    siteComparisonOptions,
    yearOverYearOptions,
    monthlyTrendOptions,
    hasCategoryData,
    hasMonthlyTrendData,
  };
}
