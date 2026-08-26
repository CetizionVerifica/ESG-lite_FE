import { useState, useEffect, useMemo } from "react";
import ReactECharts from "echarts-for-react";
import Dropdown, { DropdownOption } from "../../components/Dropdown";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";

import { Site, Category } from "./types";
import { generateYearOptions } from "./utils/dateUtils";
import { useEmissionsData } from "./hooks/useEmissionsData";
import { useChartOptions } from "./hooks/useChartOptions";
import { useEmissionIntensity } from "./hooks/useEmissionIntensity";
import PendingEmissionsList from "./components/PendingEmissionsList";
import EmissionIntensityCard from "./components/EmissionIntensityCard";
import SubmissionStatusWidget from "../../components/SubmissionStatusWidget";


const ManagerDashboard = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();

  // Get available sites from user
  const sites: Site[] = user?.sites || [];
  const singleSite: Site | null = user?.site || null;
  const availableSites = useMemo(() =>
    sites.length > 0 ? sites : singleSite ? [singleSite] : [],
    [sites, singleSite]
  );

  // Filter state
  const [selectedSites, setSelectedSites] = useState<number[]>(
    availableSites.length > 0 ? [availableSites[0].site_id] : []
  );
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  // Site comparison state
  const [comparisonYear, setComparisonYear] = useState<number>(new Date().getFullYear());

  // Year-over-year comparison state
  const [selectedComparisonYears, setSelectedComparisonYears] = useState<number[]>([
    new Date().getFullYear(),
    new Date().getFullYear() - 1,
  ]);
  const [yoySelectedSite, setYoySelectedSite] = useState<number | null>(
    availableSites.length > 0 ? availableSites[0].site_id : null
  );

  // Use custom hooks
  const {
    emissions,
    filteredEmissions,
    approvedEmissions,
    allSitesEmissions,
    approvedSitesEmissions,
    loading,
    kpis,
    pendingEmissions,
  } = useEmissionsData({
    selectedSites,
    selectedCategory,
    selectedYear,
    availableSites,
  });

  // Emission intensity data (must be before useChartOptions)
  const {
    intensityData,
    loading: intensityLoading,
  } = useEmissionIntensity({
    selectedSites,
    availableSites,
    selectedYear,
  });

  const {
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
    yearlyEmissionsTotal,
  } = useChartOptions({
    filteredEmissions,
    approvedEmissions,
    emissions,
    kpis,
    availableSites,
    allSitesEmissions,
    approvedSitesEmissions,
    comparisonYear,
    selectedComparisonYears,
    yoySelectedSite,
    selectedYear,
    isDark,
    intensityData,
  });

  // Get categories from all selected sites (union, deduplicated)
  const categories = useMemo(() => {
    const categoryMap = new Map<number, Category>();
    selectedSites.forEach((siteId) => {
      const site = availableSites.find((s) => s.site_id === siteId);
      site?.categories?.forEach((cat) => {
        if (!categoryMap.has(cat.category_id)) {
          categoryMap.set(cat.category_id, cat);
        }
      });
    });
    return Array.from(categoryMap.values());
  }, [selectedSites, availableSites]);

  // Generate dropdown options
  const siteOptions: DropdownOption[] = availableSites.map((site) => ({
    id: site.site_id,
    label: site.name,
  }));

  const categoryOptions: DropdownOption[] = categories.map((category) => ({
    id: category.category_id,
    label: category.category_name,
  }));

  const yearOptions = generateYearOptions();

  // Reset category when selected sites change if current category is not available
  useEffect(() => {
    if (selectedCategory) {
      const categoryAvailable = categories.some(
        (c) => c.category_id === selectedCategory
      );
      if (!categoryAvailable) {
        setSelectedCategory(null);
      }
    }
  }, [selectedSites, categories, selectedCategory]);

  // Theme classes
  const containerClass = isDark
    ? "p-6 bg-slate-900 min-h-screen text-slate-100"
    : "p-6 bg-gray-50 min-h-screen text-gray-900";

  const cardClass = isDark
    ? "bg-slate-800 rounded-lg shadow-lg shadow-slate-900/50 p-5 border border-slate-700"
    : "bg-white rounded-lg shadow p-5";

  const labelClass = isDark
    ? "block text-sm font-medium mb-1 text-slate-300"
    : "block text-sm font-medium mb-1 text-gray-700";

  const chartTitleClass = isDark
    ? "text-lg font-semibold mb-4 text-slate-100"
    : "text-lg font-semibold mb-4 text-gray-900";

  const emptyStateClass = isDark
    ? "flex items-center justify-center h-75 text-slate-500"
    : "flex items-center justify-center h-75 text-gray-500";

  const kpiLabelClass = isDark
    ? "text-sm font-medium text-slate-400"
    : "text-sm font-medium text-gray-500";

  const kpiValueClass = isDark
    ? "text-2xl font-bold text-slate-100 mt-1"
    : "text-2xl font-bold text-gray-900 mt-1";

  const kpiUnitClass = isDark
    ? "text-xs text-slate-500"
    : "text-xs text-gray-400";

  return (
    <div className={containerClass}>
      <h1 className="text-2xl font-bold mb-6">Manager Dashboard</h1>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className={labelClass}>Site</label>
          <Dropdown
            options={siteOptions}
            placeholder="Select Sites"
            multiple={true}
            multipleValue={selectedSites}
            onMultipleChange={(options) =>
              setSelectedSites(options.map((o) => o.id as number))
            }
            searchable={true}
            clearable={true}
          />
        </div>
        <div>
          <label className={labelClass}>Category</label>
          <Dropdown
            options={categoryOptions}
            placeholder="All Categories"
            value={selectedCategory}
            onChange={(option) => setSelectedCategory(option?.id as number)}
            searchable={true}
          />
        </div>
        <div>
          <label className={labelClass}>Year</label>
          <Dropdown
            options={yearOptions}
            placeholder="All Years"
            value={selectedYear}
            onChange={(option) => setSelectedYear(option?.id as number)}
            searchable={true}
          />
        </div>
      </div>

      {selectedSites.length === 0 ? (
        <div className={`${cardClass} text-center py-12`}>
          <p className={isDark ? "text-slate-400" : "text-gray-500"}>
            Please select at least one site to view data
          </p>
        </div>
      ) : loading ? (
        <div className="flex justify-center items-center py-12">
          <div className={`animate-spin rounded-full h-8 w-8 border-b-2 ${isDark ? "border-blue-400" : "border-blue-600"}`}></div>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4 mb-6">
            <div className={cardClass}>
              <div className={kpiLabelClass}>Net Emissions</div>
              <div className={kpiValueClass}>{kpis.netEmissions.toFixed(2)}</div>
              <div className={kpiUnitClass}>tCO2e (after discount)</div>
            </div>
            <div className={cardClass}>
              <div className={kpiLabelClass}>Gross Emissions</div>
              <div className={`${kpiValueClass} ${isDark ? "text-slate-400" : "text-gray-600"}`}>
                {kpis.grossEmissions.toFixed(2)}
              </div>
              <div className={kpiUnitClass}>tCO2e</div>
            </div>
            <EmissionIntensityCard data={intensityData} loading={intensityLoading} isDark={isDark} />
            <div className={cardClass}>
              <div className={kpiLabelClass}>Scope 1</div>
              <div className={`${kpiValueClass} ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                {kpis.scope1Emissions.toFixed(2)}
              </div>
              <div className={kpiUnitClass}>tCO2e</div>
            </div>
            <div className={cardClass}>
              <div className={kpiLabelClass}>Scope 2</div>
              <div className={`${kpiValueClass} ${isDark ? "text-green-400" : "text-green-600"}`}>
                {kpis.scope2Emissions.toFixed(2)}
              </div>
              <div className={kpiUnitClass}>tCO2e</div>
            </div>
            <div className={cardClass}>
              <div className={kpiLabelClass}>Scope 3</div>
              <div className={`${kpiValueClass} ${isDark ? "text-purple-400" : "text-purple-600"}`}>
                {kpis.scope3Emissions.toFixed(2)}
              </div>
              <div className={kpiUnitClass}>tCO2e</div>
            </div>
            <div className={cardClass}>
              <div className={kpiLabelClass}>Emissions Saved</div>
              <div className={`${kpiValueClass} ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>
                {kpis.savedEmissions.toFixed(2)}
              </div>
              <div className={kpiUnitClass}>tCO2e (discount)</div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Monthly Trend */}
            <div className={cardClass}>
              <h3 className={chartTitleClass}>Monthly Net Emissions Trend</h3>
              <p className={`text-xs mb-2 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                Net = Gross - Saved (Renewable Electricity discounted)
              </p>
              {yearlyEmissionsTotal > 0 && (
                <p className={`text-xs mb-2 ${isDark ? "text-amber-400" : "text-amber-700"}`}>
                  + {yearlyEmissionsTotal.toLocaleString()} tCO2e filed as yearly
                  batches — counted in totals, not shown as monthly bars
                </p>
              )}
              {hasMonthlyTrendData ? (
                <ReactECharts option={monthlyTrendOptions} style={{ height: "300px" }} />
              ) : (
                <div className={emptyStateClass}>
                  No data available
                </div>
              )}
            </div>

            {/* Emissions by Category */}
            <div className={cardClass}>
              <h3 className={chartTitleClass}>Emissions by Category</h3>
              <p className={`text-xs mb-2 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                Scoped emissions only (excludes Renewable Electricity)
              </p>
              {hasCategoryData ? (
                <ReactECharts option={categoryChartOptions} style={{ height: "300px" }} />
              ) : (
                <div className={emptyStateClass}>
                  No data available
                </div>
              )}
            </div>
          </div>

          {/* Emissions Saved Chart */}
          <div className={`${cardClass} mb-6`}>
            <h3 className={chartTitleClass}>Emissions Saved</h3>
            <p className={`text-sm mb-4 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
              Emissions from categories without scope (e.g., Renewable Electricity) - not counted in total emissions
            </p>
            {hasSavedEmissionsData ? (
              <ReactECharts option={savedEmissionsChartOptions} style={{ height: "300px" }} />
            ) : (
              <div className={emptyStateClass}>
                No saved emissions data available
              </div>
            )}
          </div>

          {/* Scope 2 (Purchased Electricity) Chart */}
          <div className={`${cardClass} mb-6`}>
            <h3 className={chartTitleClass}>Scope 2 (Purchased Electricity)</h3>
            <p className={`text-sm mb-4 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
              Monthly emissions (bars) and electricity consumption (line)
            </p>
            {hasScope2Data ? (
              <ReactECharts option={scope2ChartOptions} style={{ height: "350px" }} />
            ) : (
              <div className={emptyStateClass}>
                No Scope 2 emissions data available
              </div>
            )}
          </div>

          {/* Monthly Emission Intensity Trend Chart */}
          <div className={`${cardClass} mb-6`}>
            <h3 className={chartTitleClass}>Monthly Emission Intensity Trend</h3>
            <p className={`text-sm mb-4 ${isDark ? "text-slate-400" : "text-gray-500"}`}>
              Emission intensity (line), emissions (bars), and production (dashed line) over time
            </p>
            {hasIntensityData ? (
              <ReactECharts option={intensityTrendChartOptions} style={{ height: "350px" }} />
            ) : (
              <div className={emptyStateClass}>
                {intensityLoading ? "Loading intensity data..." : "No emission intensity data available. Add production data to calculate intensity."}
              </div>
            )}
          </div>

          {/* Site Comparison Chart - only show when single site selected */}
          {availableSites.length > 1 && selectedSites.length === 1 && (
            <div className={`${cardClass} mb-6`}>
              <div className="flex justify-between items-center mb-4">
                <h3 className={chartTitleClass.replace(" mb-4", "")}>Site Comparison</h3>
                <div className="w-32">
                  <Dropdown
                    options={yearOptions}
                    placeholder="Year"
                    value={comparisonYear}
                    onChange={(option) => setComparisonYear(option?.id as number)}
                    clearable={false}
                  />
                </div>
              </div>
              <ReactECharts option={siteComparisonOptions} style={{ height: "300px" }} />
            </div>
          )}

          {/* Year-over-Year Monthly Comparison Chart */}
          <div className={`${cardClass} mb-6`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className={chartTitleClass.replace(" mb-4", "")}>Year-over-Year Monthly Comparison</h3>
              <div className="flex gap-2">
                <div className="w-40">
                  <Dropdown
                    options={siteOptions}
                    placeholder="Select Site"
                    value={yoySelectedSite}
                    onChange={(option) => setYoySelectedSite(option?.id as number)}
                    clearable={false}
                    searchable={true}
                  />
                </div>
                <div className="w-48">
                  <Dropdown
                    options={yearOptions}
                    placeholder="Select Years"
                    multiple={true}
                    multipleValue={selectedComparisonYears}
                    onMultipleChange={(options) =>
                      setSelectedComparisonYears(options.map((o) => o.id as number))
                    }
                    clearable={false}
                  />
                </div>
              </div>
            </div>
            {selectedComparisonYears.length > 0 && yoySelectedSite ? (
              <ReactECharts option={yearOverYearOptions} style={{ height: "300px" }} />
            ) : (
              <div className={emptyStateClass}>
                Select a site and years to compare
              </div>
            )}
          </div>

          {/* Status Distribution and Pending Emissions Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Status Distribution */}
            <div className={cardClass}>
              <h3 className={chartTitleClass}>Status Distribution</h3>
              {kpis.totalCount > 0 ? (
                <ReactECharts option={statusChartOptions} style={{ height: "250px" }} />
              ) : (
                <div className={emptyStateClass.replace("h-75", "h-62.5")}>
                  No data available
                </div>
              )}
            </div>

            {/* Submission Status */}
            <SubmissionStatusWidget />

            {/* Pending Emissions */}
            <PendingEmissionsList
              pendingEmissions={pendingEmissions}
              totalPendingCount={filteredEmissions.filter((e) => e.status === "pending").length}
              isDark={isDark}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default ManagerDashboard;
