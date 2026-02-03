import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";

import { Site } from "../ManagerDashboard/types";
import EdeReportFilters from "./EdeReportsFilters";
import EdeReportTables from "./EdeReportTable";

import {
  getApprovedEmissionsReport,
  ApprovedEmissionsReportPayload,
} from "../../services/emissionService";

type Frequency = "yearly" | "monthly";


const EdeReports = () => {

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
  const [frequency, setFrequency] = useState<Frequency>("yearly");
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);

  const [reportData, setReportData] = useState<{
  totals: any | null;
  bySite: any[];
  monthly: any[];
} | null>(null);

const [loading, setLoading] = useState(false)


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

      const payload = {
        siteIds: selectedSites,
        frequency,
        year,
        ...(frequency === "monthly" ? { month } : {}),
        ...(selectedCategoryIds.length > 0
          ? { categoryIds: selectedCategoryIds }
          : {}),
      };

      const data = await getApprovedEmissionsReport(payload);
      setReportData(data);
    } catch (error) {
      console.error("Fetch report failed:", error);
      setReportData(null);
    } finally {
      setLoading(false);
    }
  };

  fetchReport();
}, [
  selectedSites,
  selectedCategoryIds,
  frequency,
  year,
  month,
]);


    return(
         <div className={pageClass}>
      <h1 className="text-2xl font-bold mb-2">EDE Reports</h1>
      <div className={`${subText} mb-5`}>{titleLine}</div>
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
    <EdeReportTables
      totals={reportData.totals}
      bySite={reportData.bySite}
      isDark={isDark}
    />
  ) : (
    <div className="text-sm text-gray-500">No data available.</div>
  )}
</div>


      </div>
    )
}
export default EdeReports;