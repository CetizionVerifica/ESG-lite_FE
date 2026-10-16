import { Link } from "react-router-dom";
import { Target } from "lucide-react";
import {
  Badge,
  type BadgeTone,
  Button,
  Callout,
  type Column,
  DataTable,
  EmptyState,
  Scope3CategoryChip,
  cn,
  focusRing,
  formatEmissions,
  formatPercent,
  panel,
} from "../../../ui";
import { BOUNDARY_STATUS_LABEL, type BoundaryStatus } from "../../../lib/scope3/boundary";
import { NOT_RECORDED, NOT_TRACKED, SCOPE3_TOTAL_NOTE, type Scope3Report, type Scope3ReportRow, methodMixText, rowLabel } from "../../../lib/scope3/report";
import { SBTI_HINT_LEAD, coverageSentence, sbtiScope3Applies, scope3CoverageSet } from "../../../lib/scope3/sbti";
import { DqCell } from "./DqCell";

const STATUS_TONE: Record<BoundaryStatus, BadgeTone> = { included: "good", excluded: "warn", not_relevant: "neutral", screening: "info" };

type Props = {
  report: Scope3Report | undefined;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** Scope 1 + 2 + 3 for the period, for the SBTi 40 % rule. */
  grandTotal: number;
};

/** Scope 3 by GHG Protocol category: status, emissions, method mix, value-chain data and data quality, then the exclusions. */
export function Scope3Tab({ report, loading, error, onRetry, grandTotal }: Props) {
  const tracked = report?.tracked;
  const shown = (report?.rows ?? []).filter((r) => r.n !== null || r.tco2e > 0 || r.mapped_categories.length > 0);
  const unmapped = report?.rows.find((r) => r.n === null);
  const excluded = (report?.rows ?? []).filter((r) => r.status === "excluded" || r.status === "not_relevant");
  const coverage = report ? scope3CoverageSet(report.rows) : null;
  const showSbti = !!report && sbtiScope3Applies(report.total_tco2e, grandTotal);

  const columns: Column<Scope3ReportRow>[] = [
    {
      id: "category",
      header: "Category",
      value: (r) => rowLabel(r),
      sortValue: (r) => r.n ?? 99,
      cell: (r) => <Scope3CategoryChip n={r.n} />,
    },
    {
      id: "status",
      header: "Status",
      value: (r) => (r.status ? BOUNDARY_STATUS_LABEL[r.status] : "Needs a category"),
      cell: (r) =>
        r.status ? (
          <Badge tone={STATUS_TONE[r.status]}>{BOUNDARY_STATUS_LABEL[r.status]}</Badge>
        ) : (
          <Link to="/settings/scope3" className={cn("rounded-chip text-sm text-warn underline", focusRing)}>
            Map on the boundary page
          </Link>
        ),
    },
    { id: "t", header: "tCO₂e", value: (r) => r.tco2e, cell: (r) => (r.tco2e > 0 ? <strong>{formatEmissions(r.tco2e)}</strong> : "—"), numeric: true },
    { id: "share", header: "Share", value: (r) => r.share_pct, cell: (r) => (r.tco2e > 0 ? formatPercent(r.share_pct) : "—"), numeric: true },
    {
      id: "methods",
      header: "Method mix",
      value: (r) => (r.tco2e > 0 ? (tracked?.method ? methodMixText(r) : NOT_RECORDED) : "—"),
      wrap: true,
    },
    {
      id: "value-chain",
      header: "Value-chain data",
      value: (r) => r.value_chain_pct,
      cell: (r) => (r.tco2e > 0 ? (tracked?.method ? formatPercent(r.value_chain_pct) : NOT_RECORDED) : "—"),
      exportValue: (r) => (tracked?.method ? r.value_chain_pct : NOT_RECORDED),
      numeric: true,
      info: false,
    },
    {
      id: "dq",
      header: "Data quality",
      value: (r) => r.dq.overall,
      cell: (r) => (r.tco2e > 0 ? <DqCell row={r} /> : "—"),
      info: false,
    },
    {
      id: "biogenic",
      header: "Biogenic CO₂",
      value: (r) => r.biogenic_tco2e,
      cell: (r) => (r.tco2e > 0 ? (r.biogenic_tco2e === null ? NOT_TRACKED : formatEmissions(r.biogenic_tco2e)) : "—"),
      exportValue: (r) => r.biogenic_tco2e ?? NOT_TRACKED,
      numeric: true,
      defaultHidden: true,
      info: false,
    },
    {
      id: "included",
      header: "Included activities",
      value: (r) => r.mapped_categories.map((m) => m.name).join(", ") || "—",
      wrap: true,
      defaultHidden: true,
      info: false,
    },
  ];

  if (error)
    return <EmptyState variant="error" title={error} action={<Button onClick={onRetry}>Try again</Button>} />;

  return (
    <div className="space-y-6">
      {showSbti && coverage && (
        <Callout tone="info" icon={Target} title={SBTI_HINT_LEAD}>
          {coverageSentence(coverage)} Scope 3 is {formatPercent(grandTotal > 0 ? (report!.total_tco2e / grandTotal) * 100 : 0, 0)} of your total, so the
          Scope 3 rule applies.
        </Callout>
      )}
      {unmapped && unmapped.tco2e > 0 && (
        <Callout
          tone="warn"
          title={`${formatEmissions(unmapped.tco2e)} has no GHG Protocol category yet`}
          action={
            <Link to="/settings/scope3" className={cn("rounded-chip text-sm font-medium underline", focusRing)}>
              Map categories on the Scope 3 boundary page
            </Link>
          }
        >
          It counts in the Scope 3 total but not in any category below.
        </Callout>
      )}
      <DataTable<Scope3ReportRow>
        label="Scope 3 emissions by GHG Protocol category"
        rows={shown}
        columns={columns}
        getRowId={(r) => r.n ?? "unmapped"}
        rowLabel={rowLabel}
        loading={loading}
        exportName="ghg-scope3-by-category"
        empty={<p className="p-4 text-sm text-muted">No Scope 3 categories for these sites.</p>}
      />
      <p className="text-xs text-muted">
        {SCOPE3_TOTAL_NOTE} Value-chain data is the share calculated from supplier or other value-chain partner data.
        {tracked && !tracked.biogenic && " Biogenic CO₂ is not tracked per entry yet."}
        {report && ` Total Scope 3: ${formatEmissions(report.total_tco2e)}.`}
      </p>

      <section aria-labelledby="ghg-s3-excluded" className={cn(panel, "p-5")}>
        <h3 id="ghg-s3-excluded" className="mb-3 text-sm font-semibold text-ink">
          Excluded and not relevant categories
        </h3>
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : excluded.length === 0 ? (
          <p className="text-sm text-muted">No category is excluded. Every category is included or still being screened.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {excluded.map((r) => (
              <li key={r.n ?? "u"} className="flex flex-wrap items-baseline gap-2">
                <Scope3CategoryChip n={r.n} />
                <Badge tone={STATUS_TONE[r.status!]}>{BOUNDARY_STATUS_LABEL[r.status!]}</Badge>
                <span className="text-ink">{r.reason ?? "No reason recorded"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
