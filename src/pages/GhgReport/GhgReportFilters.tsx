

import React, { useEffect, useMemo } from "react";
import Dropdown, { DropdownOption } from "../../components/Dropdown";
import { generateYearOptions } from "../ManagerDashboard/utils/dateUtils";
import { Site, Category } from "../ManagerDashboard/types";
import { useTheme } from "../../context/ThemeContext";

export type YearType = "CY" | "FY";

interface Props {
  availableSites: Site[];
  selectedSites: number[];
  setSelectedSites: React.Dispatch<React.SetStateAction<number[]>>;
  selectedCategoryIds: number[];
  setSelectedCategoryIds: React.Dispatch<React.SetStateAction<number[]>>;
  yearType: YearType;
  setYearType: React.Dispatch<React.SetStateAction<YearType>>;
  year: number;
  setYear: React.Dispatch<React.SetStateAction<number>>;
  onProceed: () => void;
  onBack: () => void;
  loading?: boolean;
  errorMsg?: string;
}

const GhgReportFilters = ({
  availableSites,
  selectedSites,
  setSelectedSites,
  selectedCategoryIds,
  setSelectedCategoryIds,
  yearType,
  setYearType,
  year,
  setYear,
  onProceed,
  onBack,
  loading = false,
  errorMsg = "",
}: Props) => {
  const { isDark } = useTheme();

  useEffect(() => {
    if (availableSites.length > 0 && selectedSites.length === 0) {
      setSelectedSites([availableSites[0].site_id]);
    }
  }, [availableSites, selectedSites.length, setSelectedSites]);

  const siteOptions: DropdownOption[] = useMemo(
    () => availableSites.map((s) => ({ id: s.site_id, label: s.name })),
    [availableSites]
  );

  const categories: Category[] = useMemo(() => {
    const map = new Map<number, Category>();
    selectedSites.forEach((sid) => {
      const site = availableSites.find((s) => s.site_id === sid);
      site?.categories?.forEach((c) => {
        if (!map.has(c.category_id)) map.set(c.category_id, c);
      });
    });
    return Array.from(map.values());
  }, [selectedSites, availableSites]);

  const categoryOptions: DropdownOption[] = useMemo(
    () => categories.map((c) => ({ id: c.category_id, label: c.category_name })),
    [categories]
  );

  useEffect(() => {
    if (selectedCategoryIds.length === 0) return;
    const valid = new Set(categories.map((c) => c.category_id));
    const next = selectedCategoryIds.filter((id) => valid.has(id));
    if (next.length !== selectedCategoryIds.length) setSelectedCategoryIds(next);
  }, [categories, selectedCategoryIds, setSelectedCategoryIds]);

  const yearOptions = useMemo(() => generateYearOptions(), []);
  const canProceed = selectedSites.length > 0 && Boolean(yearType) && Boolean(year);

  const textPrimary = isDark ? "#f1f5f9" : "#0f172a";
  const textSub = isDark ? "#94a3b8" : "#64748b";
  const border = isDark ? "rgba(148,163,184,0.15)" : "rgba(203,213,225,0.8)";
  const cardBg = isDark ? "#111827" : "#ffffff";
  const pageBg = isDark ? "#0d1520" : "#f0faf9";
  const accent = "#0d9488";
  const accentDark = "#047857";

  const divider = (
    <div style={{ height: 1, background: border, margin: "28px 0" }} />
  );

  const Label = ({ text }: { text: string }) => (
    <p
      style={{
        margin: "0 0 5px",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.09em",
        textTransform: "uppercase" as const,
        color: textSub,
      }}
    >
      {text}
    </p>
  );

  const Hint = ({ text }: { text: string }) => (
    <p style={{ margin: "0 0 14px", fontSize: 13, color: textSub, lineHeight: 1.6 }}>
      {text}
    </p>
  );

  const summaryItems = [
    {
      label: "Sites",
      value:
        selectedSites.length === 0
          ? "—"
          : selectedSites.length === 1
          ? availableSites.find((s) => s.site_id === selectedSites[0])?.name ?? "1 site"
          : `${selectedSites.length} sites`,
    },
    { label: "Calendar", value: yearType === "CY" ? "CY" : "FY" },
    { label: "Year", value: year ? String(year) : "—" },
    {
      label: "Categories",
      value: selectedCategoryIds.length === 0 ? "All" : `${selectedCategoryIds.length} selected`,
    },
  ];

  return (
    <div
      style={{
        fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
        background: pageBg,
        minHeight: "100%",
        padding: "0 0 60px",
      }}
    >
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 20px" }}>

        {/* Page header */}
        <div style={{ padding: "36px 0 28px" }}>
          <h2
            style={{
              margin: "0 0 5px",
              fontSize: 22,
              fontWeight: 800,
              color: textPrimary,
              letterSpacing: "-0.01em",
            }}
          >
            Configure Report
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: textSub, lineHeight: 1.6 }}>
            Set your sites, reporting period, and emission categories.
          </p>
        </div>

        {/* Main form card */}
        <div
          style={{
            background: cardBg,
            border: `1px solid ${border}`,
            borderRadius: 18,
            padding: "32px 32px 28px",
            boxShadow: isDark
              ? "0 8px 40px rgba(0,0,0,0.4)"
              : "0 4px 24px rgba(0,0,0,0.06)",
          }}
        >
          {/* SITES */}
          <div>
            <Label text="Sites" />
            <Hint text="Select one or more sites to include in the emissions report." />
            <Dropdown
              options={siteOptions}
              placeholder="Search and select sites…"
              multiple
              multipleValue={selectedSites}
              onMultipleChange={(opts) =>
                setSelectedSites(opts.map((o) => o.id as number))
              }
              searchable
              clearable
            />
          </div>

          {divider}

          {/* REPORTING CALENDAR */}
          <div>
            <Label text="Reporting Calendar" />
            <Hint text="Calendar Year runs Jan–Dec. Fiscal Year runs Apr-Mar." />
            <div style={{ display: "flex", gap: 10 }}>
              {[
                { id: "CY" as YearType, label: "Calendar Year", sub: "Jan – Dec" },
                { id: "FY" as YearType, label: "Fiscal Year", sub: "Apr – Mar" },
              ].map((opt) => {
                const selected = yearType === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => setYearType(opt.id)}
                    style={{
                      flex: 1,
                      padding: "14px 20px",
                      borderRadius: 12,
                      border: `2px solid ${selected ? accent : border}`,
                      background: selected ? accent : "transparent",
                      color: selected ? "#fff" : textSub,
                      cursor: "pointer",
                      textAlign: "left" as const,
                      transition: "all 0.18s",
                      lineHeight: 1.3,
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>
                      {opt.label}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.8 }}>{opt.sub}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {divider}

          {/* YEAR */}
          <div>
            <Label text="Reporting Year" />
            <Hint text="The report will include the prior year automatically for comparison." />
            <div style={{ maxWidth: 260 }}>
              <Dropdown
                options={yearOptions}
                placeholder="Select year"
                value={year}
                onChange={(opt) => setYear(opt?.id as number)}
                clearable={false}
                searchable
              />
            </div>
          </div>

          {divider}

          {/* CATEGORIES */}
          <div>
            <Label text="Emission Categories" />
            <Hint text="Leave empty to include all categories. Select specific ones for a focused analysis." />
            <Dropdown
              options={categoryOptions}
              placeholder="All categories (default)"
              multiple
              multipleValue={selectedCategoryIds}
              onMultipleChange={(opts) =>
                setSelectedCategoryIds(opts.map((o) => o.id as number))
              }
              searchable
              clearable
            />
          </div>
        </div>

        {/* Summary card */}
        <div
          style={{
            marginTop: 16,
            background: isDark ? "rgba(13,148,136,0.08)" : "rgba(13,148,136,0.05)",
            border: `1px solid ${isDark ? "rgba(13,148,136,0.22)" : "rgba(13,148,136,0.18)"}`,
            borderRadius: 14,
            padding: "20px 24px",
          }}
        >
          <p
            style={{
              margin: "0 0 16px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.09em",
              textTransform: "uppercase" as const,
              color: accent,
            }}
          >
            Summary
          </p>
          <div style={{ display: "flex", gap: 0, flexWrap: "wrap" as const }}>
            {summaryItems.map((item, i) => (
              <div
                key={item.label}
                style={{
                  flex: "1 1 120px",
                  paddingRight: i < summaryItems.length - 1 ? 24 : 0,
                  marginRight: i < summaryItems.length - 1 ? 24 : 0,
                  borderRight:
                    i < summaryItems.length - 1
                      ? `1px solid ${isDark ? "rgba(13,148,136,0.2)" : "rgba(13,148,136,0.16)"}`
                      : "none",
                  paddingBottom: 4,
                }}
              >
                <div style={{ fontSize: 11, color: textSub, marginBottom: 5, fontWeight: 500 }}>
                  {item.label}
                </div>
                <div
                  style={{
                    fontSize: 17,
                    fontWeight: 800,
                    color: textPrimary,
                    letterSpacing: "-0.01em",
                    whiteSpace: "nowrap" as const,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Error */}
        {errorMsg && (
          <div
            style={{
              marginTop: 14,
              padding: "13px 18px",
              borderRadius: 12,
              background: isDark ? "rgba(239,68,68,0.1)" : "rgba(239,68,68,0.07)",
              border: "1px solid rgba(239,68,68,0.25)",
              color: isDark ? "#fca5a5" : "#dc2626",
              fontSize: 13,
              lineHeight: 1.6,
            }}
          >
            {errorMsg}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 24,
          }}
        >
          <button
            onClick={onBack}
            style={{
              background: "transparent",
              border: "none",
              color: textSub,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M10 4L6 8l4 4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back
          </button>

          <button
            onClick={onProceed}
            disabled={!canProceed || loading}
            style={{
              height: 48,
              padding: "0 36px",
              borderRadius: 12,
              border: "none",
              background:
                canProceed && !loading
                  ? `linear-gradient(135deg, ${accent}, ${accentDark})`
                  : isDark
                  ? "rgba(148,163,184,0.15)"
                  : "rgba(203,213,225,0.6)",
              color: canProceed && !loading ? "#fff" : textSub,
              fontWeight: 700,
              fontSize: 15,
              cursor: canProceed && !loading ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              gap: 10,
              boxShadow:
                canProceed && !loading ? "0 4px 20px rgba(13,148,136,0.35)" : "none",
              transition: "opacity 0.18s, transform 0.18s",
            }}
            onMouseEnter={(e) => {
              if (canProceed && !loading) {
                e.currentTarget.style.opacity = "0.9";
                e.currentTarget.style.transform = "translateY(-1px)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.opacity = "1";
              e.currentTarget.style.transform = "translateY(0)";
            }}
          >
            {loading ? (
              <>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  style={{ animation: "ghg-spin 1s linear infinite" }}
                >
                  <circle
                    cx="8"
                    cy="8"
                    r="6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeDasharray="20 18"
                  />
                </svg>
                Generating…
              </>
            ) : (
              <>
                View Report
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3 8h10M9 4l4 4-4 4"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>

      <style>{`@keyframes ghg-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

export default GhgReportFilters;
