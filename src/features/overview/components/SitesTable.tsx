import { useNavigate } from "react-router-dom";
import type { OverviewSite } from "../../../services/overviewService";
import { type Column, DataTable, StatusPill, cn, formatDelta, formatEmissions } from "../../../ui";
import { type SiteStatus, siteStatus } from "../logic";

type Row = OverviewSite & { state: SiteStatus };

const toneClass = { good: "text-good", bad: "text-bad", neutral: "text-muted" } as const;

/** Net, change vs last year, entries and status per site. A row opens the ledger for that site. */
export function SitesTable(props: {
  sites: OverviewSite[];
  missing: Map<string, number>;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  linkFor: (siteId: number) => string;
}) {
  const navigate = useNavigate();
  const rows: Row[] = props.sites.map((s) => ({ ...s, state: siteStatus(s, props.missing.get(s.name) ?? 0) }));
  const columns: Column<Row>[] = [
    { id: "site", header: "Site", value: (r) => r.name, hideable: false },
    { id: "net", header: "Net tCO₂e", numeric: true, value: (r) => r.net, cell: (r) => formatEmissions(r.net) },
    {
      id: "vs-ly",
      header: "vs last year",
      numeric: true,
      value: (r) => r.net_vs_last_year_pct,
      cell: (r) => {
        if (r.net_vs_last_year_pct === null) return <span className="text-muted">—</span>;
        // formatDelta wants two values; a percent change of p is the same as 100+p vs 100.
        const d = formatDelta(100 + r.net_vs_last_year_pct, 100, { lowerIsBetter: true });
        return d ? <span className={cn("font-medium", toneClass[d.tone])}>{d.text}</span> : "—";
      },
    },
    {
      id: "entries",
      header: "Approved / entries",
      numeric: true,
      value: (r) => r.entries,
      cell: (r) => `${r.approved} / ${r.entries}`,
      exportValue: (r) => `${r.approved} / ${r.entries}`,
    },
    {
      id: "status",
      header: "Status",
      value: (r) => r.state.label,
      cell: (r) => <StatusPill size="sm" status={r.state.status} label={r.state.label} />,
    },
  ];
  return (
    <section aria-label="By site">
      <h3 className="mb-2 text-sm font-semibold text-ink">By site</h3>
      <DataTable<Row>
        label="Emissions by site"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.site_id}
        loading={props.loading}
        error={props.error}
        onRetry={props.onRetry}
        onRowClick={(r) => navigate(props.linkFor(r.site_id))}
        exportName="overview-by-site"
        defaultSort={{ id: "net", dir: "desc" }}
      />
    </section>
  );
}
