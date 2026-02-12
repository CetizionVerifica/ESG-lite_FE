import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";

import { Site } from "../ManagerDashboard/types";
import EdeReportFilters from "./EdeReportsFilters";
import EdeReportTables from "./EdeReportTable";
import EdeReportCharts from "./EdeReportCharts";

import { getEdeReport } from "../../services/reportService";
import { downloadEdeReportPdf } from "./downloadPdf";
import { getCompanyNameBySites } from "../../services/companyService";
import { getSites } from "../../services/siteService";

type Frequency = "yearly" | "monthly";

type ReportTotals = { scope1: number; scope2: number; scope3: number; total: number };

type BySiteRow = {
  siteId: number;
  siteName: string;
  scope1: number;
  scope2: number;
  scope3: number;
  total: number;
  pctOfTotal: number;
};

type SiteDonutRow = { name: string; value: number; pct: number };
type MonthlyBySiteRow = { month: string; siteId: number; siteName: string; total: number };
type SavedBySiteRow = { siteId: number; siteName: string; saved: number };
type RenewableKwhBySiteRow = { siteId: number; siteName: string; kwh: number; unit: string };

type IntensityMonthlyRow = {
  month: string;
  siteName: string;
  emissions: number;
  production: number;
  intensity: number;
  unit: string;
};

type ReportData = {
  totals: ReportTotals;
  bySite: BySiteRow[];
  siteDonut: SiteDonutRow[];
  monthlyBySite: MonthlyBySiteRow[];
  savedBySite: SavedBySiteRow[];
  renewableKwhBySite: RenewableKwhBySiteRow[];
  intensityMonthly: IntensityMonthlyRow[];
};

type EdeReportRequest = {
  siteIds: number[];
  categoryIds?: number[];
  frequency: Frequency;
  year: number;
  month?: number;
};

