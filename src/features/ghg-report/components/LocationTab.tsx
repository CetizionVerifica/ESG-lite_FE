import { ChartFrame, type Column, DataTable, formatEmissions } from "../../../ui";
import { type LocationRow, SCOPES } from "../logic";
import { Change } from "./ScopeTable";

/** Each site's Scope 1–3 emissions for both periods, as a table and a bar chart. */
export function LocationTab({ rows, prevLabel, selLabel }: { rows: LocationRow[]; prevLabel: string; selLabel: string }) {
  const columns: Column<LocationRow>[] = [
    { id: "site", header: "Site", value: (r) => r.site },
    ...SCOPES.flatMap((scope): Column<LocationRow>[] => [
      { id: `p-${scope}`, header: `${scope} ${prevLabel}`, value: (r) => r.previous[scope], cell: (r) => formatEmissions(r.previous[scope]), numeric: true },
      { id: `s-${scope}`, header: `${scope} ${selLabel}`, value: (r) => r.selected[scope], cell: (r) => formatEmissions(r.selected[scope]), numeric: true },
    ]),
    { id: "p-total", header: `Total ${prevLabel}`, value: (r) => r.previous.total, cell: (r) => formatEmissions(r.previous.total), numeric: true },
    { id: "s-total", header: `Total ${selLabel}`, value: (r) => r.selected.total, cell: (r) => <strong>{formatEmissions(r.selected.total)}</strong>, numeric: true },
    { id: "change", header: "Change", value: (r) => r.selected.total - r.previous.total, cell: (r) => <Change now={r.selected.total} before={r.previous.total} />, numeric: true },
  ];
  const sites = rows.map((r) => r.site);

  return (
    <div className="space-y-6">
      <ChartFrame
        title="Emissions by site"
        unit="tCO₂e"
        empty={rows.every((r) => r.selected.total === 0 && r.previous.total === 0)}
        emptyText="No Scope 1–3 emissions at these sites in either period."
        exportName="ghg-emissions-by-site"
        table={{
          columns: [
            { id: "site", header: "Site" },
            { id: "previous", header: `${prevLabel} tCO₂e`, numeric: true, decimals: 3 },
            { id: "selected", header: `${selLabel} tCO₂e`, numeric: true, decimals: 3 },
          ],
          rows: rows.map((r) => ({ site: r.site, previous: r.previous.total, selected: r.selected.total })),
        }}
        option={(t) => ({
          grid: { left: 8, right: 8, top: 32, bottom: 4, containLabel: true },
          legend: { top: 0 },
          tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => (typeof v === "number" ? formatEmissions(v) : "—") },
          xAxis: { type: "category", data: sites, axisLabel: { interval: 0, hideOverlap: true } },
          yAxis: { type: "value" },
          series: [
            ...SCOPES.map((scope, i) => ({
              name: `${scope} ${prevLabel}`,
              type: "bar" as const,
              stack: "previous",
              barMaxWidth: 32,
              itemStyle: { color: [t.scopes.s1, t.scopes.s2, t.scopes.s3][i], opacity: 0.45 },
              data: rows.map((r) => r.previous[scope]),
            })),
            ...SCOPES.map((scope, i) => ({
              name: `${scope} ${selLabel}`,
              type: "bar" as const,
              stack: "selected",
              barMaxWidth: 32,
              itemStyle: { color: [t.scopes.s1, t.scopes.s2, t.scopes.s3][i] },
              data: rows.map((r) => r.selected[scope]),
            })),
          ],
        })}
      />
      <DataTable<LocationRow>
        label="Emissions by site and scope"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.siteId}
        exportName="ghg-overview-by-location"
        defaultSort={{ id: "s-total", dir: "desc" }}
      />
    </div>
  );
}
