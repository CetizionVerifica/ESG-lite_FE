import { useMemo, useState } from "react";
import { Badge, Button, type Column, DataTable, EmptyState, KpiStrip, SegmentedControl, formatNumber } from "../../../ui";
import type { PlanSummary } from "../api";
import { type PreviewRow, contributorRowIssue, previewCounts, rowIssue as reviewerRowIssue } from "../logic";

type Shown = "all" | "issues";
type Row = PreviewRow & { _i: number };

const rowsText = (n: number) => `${n} ${n === 1 ? "row" : "rows"}`;

/**
 * The plan ESG-lite made for the sheet: its first page of rows with the
 * factor, total and issues the engine found, and the plan's own counts and
 * total for the whole sheet. Rows with an issue are left out on import.
 */
export function PreviewStep(props: {
  plan: PlanSummary | null;
  rows: PreviewRow[] | null;
  total: number | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onBack: () => void;
  onImport: () => void;
  /** SE-1: false for a User: entered values and tCO₂e only (no factor or FERA columns, plain issues). */
  detail?: boolean;
}) {
  const detail = props.detail !== false;
  const rowIssue = detail ? reviewerRowIssue : contributorRowIssue;
  const [shown, setShown] = useState<Shown>("all");
  const rows = useMemo<Row[]>(() => (props.rows ?? []).map((r, i) => ({ ...r, _i: i })), [props.rows]);
  const counts = previewCounts(rows, props.plan?.counts);
  const visible = shown === "issues" ? rows.filter((r) => rowIssue(r)) : rows;
  const total = props.total ?? 0;
  const shownIssues = rows.filter((r) => rowIssue(r)).length;

  const allColumns: Column<Row>[] = [
    { id: "row", header: "Row", numeric: true, width: "4rem", hideable: false, value: (r) => r.row ?? r._i + 1 },
    { id: "category", header: "Category", sortable: true, value: (r) => String(r.emission_category ?? "") },
    { id: "global", header: "Factor used", sortable: true, value: (r) => r.global_category_name ?? "", cell: (r) => r.global_category_name ?? <span className="text-muted">None</span> },
    {
      id: "factor",
      header: "Factor",
      numeric: true,
      value: (r) => r.factor_value ?? null,
      cell: (r) =>
        r.factor_value == null ? (
          <span className="text-muted">–</span>
        ) : (
          <>
            {formatNumber(r.factor_value, 4)}
            {r.factor_year != null && <span className="text-muted"> ({r.factor_year})</span>}
          </>
        ),
    },
    { id: "value", header: "Value", numeric: true, value: (r) => (r.activity_value == null || r.activity_value === "" ? null : Number(r.activity_value)), cell: (r) => (r.activity_value == null || r.activity_value === "" ? <span className="text-muted">–</span> : String(r.activity_value)) },
    { id: "unit", header: "Unit", value: (r) => String(r.activity_data_unit ?? "") },
    { id: "tco2e", header: "tCO₂e", numeric: true, sortable: true, decimals: 3, value: (r) => (r.total_emission == null ? null : Number(r.total_emission)) },
    { id: "fera", header: "FERA tCO₂e", numeric: true, decimals: 3, defaultHidden: true, value: (r) => (r.fera_total_emission == null ? null : Number(r.fera_total_emission)) },
    { id: "date", header: "Filed in", value: (r) => String(r.date_of_reporting ?? "").slice(0, 7), defaultHidden: false },
    {
      id: "issue",
      header: "Issue",
      sortable: true,
      // The reason has to be readable in full to fix the file.
      wrap: true,
      value: (r) => rowIssue(r)?.text ?? "",
      cell: (r) => {
        const issue = rowIssue(r);
        if (!issue) return <Badge tone="good">OK</Badge>;
        return <span className={issue.kind === "skip" ? "text-bad" : "text-warn"}>{issue.text}</span>;
      },
    },
  ];

  const columns = detail ? allColumns : allColumns.filter((c) => c.id !== "global" && c.id !== "factor" && c.id !== "fera");
  const ready = props.plan ? props.plan.counts.ready : counts.valid;

  return (
    <div className="space-y-4">
      {props.plan && (
        <KpiStrip
          items={[
            { label: "Will import", value: props.plan.counts.ready, format: "number", primary: true, hint: detail && props.plan.counts.warnings ? `${props.plan.counts.warnings} with a warning` : undefined },
            { label: "Won't import", value: counts.issues, format: "number", hint: counts.issues ? "Fix the file or import without them" : undefined },
            { label: "Total", value: props.plan.totals.tco2e, format: "emissions", hint: "of the rows that will import" },
          ]}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted" role="status">
          {props.rows
            ? total > rows.length
              ? `Showing the first ${rows.length} of ${total} rows. In the whole sheet, ${counts.valid} ready, ${counts.issues} need a look.`
              : `${rowsText(total)}. ${counts.valid} ready, ${counts.issues} need a look.`
            : " "}
        </p>
        <SegmentedControl<Shown>
          label="Rows shown"
          size="sm"
          value={shown}
          onChange={setShown}
          options={[
            { value: "all", label: `All (${rows.length})` },
            { value: "issues", label: `Issues (${shownIssues})` },
          ]}
        />
      </div>

      <DataTable<Row>
        label="Preview of the rows to import"
        rows={visible}
        columns={columns}
        getRowId={(r) => r._i}
        rowLabel={(r) => `Row ${r.row ?? r._i + 1}`}
        loading={props.loading}
        error={props.error}
        onRetry={props.onRetry}
        empty={<EmptyState title={shown === "issues" ? "No issues in these rows." : "No rows to import."} description={shown === "issues" ? undefined : "Go back and tick at least one category."} />}
        pagination={{ mode: "client", pageSize: 25 }}
        maxHeight="28rem"
      />

      <div className="flex flex-wrap justify-between gap-3">
        <Button variant="secondary" onClick={props.onBack}>
          Back
        </Button>
        <Button variant="primary" disabled={!props.rows || !props.plan?.plan_id || ready <= 0} onClick={props.onImport}>
          {ready > 0 ? `Import ${rowsText(ready)}` : "Import"}
        </Button>
      </div>
    </div>
  );
}
