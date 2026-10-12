import { Link } from "react-router-dom";
import { cn, focusRing } from "../../../ui";
import { STAGE_LABEL, STAGES, dqrAverage, type ResultFactor, type ResultLine } from "../logic";

const fmt = (v: number | null, digits = 3) => (v == null ? "—" : v.toLocaleString("en-GB", { maximumFractionDigits: digits }));

function factorText(f: ResultFactor | null) {
  if (!f) return "—";
  const value = f.value_kgco2e == null ? (f.licence === "ecoinvent" ? "value hidden (licensed)" : null) : `${fmt(f.value_kgco2e, 4)} kg/${f.unit}`;
  return [f.name, f.source, value].filter(Boolean).join(" · ");
}

type Props = { lines: ResultLine[]; unitText: string; editLink: string | null };

/** Every line of the calculation with its factor, source, DQR and contribution. */
export function InputsTab({ lines, unitText, editLink }: Props) {
  const rows = [...lines].sort((a, b) => STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage));
  if (rows.length === 0) return <p className="text-sm text-muted">This calculation has no input lines.</p>;
  return (
    <div className="space-y-3">
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <caption className="sr-only">Inputs behind this footprint</caption>
          <thead className="border-b border-line text-left text-xs text-muted">
            <tr>
              <th scope="col" className="px-2 py-2">Stage</th>
              <th scope="col" className="px-2 py-2">Input</th>
              <th scope="col" className="px-2 py-2 text-right">Quantity</th>
              <th scope="col" className="px-2 py-2">Factor and source</th>
              <th scope="col" className="px-2 py-2">Data</th>
              <th scope="col" className="px-2 py-2 text-right">DQR</th>
              <th scope="col" className="px-2 py-2 text-right">{unitText}</th>
              <th scope="col" className="px-2 py-2 text-right">Share</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((l) => (
              <tr key={l.id} className="border-b border-line last:border-0 align-top">
                <td className="whitespace-nowrap px-2 py-2 text-muted">{STAGE_LABEL[l.stage]}</td>
                <td className="px-2 py-2 text-ink">
                  {l.name}
                  {l.recycled_share_pct ? <span className="block text-xs text-muted">{fmt(l.recycled_share_pct, 1)}% recycled</span> : null}
                  {l.cut_off_candidate && <span className="block text-xs text-muted">Under the 1% cut-off</span>}
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right">{l.quantity == null ? "—" : `${fmt(l.quantity, 4)} ${l.unit ?? ""}`}</td>
                <td className="px-2 py-2 text-muted">
                  {l.supplier_specific ? "Supplier-specific figure" : l.stage === "A3_energy" ? "Approved plant data" : factorText(l.factor)}
                  {l.recycled_factor && <span className="block text-xs">Recycled: {factorText(l.recycled_factor)}</span>}
                </td>
                <td className="px-2 py-2 text-muted">{l.data_type === "primary" ? "Primary" : "Secondary"}</td>
                <td className="px-2 py-2 text-right">{fmt(dqrAverage(l.dqr), 1)}</td>
                <td className="px-2 py-2 text-right text-ink">{l.value_hidden ? "Licensed" : fmt(l.kgco2e_per_unit)}</td>
                <td className="px-2 py-2 text-right">{l.share_pct == null ? "—" : `${fmt(l.share_pct, 1)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editLink && (
        <Link to={editLink} className={cn("inline-block rounded-chip text-sm font-medium text-brand-text underline underline-offset-2", focusRing)}>
          Edit the inputs in the builder
        </Link>
      )}
    </div>
  );
}
