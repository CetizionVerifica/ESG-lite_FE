import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { Site } from "../ManagerDashboard/types";
import { getSites } from "../../services/siteService";
import Dropdown, { DropdownOption } from "../../components/Dropdown";
import { generateYearOptions } from "../ManagerDashboard/utils/dateUtils";

export type SbtiTargetType = "near-term" | "long-term";
export type SbtiPathway = "15C" | "WB2C";
export type NearTermHorizon = 5 | 10;

export interface SbtiFilterConfig {
  selectedSites: number[];
  baseYear: number;
  targetType: SbtiTargetType;
  nearTermHorizon: NearTermHorizon;
  pathway: SbtiPathway;
  annualRate: number;
}

interface Props {
  onApply: (config: SbtiFilterConfig) => void;
  onBack: () => void;
}

const RATE_MAP: Record<SbtiPathway, number> = {
  "15C": 0.042,
  WB2C: 0.025,
};

const SbtiNearTermFilters = ({ onApply, onBack }: Props) => {
  const { user } = useAuth();
  const { isDark } = useTheme();

  const sites: Site[] = (user as any)?.sites || [];
  const singleSite: Site | null = (user as any)?.site || null;

  const [availableSites, setAvailableSites] = useState<Site[]>(
    sites.length > 0 ? sites : singleSite ? [singleSite] : []
  );
  const [selectedSites, setSelectedSites] = useState<number[]>([]);
  const [baseYear, setBaseYear] = useState<number>(new Date().getFullYear() - 1);
  const [targetType, setTargetType] = useState<SbtiTargetType>("near-term");
  const [nearTermHorizon, setNearTermHorizon] = useState<NearTermHorizon>(10);
  const [pathway, setPathway] = useState<SbtiPathway>("15C");

  useEffect(() => {
    if ((user as any)?.role === "Superadmin") {
      getSites().then(setAvailableSites);
    }
  }, [user]);

  useEffect(() => {
    if (availableSites.length > 0 && selectedSites.length === 0) {
      setSelectedSites([availableSites[0].site_id]);
    }
  }, [availableSites, selectedSites.length]);

  const siteOptions: DropdownOption[] = useMemo(
    () => availableSites.map((s) => ({ id: s.site_id, label: s.name })),
    [availableSites]
  );

  const yearOptions = useMemo(() => generateYearOptions(), []);

  const targetYear = useMemo(() => {
    if (targetType === "near-term") return baseYear + nearTermHorizon;
    return 2050;
  }, [baseYear, targetType, nearTermHorizon]);

  const canApply = selectedSites.length > 0 && !!baseYear;

  const handleApply = () => {
    if (!canApply) return;
    onApply({
      selectedSites,
      baseYear,
      targetType,
      nearTermHorizon,
      pathway,
      annualRate: RATE_MAP[pathway],
    });
  };

  const bg = isDark ? "bg-slate-900 text-slate-100" : "bg-gray-50 text-gray-900";
  const cardBg = isDark ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200";
  const mutedText = isDark ? "text-slate-400" : "text-gray-500";
  const labelText = isDark ? "text-slate-300" : "text-gray-700";
  const activePill = "bg-emerald-500 text-white";
  const inactivePill = isDark
    ? "bg-slate-700 text-slate-300 border border-slate-600 hover:bg-slate-600"
    : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50";
  const summaryBg = isDark ? "bg-emerald-900/30 border-emerald-700/40" : "bg-emerald-50 border-emerald-200";
  const summaryLabel = isDark ? "text-emerald-400" : "text-emerald-700";

  return (
    <div className={`min-h-screen ${bg}`}>
      <div className="max-w-2xl mx-auto px-6 py-10 flex flex-col gap-6">

        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className={`p-2 rounded-lg transition-colors ${
              isDark ? "hover:bg-slate-700 text-slate-400" : "hover:bg-gray-100 text-gray-500"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Configure Commitment</h1>
            <p className={`text-xs mt-0.5 ${mutedText}`}>Set your sites, base year, target type and reduction pathway</p>
          </div>
        </div>

        <div className={`rounded-xl border flex flex-col divide-y ${cardBg} ${isDark ? "divide-slate-700" : "divide-gray-100"}`}>

          <div className="p-5 flex flex-col gap-2">
            <label className={`text-xs font-semibold uppercase tracking-wide ${labelText}`}>Sites</label>
            <Dropdown
              options={siteOptions}
              placeholder="Select sites"
              multiple
              multipleValue={selectedSites}
              onMultipleChange={(opts) => setSelectedSites(opts.map((o) => o.id as number))}
              searchable
              clearable
            />
          </div>

          <div className="p-5 flex flex-col gap-2">
            <label className={`text-xs font-semibold uppercase tracking-wide ${labelText}`}>Base Year</label>
            <p className={`text-xs ${mutedText}`}>The year all reduction targets are calculated from.</p>
            <div className="max-w-xs">
              <Dropdown
                options={yearOptions}
                placeholder="Select base year"
                value={baseYear}
                onChange={(opt) => setBaseYear(opt?.id as number)}
                clearable={false}
                searchable
              />
            </div>
          </div>

          <div className="p-5 flex flex-col gap-2">
            <label className={`text-xs font-semibold uppercase tracking-wide ${labelText}`}>Type of Target</label>
            <p className={`text-xs ${mutedText}`}>Near-term is 5–10 years. Long-term is Net-Zero by 2050.</p>
            <div className="flex gap-2 mt-1">
              {(["near-term", "long-term"] as SbtiTargetType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTargetType(t)}
                  className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
                    targetType === t ? activePill : inactivePill
                  }`}
                >
                  {t === "near-term" ? "Near-Term" : "Long-Term"}
                </button>
              ))}
            </div>
            {targetType === "long-term" && (
              <div className={`mt-2 text-xs px-3 py-2.5 rounded-lg flex items-start gap-2 ${
                isDark ? "bg-emerald-900/30 text-emerald-400" : "bg-emerald-50 text-emerald-700"
              }`}>
                <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
                </svg>
                Net-Zero target — 90% emission reduction by 2050. Annual reduction rate will be automatically calculated from your base year emissions.
              </div>
            )}
          </div>

          {targetType === "near-term" && (
            <div className="p-5 flex flex-col gap-2">
              <label className={`text-xs font-semibold uppercase tracking-wide ${labelText}`}>
                How Many Years?
              </label>
              <p className={`text-xs ${mutedText}`}>SBTi allows near-term targets of 5 or 10 years from base year.</p>
              <div className="flex gap-2 mt-1">
                {([5, 10] as NearTermHorizon[]).map((h) => (
                  <button
                    key={h}
                    onClick={() => setNearTermHorizon(h)}
                    className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
                      nearTermHorizon === h ? activePill : inactivePill
                    }`}
                  >
                    {h} Years
                    <span className={`block text-xs font-normal ${nearTermHorizon === h ? "text-emerald-100" : mutedText}`}>
                      Target: {baseYear + h}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {targetType === "near-term" && (
            <div className="p-5 flex flex-col gap-2">
              <label className={`text-xs font-semibold uppercase tracking-wide ${labelText}`}>
                Reduction Percentage
              </label>
              <p className={`text-xs ${mutedText}`}>Annual emission reduction rate aligned with the Paris Agreement.</p>
              <div className="flex flex-col gap-2 mt-1">
                {(["15C", "WB2C"] as SbtiPathway[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPathway(p)}
                    className={`w-full flex items-center justify-between py-3 px-4 rounded-lg text-sm font-semibold transition-all border ${
                      pathway === p
                        ? `${activePill} border-emerald-500`
                        : inactivePill
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          pathway === p ? "border-white" : isDark ? "border-slate-500" : "border-gray-300"
                        }`}
                      >
                        {pathway === p && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <div className="text-left">
                        <span>{p === "15C" ? "1.5°C Pathway" : "Well-Below 2°C Pathway"}</span>
                        <span className={`block text-xs font-normal ${pathway === p ? "text-emerald-100" : mutedText}`}>
                          {p === "15C" ? "Most ambitious — Paris Agreement" : "Moderate — Paris Agreement aligned"}
                        </span>
                      </div>
                    </div>
                    <span className={`text-base font-bold ${pathway === p ? "text-white" : "text-emerald-500"}`}>
                      {RATE_MAP[p] * 100}%
                      <span className={`text-xs font-normal ml-0.5 ${pathway === p ? "text-emerald-100" : mutedText}`}>/yr</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>

        <div className={`rounded-xl border p-4 ${summaryBg}`}>
          <p className={`text-xs font-semibold uppercase tracking-widest mb-3 ${summaryLabel}`}>Summary</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {targetType === "near-term" ? (
              <>
                {[
                  { label: "Base Year", value: baseYear || "—" },
                  { label: "Target Year", value: targetYear },
                  { label: "Pathway", value: pathway === "15C" ? "1.5°C" : "WB2°C" },
                  { label: "Rate / Year", value: `${RATE_MAP[pathway] * 100}%` },
                ].map((item) => (
                  <div key={item.label}>
                    <p className={`text-xs ${summaryLabel} opacity-70`}>{item.label}</p>
                    <p className={`text-base font-bold ${summaryLabel}`}>{item.value}</p>
                  </div>
                ))}
              </>
            ) : (
              <>
                {[
                  { label: "Base Year", value: baseYear || "—" },
                  { label: "Target Year", value: "2050" },
                  { label: "Goal", value: "Net-Zero" },
                  { label: "Reduction", value: "90%" },
                ].map((item) => (
                  <div key={item.label}>
                    <p className={`text-xs ${summaryLabel} opacity-70`}>{item.label}</p>
                    <p className={`text-base font-bold ${summaryLabel}`}>{item.value}</p>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isDark ? "text-slate-400 hover:text-slate-200" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            ← Back
          </button>
          <button
            disabled={!canApply}
            onClick={handleApply}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              canApply
                ? "bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            View Targets
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>

      </div>
    </div>
  );
};

export default SbtiNearTermFilters;