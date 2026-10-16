import type { ReactNode } from "react";
import { Button, EmptyState, Scope3CategoryChip, SkeletonText, cn, formatPercent, panel } from "../../../ui";
import { CONSOLIDATION_LABEL, isConsolidationApproach } from "../../../lib/scope3/boundary";
import { NOT_RECORDED, type Scope3Report, datasetText, gwpText, methodMixText, rowLabel } from "../../../lib/scope3/report";

type Props = {
  report: Scope3Report | undefined;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** The base-year block (S3-14). Defaults to "No Scope 3 base year set". */
  baseYear?: ReactNode;
};

function Term({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  );
}

/**
 * How the Scope 3 figures were made (Scope 3 Standard ch. 11.1): boundary
 * approach, GWP set, and per category the methods, data and factor sources,
 * assumptions and proxy share, plus the base-year slot S3-14 fills.
 */
export function MethodologySection({ report, loading, error, onRetry, baseYear }: Props) {
  if (error) return <EmptyState variant="error" title={error} action={<Button onClick={onRetry}>Try again</Button>} />;
  if (loading || !report)
    return (
      <div className={cn(panel, "p-5")}>
        <SkeletonText lines={6} />
      </div>
    );

  const approach = isConsolidationApproach(report.consolidation_approach) ? CONSOLIDATION_LABEL[report.consolidation_approach] : CONSOLIDATION_LABEL.operational_control;
  const gwp = gwpText(report.gwp_sets);
  const categories = report.rows.filter((r) => r.tco2e > 0 || !!r.method_note);

  return (
    <div className="space-y-6">
      <section aria-labelledby="ghg-method-basis" className={cn(panel, "p-5")}>
        <h3 id="ghg-method-basis" className="mb-3 text-sm font-semibold text-ink">
          Basis of the inventory
        </h3>
        <dl className="space-y-3">
          <Term label="Organisational boundary">{approach} approach.</Term>
          <Term label="GWP values">{gwp ? `100-year GWP values from IPCC ${gwp}.` : "The GWP set is not recorded on the emission factors used."}</Term>
          <Term label="Calculation">Every figure is activity data multiplied by an emission factor in ESGLite's calculation engine, from approved entries only.</Term>
          <Term label="Biogenic CO₂ and gases">
            {report.tracked.biogenic
              ? "Biogenic CO₂ is reported separately per category and kept out of the totals."
              : "Biogenic CO₂ and per-gas totals are not tracked per entry yet; the factors used report CO₂e only."}
          </Term>
          <Term label="Avoided emissions">Avoided emissions and renewable energy are reported separately and never deducted from Scope 3.</Term>
        </dl>
      </section>

      <section aria-labelledby="ghg-method-cats" className="space-y-3">
        <h3 id="ghg-method-cats" className="text-sm font-semibold text-ink">
          Methodology by category
        </h3>
        {categories.length === 0 ? (
          <p className="text-sm text-muted">No Scope 3 emissions or method notes for this period.</p>
        ) : (
          <ul className="space-y-3">
            {categories.map((r) => (
              <li key={r.n ?? "unmapped"} className={cn(panel, "space-y-2 p-4")}>
                <div className="flex flex-wrap items-center gap-2">
                  <Scope3CategoryChip n={r.n} />
                  <span className="text-sm font-medium text-ink">{rowLabel(r)}</span>
                </div>
                <dl className="space-y-2">
                  <Term label="Methods">{report.tracked.method ? methodMixText(r) : NOT_RECORDED}</Term>
                  <Term label="Data and factors">{datasetText(r)}</Term>
                  <Term label="Data types">
                    {report.tracked.data_type ? `${formatPercent(r.primary_pct)} primary data` : NOT_RECORDED}
                    {report.tracked.method && `, ${formatPercent(r.value_chain_pct)} from suppliers or value-chain partners`}
                    {r.proxy_pct > 0 && `, ${formatPercent(r.proxy_pct)} extrapolated or proxy data`}
                  </Term>
                  <Term label="GWP">{r.gwp_sets.join(", ") || NOT_RECORDED}</Term>
                  <Term label="Assumptions">{r.method_note ?? "None recorded on the boundary page."}</Term>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ghg-method-base" className={cn(panel, "p-5")}>
        <h3 id="ghg-method-base" className="mb-2 text-sm font-semibold text-ink">
          Base year
        </h3>
        {baseYear ?? <p className="text-sm text-muted">No Scope 3 base year set.</p>}
      </section>
    </div>
  );
}
