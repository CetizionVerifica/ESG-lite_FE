import { useMemo } from "react";

type Totals = {
  scope1: number;
  scope2: number;
  scope3: number;
  total: number;
};
type BySiteRow = {
  siteId: number;
  siteName: string;
  scope1: number;
  scope2: number;
  scope3: number;
  total: number;
  pctOfTotal: number;
};

interface Props {
  totals: Totals | null;
  bySite: BySiteRow[];
  isDark?: boolean;
}
const format = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : "0.00");

const EdeReportTable: React.FC<Props> = ({ totals, bySite, isDark = false }) => {
  const cardClass = isDark
    ? "bg-slate-800 border border-slate-700 rounded-lg p-4"
    : "bg-white rounded-lg shadow p-4";

  const thClass = isDark
    ? "text-left text-xs font-semibold text-slate-300 uppercase tracking-wide py-2 px-3 border-b border-slate-700"
    : "text-left text-xs font-semibold text-gray-600 uppercase tracking-wide py-2 px-3 border-b";

  const tdClass = isDark
    ? "py-2 px-3 text-sm text-slate-100 border-b border-slate-700"
    : "py-2 px-3 text-sm text-gray-800 border-b";

  const muted = isDark ? "text-slate-400" : "text-gray-500";
//   const overallRows = useMemo(() => {
//     if (!totals) return [];
//     const total = totals.total || 0;

//     return [
//       { label: "Scope 1", value: totals.scope1, pct: total ? (totals.scope1 / total) * 100 : 0 },
//       { label: "Scope 2", value: totals.scope2, pct: total ? (totals.scope2 / total) * 100 : 0 },
//       { label: "Scope 3", value: totals.scope3, pct: total ? (totals.scope3 / total) * 100 : 0 },
//     ].map((r) => ({ ...r, pct: Number(r.pct.toFixed(2)) }));
//   }, [totals]);

  const footerTotals = useMemo(() => {
    const s1 = bySite.reduce((a, b) => a + (b.scope1 || 0), 0);
    const s2 = bySite.reduce((a, b) => a + (b.scope2 || 0), 0);
    const s3 = bySite.reduce((a, b) => a + (b.scope3 || 0), 0);
    const total = bySite.reduce((a, b) => a + (b.total || 0), 0);
    return { s1, s2, s3, total };
  }, [bySite]);
  console.log("totals", totals)

 return (
    <div className="space-y-5">
      {/* 1) OVERALL TOTALS (Scope-wise) */}
      {/* <div className={cardClass}>
        <div className="flex items-end justify-between mb-3">
          <div className="text-lg font-semibold">Overall Totals</div>
          {totals && (
            <div className={`text-sm ${muted}`}>
              Total:{" "}
              <span className={isDark ? "text-slate-200" : "text-gray-900"}>
                {format(totals.total)}
              </span>{" "}
              tCO2e
            </div>
          )}
        </div>

        {!totals ? (
          <div className={muted}>No totals available.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={thClass}>Scope</th>
                  <th className={thClass}>Emissions (tCO2e)</th>
                  <th className={thClass}>% of Total</th>
                </tr>
              </thead>
              <tbody>
                {overallRows.map((r) => (
                  <tr key={r.label}>
                    <td className={tdClass}>{r.label}</td>
                    <td className={tdClass}>{format(r.value)}</td>
                    <td className={tdClass}>{r.pct.toFixed(2)}%</td>
                  </tr>
                ))}

                <tr>
                  <td className={`${tdClass} font-semibold`}>Total</td>
                  <td className={`${tdClass} font-semibold`}>{format(totals.total)}</td>
                  <td className={`${tdClass} font-semibold`}>100.00%</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div> */}

      <div className={cardClass}>
        <div className="flex items-end justify-between mb-3">
          <div className="text-lg font-semibold">Total Organizational Footprint</div>
          <div className={`text-sm ${muted}`}>{bySite.length} site(s)</div>
        </div>

        {bySite.length === 0 ? (
          <div className={muted}>No site breakdown available.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={thClass}>Site</th>
                  <th className={thClass}>Total Emissions (tCO2e)</th>
                  <th className={thClass}>Scope 1</th>
                  <th className={thClass}>Scope 2</th>
                  <th className={thClass}>Scope 3</th>
                </tr>
              </thead>
              <tbody>
                {bySite.map((row) => (
                  <tr key={row.siteId}>
                    <td className={tdClass}>{row.siteName}</td>
                    <td className={`${tdClass} font-semibold`}>{format(row.total)}</td>
                    <td className={tdClass}>{format(row.scope1)}</td>
                    <td className={tdClass}>{format(row.scope2)}</td>
                    <td className={tdClass}>{format(row.scope3)}</td>
                  </tr>
                ))}

                <tr>
                  <td className={`${tdClass} font-semibold`}>Combined Total</td>
                  <td className={`${tdClass} font-semibold`}>{format(footerTotals.total)}</td>
                  <td className={`${tdClass} font-semibold`}>{format(footerTotals.s1)}</td>
                  <td className={`${tdClass} font-semibold`}>{format(footerTotals.s2)}</td>
                  <td className={`${tdClass} font-semibold`}>{format(footerTotals.s3)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={cardClass}>
        <div className="flex items-end justify-between mb-3">
          <div className="text-lg font-semibold">Emissions Distribution by Site</div>
          <div className={`text-sm ${muted}`}>% of Total</div>
        </div>

        {bySite.length === 0 ? (
          <div className={muted}>No data available.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={thClass}>Site</th>
                  <th className={thClass}>Percentage of Total</th>
                </tr>
              </thead>
              <tbody>
                {bySite.map((row) => (
                  <tr key={`${row.siteId}-pct`}>
                    <td className={tdClass}>{row.siteName}</td>
                    <td className={tdClass}>{row.pctOfTotal.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
 )
}

export default EdeReportTable;
