import React, { useMemo } from "react";
import type { GhgReportTablesResponse } from "../../services/ghgreportService";

type Props = {
  data: GhgReportTablesResponse;
  isDark?: boolean;
};

const GhgSiteCategoriesTable = ({ data, isDark }: Props) => {
  const selectedYear = data.filters.year;
  const rows = data.tables.table_overviewByLocations_selectedYear.rows;

  const siteCategoryMap = useMemo(() => {
    const map = new Map<number, { siteName: string; categories: Set<string> }>();

    for (const r of rows) {
      for (const s of r.bySite) {
        if ((s.value ?? 0) <= 0) continue;
        if (!map.has(s.siteId)) map.set(s.siteId, { siteName: s.siteName, categories: new Set() });
        map.get(s.siteId)!.categories.add(r.category);
      }
    }

    return Array.from(map.entries())
      .map(([siteId, v]) => ({
        siteId,
        siteName: v.siteName,
        categories: Array.from(v.categories).sort((a, b) => a.localeCompare(b)),
        count: v.categories.size,
      }))
      .sort((a, b) => a.siteName.localeCompare(b.siteName));
  }, [rows]);

  const card = isDark ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200";
  const headerBg = isDark ? "bg-slate-700 text-slate-100" : "bg-sky-100 text-gray-900";
  const border = isDark ? "border-slate-700" : "border-gray-200";
  const text = isDark ? "text-slate-100" : "text-gray-900";
  const sub = isDark ? "text-slate-300" : "text-gray-600";
  const rowHover = isDark ? "hover:bg-slate-700/40" : "hover:bg-gray-50";

  return (
    <div className={`rounded-lg border shadow-sm ${card}`}>
      <div className="px-4 py-3 border-b border-inherit">
        <div className={isDark ? "text-slate-100 font-semibold" : "text-gray-900 font-semibold"}>
          Sites and categories with submitted data (Year: {selectedYear})
        </div>
      </div>

      <div className="p-4">
        {siteCategoryMap.length === 0 ? (
          <div className={`text-sm ${sub}`}>No site-category entries found.</div>
        ) : (
          <div className="overflow-auto">
            <table className={`min-w-[900px] w-full border ${border}`}>
              <thead>
                <tr className={headerBg}>
                  <th className={`border ${border} px-3 py-2 text-left text-sm`}>Site</th>
                  <th className={`border ${border} px-3 py-2 text-right text-sm`}># Categories</th>
                  <th className={`border ${border} px-3 py-2 text-left text-sm`}>Categories</th>
                </tr>
              </thead>
              <tbody className={text}>
                {siteCategoryMap.map((r) => (
                  <tr key={r.siteId} className={rowHover}>
                    <td className={`border ${border} px-3 py-2 text-sm font-medium`}>{r.siteName}</td>
                    <td className={`border ${border} px-3 py-2 text-right text-sm`}>{r.count}</td>
                    <td className={`border ${border} px-3 py-2 text-sm`}>
                      {r.categories.length ? r.categories.join(", ") : <span className={sub}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default GhgSiteCategoriesTable;
