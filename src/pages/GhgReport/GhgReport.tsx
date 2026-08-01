

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { getSites } from "../../services/siteService";
import { Site } from "../ManagerDashboard/types";
import GhgReportFilters from "./GhgReportFilters";
import GhgReportTables from "./GhgReportTables";
import GhgReportDetailsTables from "./GhgReportDetailsTables";
import GhgSiteCategoriesTable from "./GhgSiteCategoriesTable";

import {
  getGhgReportTables,
  getGhgReportDetails,
  type GhgReportTablesResponse,
  type GhgReportDetailsResponse,
  type YearType,
  type Frequency,
} from "../../services/ghgreportService";

import GhgReportSummaryCharts from "./GhgReportSummaryCharts";
import GhgReportDetailedCharts from "./GhgReportDetailedCharts";
import GhgReportResultsChart from "./GhgReportResultsCharts";
import GhgReportPeriodChart from "./GhgReportPeriodChart";
import GhgReportPdfExport from "./pdf/GhgPdf";

type Step = 1 | 2 | 3;

function extractErrorMessage(err: any) {
  // Axios-style
  const apiMsg =
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    err?.response?.data?.msg;

  if (apiMsg) return String(apiMsg);

  if (err?.message) return String(err.message);
  return "Failed to generate report. Please verify filters and try again.";
}

const GhgReport = () => {
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

  const [step, setStep] = useState<Step>(1);

  const [selectedSites, setSelectedSites] = useState<number[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [yearType, setYearType] = useState<YearType>("CY");
  const [year, setYear] = useState<number>(now.getFullYear());
  const [frequency, setFrequency] = useState<Frequency>("yearly");

  const [tablesData, setTablesData] = useState<GhgReportTablesResponse | null>(null);
  const [detailsData, setDetailsData] = useState<GhgReportDetailsResponse | null>(null);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");


  useEffect(() => {
  if ((user as any)?.role === "Superadmin") {
    getSites()
      .then((allSites) => {
        setAvailableSites(allSites || []);
      })
      .catch((e) => {
        console.error("Failed to load sites for Superadmin:", e);
      });
  } else {
    setAvailableSites(sites.length > 0 ? sites : singleSite ? [singleSite] : []);
  }
}, [user, sites, singleSite]);

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
    : `Sites: ${selectedSites.map((id) => availableSites.find((s) => s.site_id === id)?.name).filter(Boolean).join(", ")}`;

    const catsText =
      selectedCategoryIds.length === 0 ? "All categories" : `Categories: ${selectedCategoryIds.length}`;

    const yearTypeText = yearType === "CY" ? "Calendar Year (CY)" : "Financial Year (FY)";
    const yearText = `Year: ${year}`;
    const freqText = `Frequency: ${
      frequency === "monthly" ? "Monthly" : frequency === "quarterly" ? "Quarterly" : "Yearly"
    }`;

    return `${sitesText} • ${catsText} • ${yearTypeText} • ${yearText} • ${freqText}`;
  }, [selectedSites, availableSites, selectedCategoryIds.length, yearType, year, frequency]);

  // Theme classes
  const pageClass = isDark
    ? "p-6 min-h-screen bg-slate-900 text-slate-100"
    : "p-6 min-h-screen bg-gray-50 text-gray-900";

  const subText = isDark ? "text-slate-400" : "text-gray-600";

  const cardBase = isDark ? "bg-slate-800/60 border border-slate-700" : "bg-white border border-gray-200";
  //const softCard = isDark ? "bg-slate-800/40 border border-slate-700" : "bg-white border border-gray-200";

  // const btnPrimary =
  //   "h-10 px-4 rounded-lg text-white font-semibold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed";

  const btnSecondary =
    "h-10 px-4 rounded-lg font-semibold border disabled:opacity-50 disabled:cursor-not-allowed";

  const canProceedStep2 =
    selectedSites.length > 0 && Boolean(yearType) && Boolean(year) && !loading;

  const runReport = async () => {
    if (!canProceedStep2) return;

    setErrorMsg("");
    setLoading(true);

    try {
      // Coerce everything to numbers to avoid backend rejecting strings
      const siteIds = (selectedSites || []).map((x) => Number(x)).filter((x) => Number.isFinite(x));
      const categoryIds = (selectedCategoryIds || []).map((x) => Number(x)).filter((x) => Number.isFinite(x));
      const yr = Number(year);

      const payload: any = {
        siteIds,
        yearType,
        year: yr,
        frequency,
        ...(categoryIds.length > 0 ? { categoryIds } : {}),
      };

      // Debug if needed
      // console.log("GHG report payload:", payload);

      const [tables, details] = await Promise.all([
        getGhgReportTables(payload),
        getGhgReportDetails(payload),
      ]);

      setTablesData(tables);
      setDetailsData(details);

      setStep(3);
    } catch (e: any) {
      console.error("Fetch GHG report failed:", e);
      setTablesData(null);
      setDetailsData(null);
      setErrorMsg(extractErrorMessage(e));
      // stay on step 2
    } finally {
      setLoading(false);
    }
  };

  const StepPill = ({ n, label }: { n: Step; label: string }) => {
    const active = step === n;
    const done = step > n;

    const base = "flex items-center gap-2 px-3 py-2 rounded-full text-sm border";
    const cls = active
      ? isDark
        ? "bg-slate-700 border-slate-600"
        : "bg-gray-900 text-white border-gray-900"
      : done
      ? isDark
        ? "bg-slate-800 border-slate-700 text-slate-200"
        : "bg-white border-gray-200 text-gray-700"
      : isDark
      ? "bg-slate-900/30 border-slate-700 text-slate-400"
      : "bg-gray-50 border-gray-200 text-gray-500";

    const dotCls = active
      ? "bg-white"
      : done
      ? isDark
        ? "bg-emerald-400"
        : "bg-emerald-600"
      : isDark
      ? "bg-slate-500"
      : "bg-gray-400";

    return (
      <div className={`${base} ${cls}`}>
        <span className={`inline-block w-2.5 h-2.5 rounded-full ${dotCls}`} />
        <span className="font-semibold">{label}</span>
      </div>
    );
  };

  
