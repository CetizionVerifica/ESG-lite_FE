import { useState } from "react";
import { Link } from "react-router-dom";
import { cn, focusRing, formatDateTime, inputBase } from "../../../ui";
import { STATUS_LABEL, compareVersions, periodLabel, previousVersion, type Study } from "../logic";

const fmt = (v: number | null, digits = 3) => (v == null ? "—" : v.toLocaleString("en-GB", { maximumFractionDigits: digits }));
const signed = (v: number | null, digits: number, suffix = "") => (v == null ? "—" : `${v > 0 ? "+" : ""}${fmt(v, digits)}${suffix}`);

type Props = { study: Study; versions: Study[]; productId: number; unitText: string };

/** Every version of this product's footprint, and this one side by side with another. */
export function VersionsTab({ study, versions, productId, unitText }: Props) {
  const sorted = [...versions].sort((a, b) => b.version - a.version);
  const others = sorted.filter((v) => v.pcf_study_id !== study.pcf_study_id && v.result);
  const [againstId, setAgainstId] = useState<number | null>(null);
  const against = others.find((v) => v.pcf_study_id === againstId) ?? previousVersion(versions, study) ?? others[0] ?? null;
  const rows = against ? compareVersions(study, against) : [];
  const link = cn("rounded-chip font-medium text-brand-text underline underline-offset-2", focusRing);

  return (
    <div className="space-y-5">
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">Versions of this footprint</caption>
          <thead className="border-b border-line text-left text-xs text-muted">
            <tr>
              <th scope="col" className="px-2 py-2">Version</th>
              <th scope="col" className="px-2 py-2">Period</th>
              <th scope="col" className="px-2 py-2">Status</th>
              <th scope="col" className="px-2 py-2 text-right">{unitText}</th>
              <th scope="col" className="px-2 py-2">Calculated</th>
              <th scope="col" className="px-2 py-2">Reviewed by</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {sorted.map((v) => {
              const current = v.pcf_study_id === study.pcf_study_id;
              return (
                <tr key={v.pcf_study_id} className={cn("border-b border-line last:border-0", current && "bg-tint")} aria-current={current ? "true" : undefined}>
                  <td className="px-2 py-2">
                    {current ? (
                      <span className="font-medium text-ink">v{v.version} (this one)</span>
                    ) : (
                      <Link to={`/products/${productId}/footprints/${v.pcf_study_id}`} className={link}>
                        v{v.version}
                      </Link>
                    )}
                  </td>
                  <td className="px-2 py-2 text-muted">{periodLabel(v)}</td>
                  <td className="px-2 py-2">{STATUS_LABEL[v.status]}</td>
                  <td className="px-2 py-2 text-right text-ink">{v.result ? fmt(v.result.total_kg_per_unit) : "Not calculated"}</td>
                  <td className="px-2 py-2 text-muted">{v.result ? formatDateTime(v.result.calculated_at) : "—"}</td>
                  <td className="px-2 py-2 text-muted">{v.reviewed_by?.name ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium text-ink">Compare v{study.version} with</h3>
          {others.length === 0 ? (
            <span className="text-sm text-muted">no other calculated version yet.</span>
          ) : (
            <select aria-label="Version to compare with" value={against?.pcf_study_id ?? ""} onChange={(e) => setAgainstId(Number(e.target.value) || null)} className={cn(inputBase, "h-9 w-auto")}>
              {others.map((v) => (
                <option key={v.pcf_study_id} value={v.pcf_study_id}>
                  v{v.version} · {STATUS_LABEL[v.status]}
                </option>
              ))}
            </select>
          )}
        </div>
        {against && study.result && (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <caption className="sr-only">
                v{study.version} compared with v{against.version}
              </caption>
              <thead className="border-b border-line text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="px-2 py-2">Stage</th>
                  <th scope="col" className="px-2 py-2 text-right">v{study.version}</th>
                  <th scope="col" className="px-2 py-2 text-right">v{against.version}</th>
                  <th scope="col" className="px-2 py-2 text-right">Change</th>
                  <th scope="col" className="px-2 py-2 text-right">Change %</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {rows.map((r) => (
                  <tr key={r.key} className={r.key === "total" ? "border-t border-line font-medium" : "border-b border-line last:border-0"}>
                    <th scope="row" className="px-2 py-2 text-left font-normal text-ink">
                      {r.label}
                    </th>
                    <td className="px-2 py-2 text-right">{fmt(r.a)}</td>
                    <td className="px-2 py-2 text-right">{fmt(r.b)}</td>
                    <td className={cn("px-2 py-2 text-right", r.delta != null && r.delta < 0 && "text-good", r.delta != null && r.delta > 0 && "text-bad")}>{signed(r.delta, 3)}</td>
                    <td className={cn("px-2 py-2 text-right", r.delta != null && r.delta < 0 && "text-good", r.delta != null && r.delta > 0 && "text-bad")}>{signed(r.delta_pct, 1, "%")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {against && !study.result && <p className="text-sm text-muted">Calculate this version to compare it.</p>}
      </section>
    </div>
  );
}
