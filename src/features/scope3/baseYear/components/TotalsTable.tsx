import { emissionsParts } from "../../../../ui";
import { type CategoryTotal, beforeAfterRows, signedT, totalLabel } from "../../../../lib/scope3/baseYear";

const t = (v: number) => emissionsParts(v).value;

/** Per-category tCO₂e: one column (what is frozen) or frozen beside today with the change. */
export function TotalsTable({ caption, totals, after }: { caption: string; totals: CategoryTotal[]; after?: CategoryTotal[] }) {
  const rows = after ? beforeAfterRows(totals, after) : beforeAfterRows(totals, totals);
  const sum = (key: "before" | "after") => Math.round(rows.reduce((a, r) => a + r[key], 0) * 1000) / 1000; // #209: 3 dp
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[20rem] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th scope="col" className="py-1.5 pr-3 font-medium">Category</th>
            <th scope="col" className="py-1.5 pr-3 text-right font-medium">{after ? "Frozen, tCO₂e" : "tCO₂e"}</th>
            {after && <th scope="col" className="py-1.5 pr-3 text-right font-medium">Today, tCO₂e</th>}
            {after && <th scope="col" className="py-1.5 text-right font-medium">Change</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={after ? 4 : 2} className="py-2 text-muted">No emissions.</td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={String(r.n)} className="border-b border-line/60">
              <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink">{totalLabel(r.n)}</th>
              <td className="py-1.5 pr-3 text-right tabular-nums">{t(r.before)}</td>
              {after && <td className="py-1.5 pr-3 text-right tabular-nums">{t(r.after)}</td>}
              {after && <td className="py-1.5 text-right tabular-nums text-muted">{r.delta ? signedT(r.delta) : "—"}</td>}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-medium text-ink">
            <th scope="row" className="py-1.5 pr-3 text-left">Scope 3 total</th>
            <td className="py-1.5 pr-3 text-right tabular-nums">{t(sum("before"))}</td>
            {after && <td className="py-1.5 pr-3 text-right tabular-nums">{t(sum("after"))}</td>}
            {after && <td className="py-1.5 text-right tabular-nums">{signedT(sum("after") - sum("before"))}</td>}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
