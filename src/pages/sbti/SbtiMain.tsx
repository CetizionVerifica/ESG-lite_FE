import { useState } from "react";
import { useTheme } from "../../context/ThemeContext";
import SbtiNearTermFilters from "./SbtiNearTermFilters";
import { SbtiFilterConfig } from "./SbtiNearTermFilters";
import SbtiNearTerm from "./SbtiNearTerm";
import SbtiLongTerm from "./SbtiLongTerm";

type View = "landing" | "filters" | "near-term" | "long-term";

const SbtiMain = () => {
  const { isDark } = useTheme();
  const [view, setView] = useState<View>("landing");
  const [config, setConfig] = useState<SbtiFilterConfig | null>(null);

  const handleFilterApply = (cfg: SbtiFilterConfig) => {
    setConfig(cfg);
    if (cfg.targetType === "near-term") {
      setView("near-term");
    } else {
      setView("long-term");
    }
  };

  if (view === "filters") {
    return (
      <SbtiNearTermFilters
        onApply={handleFilterApply}
        onBack={() => setView("landing")}
      />
    );
  }

  if (view === "near-term" && config) {
    return (
      <SbtiNearTerm
        config={config}
        onBack={() => setView("filters")}
      />
    );
  }

  if (view === "long-term" && config) {
    return (
      <SbtiLongTerm
        config={config}
        onBack={() => setView("filters")}
      />
    );
  }

  const bg = isDark ? "bg-slate-900 text-slate-100" : "bg-gray-50 text-gray-900";
  const cardBg = isDark ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200";
  const heroBg = isDark
    ? "bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700"
    : "bg-gradient-to-br from-emerald-700 to-emerald-900 border-emerald-800";
  const mutedText = isDark ? "text-slate-400" : "text-gray-500";

  const rules = [
    {
      num: "01",
      title: "Near-Term Targets",
      desc: "Set targets 5–10 years from now aligned with a 1.5°C or Well-Below 2°C pathway.",
      color: "text-emerald-400",
      ring: isDark ? "border-emerald-500" : "border-emerald-300",
    },
    {
      num: "02",
      title: "Net-Zero by 2050",
      desc: "Long-term goal — reduce emissions by over 90% across all scopes by 2050.",
      color: "text-teal-400",
      ring: isDark ? "border-teal-500" : "border-teal-300",
    },
    {
      num: "03",
      title: "Base Year",
      desc: "Base year for all calculations cannot be earlier than 2015 as per SBTi rules.",
      color: "text-amber-400",
      ring: isDark ? "border-amber-500" : "border-amber-300",
    },
    {
      num: "04",
      title: "Scope 1 & 2",
      desc: "Targets must cover at least 95% of all Scope 1 and Scope 2 emissions. Mandatory.",
      color: "text-blue-400",
      ring: isDark ? "border-blue-500" : "border-blue-300",
    },
    {
      num: "05",
      title: "Scope 3",
      desc: "If Scope 3 exceeds 40% of total emissions, a Scope 3 reduction target is mandatory.",
      color: "text-lime-400",
      ring: isDark ? "border-lime-500" : "border-lime-300",
    },
  ];

  return (
    <div className={`min-h-screen ${bg}`}>
      <div className="max-w-5xl mx-auto px-6 py-10 flex flex-col gap-6">

        <div className={`rounded-2xl border px-8 py-10 flex flex-col items-center text-center gap-3 ${heroBg}`}>
          <span className={`text-xs font-bold tracking-widest uppercase px-3 py-1 rounded-full ${
            isDark ? "bg-emerald-500/20 text-emerald-400" : "bg-white/20 text-white"
          }`}>
            Science Based Targets initiative
          </span>

          <h1 className="text-2xl font-bold mt-1 text-white">
            What You Need to Know Before Setting Your Targets
          </h1>

          <p className={`text-sm max-w-xl ${isDark ? "text-slate-400" : "text-emerald-100"}`}>
            "Companies must reduce emissions at a rate consistent with climate science — not just set ambitions, but follow a defined, verifiable pathway."
          </p>

          <div className="w-full mt-8 overflow-x-auto pb-2">
            <div className="flex items-start justify-center min-w-160">
              {rules.map((rule, i) => (
                <div key={rule.num} className="flex items-center">
                  <div className="flex flex-col items-center gap-4 w-32">
                    <div className={`w-24 h-24 rounded-full border-2 flex flex-col items-center justify-center shrink-0 bg-white/10 ${rule.ring}`}>
                      {/* <span className={`text-xl font-black leading-none ${rule.color}`}>{rule.num}</span> */}
                      <span className={`text-[12px] font-bold mt-1 tracking-wide text-center px-2 leading-tight ${rule.color}`}>
                        {rule.title.toUpperCase()}
                      </span>
                    </div>
                    <p className={`text-xs leading-relaxed text-center px-1 ${isDark ? "text-slate-400" : "text-white/80"}`}>
                      {rule.desc}
                    </p>
                  </div>
                  {i < rules.length - 1 && (
                    <div className={`w-4 h-px mb-16 shrink-0 ${isDark ? "bg-slate-600" : "bg-white/30"}`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={`rounded-xl border p-5 ${cardBg}`}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <div>
              <p className="text-sm font-semibold mb-0.5">Ready to set your commitment?</p>
              <p className={`text-xs ${mutedText}`}>
                Configure your sites, base year, target type, and reduction pathway in the next step.
              </p>
            </div>
            <button
              onClick={() => setView("filters")}
              className="shrink-0 flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 active:scale-95 transition-all text-white font-semibold px-6 py-2.5 rounded-lg text-sm"
            >
              Set My Commitment
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SbtiMain;