const IntroHero = () => {
  const [activeNode, setActiveNode] = useState<string | null>(null);

  const nodes = [
    {
      key: "measure",
      label: "MEASURE\nEMISSIONS",
      color: "#e05c5c",
      x: 148,
      y: 108,
      r: 52,
      desc: "Collect activity data across Scope 1, 2 & 3 sources and convert to tCO₂e using emission factors.",
    },
    {
      key: "target",
      label: "SET A\nTARGET",
      color: "#7c6fad",
      x: 318,
      y: 148,
      r: 48,
      desc: "Define science-based reduction targets aligned with 1.5°C pathways and your net-zero commitment.",
    },
    {
      key: "improve",
      label: "IMPROVE\nPERFORMANCE",
      color: "#e8953a",
      x: 178,
      y: 272,
      r: 52,
      desc: "Implement reduction initiatives, track progress against targets and optimise energy use.",
    },
    {
      key: "report",
      label: "REPORT &\nDISCLOSE",
      color: "#4a8fa8",
      x: 44,
      y: 210,
      r: 44,
      desc: "Publish emissions data to CDP, TCFD, GRI or mandatory regulatory frameworks.",
    },
    {
      key: "investor",
      label: "INVESTOR\nDATA",
      color: "#5a9a6a",
      x: -48,
      y: 148,
      r: 44,
      desc: "Provide investors and lenders with verified climate risk disclosures and net-zero transition plans.",
    },
  ];

  const activeData = nodes.find((n) => n.key === activeNode);

  const pageBg = isDark ? "#0d1a22" : "#2d6e72";
  const arcBg = isDark ? "#1e3a4a" : "#1e4d52";

  return (
    <div
      style={{
        fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
        background: pageBg,
        borderRadius: 20,
        overflow: "hidden",
        position: "relative",
        minHeight: 440,
        display: "flex",
        alignItems: "center",
        padding: "48px 40px",
        gap: 32,
      }}
    >
      {/* Decorative corner blobs */}
      <div
        style={{
          position: "absolute",
          bottom: -40,
          right: 260,
          width: 130,
          height: 130,
          borderRadius: "50%",
          background: "#0d9488",
          opacity: 0.5,
          zIndex: 0,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: 0,
          right: 200,
          width: 80,
          height: 80,
          borderRadius: "50%",
          background: "#14b8a6",
          opacity: 0.35,
          zIndex: 0,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: -30,
          left: -30,
          width: 100,
          height: 100,
          borderRadius: "50%",
          background: "#0f766e",
          opacity: 0.25,
          zIndex: 0,
          pointerEvents: "none",
        }}
      />

      {/* LEFT: SVG arc + bubbles */}
      <div style={{ flexShrink: 0, position: "relative", zIndex: 1 }}>
        <svg
          width={420}
          height={380}
          viewBox="-80 -20 480 420"
          style={{ overflow: "visible" }}
        >
          <defs>
            <filter id="ghg-glow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="7" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <path
              id="ghg-arc-text"
              d="M 195,338 A 188,188 0 0,1 12,105"
            />
          </defs>

          {/* Arc body — filled wedge shape */}
          <path
            d="M 195,338 A 188,188 0 0,1 12,105 L 76,142 A 122,122 0 0,0 175,298 Z"
            fill={arcBg}
            opacity={0.92}
          />

          {/* Curved text along arc */}
          <text
            fontSize="11"
            fontWeight="800"
            letterSpacing="5"
            fill="#ffffff"
            opacity={0.85}
          >
            <textPath href="#ghg-arc-text" startOffset="6%">
              GHG REPORTING CYCLE
            </textPath>
          </text>

          {/* Center hub dot */}
          <circle cx={128} cy={198} r={10} fill="#0d9488" opacity={0.9} />
          <circle cx={128} cy={198} r={6} fill="#ffffff" opacity={0.7} />

          {/* Connector lines */}
          {nodes.map((node) => (
            <line
              key={node.key + "-line"}
              x1={128}
              y1={198}
              x2={node.x}
              y2={node.y}
              stroke={node.color}
              strokeWidth={activeNode === node.key ? 2.2 : 1.2}
              strokeOpacity={activeNode === node.key ? 0.85 : 0.3}
              strokeDasharray="5 4"
              style={{ transition: "stroke-opacity 0.22s, stroke-width 0.22s" }}
            />
          ))}

          {/* Bubble nodes */}
          {nodes.map((node) => {
            const isActive = activeNode === node.key;
            const lines = node.label.split("\n");
            return (
              <g
                key={node.key}
                onMouseEnter={() => setActiveNode(node.key)}
                onMouseLeave={() => setActiveNode(null)}
                style={{ cursor: "pointer" }}
              >
                {/* Outer glow ring */}
                {isActive && (
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={node.r + 10}
                    fill="none"
                    stroke={node.color}
                    strokeWidth={2}
                    strokeOpacity={0.35}
                  />
                )}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.r + (isActive ? 3 : 0)}
                  fill={node.color}
                  opacity={isActive ? 1 : 0.9}
                  filter={isActive ? "url(#ghg-glow)" : "none"}
                  style={{ transition: "r 0.22s" }}
                />
                {lines.map((line, li) => (
                  <text
                    key={li}
                    x={node.x}
                    y={
                      node.y +
                      (lines.length === 1
                        ? 0
                        : li === 0
                        ? -9
                        : 9)
                    }
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="9.5"
                    fontWeight="800"
                    letterSpacing="0.6"
                    fill="#ffffff"
                    style={{ pointerEvents: "none" }}
                  >
                    {line}
                  </text>
                ))}
              </g>
            );
          })}
        </svg>
      </div>

      {/* RIGHT: Info circle */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: 295,
            height: 295,
            borderRadius: "50%",
            background: isDark ? "#e8f5f4" : "#f5fffe",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "38px 30px",
            boxSizing: "border-box",
            textAlign: "center",
            boxShadow: "0 12px 48px rgba(0,0,0,0.25)",
            transition: "all 0.28s ease",
          }}
        >
          {activeData ? (
            <>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: activeData.color,
                  marginBottom: 12,
                  flexShrink: 0,
                }}
              />
              <p
                style={{
                  margin: "0 0 10px",
                  fontSize: 12,
                  fontWeight: 800,
                  color: "#0f172a",
                  letterSpacing: "0.07em",
                  textTransform: "uppercase" as const,
                  lineHeight: 1.3,
                }}
              >
                {activeData.label.replace("\n", " ")}
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: 12.5,
                  color: "#374151",
                  lineHeight: 1.68,
                }}
              >
                {activeData.desc}
              </p>
            </>
          ) : (
            <>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: "#0d9488",
                  marginBottom: 16,
                  flexShrink: 0,
                }}
              />
              <p
                style={{
                  margin: "0 0 4px",
                  fontSize: 14,
                  fontWeight: 900,
                  color: "#0f172a",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase" as const,
                  lineHeight: 1.25,
                }}
              >
                NAVIGATING THE
              </p>
              <p
                style={{
                  margin: "0 0 16px",
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#0d9488",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase" as const,
                }}
              >
                GHG DISCLOSURE LANDSCAPE
              </p>
              <p
                style={{
                  margin: "0 0 12px",
                  fontSize: 12,
                  color: "#374151",
                  lineHeight: 1.68,
                }}
              >
                A structured, management-ready emissions report covering Scope 1, 2 & 3 — with
                site-level breakdowns and year-over-year comparability.
              </p>
              {/* <p
                style={{
                  margin: 0,
                  fontSize: 11.5,
                  color: "#64748b",
                  lineHeight: 1.6,
                  fontStyle: "italic",
                }}
              >
                Hover each bubble to explore the reporting cycle.
              </p> */}
            </>
          )}
        </div>

        {/* Get Started CTA below circle */}
        <button
          onClick={() => setStep(2)}
          style={{
            marginTop: 24,
            height: 44,
            padding: "0 30px",
            borderRadius: 10,
            border: "2px solid rgba(255,255,255,0.35)",
            background: "rgba(255,255,255,0.12)",
            color: "#ffffff",
            fontWeight: 700,
            fontSize: 14,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 9,
            backdropFilter: "blur(8px)",
            transition: "background 0.2s, border-color 0.2s",
            letterSpacing: "0.02em",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.22)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.65)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.12)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.35)";
          }}
        >
          Select Filters & Generate Report
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M2 7h10M8 3l4 4-4 4"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};


