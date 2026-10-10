import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Badge, Button, Callout, type Column, DataTable, EmptyState, FileDrop, KpiStrip, SegmentedControl, exportMatrix, formatNumber, type FileDropItem } from "../../../ui";
import type { HistoricalPlanRow } from "../../../services/historicalImportService";
import { type Site, errorMessage, useHistoricalImport, useHistoricalPreview } from "../api";
import type { UploadContext } from "../hooks/useUploadContext";
import { HISTORICAL_ACCEPT, HISTORICAL_COLUMNS, HISTORICAL_MAX_BYTES, historicalFileProblem, historicalSkippedMatrix, monthLabel } from "../historical";
import { ContextFields } from "./ContextFields";
import { selectedSite } from "../logic";

type Shown = "all" | "skipped";
const rowsText = (n: number) => `${n} ${n === 1 ? "row" : "rows"}`;
const peopleText = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;

/**
 * Historical import (Superadmin): sheets in the old year / month / equipment
 * format. Only an existing client, site and category can be picked, the rows
 * are previewed before anything is saved, and new people get an invite email.
 * No password is ever shown.
 */
export function HistoricalImport(props: {
  ctx: UploadContext;
  onContext: (patch: Partial<UploadContext>) => void;
  sites: { data: Site[]; loading: boolean; error: string | null; retry: () => void };
}) {
  const { ctx, sites } = props;
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [shown, setShown] = useState<Shown>("all");
  const preview = useHistoricalPreview();
  const run = useHistoricalImport();

  const site = selectedSite(sites.data, ctx, false);
  const ready = !!site && ctx.clientId !== null && ctx.categoryId !== null && !!file && !fileError;
  const args = ready ? { file: file as File, companyId: ctx.clientId as number, siteId: site.site_id, categoryId: ctx.categoryId as number } : null;

  const reset = () => {
    preview.reset();
    run.reset();
    setShown("all");
  };
  const changeContext = (patch: Partial<UploadContext>) => {
    props.onContext(patch);
    reset();
  };
  const chooseFile = (next: File | null) => {
    setFile(next);
    setFileError(next ? historicalFileProblem(next) : null);
    reset();
  };
  const startAgain = () => {
    chooseFile(null);
  };

  const plan = preview.data ?? null;
  const rows = useMemo(() => plan?.rows ?? [], [plan]);
  const visible = shown === "skipped" ? rows.filter((r) => r.status === "skip") : rows;
  const skippedCount = rows.filter((r) => r.status === "skip").length;

  const columns: Column<HistoricalPlanRow>[] = [
    { id: "row", header: "Row", numeric: true, width: "4rem", hideable: false, value: (r) => r.row },
    { id: "month", header: "Month", sortable: true, value: (r) => r.period ?? "", cell: (r) => monthLabel(r.period) || <span className="text-muted">–</span> },
    { id: "fuel", header: "Fuel type", sortable: true, value: (r) => r.fuelType },
    { id: "activity", header: "Activity", numeric: true, value: (r) => r.activity },
    { id: "unit", header: "Unit", value: (r) => r.unit },
    { id: "tco2e", header: "tCO₂e", numeric: true, sortable: true, value: (r) => r.total, cell: (r) => (r.total === null ? <span className="text-muted">–</span> : formatNumber(r.total, 2)) },
    { id: "from", header: "Total from", value: (r) => (r.totalFrom === "calculated" ? "Calculated" : r.totalFrom === "file" ? "The sheet" : "") },
    {
      id: "status",
      header: "Status",
      sortable: true,
      value: (r) => r.reason ?? "",
      cell: (r) => (r.status === "import" ? <Badge tone="good">Import</Badge> : <span className="text-bad">{r.reason}</span>),
    },
  ];

  if (run.isSuccess) {
    const s = run.data.summary;
    const skipped = historicalSkippedMatrix(run.data);
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink" role="status">
          {s.emissionsCreated === 0 ? "No rows were imported." : `Imported ${rowsText(s.emissionsCreated)} for ${s.site.name}, ${s.category.name}.`}
        </p>
        <KpiStrip
          items={[
            { label: "Imported", value: s.emissionsCreated, format: "number", primary: true },
            { label: "Skipped", value: s.emissionsSkipped, format: "number" },
            { label: "New people", value: s.usersCreated, format: "number" },
            { label: "Invites sent", value: s.invitesSent, format: "number" },
          ]}
        />
        {s.emissionsCreated > 0 && (
          <Callout tone="info" title="Rows arrive as Pending">
            The site's manager approves them in Approvals.
          </Callout>
        )}
        {s.inviteWarning && (
          <Callout tone="warn" title="Some invites weren't sent">
            {s.inviteWarning} Send them later from Users.
          </Callout>
        )}
        {skipped && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              {rowsText(s.emissionsSkipped)} {s.emissionsSkipped === 1 ? "was" : "were"} skipped. The file gives the reason for each one.
            </p>
            <Button
              variant="secondary"
              icon={<Download aria-hidden className="size-4" />}
              onClick={() => void exportMatrix(skipped, `skipped-rows-${file?.name.replace(/\.[^.]+$/, "") ?? "historical"}`, "csv")}
            >
              Download skipped rows
            </Button>
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="primary" onClick={startAgain}>
            Import another sheet
          </Button>
        </div>
      </div>
    );
  }

  const items: FileDropItem[] = file ? [{ id: "sheet", file, status: preview.isPending ? "uploading" : "queued" }] : [];
  const newPeople = plan?.people.filter((p) => !p.exists) ?? [];
  const knownPeople = plan?.people.filter((p) => p.exists) ?? [];

  return (
    <div className="space-y-5">
      <Callout tone="info" title="For sheets in the old year and month format">
        Pick an existing client, site and category. You see every row before anything is saved, and people the sheet names who have no account get an invite email to choose a password.
      </Callout>
      {sites.error && (
        <Callout tone="warn" title="Couldn't load sites" action={<Button size="sm" variant="ghost" onClick={sites.retry}>Try again</Button>}>
          {sites.error}
        </Callout>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <ContextFields ctx={ctx} onContext={changeContext} sites={sites.data} sitesLoading={sites.loading} contributor={false} />
      </div>

      <FileDrop
        label="Spreadsheet"
        help="One sheet, header row first. .xlsx or .xls, up to 10 MB."
        accept={HISTORICAL_ACCEPT}
        maxSize={HISTORICAL_MAX_BYTES}
        multiple={false}
        maxFiles={1}
        items={items}
        disabled={preview.isPending || run.isPending}
        onAdd={(files) => chooseFile(files[0] ?? null)}
        onRemove={() => chooseFile(null)}
      />
      {fileError && <Callout tone="warn" title="Choose another file">{fileError}</Callout>}

      <details className="rounded-card border border-line p-3 text-sm">
        <summary className="cursor-pointer font-medium text-ink">Columns the sheet needs</summary>
        <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
          {HISTORICAL_COLUMNS.map((c) => (
            <div key={c.name} className="contents">
              <dt className="font-mono text-xs text-ink">{c.name}</dt>
              <dd className="text-muted">{c.text}</dd>
            </div>
          ))}
        </dl>
      </details>

      {preview.isError && (
        <Callout tone="warn" title="The preview didn't load">
          {errorMessage(preview.error, "Try again in a moment.")}
        </Callout>
      )}

      {!plan && (
        <div className="flex justify-end">
          <Button variant="primary" disabled={!args} loading={preview.isPending} onClick={() => args && preview.mutate(args)}>
            Preview rows
          </Button>
        </div>
      )}

      {plan && (
        <section aria-label="Preview" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted" role="status">
              {plan.summary.totalRows > rows.length ? `Showing the first ${rows.length} of ${plan.summary.totalRows} rows. ` : `${rowsText(plan.summary.totalRows)}. `}
              {plan.summary.toImport} will be imported, {plan.summary.toSkip} skipped.
            </p>
            <SegmentedControl<Shown>
              label="Rows shown"
              size="sm"
              value={shown}
              onChange={setShown}
              options={[
                { value: "all", label: `All (${rows.length})` },
                { value: "skipped", label: `Skipped (${skippedCount})` },
              ]}
            />
          </div>
          <DataTable<HistoricalPlanRow>
            label="Preview of the historical rows"
            rows={visible}
            columns={columns}
            getRowId={(r) => r.row}
            rowLabel={(r) => `Row ${r.row}`}
            empty={<EmptyState title={shown === "skipped" ? "No rows are skipped." : "The sheet has no rows."} />}
            pagination={{ mode: "client", pageSize: 25 }}
            maxHeight="28rem"
          />

          {plan.people.length > 0 && (
            <div className="space-y-1 text-sm">
              {newPeople.length > 0 && (
                <p className="text-ink">
                  {peopleText(newPeople.length)} will get an account at {plan.summary.site.name} and an invite email: {newPeople.map((p) => p.email).join(", ")}.
                </p>
              )}
              {knownPeople.length > 0 && (
                <p className="text-muted">
                  {peopleText(knownPeople.length)} already {knownPeople.length === 1 ? "has" : "have"} an account: {knownPeople.map((p) => p.email).join(", ")}.
                </p>
              )}
            </div>
          )}
          {plan.invalidEmails.length > 0 && (
            <Callout tone="warn" title="Some emails aren't valid">
              No account is made for {plan.invalidEmails.join(", ")}. Their rows are still imported.
            </Callout>
          )}
          {run.isError && (
            <Callout tone="warn" title="The import didn't finish">
              {errorMessage(run.error, "Nothing was saved, so you can try again.")}
            </Callout>
          )}

          <div className="flex flex-wrap justify-between gap-3">
            <Button variant="secondary" disabled={run.isPending} onClick={reset}>
              Back
            </Button>
            <Button variant="primary" disabled={!args || plan.summary.toImport === 0} loading={run.isPending} onClick={() => args && run.mutate(args)}>
              {plan.summary.toImport > 0 ? `Import ${rowsText(plan.summary.toImport)}` : "Nothing to import"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
