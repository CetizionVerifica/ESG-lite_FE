import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";

import { Site } from "../ManagerDashboard/types";
import GhgReportFilters from "./GhgReportFilters";
import GhgReportTables from "./GhgReportTables";
import GhgReportDetailsTables from "./GhgReportDetailsTables";

import {
  getGhgReportTables,
  getGhgReportDetails,
  type GhgReportTablesResponse,
  type GhgReportDetailsResponse,
  type YearType,
} from "../../services/ghgreportService";
import GhgSiteCategoriesTable from "./GhgSiteCategoriesTable";

const GhgReport = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();

  const sites: Site[] = (user as any)?.sites || [];
  const singleSite: Site | null = (user as any)?.site || null;

  const availableSites = useMemo(() => {
    return sites.length > 0 ? sites : singleSite ? [singleSite] : [];
  }, [sites, singleSite]);

  const now = new Date();

  const [selectedSites, setSelectedSites] = useState<number[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [yearType, setYearType] = useState<YearType>("CY");
  const [year, setYear] = useState<number>(now.getFullYear());

  const [tablesData, setTablesData] = useState<GhgReportTablesResponse | null>(null);
  const [detailsData, setDetailsData] = useState<GhgReportDetailsResponse | null>(null);

  const [loading, setLoading] = useState(false);

  // default site selected
  useEffect(() => {
    if (availableSites.length > 0 && selectedSites.length === 0) {
      setSelectedSites([availableSites[0].site_id]);
    }
  }, [availableSites, selectedSites.length]);

  const titleLine = useMemo(() => {
    const sitesText =
      selectedSites.length === 0
        ? "No site selected"
        : selectedSites.length === 1
        ? `Site: ${availableSites.find((s) => s.site_id === selectedSites[0])?.name || ""}`
        : `Sites: ${selectedSites.length}`;

    const catsText =
      selectedCategoryIds.length === 0 ? "All categories" : `Categories: ${selectedCategoryIds.length}`;

    const yearTypeText = yearType === "CY" ? "Calendar Year (CY)" : "Financial Year (FY)";
    const yearText = `Year: ${year}`;

    return `${sitesText} • ${catsText} • ${yearTypeText} • ${yearText}`;
  }, [selectedSites, availableSites, selectedCategoryIds.length, yearType, year]);

  const pageClass = isDark
    ? "p-6 min-h-screen bg-slate-900 text-slate-100"
    : "p-6 min-h-screen bg-gray-50 text-gray-900";

  const subText = isDark ? "text-slate-400" : "text-gray-600";

  useEffect(() => {
    const fetchAll = async () => {
      if (selectedSites.length === 0 || !yearType || !year) return;

      try {
        setLoading(true);

        const payload: any = {
          siteIds: selectedSites,
          yearType,
          year,
          ...(selectedCategoryIds.length > 0 ? { categoryIds: selectedCategoryIds } : {}),
        };

        const [tables, details] = await Promise.all([
          getGhgReportTables(payload),
          getGhgReportDetails(payload),
        ]);

        setTablesData(tables);
        setDetailsData(details);
      } catch (e) {
        console.error("Fetch GHG report failed:", e);
        setTablesData(null);
        setDetailsData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [selectedSites, selectedCategoryIds, yearType, year]);

  return (
    <div className={pageClass}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold mb-2">GHG Report</h1>
          <div className={`${subText} mb-5`}>{titleLine}</div>
        </div>

        {/* PDF next step */}
        <button
          className="h-10 px-4 rounded text-white bg-gray-400 cursor-not-allowed"
          disabled
          title="Next step: charts + PDF generation"
        >
          Download PDF
        </button>
      </div>

      <GhgReportFilters
        availableSites={availableSites}
        selectedSites={selectedSites}
        setSelectedSites={setSelectedSites}
        selectedCategoryIds={selectedCategoryIds}
        setSelectedCategoryIds={setSelectedCategoryIds}
        yearType={yearType}
        setYearType={setYearType}
        year={year}
        setYear={setYear}
      />

      <div className="mt-6">
        {loading ? (
          <div className="text-sm text-gray-500">Loading report…</div>
        ) : tablesData ? (
          <div className="space-y-8">
            <GhgReportTables data={tablesData} isDark={isDark} />
              <GhgSiteCategoriesTable data={tablesData} isDark={isDark} />
            {detailsData ? (
              <GhgReportDetailsTables data={detailsData} isDark={isDark} />
            ) : (
              <div className="text-sm text-gray-500">No detailed data available.</div>
            )}
          </div>
        ) : (
          <div className="text-sm text-gray-500">No data available.</div>
        )}
      </div>
    </div>
  );
};

export default GhgReport;
