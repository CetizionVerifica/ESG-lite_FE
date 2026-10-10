import { useMemo, useState } from "react";
import { Badge, Button, type Column, DataTable, EmptyState, SegmentedControl, formatNumber } from "../../../ui";
import { type PreviewRow, previewCounts, rowIssue } from "../logic";

type Shown = "all" | "issues";
type Row = PreviewRow & { _i: number };

export function PreviewStep(props: {
  rows: PreviewRow[] | null;
  total: number | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onBack: () => void;
  onImport: () => void;
}) {
  const [shown, setShown] = useState<Shown>("all");
  const rows = useMemo<Row[]>(() => (props.rows ?? []).map((r, i) => ({ ...r, _i: i })), [props.rows]);
  const counts = previewCounts(rows);
  const visible = shown === "issues" ? rows.filter((r) => rowIssue(r)) : rows;
  const total = props.total ?? 0;

  const columns: Column<Row>[] = [
    { id: "row", header: "Row", numeric: true, width: "4rem", hideable: false, value: (r) => r._i + 1 },
    { id: "category", header: "Category", sortable: true, value: (r) => String(r.emission_category ?? "") },
    { id: "global", header: "Global category", sortable: true, value: (r) => r.global_category_name ?? "", cell: (r) => r.global_category_name ?? <span className="text-muted">None</span> },
    { id: "factor", header: "Factor", numeric: true, value: (r) => r.factor_value ?? null, cell: (r) => (r.factor_value == null ? <span className="text-muted">–</span> : formatNumber(r.factor_value, 4)) },
    { id: "unit", header: "Unit", value: (r) => String(r.activity_data_unit ?? "") },
    { id: "tco2e", header: "tCO₂e", numeric: true, sortable: true, decimals: 2, value: (r) => Number(r.total_emission ?? 0) },
    { id: "date", header: "Filed in", value: (r) => String(r.date_of_reporting ?? "").slice(0, 7), defaultHidden: false },
    {
      id: "issue",
      header: "Issue",
      sortable: true,
      value: (r) => rowIssue(r)?.text ?? "",
      cell: (r) => {
        const issue = rowIssue(r);
        if (!issue) return <Badge tone="good">OK</Badge>;
        return <span className={issue.kind === "skip" ? "text-bad" : "text-warn"}>{issue.text}</span>;
      },
    },
  ];

  const importable = total - rows.filter((r) => rowIssue(r)?.kind === "skip").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted" role="status">
          {props.rows
            ? total > rows.length
              ? `Showing the first ${rows.length} of ${total} rows. ${counts.valid} look right, ${counts.issues} need a look.`
              : `${total} ${total === 1 ? "row" : "rows"}. ${counts.valid} look right, ${counts.issues} need a look.`
            : " "}
        </p>
        <SegmentedControl<Shown>
          label="Rows shown"
          size="sm"
          value={shown}
          onChange={setShown}
          options={[
            { value: "all", label: `All (${rows.length})` },
            { value: "issues", label: `Issues (${counts.issues})` },
          ]}
        />
      </div>

      <DataTable<Row>
        label="Preview of the rows to import"
        rows={visible}
        columns={columns}
        getRowId={(r) => r._i}
        rowLabel={(r) => `Row ${r._i + 1}`}
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
        <Button variant="primary" disabled={!props.rows || total === 0 || importable <= 0} onClick={props.onImport}>
          {total > 0 ? `Import ${total} ${total === 1 ? "row" : "rows"}` : "Import"}
        </Button>
      </div>
    </div>
  );
}
