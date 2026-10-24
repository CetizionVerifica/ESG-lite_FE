import { useMemo, useState } from "react";
import { Badge, Button, Callout, type Column, DataTable, Drawer, EmptyState, FileDrop, type FileDropItem, KpiStrip, SegmentedControl } from "../../../../ui";
import type { KpiTemplatePlan, KpiTemplateRow } from "../../../../lib/kpi/contracts";
import { periodText } from "../../../../lib/kpi/entry";
import { kpiErrorMessage, useCommitTemplate, usePlanTemplate } from "../api";

type Shown = "all" | "issues";
const ACCEPT = [".xlsx"];
const rowsText = (n: number) => `${n} ${n === 1 ? "row" : "rows"}`;

/**
 * KPI-7 part 3 · "Upload filled template", the bulk-upload drop-and-review
 * pattern for KPIs: drop the sheet, see which rows will be saved and why
 * the others won't, then save the ready rows as drafts. Nothing is sent for
 * review here; the person still checks and submits.
 */
export function TemplateUpload({ open, period, siteId, onClose, onSaved }: { open: boolean; period: string; siteId: number | null; onClose: () => void; onSaved: (saved: number) => void }) {
  const plan = usePlanTemplate();
  const commit = useCommitTemplate();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<KpiTemplatePlan | null>(null);
  const [shown, setShown] = useState<Shown>("all");
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFile(null);
    setResult(null);
    setShown("all");
    setError(null);
  };
  const close = () => {
    reset();
    onClose();
  };
  const check = async () => {
    if (!file) return;
    setError(null);
    try {
      setResult(await plan.mutateAsync({ file, period, siteId }));
    } catch (e) {
      setError(kpiErrorMessage(e, "Couldn't read the file. Check it's the template from this page."));
    }
  };
  const save = async () => {
    if (!result) return;
    setError(null);
    try {
      const r = await commit.mutateAsync(result.plan_id);
      reset();
      onSaved(r.saved);
    } catch (e) {
      setError(kpiErrorMessage(e, "Nothing was saved. Try again."));
    }
  };

  const items: FileDropItem[] = file ? [{ id: "sheet", file, status: plan.isPending ? "uploading" : "queued" }] : [];
  const rows = useMemo(() => (result?.rows ?? []).filter((r) => shown === "all" || r.issue), [result, shown]);
  const columns: Column<KpiTemplateRow>[] = [
    { id: "row", header: "Row", numeric: true, width: "4rem", hideable: false, value: (r) => r.row },
    { id: "kpi", header: "KPI", value: (r) => r.name ?? r.kpi_code ?? "" },
    { id: "site", header: "Site", value: (r) => r.site_name ?? (r.site_id === null && r.kpi_definition_id ? "Company" : "") },
    { id: "period", header: "Period", value: (r) => (r.period_start ? periodText(r.period_start, "monthly") : "") },
    { id: "value", header: "Value", numeric: true, value: (r) => (typeof r.value === "number" ? r.value : null), cell: (r) => (r.value === null || r.value === "" ? <span className="text-muted">–</span> : String(r.value)) },
    { id: "unit", header: "Unit", value: (r) => r.unit ?? "" },
    {
      id: "issue",
      header: "Issue",
      wrap: true,
      value: (r) => r.issue?.message ?? "",
      cell: (r) => (r.issue ? <span className="text-warn">{r.issue.message}</span> : <Badge tone="good">OK</Badge>),
    },
  ];

  return (
    <Drawer
      open={open}
      onClose={close}
      title="Upload filled template"
      subtitle={result ? `${rowsText(result.rows.length)} read from ${file?.name ?? "your file"}` : `For ${periodText(`${period}-01`, "monthly")}. Rows are saved as drafts; you still submit them.`}
      size="lg"
      footer={
        result ? (
          <>
            <Button variant="secondary" onClick={() => setResult(null)}>
              Back
            </Button>
            <Button variant="primary" onClick={() => void save()} loading={commit.isPending} disabled={!result.counts.ready}>
              {result.counts.ready ? `Save ${rowsText(result.counts.ready)} as drafts` : "Nothing to save"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void check()} loading={plan.isPending} disabled={!file}>
              Check the file
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {error && (
          <Callout tone="warn" title={result ? "Couldn't save" : "Couldn't read the file"}>
            {error}
          </Callout>
        )}
        {!result ? (
          <>
            <FileDrop
              label="Filled template"
              help="The sheet from Download template, with the Value column filled in, saved as .xlsx."
              accept={ACCEPT}
              maxSize={10 * 1024 * 1024}
              multiple={false}
              maxFiles={1}
              items={items}
              disabled={plan.isPending}
              onAdd={(files) => setFile(files[0] ?? null)}
              onRemove={() => setFile(null)}
            />
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              <li>Keep the KPI, Site and Period columns as they are; fill in Value, and Unit if yours is different.</li>
              <li>Empty rows are left out. Nothing goes for review until you submit.</li>
            </ul>
          </>
        ) : (
          <>
            <KpiStrip
              items={[
                { label: "Will be saved as drafts", value: result.counts.ready, format: "number", primary: true },
                { label: "Won't be saved", value: result.counts.issues, format: "number", hint: result.counts.issues ? "Fix the file, or save without them" : undefined },
              ]}
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted" role="status">
                {`${rowsText(result.rows.length)}. ${result.counts.ready} ready, ${result.counts.issues} need a look.`}
              </p>
              <SegmentedControl<Shown>
                label="Rows shown"
                size="sm"
                value={shown}
                onChange={setShown}
                options={[
                  { value: "all", label: `All (${result.rows.length})` },
                  { value: "issues", label: `Issues (${result.counts.issues})` },
                ]}
              />
            </div>
            <DataTable<KpiTemplateRow>
              label="Rows in the template"
              rows={rows}
              columns={columns}
              getRowId={(r) => r.row}
              rowLabel={(r) => `Row ${r.row}`}
              empty={<EmptyState title={shown === "issues" ? "No issues in these rows." : "No rows with a value."} description={shown === "issues" ? undefined : "Fill in the Value column, then upload again."} />}
              pagination={{ mode: "client", pageSize: 25 }}
              maxHeight="24rem"
            />
          </>
        )}
      </div>
    </Drawer>
  );
}
