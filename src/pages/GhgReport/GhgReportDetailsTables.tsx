import React, { useMemo } from "react";
import type { GhgReportDetailsResponse, GhgDetailsRow } from "../../services/ghgreportService";

function fmt(n: number) {
  return (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// function formatPeriodLabel(
//   yearType: "CY" | "FY",
//   year: number,
//   ranges?: Record<string, { startDate: string; endDate: string }>
// ) {
//   if (!ranges || !ranges[String(year)]) return `${yearType} ${year}`;
//   const { startDate, endDate } = ranges[String(year)];
//   const fmtMY = (iso: string) =>
//     new Date(iso).toLocaleString("en-US", { month: "short", year: "numeric" });
//   return yearType === "FY"
//     ? `FY ${year} (${fmtMY(startDate)} – ${fmtMY(endDate)})`
//     : `CY ${year} (${fmtMY(startDate)} – ${fmtMY(endDate)})`;
// }


function formatPeriodLabel(yearType: "CY" | "FY", year: number) {
  if (yearType === "CY") {
    return `CY ${year} (Jan ${year} – Dec ${year})`;
  }

  const startYear = year - 1;
  return `FY ${year} (Apr ${startYear} – Mar ${year})`;
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

type Props = {
  data: GhgReportDetailsResponse;
  isDark?: boolean;
};

const GhgReportDetailsTables = ({ data, isDark }: Props) => {
  const compYear = data.filters.compareYear;
  const selectedYear = data.filters.year;

  const compLabel = formatPeriodLabel(data.filters.yearType, compYear);
  const selectedLabel = formatPeriodLabel(data.filters.yearType, selectedYear);

  const rowsByScope = useMemo(() => {
    const s1: GhgDetailsRow[] = [];
    const s2: GhgDetailsRow[] = [];
    const s3: GhgDetailsRow[] = [];

    for (const r of data.rows) {
      if (r.scope === "Scope 1") s1.push(r);
      else if (r.scope === "Scope 2") s2.push(r);
      else if (r.scope === "Scope 3") s3.push(r);
    }

    const sortFn = (a: GhgDetailsRow, b: GhgDetailsRow) =>
      a.categoryName.localeCompare(b.categoryName) ||
      a.siteName.localeCompare(b.siteName) ||
      a.fuelType.localeCompare(b.fuelType);

    s1.sort(sortFn);
    s2.sort((a, b) => a.siteName.localeCompare(b.siteName));
    s3.sort(sortFn);

    return { s1, s2, s3 };
  }, [data.rows]);

  const headerBg = isDark ? "bg-slate-700 text-slate-100" : "bg-sky-100 text-gray-900";
  const border = isDark ? "border-slate-700" : "border-gray-200";
  const text = isDark ? "text-slate-100" : "text-gray-900";
  const sub = isDark ? "text-slate-300" : "text-gray-600";
  const rowHover = isDark ? "hover:bg-slate-700/40" : "hover:bg-gray-50";

  const ScopeDetailedTable = ({ title, rows }: { title: string; rows: GhgDetailsRow[] }) => (
    <TableCard isDark={isDark} title={title}>
      {rows.length === 0 ? (
        <div className={`text-sm ${sub}`}>No data available.</div>
      ) : (
        <div className="overflow-auto">
          <table className={`min-w-325 w-full border ${border}`}>
            <thead>
              <tr className={headerBg}>
                <th rowSpan={2} className={`border ${border} px-3 py-2 text-left text-sm`}>
                  Category
                </th>
                <th rowSpan={2} className={`border ${border} px-3 py-2 text-left text-sm`}>
                  Location
                </th>
                <th rowSpan={2} className={`border ${border} px-3 py-2 text-left text-sm`}>
                  Emission Category
                </th>
                <th colSpan={3} className={`border ${border} px-3 py-2 text-center text-sm`}>
                  {compLabel}
                </th>
                <th colSpan={3} className={`border ${border} px-3 py-2 text-center text-sm`}>
                  {selectedLabel}
                </th>
              </tr>
              <tr className={headerBg}>
                <th className={`border ${border} px-3 py-2 text-right text-sm`}>Consumption</th>
                <th className={`border ${border} px-3 py-2 text-left text-sm`}>Unit</th>
                <th className={`border ${border} px-3 py-2 text-right text-sm`}>Emissions (tCO₂e)</th>
                <th className={`border ${border} px-3 py-2 text-right text-sm`}>Consumption</th>
                <th className={`border ${border} px-3 py-2 text-left text-sm`}>Unit</th>
                <th className={`border ${border} px-3 py-2 text-right text-sm`}>Emissions (tCO₂e)</th>
              </tr>
            </thead>
            <tbody className={text}>
              {rows.map((r, idx) => (
                <tr key={`${r.scope}-${r.categoryId}-${r.siteId}-${r.fuelType}-${idx}`} className={rowHover}>
                  <td className={`border ${border} px-3 py-2 text-sm`}>{r.categoryName}</td>
                  <td className={`border ${border} px-3 py-2 text-sm`}>{r.siteName}</td>
                  <td className={`border ${border} px-3 py-2 text-sm`}>{r.fuelType}</td>

                  <td className={`border ${border} px-3 py-2 text-right text-sm`}>
                    {fmt(r.compare.consumption)}
                  </td>
                  <td className={`border ${border} px-3 py-2 text-sm`}>
                    {r.compare.unit || r.selected.unit || "—"}
                  </td>
                  <td className={`border ${border} px-3 py-2 text-right text-sm`}>
                    {fmt(r.compare.emissions)}
                  </td>

                  <td className={`border ${border} px-3 py-2 text-right text-sm`}>
                    {fmt(r.selected.consumption)}
                  </td>
                  <td className={`border ${border} px-3 py-2 text-sm`}>
                    {r.selected.unit || r.compare.unit || "—"}
                  </td>
                  <td className={`border ${border} px-3 py-2 text-right text-sm font-semibold`}>
                    {fmt(r.selected.emissions)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TableCard>
  );

  const Scope2Table = ({ rows }: { rows: GhgDetailsRow[] }) => (
    <ScopeDetailedTable
      title={`Indirect GHG Emissions: Scope 2 — for ${compLabel} & ${selectedLabel}`}
      rows={rows}
    />
  );

  return (
    <div className="space-y-8">
      <ScopeDetailedTable
        title={`Direct GHG Emissions: Scope 1 — for ${compLabel} & ${selectedLabel}`}
        rows={rowsByScope.s1}
      />
      <Scope2Table rows={rowsByScope.s2} />
      <ScopeDetailedTable
        title={`Indirect GHG Emissions: Scope 3 — for ${compLabel} & ${selectedLabel}`}
        rows={rowsByScope.s3}
      />
    </div>
  );
};

export default GhgReportDetailsTables;
