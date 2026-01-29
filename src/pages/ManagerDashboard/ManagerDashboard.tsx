import { useState, useEffect, useMemo } from "react";
import ReactECharts from "echarts-for-react";
import Dropdown, { DropdownOption } from "../../components/Dropdown";
import { useAuth } from "../../context/AuthContext";

import { Site } from "./types";
import { generateYearOptions } from "./utils/dateUtils";
import { useEmissionsData } from "./hooks/useEmissionsData";
import { useChartOptions } from "./hooks/useChartOptions";
import { useEmissionIntensity } from "./hooks/useEmissionIntensity";
import PendingEmissionsList from "./components/PendingEmissionsList";
import EmissionIntensityCard from "./components/EmissionIntensityCard";

const ManagerDashboard = () => {
  const { user } = useAuth();

  // Get available sites from user
  const sites: Site[] = user?.sites || [];
  const singleSite: Site | null = user?.site || null;
  const availableSites = useMemo(() =>
    sites.length > 0 ? sites : singleSite ? [singleSite] : [],
    [sites, singleSite]
  );

  // Filter state
  const [selectedSite, setSelectedSite] = useState<number | null>(
    availableSites.length > 0 ? availableSites[0].site_id : null
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
    selectedSite,
    selectedCategory,
    selectedYear,
    availableSites,
  });

  const {
    categoryChartOptions,
    statusChartOptions,
    siteComparisonOptions,
    yearOverYearOptions,
    monthlyTrendOptions,
    hasCategoryData,
    hasMonthlyTrendData,
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
  });

  // Emission intensity data
  const {
    intensityData,
    loading: intensityLoading,
  } = useEmissionIntensity({
    selectedSite,
    availableSites,
    selectedYear,
  });

  // Get current site and its categories
  const currentSite = availableSites.find((s) => s.site_id === selectedSite);
  const categories = currentSite?.categories || [];

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

  // Reset category when site changes
  useEffect(() => {
    setSelectedCategory(null);
  }, [selectedSite]);

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-2xl font-bold mb-6">Manager Dashboard</h1>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium mb-1">Site</label>
          <Dropdown
            options={siteOptions}
            placeholder="Select Site"
            value={selectedSite}
            onChange={(option) => setSelectedSite(option?.id as number)}
            searchable={true}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Category</label>
          <Dropdown
            options={categoryOptions}
            placeholder="All Categories"
            value={selectedCategory}
            onChange={(option) => setSelectedCategory(option?.id as number)}
            searchable={true}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Year</label>
          <Dropdown
            options={yearOptions}
            placeholder="All Years"
            value={selectedYear}
            onChange={(option) => setSelectedYear(option?.id as number)}
            searchable={true}
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-5">
              <div className="text-sm font-medium text-gray-500">Total Emissions</div>
              <div className="text-2xl font-bold text-gray-900 mt-1">
                {kpis.totalEmissions.toFixed(2)}
              </div>
              <div className="text-xs text-gray-400 mt-1">tCO2e</div>
            </div>
            <EmissionIntensityCard data={intensityData} loading={intensityLoading} />
            <div className="bg-white rounded-lg shadow p-5">
              <div className="text-sm font-medium text-gray-500">Scope 1 Emissions</div>
              <div className="text-2xl font-bold text-blue-600 mt-1">
                {kpis.scope1Emissions.toFixed(2)}
              </div>
              <div className="text-xs text-gray-400 mt-1">tCO2e</div>
            </div>
            <div className="bg-white rounded-lg shadow p-5">
              <div className="text-sm font-medium text-gray-500">Scope 2 Emissions</div>
              <div className="text-2xl font-bold text-green-600 mt-1">
                {kpis.scope2Emissions.toFixed(2)}
              </div>
              <div className="text-xs text-gray-400 mt-1">tCO2e</div>
            </div>
            <div className="bg-white rounded-lg shadow p-5">
              <div className="text-sm font-medium text-gray-500">Scope 3 Emissions</div>
              <div className="text-2xl font-bold text-purple-600 mt-1">
                {kpis.scope3Emissions.toFixed(2)}
              </div>
              <div className="text-xs text-gray-400 mt-1">tCO2e</div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Monthly Trend */}
            <div className="bg-white rounded-lg shadow p-5">
              <h3 className="text-lg font-semibold mb-4">Monthly Emissions Trend</h3>
              {hasMonthlyTrendData ? (
                <ReactECharts option={monthlyTrendOptions} style={{ height: "300px" }} />
              ) : (
                <div className="flex items-center justify-center h-75 text-gray-500">
                  No data available
                </div>
              )}
            </div>

            {/* Emissions by Category */}
            <div className="bg-white rounded-lg shadow p-5">
              <h3 className="text-lg font-semibold mb-4">Emissions by Category</h3>
              {hasCategoryData ? (
                <ReactECharts option={categoryChartOptions} style={{ height: "300px" }} />
              ) : (
                <div className="flex items-center justify-center h-75 text-gray-500">
                  No data available
                </div>
              )}
            </div>
          </div>

          {/* Site Comparison Chart */}
          {availableSites.length > 1 && (
            <div className="bg-white rounded-lg shadow p-5 mb-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Site Comparison</h3>
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
          <div className="bg-white rounded-lg shadow p-5 mb-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Year-over-Year Monthly Comparison</h3>
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
              <div className="flex items-center justify-center h-75 text-gray-500">
                Select a site and years to compare
              </div>
            )}
          </div>

          {/* Status Distribution and Pending Emissions Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Status Distribution */}
            <div className="bg-white rounded-lg shadow p-5">
              <h3 className="text-lg font-semibold mb-4">Status Distribution</h3>
              {kpis.totalCount > 0 ? (
                <ReactECharts option={statusChartOptions} style={{ height: "250px" }} />
              ) : (
                <div className="flex items-center justify-center h-62.5 text-gray-500">
                  No data available
                </div>
              )}
            </div>

            {/* Pending Emissions */}
            <PendingEmissionsList
              pendingEmissions={pendingEmissions}
              totalPendingCount={filteredEmissions.filter((e) => e.status === "pending").length}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default ManagerDashboard;
