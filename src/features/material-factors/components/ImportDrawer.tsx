import { type ReactNode, useMemo, useState } from "react";
import { CheckCircle2, Download } from "lucide-react";
import { Button, Callout, Combobox, Drawer, FileDrop, type FileDropItem, Select, Stepper } from "../../../ui";
import type { MaterialFactorBody } from "../../../services/materialFactorService";
import { type ImportError, errorMessage, importErrors, useImportCheck, useImportFactors } from "../api";
import { type Company, type Mapping, type Role, SHEET_FIELDS, detectMapping, missingRequired, toRow } from "../logic";
import { type Sheet, downloadTemplate, readSheet } from "../sheet";

const STEPS = [
  { id: "upload", label: "Upload sheet" },
  { id: "review", label: "Check columns" },
  { id: "done", label: "Imported" },
];
const PREVIEW_ROWS = 8;
const MAX_ROWS = 1000;

type Props = {
  open: boolean;
  role: Role;
  companies: Company[];
  defaultCompanyId: number | null;
  onOpenExisting: (id: number) => void;
  onClose: () => void;
};

/**
 * Import sheet: upload → check the detected columns and rows → import all or nothing.
 * Columns are matched by header name; the AI sheet reader (E2) replaces the matching later.
 */
export function ImportDrawer(props: Props) {
  const [step, setStep] = useState(0);
  const [items, setItems] = useState<FileDropItem[]>([]);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [companyId, setCompanyId] = useState<number | null>(props.defaultCompanyId);
  const run = useImportFactors();

  const reset = () => {
    setStep(0);
    setItems([]);
    setSheet(null);
    setReadError(null);
    setMapping({});
    run.reset();
  };
  const close = () => {
    if (run.isPending) return;
    reset();
    props.onClose();
  };

  const onAdd = async (files: File[]) => {
    const file = files[0];
    setItems([{ id: file.name, file }]);
    setReadError(null);
    run.reset();
    try {
      const s = await readSheet(file);
      if (!s.rows.length) throw new Error("empty");
      if (s.rows.length > MAX_ROWS) {
        setReadError(`The sheet has ${s.rows.length} rows; import at most ${MAX_ROWS} at a time.`);
        return;
      }
      setSheet(s);
      setMapping(detectMapping(s.headers));
      setStep(1);
    } catch {
      setReadError("Couldn't read that file. Use an .xlsx, .xls or .csv file with one header row.");
    }
  };

  const parsed = useMemo(() => (sheet ? sheet.rows.map((r) => ({ line: r.line, ...toRow(r.raw, mapping) })) : []), [sheet, mapping]);
  const missing = missingRequired(mapping);
  const withProblems = parsed.filter((p) => p.problems.length);
  const serverErrors = importErrors(run.error);
  const body = useMemo(
    () => ({ ...(props.role === "Superadmin" ? { company_id: companyId } : {}), rows: parsed.map((p): MaterialFactorBody => p.row) }),
    [props.role, companyId, parsed],
  );
  const clientOk = !!sheet && missing.length === 0 && withProblems.length === 0;
  // The server dry run also finds rows already in the library. If it can't run, the import itself still checks everything.
  const check = useImportCheck(body, clientOk && step === 1);
  const canImport = clientOk && !run.isPending && (check.data ? check.data.valid : !!check.error);

  const submit = () => run.mutate(body, { onSuccess: () => setStep(2) });

  const companyOptions = [{ value: 0, label: "Global library" }, ...props.companies.map((c) => ({ value: c.company_id, label: c.name }))];
  const headerOptions = (sheet?.headers ?? []).map((h) => ({ value: h, label: h }));

  return (
    <Drawer
      open={props.open}
      size="lg"
      onClose={close}
      title="Import sheet"
      subtitle="Every row is checked first; nothing is saved unless all rows pass."
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          {step === 1 && (
            <Button onClick={reset} disabled={run.isPending}>
              Choose another file
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button onClick={close} disabled={run.isPending}>
              {step === 2 ? "Close" : "Cancel"}
            </Button>
            {step === 1 && (
              <Button variant="primary" onClick={submit} loading={run.isPending} disabled={!canImport}>
                Import {parsed.length} {parsed.length === 1 ? "factor" : "factors"}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <Stepper steps={STEPS} current={step} completed={STEPS.slice(0, step).map((s) => s.id)} label="Import progress" />

        {step === 0 && (
          <div className="space-y-4">
            {props.role === "Superadmin" && (
              <Combobox<number>
                label="Import into"
                help="Global rows are visible to every client."
                value={companyId ?? 0}
                onChange={(v) => setCompanyId(v ? v : null)}
                options={companyOptions}
              />
            )}
            <FileDrop
              label="Factor sheet"
              help="Excel or CSV, one factor per row, up to 1,000 rows."
              items={items}
              onAdd={(f) => void onAdd(f)}
              onRemove={() => {
                setItems([]);
                setReadError(null);
              }}
              accept={[".xlsx", ".xls", ".csv"]}
              maxSize={5 * 1024 * 1024}
              multiple={false}
            />
            {readError && <Callout tone="warn">{readError}</Callout>}
            <Button variant="ghost" icon={<Download aria-hidden className="size-4" />} onClick={downloadTemplate}>
              Download the column template
            </Button>
          </div>
        )}

        {step === 1 && sheet && (
          <div className="space-y-5">
            <section aria-labelledby="import-columns" className="space-y-3">
              <h3 id="import-columns" className="text-sm font-semibold text-ink">
                Columns
              </h3>
              <p className="text-sm text-muted">We matched your headers by name. Change any match that is wrong.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {SHEET_FIELDS.map((f) => (
                  <Select<string>
                    key={f.field}
                    label={f.label}
                    required={f.required}
                    value={mapping[f.field] ?? null}
                    onChange={(v) => setMapping((m) => ({ ...m, [f.field]: v ?? undefined }))}
                    options={headerOptions}
                    placeholder="Not in the sheet"
                  />
                ))}
              </div>
              {missing.length > 0 && <Callout tone="warn">Pick a column for {missing.join(", ")}.</Callout>}
            </section>

            {missing.length === 0 && (
              <section aria-labelledby="import-rows" className="space-y-3">
                <h3 id="import-rows" className="text-sm font-semibold text-ink">
                  Rows
                </h3>
                {withProblems.length > 0 ? (
                  <Callout tone="warn" title={`${withProblems.length} of ${parsed.length} rows need fixing in the sheet`}>
                    <RowList items={withProblems.map((p) => ({ line: p.line, text: p.problems.join("; ") }))} />
                  </Callout>
                ) : (
                  <p className="text-sm text-muted" role="status">
                    {check.isFetching
                      ? `All ${parsed.length} rows look complete. Checking them against the library…`
                      : check.data?.valid
                        ? `All ${parsed.length} rows are ready to import.`
                        : check.data
                          ? `Some rows can't be imported yet.`
                          : `All ${parsed.length} rows look complete. The library checks for duplicates when you import.`}
                  </p>
                )}
                {!check.isFetching && check.data && !check.data.valid && (
                  <ServerErrors
                    title="Fix these rows before importing"
                    errors={check.data.errors}
                    lines={parsed.map((p) => p.line)}
                    fallback=""
                    onOpenExisting={props.onOpenExisting}
                  />
                )}
                <Preview rows={parsed.slice(0, PREVIEW_ROWS).map((p) => p.row)} />
                {parsed.length > PREVIEW_ROWS && <p className="text-xs text-muted">Showing the first {PREVIEW_ROWS} of {parsed.length} rows.</p>}
              </section>
            )}

            {!!run.error && (
              <ServerErrors errors={serverErrors} lines={parsed.map((p) => p.line)} fallback={errorMessage(run.error, "Nothing was imported. Try again.")} onOpenExisting={props.onOpenExisting} />
            )}
          </div>
        )}

        {step === 2 && (
          <div className="flex items-start gap-3 rounded-control border border-line p-4">
            <CheckCircle2 aria-hidden className="mt-0.5 size-5 text-good" />
            <p className="text-sm text-ink">
              Imported {run.data?.created ?? parsed.length} {(run.data?.created ?? parsed.length) === 1 ? "factor" : "factors"}. They are in the list now.
            </p>
          </div>
        )}
      </div>
    </Drawer>
  );
}

function RowList({ items }: { items: { line: number; text: string; action?: ReactNode }[] }) {
  return (
    <ul className="mt-1 max-h-48 space-y-1 overflow-auto text-sm">
      {items.map((i) => (
        <li key={`${i.line}-${i.text}`} className="flex flex-wrap items-center gap-x-2">
          <span className="font-num text-muted">Row {i.line}</span>
          <span className="text-ink">{i.text}</span>
          {i.action}
        </li>
      ))}
    </ul>
  );
}

function ServerErrors(props: { title?: string; errors: ImportError[]; lines: number[]; fallback: string; onOpenExisting: (id: number) => void }) {
  const title = props.title ?? "Nothing was imported";
  if (!props.errors.length) return <Callout tone="warn" title={title}>{props.fallback}</Callout>;
  return (
    <Callout tone="warn" title={title}>
      <RowList
        items={props.errors.map((e) => ({
          line: props.lines[e.index] ?? e.index + 2,
          text: e.duplicate_of_row !== undefined ? `Repeats row ${props.lines[e.duplicate_of_row] ?? e.duplicate_of_row + 2}` : e.message,
          action: e.existing_id ? (
            <Button size="sm" variant="ghost" onClick={() => props.onOpenExisting(e.existing_id!)}>
              Open existing
            </Button>
          ) : undefined,
        }))}
      />
    </Callout>
  );
}

function Preview({ rows }: { rows: MaterialFactorBody[] }) {
  return (
    <div className="overflow-x-auto rounded-control border border-line">
      <table className="w-full text-sm">
        <caption className="sr-only">First rows of the sheet as they will be imported</caption>
        <thead className="bg-tint text-left text-xs text-muted">
          <tr>
            <th scope="col" className="px-3 py-2 font-medium">Name</th>
            <th scope="col" className="px-3 py-2 font-medium">Group</th>
            <th scope="col" className="px-3 py-2 font-medium">Geography</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Value</th>
            <th scope="col" className="px-3 py-2 font-medium">Unit</th>
            <th scope="col" className="px-3 py-2 font-medium">Source</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="px-3 py-2 text-ink">{r.name || "—"}</td>
              <td className="px-3 py-2">{r.material_group || "—"}</td>
              <td className="px-3 py-2">{r.geography || "Global"}</td>
              <td className="px-3 py-2 text-right font-num">{Number.isFinite(r.value_kgco2e) ? r.value_kgco2e : "—"}</td>
              <td className="px-3 py-2">{r.unit || "—"}</td>
              <td className="px-3 py-2">{[r.source, r.source_year].filter(Boolean).join(" ") || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