const EdeReports = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();

  const sites: Site[] = (user as any)?.sites || [];
  const singleSite: Site | null = (user as any)?.site || null;

  // const availableSites = useMemo(() => {
  //   return sites.length > 0 ? sites : singleSite ? [singleSite] : [];
  // }, [sites, singleSite]);

  const [availableSites, setAvailableSites] = useState<Site[]>(
  sites.length > 0 ? sites : singleSite ? [singleSite] : []
);

  const now = new Date();

  const [selectedSites, setSelectedSites] = useState<number[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [frequency, setFrequency] = useState<Frequency>("yearly");
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);

  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  
  useEffect(() => {
    if (availableSites.length > 0 && selectedSites.length === 0) {
      setSelectedSites([availableSites[0].site_id]);
    }
  }, [availableSites, selectedSites.length]);

  useEffect(() => {
  if ((user as any)?.role === "Superadmin") {
    getSites().then((allSites) => {
      setAvailableSites(allSites);
    });
  }
}, [user]);

  
  const titleLine = useMemo(() => {
    const sitesText =
      selectedSites.length === 0
        ? "No site selected"
        : selectedSites.length === 1
        ? `Site: ${availableSites.find((s) => s.site_id === selectedSites[0])?.name || ""}`
        : `Sites: ${selectedSites.length}`;

    const catsText =
      selectedCategoryIds.length === 0 ? "All categories" : `Categories: ${selectedCategoryIds.length}`;

    const periodText =
      frequency === "yearly"
        ? `Year: ${year}`
        : `Period: ${year}-${String(month).padStart(2, "0")}`;

    return `${sitesText} • ${catsText} • ${periodText}`;
  }, [selectedSites, availableSites, selectedCategoryIds.length, frequency, year, month]);

  const pageClass = isDark
    ? "p-6 min-h-screen bg-slate-900 text-slate-100"
    : "p-6 min-h-screen bg-gray-50 text-gray-900";

  const subText = isDark ? "text-slate-400" : "text-gray-600";

  useEffect(() => {
    const fetchReport = async () => {
      if (selectedSites.length === 0 || !year) return;

      try {
        setLoading(true);

        const payload: EdeReportRequest = {
          siteIds: selectedSites,
          frequency,
          year,
          ...(frequency === "monthly" ? { month } : {}),
          ...(selectedCategoryIds.length > 0 ? { categoryIds: selectedCategoryIds } : {}),
        };

        const data = await getEdeReport(payload);

        const normalized: ReportData = {
          totals: data?.totals || { scope1: 0, scope2: 0, scope3: 0, total: 0 },
          bySite: data?.bySite || [],
          siteDonut: data?.siteDonut || [],
          monthlyBySite: data?.monthlyBySite || [],
          savedBySite: data?.savedBySite || [],
          renewableKwhBySite: data?.renewableKwhBySite || [],
          intensityMonthly: data?.intensityMonthly || [],
        };

        setReportData(normalized);
      } catch (error) {
        console.error("Fetch report failed:", error);
        setReportData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [selectedSites, selectedCategoryIds, frequency, year, month]);

  const siteDonutRef = useRef<HTMLDivElement | null>(null);
  const monthlyTrendRef = useRef<HTMLDivElement | null>(null);
  const categoryPieRef = useRef<HTMLDivElement | null>(null);
  const savedEmissionsRef = useRef<HTMLDivElement | null>(null);
  const scope2Ref = useRef<HTMLDivElement | null>(null);
  const intensityTrendRef = useRef<HTMLDivElement | null>(null);

  const handleDownloadPdf = async () => {
    if (!reportData) return;

    const siteNamesText =
      selectedSites.length === 1
        ? availableSites.find((s) => s.site_id === selectedSites[0])?.name || "Selected site"
        : `${selectedSites.length} sites`;

    const categoriesText =
      selectedCategoryIds.length === 0 ? "All categories" : `${selectedCategoryIds.length} categories`;

    const siteIds = reportData.bySite.map((site) => site.siteId);
    
    const companyData = await getCompanyNameBySites(siteIds);

    const reportProps = {
      title: "EDE Emissions Report",
      subtitle: "Approved emissions + production data",
    companyName: companyData.companyName || "Company Name",
      frequency,
      year,
      month: frequency === "monthly" ? month : null,
      siteNamesText,
      categoriesText,

      totals: reportData.totals,
      bySite: reportData.bySite,
      monthlyBySite: reportData.monthlyBySite,
      savedBySite: reportData.savedBySite,
      renewableKwhBySite: reportData.renewableKwhBySite,
      intensityMonthly: reportData.intensityMonthly,
    };

    await downloadEdeReportPdf(
      reportProps,
      {
        siteDonut: siteDonutRef.current,
        monthlyTrend: monthlyTrendRef.current,
        categoryPie: categoryPieRef.current,
        savedEmissions: savedEmissionsRef.current,
        scope2: scope2Ref.current,
        intensityTrend: intensityTrendRef.current,
      },
      "EDE_Report.pdf"
    );
  };

  return (
    <div className={pageClass}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold mb-2">EDE Reports</h1>
          <div className={`${subText} mb-5`}>{titleLine}</div>
        </div>

        <button
          className={`h-10 px-4 rounded text-white ${
            loading || !reportData ? "bg-gray-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
          }`}
          disabled={loading || !reportData}
          onClick={handleDownloadPdf}
          title={!reportData ? "Load report first" : "Download PDF"}
        >
          Download PDF
        </button>
      </div>

      <EdeReportFilters
        availableSites={availableSites}
        selectedSites={selectedSites}
        setSelectedSites={setSelectedSites}
        selectedCategoryIds={selectedCategoryIds}
        setSelectedCategoryIds={setSelectedCategoryIds}
        frequency={frequency}
        setFrequency={setFrequency}
        year={year}
        setYear={setYear}
        month={month}
        setMonth={setMonth}
      />

      <div className="mt-6">
        {loading ? (
          <div className="text-sm text-gray-500">Loading report…</div>
        ) : reportData ? (
          <div className="space-y-8">
            <EdeReportTables totals={reportData.totals} bySite={reportData.bySite} isDark={isDark} />

            <EdeReportCharts
              siteDonut={reportData.siteDonut}
              monthlyBySite={reportData.monthlyBySite}
              savedBySite={reportData.savedBySite}
              renewableKwhBySite={reportData.renewableKwhBySite}
              intensityMonthly={reportData.intensityMonthly}
              isDark={isDark}
              siteDonutRef={siteDonutRef}
              monthlyTrendRef={monthlyTrendRef}
              categoryPieRef={categoryPieRef}
              savedEmissionsRef={savedEmissionsRef}
              scope2Ref={scope2Ref}
              intensityTrendRef={intensityTrendRef}
            />
          </div>
        ) : (
          <div className="text-sm text-gray-500">No data available.</div>
        )}
      </div>
    </div>
  );
};

export default EdeReports;
