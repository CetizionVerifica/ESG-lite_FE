import { ChartFrame, type Column, DataTable, formatEmissions, formatNumber, formatPercent } from "../../../ui";
import { type DetailRow, type Distribution, type ScopeName } from "../logic";
import { Change } from "./ScopeTable";

type Props = {
  scope: ScopeName;
  rows: DetailRow[];
  distribution: Distribution[];
  prevLabel: string;
  selLabel: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
};

const colorKey = { "Scope 1": "s1", "Scope 2": "s2", "Scope 3": "s3" } as const;

/** One scope: what each category, site and fuel emitted in both periods, and each category's share. */
export function ScopeTab({ scope, rows, distribution, prevLabel, selLabel, loading, error, onRetry }: Props) {
  const slug = scope.toLowerCase().replace(" ", "");
  const columns: Column<DetailRow>[] = [
    { id: "category", header: "Category", value: (r) => r.categoryName },
    { id: "site", header: "Location", value: (r) => r.siteName },
    { id: "fuel", header: "Emission category", value: (r) => r.fuelType || "—" },
    { id: "p-qty", header: `${prevLabel} consumption`, value: (r) => r.compare.consumption, cell: (r) => formatNumber(r.compare.consumption, 2), numeric: true },
    { id: "p-unit", header: `${prevLabel} unit`, value: (r) => r.compare.unit || r.selected.unit || "—" },
    { id: "p-t", header: `${prevLabel} tCO₂e`, value: (r) => r.compare.emissions, cell: (r) => formatEmissions(r.compare.emissions), numeric: true },
    { id: "s-qty", header: `${selLabel} consumption`, value: (r) => r.selected.consumption, cell: (r) => formatNumber(r.selected.consumption, 2), numeric: true },
    { id: "s-unit", header: `${selLabel} unit`, value: (r) => r.selected.unit || r.compare.unit || "—" },
    { id: "s-t", header: `${selLabel} tCO₂e`, value: (r) => r.selected.emissions, cell: (r) => <strong>{formatEmissions(r.selected.emissions)}</strong>, numeric: true },
    { id: "change", header: "Change", value: (r) => r.selected.emissions - r.compare.emissions, cell: (r) => <Change now={r.selected.emissions} before={r.compare.emissions} />, numeric: true },
  ];

  return (
    <div className="space-y-6">
      <ChartFrame
        title={`${scope} by category`}
        unit="% of scope"
        loading={loading}
        error={error}
        onRetry={onRetry}
        empty={distribution.length === 0}
        emptyText={`No ${scope} emissions in either period.`}
        exportName={`ghg-${slug}-distribution`}
        height={Math.max(160, distribution.length * 44 + 48)}
        table={{
          columns: [
            { id: "category", header: "Category" },
            { id: "previousPct", header: `${prevLabel} %`, numeric: true, decimals: 1 },
            { id: "selectedPct", header: `${selLabel} %`, numeric: true, decimals: 1 },
          ],
          rows: distribution.map(({ category, previousPct, selectedPct }) => ({ category, previousPct, selectedPct })),
        }}
        option={(t) => {
          const color = t.scopes[colorKey[scope]];
          return {
            grid: { left: 8, right: 24, top: 32, bottom: 4, containLabel: true },
            legend: { top: 0 },
            tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => (typeof v === "number" ? formatPercent(v) : "—") },
            xAxis: { type: "value", max: 100, axisLabel: { formatter: "{value}%" } },
            yAxis: { type: "category", inverse: true, data: distribution.map((d) => d.category) },
            series: [
              { name: prevLabel, type: "bar", barMaxWidth: 14, itemStyle: { color, opacity: 0.45 }, data: distribution.map((d) => d.previousPct) },
              { name: selLabel, type: "bar", barMaxWidth: 14, itemStyle: { color }, data: distribution.map((d) => d.selectedPct) },
            ],
          };
        }}
      />
      <DataTable<DetailRow>
        label={`${scope} emissions by category and site`}
        rows={rows}
        columns={columns}
        getRowId={(r) => r.key}
        loading={loading}
        error={error}
        onRetry={onRetry}
        exportName={`ghg-${slug}-details`}
        empty={<p className="p-4 text-sm text-muted">No {scope} emissions in either period.</p>}
      />
    </div>
  );
}
