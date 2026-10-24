import type { FrameworkCode, KpiReportRow, YearType } from "../../../../lib/kpi/contracts";
import { Badge, cn, focusRing, panel } from "../../../../ui";
import { groupBySection, reportValue, requirementText, rowNote, yearLabel } from "../logic";

/**
 * KPI-11 · The report preview: one table per framework layout, rows grouped
 * by section (GRI 302, Principle 6 · Essential, E1 Climate change). A value
 * opens its records (read-only). BRSR shows this year and last, the Core
 * marker and the evidence count, as SEBI's tables do.
 */
export function ReportTable({ framework, rows, year, yearType, onOpen }: { framework: FrameworkCode; rows: KpiReportRow[]; year: number; yearType: YearType; onOpen: (row: KpiReportRow) => void }) {
  const brsr = framework === "BRSR";
  const esrs = framework === "ESRS";
  const cols = brsr ? 7 : 5;
  const value = (r: KpiReportRow, v: KpiReportRow["value"] | undefined, current: boolean) => {
    const text = reportValue(v, r.unit);
    if (!current || !r.value_ids?.length || text === "—") return <span className="font-num tabular-nums text-ink">{text}</span>;
    return (
      <button type="button" onClick={() => onOpen(r)} aria-label={`${text}: open the records behind ${r.code}`} className={cn("rounded-chip font-num tabular-nums text-brand-text underline decoration-dotted underline-offset-2 hover:decoration-solid", focusRing)}>
        {text}
      </button>
    );
  };
  return (
    <section className={cn(panel, "relative overflow-x-auto")}>
      <table className="w-full min-w-[720px] text-sm" aria-label={`${framework} ${year}`} data-testid="kpi-report-table">
        <thead className="border-b border-line bg-tint text-left text-xs text-muted">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">{brsr ? "Indicator" : esrs ? "Datapoint" : "Disclosure"}</th>
            <th scope="col" className="px-3 py-2 font-medium">What it covers</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">{brsr ? yearLabel(year, yearType) : "Value"}</th>
            {brsr && <th scope="col" className="px-3 py-2 text-right font-medium">{yearLabel(year - 1, yearType)}</th>}
            {brsr && <th scope="col" className="px-3 py-2 text-right font-medium">Evidence</th>}
            <th scope="col" className="px-3 py-2 font-medium">{esrs ? "Status" : brsr ? "Core" : "Where"}</th>
            <th scope="col" className="px-4 py-2 font-medium">Notes</th>
          </tr>
        </thead>
        {groupBySection(rows).map((g) => (
          <tbody key={g.section}>
            <tr className="border-b border-line bg-page">
              <th scope="colgroup" colSpan={cols} className="px-4 py-1.5 text-left text-xs font-semibold text-ink">
                {g.section}
              </th>
            </tr>
            {g.rows.map((r) => (
              <tr key={r.disclosure_id} className="border-b border-line last:border-0" data-testid="kpi-report-row">
                <th scope="row" className="px-4 py-2 text-left font-num text-xs font-medium text-ink">{r.code}</th>
                <td className="px-3 py-2 text-ink">{r.title}</td>
                <td className="px-3 py-2 text-right">{value(r, r.value, true)}</td>
                {brsr && <td className="px-3 py-2 text-right">{value(r, r.previous, false)}</td>}
                {brsr && <td className="px-3 py-2 text-right font-num tabular-nums text-muted">{r.evidence_count ?? "—"}</td>}
                <td className="px-3 py-2">
                  {esrs ? (
                    <span className="text-xs text-muted">{requirementText(r) ?? "—"}</span>
                  ) : brsr ? (
                    r.requirement === "core" ? <Badge tone="brand">Core</Badge> : <span className="text-xs text-muted">—</span>
                  ) : (
                    <span className="text-xs text-muted">{r.where === "company" ? "Company" : r.sites?.length ? r.sites.join(", ") : r.where === "site" ? "Sites" : "—"}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-xs text-muted">{rowNote(r) ?? ""}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </section>
  );
}
