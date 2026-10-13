import { Link } from "react-router-dom";
import { cn, focusRing } from "../../../ui";
import type { ResultDetail } from "../logic";

const fmt = (v: number | null | undefined, digits = 3) => (v == null ? "—" : v.toLocaleString("en-GB", { maximumFractionDigits: digits }));

const KEY_LABEL: Record<string, string> = {
  mass: "Mass",
  machine_hours: "Machine hours",
  energy: "Metered energy",
  economic: "Economic",
  manual: "Manual %",
};

type Props = {
  result: ResultDetail;
  unitText: string;
  /** Ledger and production links filtered to the site, period and approved rows. */
  emissionsLink: (categoryId: number | null) => string;
  productionLink: string;
};

/** The approved plant Scope 1 and 2 allocated to the product when it was calculated. */
export function AllocationTab({ result, unitText, emissionsLink, productionLink }: Props) {
  const a = result.allocation;
  if (!a || result.allocations.length === 0) {
    return <p className="text-sm text-muted">No plant energy was allocated in this calculation.</p>;
  }
  const total = result.allocations.reduce((s, r) => s + r.allocated_kg_per_unit, 0);
  const link = cn("rounded-chip font-medium text-brand-text underline underline-offset-2", focusRing);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        Allocation key: <span className="text-ink">{KEY_LABEL[a.key] ?? a.key}</span>, product share {fmt(a.share_pct, 2)}%
        {a.key_value_product != null && a.key_value_site_total != null && a.key !== "manual"
          ? ` (${fmt(a.key_value_product)} of ${fmt(a.key_value_site_total)})`
          : ""}
        . Output in the period: {fmt(a.product_output_units)} declared units.
      </p>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <caption className="sr-only">Approved plant emissions allocated to this product</caption>
          <thead className="border-b border-line text-left text-xs text-muted">
            <tr>
              <th scope="col" className="px-2 py-2">Category</th>
              <th scope="col" className="px-2 py-2">Scope</th>
              <th scope="col" className="px-2 py-2 text-right">Plant total tCO₂e</th>
              <th scope="col" className="px-2 py-2 text-right">Product share</th>
              <th scope="col" className="px-2 py-2 text-right">{unitText}</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {result.allocations.map((r) => (
              <tr key={r.pcf_allocation_id} className="border-b border-line last:border-0">
                <td className="px-2 py-2">
                  <Link to={emissionsLink(r.category_id)} className={link}>
                    {r.category_name}
                  </Link>
                </td>
                <td className="px-2 py-2 text-muted">Scope {r.scope}</td>
                <td className="px-2 py-2 text-right">{fmt(r.period_total_tco2e)}</td>
                <td className="px-2 py-2 text-right">{fmt(r.share_pct, 2)}%</td>
                <td className="px-2 py-2 text-right">{fmt(r.allocated_kg_per_unit)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-line font-medium tabular-nums">
            <tr>
              <th scope="row" colSpan={4} className="px-2 py-2 text-left">
                Total
              </th>
              <td className="px-2 py-2 text-right">{fmt(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-sm text-muted">
        Uses {result.emission_ids_used.length} approved emission {result.emission_ids_used.length === 1 ? "entry" : "entries"} and{" "}
        {result.production_ids_used.length} approved production {result.production_ids_used.length === 1 ? "record" : "records"}.{" "}
        <Link to={emissionsLink(null)} className={link}>
          Open the emissions
        </Link>{" "}
        ·{" "}
        <Link to={productionLink} className={link}>
          Open the production
        </Link>
      </p>
    </div>
  );
}
