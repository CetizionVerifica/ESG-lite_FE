
import  { useMemo } from "react";
import type { GhgReportTablesResponse } from "../../services/ghgreportService";

type Props = {
  data: GhgReportTablesResponse;
  isDark?: boolean;
};

type SiteCatRow = {
  siteId: number;
  siteName: string;
  categories: string[];
  count: number;
};

function buildSiteCategoryMap(
  rows: { category: string; bySite: { siteId: number; siteName: string; value?: number | null }[] }[]
): SiteCatRow[] {
  const map = new Map<number, { siteName: string; categories: Set<string> }>();

  for (const r of rows ?? []) {
    for (const s of r.bySite ?? []) {
      if ((s.value ?? 0) <= 0) continue;

      if (!map.has(s.siteId)) {
        map.set(s.siteId, { siteName: s.siteName, categories: new Set() });
      }
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
}

const GhgSiteCategoriesTable = ({ data, isDark }: Props) => {
  const selectedYear = data.filters.year;
  const compareYear = data.filters.compareYear;

  // ✅ pick rows for both years (adjust key names if yours differ)
  const selectedRows = data.tables.table_overviewByLocations_selectedYear?.rows ?? [];
  const compareRows = data.tables.table_overviewByLocations_compareYear?.rows ?? [];

  const selectedMap = useMemo(() => buildSiteCategoryMap(selectedRows), [selectedRows]);
  const compareMap = useMemo(() => buildSiteCategoryMap(compareRows), [compareRows]);

  const card = isDark ? "bg-slate-800 border-slate-700" : "bg-white border-gray-200";
  const headerBg = isDark ? "bg-slate-700 text-slate-100" : "bg-sky-100 text-gray-900";
  const border = isDark ? "border-slate-700" : "border-gray-200";
  const text = isDark ? "text-slate-100" : "text-gray-900";
  const sub = isDark ? "text-slate-300" : "text-gray-600";
  const rowHover = isDark ? "hover:bg-slate-700/40" : "hover:bg-gray-50";

  const Table = ({ title, rows }: { title: string; rows: SiteCatRow[] }) => (
    <div className={`rounded-lg border shadow-sm ${card}`}>
      <div className="px-4 py-3 border-b border-inherit">
        <div className={isDark ? "text-slate-100 font-semibold" : "text-gray-900 font-semibold"}>
          {title}
        </div>
      </div>

      <div className="p-4">
        {rows.length === 0 ? (
          <div className={`text-sm ${sub}`}>No site-category entries found.</div>
        ) : (
          <div className="overflow-auto">
            <table className={`min-w-225 w-full border ${border}`}>
              <thead>
                <tr className={headerBg}>
                  <th className={`border ${border} px-3 py-2 text-left text-sm`}>Site</th>
                  <th className={`border ${border} px-3 py-2 text-right text-sm`}># Categories</th>
                  <th className={`border ${border} px-3 py-2 text-left text-sm`}>Categories</th>
                </tr>
              </thead>
              <tbody className={text}>
                {rows.map((r) => (
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

  return (
    <div className="space-y-6">
      <Table title={`Sites and categories with submitted data (Year: ${compareYear})`} rows={compareMap} />
      <Table title={`Sites and categories with submitted data (Year: ${selectedYear})`} rows={selectedMap} />
    </div>
  );
};

export default GhgSiteCategoriesTable;
