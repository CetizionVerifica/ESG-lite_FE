import { Button, EmptyState, SkeletonText, emissionsParts, formatDate } from "../../../ui";
import { type BaseYearResponse, RECALC_REASON_LABEL, beforeAfterRows, signedT, totalLabel } from "../../../lib/scope3/baseYear";
import type { Scope3Report } from "../../../lib/scope3/report";

const t = (v: number) => emissionsParts(v).value;

/**
 * S3-14 base year in the Methodology tab (checklist R6): year, rationale,
 * policy and threshold, frozen Scope 3 by category beside this report's year,
 * and each approved recalculation with reason, change and note.
 */
type Props = {
  data: BaseYearResponse | undefined;
  loading: boolean;
  /** Set when GET /scope3/base-year failed: never claim "no base year" then. */
  error: string | null;
  onRetry: () => void;
  report: Scope3Report | undefined;
};

export function BaseYearBlock({ data, loading, error, onRetry, report }: Props) {
  if (loading) return <SkeletonText lines={3} />;
  if (error) return <EmptyState compact variant="error" title={error} action={<Button size="sm" onClick={onRetry}>Try again</Button>} />;
  const row = data?.base_year;
  const events = data?.approved_recalculations ?? [];
  if (!row?.snapshot) return <p className="text-sm text-muted">No Scope 3 base year set.</p>;
  const current = (report?.rows ?? []).map((r) => ({ n: r.n, tco2e: r.tco2e }));
  const rows = beforeAfterRows(row.snapshot.categories, current);
  const year = `${row.year_type === "FY" ? "FY" : ""}${row.base_year}`;
  return (
    <div className="space-y-3" data-testid="methodology-base-year">
      <p className="text-sm text-ink">
        Scope 3 base year <span className="font-medium">{year}</span>
        {row.rationale ? `: ${row.rationale}` : ""}. Recalculated when changes move it by {row.significance_pct} % or more
        {row.policy_note ? `. ${row.policy_note}` : ""}.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[22rem] text-sm">
          <caption className="sr-only">Scope 3 base year beside {report?.period.label ?? "this report"}</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th scope="col" className="py-1.5 pr-3 font-medium">Category</th>
              <th scope="col" className="py-1.5 pr-3 text-right font-medium">{year}, tCO₂e</th>
              <th scope="col" className="py-1.5 text-right font-medium">{report?.period.label ?? "This report"}, tCO₂e</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.n)} className="border-b border-line/60">
                <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink">{totalLabel(r.n)}</th>
                <td className="py-1.5 pr-3 text-right tabular-nums">{t(r.before)}</td>
                <td className="py-1.5 text-right tabular-nums">{t(r.after)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-medium text-ink">
              <th scope="row" className="py-1.5 pr-3 text-left">Scope 3 total</th>
              <td className="py-1.5 pr-3 text-right tabular-nums">{t(row.snapshot.total_tco2e)}</td>
              <td className="py-1.5 text-right tabular-nums">{t(report?.total_tco2e ?? 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-muted">
        Frozen {formatDate(row.snapshot.frozen_at)}, version {row.snapshot.version}.
      </p>
      {events.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-medium text-muted">Recalculations</h4>
          <ul className="space-y-1 text-sm">
            {events.map((e, i) => (
              <li key={i}>
                <span className="text-ink">{formatDate(e.created_at)} · {RECALC_REASON_LABEL[e.reason] ?? e.reason}</span>
                <span className="text-muted"> · {signedT(e.delta_tco2e)}</span>
                {e.note && <span className="text-muted"> · {e.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