const FiltersStep = () => (
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
    frequency={frequency}
    setFrequency={setFrequency}
    onProceed={runReport}
    onBack={() => setStep(1)}
    loading={loading}
    errorMsg={errorMsg}
  />
);
  // Step 3: results + PDF only here
  const ResultsStep = () => (
    <div className="space-y-6">
      <div className={`rounded-2xl p-5 ${cardBase} shadow-sm`}>
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold mb-1">Report output</h2>
            <div className={`${subText} text-sm`}>{titleLine}</div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className={`${btnSecondary} ${isDark ? "border-slate-600 hover:bg-slate-800" : "border-gray-300 hover:bg-gray-100"}`}
              onClick={() => setStep(2)}
            >
              Back to Filters
            </button>

            {/* Download PDF ONLY on step 3 */}
            <GhgReportPdfExport siteIds={selectedSites} tablesData={tablesData} detailsData={detailsData} />

            {/* Branded, client-themed PDF from the backend (auto theme per company) */}
            <button
              className="h-10 px-4 rounded-lg font-semibold text-white shadow-sm bg-emerald-600 hover:bg-emerald-700"
              onClick={() => {
                const siteIds = selectedSites.length > 0 ? selectedSites : (availableSites[0]?.site_id ? [availableSites[0].site_id] : []);
                if (siteIds.length === 0) {
                  alert("Select a site first to download the branded report.");
                  return;
                }
                const base = import.meta.env.VITE_API_URL;
                // /reports is JWT-protected; a new browser tab can't send the
                // Authorization header, so pass the token as a query param.
                const token = localStorage.getItem("token") ?? "";
                // Pass the SAME filters as the on-screen tables so the branded
                // PDF numbers match exactly.
                const params = new URLSearchParams();
                params.set("siteIds", siteIds.join(","));
                if (selectedCategoryIds.length > 0) params.set("categoryIds", selectedCategoryIds.join(","));
                params.set("yearType", yearType);
                params.set("year", String(year));
                params.set("frequency", frequency);
                params.set("download", "1");
                params.set("token", token);
                const url = `${base}/reports/ghg?${params.toString()}`;
                window.open(url, "_blank");
              }}
            >
              Download Branded PDF
            </button>
          </div>
        </div>
      </div>

      {!tablesData ? (
        <div className={`rounded-2xl p-5 ${cardBase} shadow-sm`}>
          <div className={`text-sm ${subText}`}>No data available for the selected filters.</div>
        </div>
      ) : (
        <div className="space-y-8">
          <GhgSiteCategoriesTable data={tablesData} isDark={isDark} />
          <GhgReportTables data={tablesData} isDark={isDark} />

          {tablesData?.periodBreakdown ? (
            <GhgReportPeriodChart periodBreakdown={tablesData.periodBreakdown} isDark={isDark} />
          ) : null}

          {tablesData && detailsData ? (
            <GhgReportSummaryCharts tablesData={tablesData} detailsData={detailsData} isDark={isDark} />
          ) : null}

          {detailsData ? (
            <GhgReportDetailsTables data={detailsData} isDark={isDark} />
          ) : (
            <div className={`text-sm ${subText}`}>No detailed data available.</div>
          )}

          {tablesData && detailsData ? (
            <GhgReportDetailedCharts tablesData={tablesData} detailsData={detailsData} isDark={isDark} />
          ) : null}

          {tablesData && detailsData ? (
            <GhgReportResultsChart tablesData={tablesData} detailsData={detailsData} isDark={isDark} />
          ) : null}
        </div>
      )}
    </div>
  );

  return (
    <div className={pageClass}>
      <div className="flex flex-col gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold mb-1">GHG Report</h1>
          <div className={`${subText} text-sm`}>Generate a professional report in three steps.</div>
        </div>

        <div className="flex flex-wrap gap-2">
          <StepPill n={1} label="1. Overview" />
          <StepPill n={2} label="2. Filters" />
          <StepPill n={3} label="3. Results & PDF" />
        </div>
      </div>

      {availableSites.length === 0 ? (
        <div
          className={`rounded-xl p-4 ${
            isDark ? "bg-amber-900/20 border border-amber-800/40 text-amber-200" : "bg-amber-50 border border-amber-200 text-amber-800"
          }`}
        >
          No sites are available for this user. Please assign at least one site to generate the report.
        </div>
      ) : null}

      {step === 1 ? <IntroHero /> : null}
      {step === 2 ? <FiltersStep /> : null}
      {step === 3 ? <ResultsStep /> : null}
    </div>
  );
};

export default GhgReport;
