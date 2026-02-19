import React, { useMemo } from "react";
import type { GhgReportTablesResponse, OverviewRow} from "../../services/ghgreportService";

function fmt(n: number) {
  return (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function fmtPct(n: number) {
  return `${(Number(n) || 0).toFixed(2)}%`;
}

function formatPeriodLabel(
  yearType: "CY" | "FY",
  year: number,
  ranges?: Record<string, { startDate: string; endDate: string }>
) {
  if (!ranges || !ranges[String(year)]) return `${yearType} ${year}`;

  const { startDate, endDate } = ranges[String(year)];

  const fmtMY = (iso: string) => {
    const d = new Date(iso);
    // Force "Mon YYYY" display in a stable way.
    return d.toLocaleString("en-US", { month: "short", year: "numeric" });
  };

  if (yearType === "FY") {
    return `FY ${year} (${fmtMY(startDate)} – ${fmtMY(endDate)})`;
  }
  return `CY ${year} (${fmtMY(startDate)} – ${fmtMY(endDate)})`;
}

const TableCard = ({
  title,
  children,
  isDark,
}: {
  title: string;
  children: React.ReactNode;
  isDark?: boolean;
}) => {
  const card = isDark ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200";
  const titleCls = isDark ? "text-slate-100" : "text-gray-900";
  return (
    <div className={`rounded-lg border shadow-sm ${card}`}>
      <div className="px-4 py-3 border-b border-inherit">
        <div className={`font-semibold ${titleCls}`}>{title}</div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
};

const OverviewTable = ({
  rows,
  isDark,
}: {
  rows: OverviewRow[];
  year: number;
  isDark?: boolean;
}) => {
  const sites = useMemo(() => {
    const map = new Map<number, { siteId: number; siteName: string }>();
    rows.forEach((r) => {
      r.bySite.forEach((s) => {
        if (!map.has(s.siteId)) map.set(s.siteId, { siteId: s.siteId, siteName: s.siteName });
      });
    });
    return Array.from(map.values()).sort((a, b) => a.siteName.localeCompare(b.siteName));
  }, [rows]);

  const headerBg = isDark ? "bg-slate-700 text-slate-100" : "bg-sky-100 text-gray-900";
  const border = isDark ? "border-slate-700" : "border-gray-200";
  const rowHover = isDark ? "hover:bg-slate-700/40" : "hover:bg-gray-50";
  const text = isDark ? "text-slate-100" : "text-gray-900";
  const sub = isDark ? "text-slate-300" : "text-gray-600";

  const valueByRowSite = (r: OverviewRow, siteId: number) => {
    return r.bySite.find((x) => x.siteId === siteId)?.value ?? 0;
  };

  return (
    <div className="overflow-auto">
      <table className={`min-w-225 w-full border ${border}`}>
        <thead>
          <tr className={headerBg}>
            <th className={`border ${border} px-3 py-2 text-left text-sm`}>Scope</th>
            <th className={`border ${border} px-3 py-2 text-left text-sm`}>Categories</th>
            {sites.map((s) => (
              <th key={s.siteId} className={`border ${border} px-3 py-2 text-right text-sm whitespace-nowrap`}>
                {s.siteName}
              </th>
            ))}
            <th className={`border ${border} px-3 py-2 text-right text-sm whitespace-nowrap`}>Total (tCO₂e)</th>
          </tr>
        </thead>

        <tbody className={text}>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={sites.length + 3} className={`px-3 py-3 text-sm ${sub}`}>
                No data available.
              </td>
            </tr>
          ) : (
            rows.map((r, idx) => (
              <tr key={`${r.scope}-${r.category}-${idx}`} className={rowHover}>
                <td className={`border ${border} px-3 py-2 text-sm whitespace-nowrap`}>{r.scope}</td>
                <td className={`border ${border} px-3 py-2 text-sm`}>{r.category}</td>
                {sites.map((s) => (
                  <td key={s.siteId} className={`border ${border} px-3 py-2 text-right text-sm`}>
                    {fmt(valueByRowSite(r, s.siteId))}
                  </td>
                ))}
                <td className={`border ${border} px-3 py-2 text-right text-sm font-semibold`}>{fmt(r.total)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

const GhgReportTables = ({ data, isDark }: { data: GhgReportTablesResponse; isDark?: boolean }) => {
 // const table1 = data.tables.table1_emissionsByScope_twoYears;

  const compYear = data.filters.compareYear;
  const selectedYear = data.filters.year;

  const compLabel = formatPeriodLabel(data.filters.yearType, compYear, data.ranges);
  const selectedLabel = formatPeriodLabel(data.filters.yearType, selectedYear, data.ranges);

  const headerBg = isDark ? "bg-slate-700 text-slate-100" : "bg-sky-100 text-gray-900";
  const border = isDark ? "border-slate-700" : "border-gray-200";
  const rowHover = isDark ? "hover:bg-slate-700/40" : "hover:bg-gray-50";
  const text = isDark ? "text-slate-100" : "text-gray-900";

  const compOverview = data.tables.table_overviewByLocations_compareYear;
  const selectedOverview = data.tables.table_overviewByLocations_selectedYear;

  const table1Title = `Table 1: Emissions by Scope for ${compLabel} and ${selectedLabel}`;
  const overviewTitleComp = `Overview of emissions for all locations for ${compLabel}`;
  const overviewTitleSelected = `Overview of emissions for all locations for ${selectedLabel}`;

  return (
    <div className="space-y-8">
      {/* TABLE 1 */}
      <TableCard isDark={isDark} title={table1Title}>
        <div className="overflow-auto">
          <table className={`min-w-205 w-full border ${border}`}>
            <thead>
              <tr className={headerBg}>
                <th className={`border ${border} px-3 py-2 text-left text-sm`}>Scope</th>
                <th className={`border ${border} px-3 py-2 text-right text-sm whitespace-nowrap`}>
                  {compLabel} Total (tCO₂e)
                </th>
                <th className={`border ${border} px-3 py-2 text-right text-sm whitespace-nowrap`}>
                  {compLabel} % of Total
                </th>
                <th className={`border ${border} px-3 py-2 text-right text-sm whitespace-nowrap`}>
                  {selectedLabel} Total (tCO₂e)
                </th>
                <th className={`border ${border} px-3 py-2 text-right text-sm whitespace-nowrap`}>
                  {selectedLabel} % of Total
                </th>
              </tr>
            </thead>

        <tbody className={text}>
  {data.tables.table1_emissionsByScope_twoYears.map((r: any, idx: number) => {
    const c = r.values?.[String(compYear)];
    const s = r.values?.[String(selectedYear)];
    const isTotal = String(r.scope).toLowerCase().includes("total");

    return (
      <tr key={`${r.scope}-${idx}`} className={rowHover}>
        <td className={`border ${border} px-3 py-2 text-sm font-semibold`}>{r.scope}</td>

        <td className={`border ${border} px-3 py-2 text-right text-sm ${isTotal ? "font-semibold" : ""}`}>
          {fmt(c?.emissions ?? 0)}
        </td>
        <td className={`border ${border} px-3 py-2 text-right text-sm`}>
          {fmtPct(c?.pctOfTotal ?? 0)}
        </td>

        <td className={`border ${border} px-3 py-2 text-right text-sm ${isTotal ? "font-semibold" : ""}`}>
          {fmt(s?.emissions ?? 0)}
        </td>
        <td className={`border ${border} px-3 py-2 text-right text-sm`}>
          {fmtPct(s?.pctOfTotal ?? 0)}
        </td>
      </tr>
    );
  })}
</tbody>

          </table>
        </div>
      </TableCard>

      {/* OVERVIEW (COMPARE YEAR) */}
      <TableCard isDark={isDark} title={overviewTitleComp}>
        <OverviewTable rows={compOverview.rows} year={compOverview.year} isDark={isDark} />
      </TableCard>

      {/* OVERVIEW (SELECTED YEAR) */}
      <TableCard isDark={isDark} title={overviewTitleSelected}>
        <OverviewTable rows={selectedOverview.rows} year={selectedOverview.year} isDark={isDark} />
      </TableCard>
    </div>
  );
};

export default GhgReportTables;
