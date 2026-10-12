import { dataSplit, dqrMatrix, dqrWord, type ResultDetail } from "../logic";

const fmt = (v: number | null, digits = 1) => (v == null ? "—" : v.toLocaleString("en-GB", { maximumFractionDigits: digits }));

type Props = { result: ResultDetail; unitText: string };

/** DQR matrix per stage and the primary vs secondary split (spec §5 Data quality). */
export function DataQualityTab({ result, unitText }: Props) {
  const rows = dqrMatrix(result.lines);
  const split = dataSplit(result.lines);
  if (rows.length === 0) return <p className="text-sm text-muted">This calculation has no input lines.</p>;
  const primaryPct = result.primary_data_share_pct ?? split.primary_pct;
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h3 className="text-sm font-medium text-ink">Primary vs secondary data</h3>
        {primaryPct == null ? (
          <p className="text-sm text-muted">Hidden while a licensed factor is in the calculation.</p>
        ) : (
          <>
            <div className="flex h-3 w-full max-w-xl overflow-hidden rounded-full bg-tint" role="img" aria-label={`Primary data ${fmt(primaryPct, 0)}%, secondary ${fmt(100 - primaryPct, 0)}%`}>
              <span className="bg-good" style={{ width: `${primaryPct}%` }} />
              <span className="bg-warn" style={{ width: `${100 - primaryPct}%` }} />
            </div>
            <p className="text-sm text-muted">
              <span className="text-ink">{fmt(primaryPct, 0)}% primary</span> (supplier-specific figures and the site's approved plant data), {fmt(100 - primaryPct, 0)}% secondary (database factors)
              {split.by_lines ? ", by line count" : `, by share of the ${unitText}`}.
            </p>
          </>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium text-ink">Data quality rating</h3>
        <p className="text-sm text-muted">1 is best, 3 is worst. Averages are weighted by each line's share of the footprint{result.hidden_stages.length ? " where it is visible" : ""}.</p>
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <caption className="sr-only">DQR by stage</caption>
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-2 py-2">Stage</th>
                <th scope="col" className="px-2 py-2 text-right">Lines</th>
                <th scope="col" className="px-2 py-2 text-right">Technology</th>
                <th scope="col" className="px-2 py-2 text-right">Geography</th>
                <th scope="col" className="px-2 py-2 text-right">Time</th>
                <th scope="col" className="px-2 py-2 text-right">Overall</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {rows.map((r) => (
                <tr key={r.stage} className={r.stage === "all" ? "border-t border-line font-medium" : "border-b border-line last:border-0"}>
                  <th scope="row" className="px-2 py-2 text-left font-normal text-ink">
                    {r.label}
                  </th>
                  <td className="px-2 py-2 text-right text-muted">{r.lines}</td>
                  <td className="px-2 py-2 text-right">{fmt(r.technology)}</td>
                  <td className="px-2 py-2 text-right">{fmt(r.geography)}</td>
                  <td className="px-2 py-2 text-right">{fmt(r.time)}</td>
                  <td className="px-2 py-2 text-right text-ink">
                    {fmt(r.overall)}
                    {r.overall != null && <span className="ml-1 text-xs text-muted">{dqrWord(r.overall)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-1">
        <h3 className="text-sm font-medium text-ink">Cut-off</h3>
        <p className="text-sm text-muted">
          {result.cut_off.below_threshold_ids == null
            ? "Hidden while a licensed factor is in the calculation."
            : result.cut_off.below_threshold_ids.length === 0
              ? "No input is under the 1% cut-off; everything counts in the total."
              : `${result.cut_off.below_threshold_ids.length} input${result.cut_off.below_threshold_ids.length === 1 ? "" : "s"} under the 1% cut-off, ${fmt(result.cut_off.below_threshold_total_pct, 2)}% of the total together${result.cut_off.within_limit === false ? ", over the 5% limit" : ""}.`}
        </p>
      </section>
    </div>
  );
}
