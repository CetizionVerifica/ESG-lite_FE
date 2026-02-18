import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { Site } from "../ManagerDashboard/types";
import { getLongTermTargetChart, LongTermChartResponse } from "../../services/sbtiService";
import SbtiLongTermChart from "./Sbtilongtermchart";
import { SbtiFilterConfig } from "./SbtiNearTermFilters";

interface Props {
  config: SbtiFilterConfig;
  onBack: () => void;
}

const SbtiLongTerm = ({ config, onBack }: Props) => {
  const { user } = useAuth();
  const { isDark } = useTheme();

  const sites: Site[] = (user as any)?.sites || [];
  const singleSite: Site | null = (user as any)?.site || null;
  const availableSites: Site[] = sites.length > 0 ? sites : singleSite ? [singleSite] : [];

  const [data, setData] = useState<LongTermChartResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!config.selectedSites.length || !config.baseYear) return;
      try {
        setLoading(true);
        setError(null);
        const res = await getLongTermTargetChart({
          siteIds: config.selectedSites,
          baseYear: config.baseYear,
        });
        setData(res);
      } catch (e: any) {
        setError(e?.message || "Failed to load data.");
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [config]);

  const bg = isDark ? "bg-slate-900 text-slate-100" : "bg-gray-50 text-gray-900";
  const mutedText = isDark ? "text-slate-400" : "text-gray-500";
  const cardBg = isDark ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200";
  const pillBg = isDark ? "bg-slate-700 text-slate-300" : "bg-gray-100 text-gray-600";
  const pillGreen = isDark ? "bg-emerald-900/40 text-emerald-400" : "bg-emerald-50 text-emerald-700";
  const pillSite = isDark ? "bg-blue-900/40 text-blue-300" : "bg-blue-50 text-blue-700";

  const siteNames = useMemo(() => {
    return config.selectedSites
      .map((id) => availableSites.find((s) => s.site_id === id)?.name)
      .filter(Boolean) as string[];
  }, [config.selectedSites, availableSites]);

  const infoPills = [
    { label: `Base: ${config.baseYear}` },
    { label: "Target: 2050" },
    { label: "Net-Zero · 90% Reduction", green: true },
  ];

  return (
    <div className={`min-h-screen ${bg}`}>
      <div className="max-w-6xl mx-auto px-6 py-10 flex flex-col gap-8">

        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <button
              onClick={onBack}
              className={`mt-1 p-2 rounded-lg transition-colors shrink-0 ${
                isDark ? "hover:bg-slate-700 text-slate-400" : "hover:bg-gray-100 text-gray-500"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Long-Term Net-Zero Targets</h1>
              <p className={`text-sm mt-1 ${mutedText}`}>
                SBTi net-zero pathway — 90% emission reduction from {config.baseYear} to 2050
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pl-11">
            {siteNames.map((name) => (
              <span key={name} className={`text-xs font-medium px-3 py-1.5 rounded-full ${pillSite}`}>
                📍 {name}
              </span>
            ))}
            {infoPills.map((p) => (
              <span
                key={p.label}
                className={`text-xs font-medium px-3 py-1.5 rounded-full ${p.green ? pillGreen : pillBg}`}
              >
                {p.label}
              </span>
            ))}
          </div>
        </div>

        {loading && (
          <div className={`rounded-xl border p-10 text-center ${cardBg}`}>
            <div className="flex flex-col items-center gap-3">
              <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <p className={`text-sm ${mutedText}`}>Calculating net-zero pathway…</p>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className={`rounded-xl border p-8 text-center ${cardBg}`}>
            <p className="text-2xl mb-2">⚠️</p>
            <p className="font-semibold text-sm mb-1">No Data Found</p>
            <p className={`text-xs ${mutedText}`}>{error}</p>
            <button onClick={onBack} className="mt-4 text-sm text-emerald-500 hover:underline">
              ← Change configuration
            </button>
          </div>
        )}

        {!loading && !error && data && (
          <SbtiLongTermChart data={data} isDark={isDark} />
        )}

      </div>
    </div>
  );
};

export default SbtiLongTerm;
