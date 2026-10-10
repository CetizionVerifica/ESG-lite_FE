import { type Column, DataTable, formatEmissions } from "../../../ui";
import type { CategoryRow } from "../logic";
import { Change } from "./ScopeTable";

/** The ten largest Scope 1–3 categories this period, with last year next to them. */
export function CategoryTable({ rows, prevLabel, selLabel }: { rows: CategoryRow[]; prevLabel: string; selLabel: string }) {
  const columns: Column<CategoryRow>[] = [
    { id: "category", header: "Category", value: (r) => r.category },
    { id: "scope", header: "Scope", value: (r) => r.scope },
    { id: "previous", header: `${prevLabel} tCO₂e`, value: (r) => r.previous, cell: (r) => formatEmissions(r.previous), numeric: true },
    { id: "selected", header: `${selLabel} tCO₂e`, value: (r) => r.selected, cell: (r) => formatEmissions(r.selected), numeric: true },
    { id: "change", header: "Change", value: (r) => r.change, cell: (r) => <Change now={r.selected} before={r.previous} />, numeric: true },
  ];
  return (
    <section aria-labelledby="ghg-top-categories" className="space-y-2">
      <h3 id="ghg-top-categories" className="text-sm font-semibold text-ink">
        Emissions by category <span className="ml-1.5 text-xs font-normal text-muted">top 10</span>
      </h3>
      <DataTable<CategoryRow>
        label="Emissions by category, top 10"
        rows={rows}
        columns={columns}
        getRowId={(r) => `${r.scope}|${r.category}`}
        exportName="ghg-top-categories"
        empty={<p className="p-4 text-sm text-muted">No Scope 1–3 categories in either period.</p>}
      />
    </section>
  );
}
