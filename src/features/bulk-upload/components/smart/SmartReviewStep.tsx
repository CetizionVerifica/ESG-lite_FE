import { useMemo, useState } from "react";
import { Badge, Button, Callout, type Column, DataTable, EmptyState, KpiStrip, Select, formatNumber } from "../../../../ui";
import type { PlanSummary } from "../../api";
import type { PreviewRow } from "../../logic";
import { SEVERITY_TONE, errorRowsRemain, issueLabel, issueOptions, rowSeverity, rowsText } from "../../smart/logic";
import { type RowEdit, RowEditModal } from "./RowEditModal";

type Row = PreviewRow & { _i: number };

const SEVERITY_LABEL = { error: "Won't import", warning: "Imports with a note", info: "Note" } as const;

/**
 * Smart import, screen 3: the plan ESG-lite made from the confirmed proposal.
 * Rows carry the factor, total and issues the engine found; the user skips or
 * fixes rows (the plan is patched and rechecked). Rows still in state issue
 * are left out at import (ESG-lite commits with skip_rows_with_issues; rows
 * the AI service kept back as local issues were never sent), so Import needs
 * only one ready row.
 */
export function SmartReviewStep(props: {
  plan: PlanSummary | null;
  rows: PreviewRow[] | null;
  total: number | null;
  /** The issue filter narrowed this page only; other pages may hold more matches. */
  pageOnly?: boolean;
  page: number;
  onPage: (page: number) => void;
  code: string | null;
  onCode: (code: string | null) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSkip: (rowRef: string, skip: boolean) => void;
  onEdit: (rowRef: string, edit: RowEdit) => void;
  onSkipIssue: (code: string) => void;
  busy: boolean;
  patchError: string | null;
  /** The mapping model mapped the workbook and Confirm mapping was passed over; Back opens it. */
  autoMapped?: boolean;
  onBack: () => void;
  onImport: () => void;
}) {
  const { plan } = props;
  const [editing, setEditing] = useState<PreviewRow | null>(null);
  const rows = useMemo<Row[]>(() => (props.rows ?? []).map((r, i) => ({ ...r, _i: i })), [props.rows]);
  const total = props.total ?? 0;
  const blocked = errorRowsRemain(plan);
  const options = issueOptions(plan);
  const selectedIssue = plan?.issues_summary.find((i) => i.code === props.code) ?? null;

  const columns: Column<Row>[] = [
    { id: "ref", header: "Row", width: "9rem", hideable: false, value: (r) => r.row_ref ?? (r.row == null ? "" : String(r.row)) },
    { id: "category", header: "Category", sortable: true, value: (r) => String(r.global_category_name ?? r.category_name ?? "") },
    { id: "activity", header: "Activity", sortable: true, value: (r) => String(r.emission_category ?? "") },
    { id: "value", header: "Value", numeric: true, value: (r) => (r.activity_value == null || r.activity_value === "" ? null : Number(r.activity_value)), cell: (r) => (r.activity_value == null || r.activity_value === "" ? <span className="text-muted">–</span> : String(r.activity_value)) },
    { id: "unit", header: "Unit", value: (r) => String(r.activity_data_unit ?? "") },
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
    { id: "tco2e", header: "tCO₂e", numeric: true, sortable: true, decimals: 2, value: (r) => (r.total_emission == null ? null : Number(r.total_emission)) },
    { id: "date", header: "Filed in", value: (r) => String(r.date_of_reporting ?? "").slice(0, 7) },
    {
      id: "issue",
      header: "Issue",
      sortable: true,
      wrap: true,
      value: (r) => (r.issues ?? []).map((i) => i.message).join(" ") || (r.state === "skipped" ? "Skipped" : ""),
      cell: (r) => {
        if (r.state === "skipped") return <Badge>Skipped</Badge>;
        const severity = rowSeverity(r);
        if (!severity) return <Badge tone="good">OK</Badge>;
        return (
          <span className="flex flex-wrap items-center gap-1">
            <Badge tone={SEVERITY_TONE[severity]}>{SEVERITY_LABEL[severity]}</Badge>
            {(r.issues ?? []).map((i) => (
              <span key={i.code} className={severity === "error" ? "text-bad" : "text-muted"}>
                {i.message}
              </span>
            ))}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: "",
      hideable: false,
      width: "9rem",
      value: () => "",
      exportValue: () => undefined,
      cell: (r) =>
        r.row_ref && !(r as { local?: boolean }).local ? (
          <span className="flex gap-1">
            <Button size="sm" variant="ghost" disabled={props.busy} onClick={() => props.onSkip(r.row_ref as string, r.state !== "skipped")}>
              {r.state === "skipped" ? "Unskip" : "Skip"}
            </Button>
            {r.state !== "skipped" && (
              <Button size="sm" variant="ghost" disabled={props.busy} onClick={() => setEditing(r)}>
                Edit
              </Button>
            )}
          </span>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      {plan && (
        <KpiStrip
          items={[
            { label: "Will import", value: plan.counts.ready, format: "number", primary: true, hint: plan.counts.warnings ? `${plan.counts.warnings} with a note` : undefined },
            { label: "Won't import", value: plan.counts.issue, format: "number", hint: plan.counts.issue ? "Fix them to import, or skip them" : undefined },
            { label: "Skipped", value: plan.counts.skipped, format: "number" },
            { label: "Total", value: plan.totals.tco2e, format: "emissions", hint: "of the rows that will import" },
          ]}
        />
      )}
      {plan && (plan.totals.by_category.length > 0 || plan.totals.by_month.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          <Totals title="By category" rows={plan.totals.by_category.map((c) => ({ label: c.name, rows: c.rows, tco2e: c.tco2e }))} />
          <Totals title="By month" rows={plan.totals.by_month.map((m) => ({ label: m.month, tco2e: m.tco2e }))} />
        </div>
      )}
      {blocked && (
        <Callout tone="warn" title={`${rowsText(plan?.counts.issue ?? 0)} can't be imported as they are`}>
          They're left out when you import. Fix each one (Edit) to bring it in, or skip it (or every row with the same issue) to say so. Rows for other sites are always left out: upload the file again for that site.
        </Callout>
      )}
      {props.autoMapped && (
        <Callout tone="info" title="ESGLite mapped this workbook for you">
          Every column and match was found with confidence, so there was nothing to check. If something looks wrong, change the mapping.
        </Callout>
      )}
      {props.patchError && <Callout tone="warn" title="The change wasn't saved">{props.patchError}</Callout>}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-muted" role="status">
          {!props.rows
            ? " "
            : props.pageOnly
              ? `${rowsText(rows.length)} with this issue on page ${props.page + 1}; use the pages below for the rest.`
              : total > rows.length
                ? `Showing ${rows.length} of ${rowsText(total)}.`
                : rowsText(total) + "."}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <Select<string>
            label="Issue"
            placeholder="All rows"
            value={props.code}
            options={options}
            emptyText="No issues"
            onChange={props.onCode}
            className="min-w-56"
          />
          {/* Rows kept back by the AI service never reached the plan: there is nothing to skip, they are left out. */}
          {selectedIssue && !selectedIssue.local && (
            <Button size="sm" variant="secondary" disabled={props.busy} loading={props.busy} onClick={() => props.onSkipIssue(selectedIssue.code)}>
              Skip all {selectedIssue.count} rows with this issue
            </Button>
          )}
          {selectedIssue?.local && <p className="text-xs text-muted">These rows were never sent to the plan; they're left out when you import.</p>}
        </div>
      </div>

      <DataTable<Row>
        label="Rows of the plan"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.row_ref ?? r._i}
        rowLabel={(r) => `Row ${r.row_ref ?? r._i + 1}`}
        loading={props.loading}
        error={props.error}
        onRetry={props.onRetry}
        empty={<EmptyState title={props.code ? `No rows with “${issueLabel(props.code)}”` : "No rows to import"} description={props.code ? undefined : "Go back and include at least one sheet."} />}
        pagination={{ mode: "server", page: props.page, pageSize: 100, total, onPageChange: props.onPage }}
        maxHeight="28rem"
      />

      <RowEditModal
        row={editing}
        saving={props.busy}
        error={props.patchError}
        onClose={() => setEditing(null)}
        onSave={(ref, edit) => {
          props.onEdit(ref, edit);
          setEditing(null);
        }}
      />

      <div className="flex flex-wrap justify-between gap-3">
        <Button variant="secondary" onClick={props.onBack}>
          {props.autoMapped ? "Change mapping" : "Back"}
        </Button>
        {/* Rows with issues are left out at import (they can't all be skipped: some never reach the plan), so the
            button says so instead of blocking. Off while a change is saving or the plan is being reread,
            so the commit always carries the plan's current version. */}
        <Button variant="primary" disabled={!plan?.plan_id || (plan?.counts.ready ?? 0) <= 0 || props.busy || props.loading} onClick={props.onImport}>
          {plan && plan.counts.ready > 0 ? `Import ${rowsText(plan.counts.ready)}${blocked ? `, leave ${plan.counts.issue} out` : ""}` : "Import"}
        </Button>
      </div>
    </div>
  );
}

function Totals({ title, rows }: { title: string; rows: { label: string; rows?: number; tco2e: number }[] }) {
  return (
    <section aria-label={title} className="rounded-card border border-line p-3">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nothing yet.</p>
      ) : (
        <ul className="mt-1 divide-y divide-line text-sm">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-2 py-1">
              <span className="truncate text-ink">
                {r.label}
                {r.rows != null && <span className="text-muted"> · {rowsText(r.rows)}</span>}
              </span>
              <span className="font-num tabular-nums text-ink">{formatNumber(r.tco2e, 3)} tCO₂e</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
