import { type Column, DataTable, formatDelta, formatEmissions, formatPercent } from "../../../ui";
import { type ReportFigures, scopeTable } from "../logic";

type Row = Omit<ReturnType<typeof scopeTable>[number], "scope"> & { scope: string };

/** Table 1: emissions by scope for both periods. */
export function ScopeTable({ figures, prevLabel, selLabel }: { figures: ReportFigures; prevLabel: string; selLabel: string }) {
  const rows = scopeTable(figures);
  const total: Row = {
    scope: "Total",
    previous: figures.previous.total,
    previousPct: figures.previous.total > 0 ? 100 : 0,
    selected: figures.selected.total,
    selectedPct: figures.selected.total > 0 ? 100 : 0,
    change: figures.yoy,
  };
  const columns: Column<Row>[] = [
    { id: "scope", header: "Scope", value: (r) => r.scope, cell: (r) => (r.scope === "Total" ? <strong>{r.scope}</strong> : r.scope) },
    { id: "previous", header: `${prevLabel} tCO₂e`, value: (r) => r.previous, cell: (r) => formatEmissions(r.previous), numeric: true },
    { id: "previousPct", header: "% of total", value: (r) => r.previousPct, cell: (r) => formatPercent(r.previousPct), numeric: true },
    { id: "selected", header: `${selLabel} tCO₂e`, value: (r) => r.selected, cell: (r) => formatEmissions(r.selected), numeric: true },
    { id: "selectedPct", header: "% of total", value: (r) => r.selectedPct, cell: (r) => formatPercent(r.selectedPct), numeric: true },
    { id: "change", header: "Change", value: (r) => r.change, cell: (r) => <Change now={r.selected} before={r.previous} />, numeric: true },
  ];
  return (
    <section aria-labelledby="ghg-table1" className="space-y-2">
      <h3 id="ghg-table1" className="text-sm font-semibold text-ink">
        Table 1 · Emissions by scope
      </h3>
      <DataTable<Row> label="Emissions by scope" rows={[...rows, total]} columns={columns} getRowId={(r) => r.scope} exportName="ghg-table1-emissions-by-scope" />
    </section>
  );
}

const tone = { good: "text-good", bad: "text-bad", neutral: "text-muted" } as const;

/** "▼ 4.8%" in the fixed good/bad colour; "—" when there's nothing to compare with. */
export function Change({ now, before }: { now: number; before: number }) {
  const d = before > 0 ? formatDelta(now, before, { lowerIsBetter: true }) : null;
  if (!d) return <span className="text-muted">—</span>;
  return <span className={tone[d.tone]}>{d.text}</span>;
}
