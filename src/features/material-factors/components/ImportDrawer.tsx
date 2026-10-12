import { type ReactNode, useMemo, useRef, useState } from "react";
import { CheckCircle2, Download, Sparkles } from "lucide-react";
import { Badge, Button, Callout, Combobox, Drawer, FileDrop, type FileDropItem, Select, Stepper } from "../../../ui";
import type { MaterialFactorBody } from "../../../services/materialFactorService";
import { type FactorSheetResponse, aiErrorMessage, aiUnreachable, parseMaterialFactorSheet } from "../../../services/pcfAiService";
import { type ImportError, errorMessage, importErrors, useImportCheck, useImportFactors } from "../api";
import { type Company, type Mapping, type Role, SHEET_FIELDS, detectMapping, mappingFromAi, mappingOverride, missingRequired, rowsFromAi, toRow } from "../logic";
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

const FALLBACK_NOTE = "The AI sheet reader couldn't be reached, so the columns were matched by header name here instead.";
const AI_FILE = "Use an .xlsx or .csv file. Save an .xls file as .xlsx first.";

/**
 * Import sheet: upload → check the detected columns and rows → import all or nothing.
 * The AI sheet reader (E2) reads any layout and checks the rows; when it can't
 * be reached the sheet is read in the browser and columns matched by header name.
 */
export function ImportDrawer(props: Props) {
  const [step, setStep] = useState(0);
  const [items, setItems] = useState<FileDropItem[]>([]);
  const [file, setFile] = useState<File | null>(null);
  // Either the AI reader's answer or the in-browser sheet (fallback); never both.
  const [ai, setAi] = useState<FactorSheetResponse | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [fallbackNote, setFallbackNote] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const readSeq = useRef(0);
  const [mapping, setMapping] = useState<Mapping>({});
  const [companyId, setCompanyId] = useState<number | null>(props.defaultCompanyId);
  // The rows the server last refused; Import stays off until the file, columns or target change.
  const [refused, setRefused] = useState<object | null>(null);
  const run = useImportFactors();

  const reset = () => {
    readSeq.current++;
    setStep(0);
    setItems([]);
    setFile(null);
    setAi(null);
    setSheet(null);
    setFallbackNote(null);
    setReadError(null);
    setReading(false);
    setMapping({});
    setRefused(null);
    run.reset();
  };
  const close = () => {
    if (run.isPending) return;
    reset();
    props.onClose();
  };

  // The in-browser reader: the fallback, and the only path for .xls files.
  const readLocally = async (f: File, note: string | null) => {
    const s = await readSheet(f);
    if (!s.rows.length) throw new Error("empty");
    if (s.rows.length > MAX_ROWS) {
      setReadError(`The sheet has ${s.rows.length} rows; import at most ${MAX_ROWS} at a time.`);
      return;
    }
    setAi(null);
    setSheet(s);
    setFallbackNote(note);
    setMapping(detectMapping(s.headers));
    setStep(1);
  };

  const onAdd = async (files: File[]) => {
    const f = files[0];
    const seq = ++readSeq.current;
    setItems([{ id: f.name, file: f }]);
    setFile(f);
    setReadError(null);
    setFallbackNote(null);
    run.reset();
    try {
      if (/\.xls$/i.test(f.name)) {
        await readLocally(f, null);
        return;
      }
      setReading(true);
      try {
        const r = await parseMaterialFactorSheet(f);
        if (seq !== readSeq.current) return;
        if (!Array.isArray(r.rows)) throw new Error("shape");
        if (r.total_rows > MAX_ROWS) {
          setReadError(`The sheet has ${r.total_rows} rows; import at most ${MAX_ROWS} at a time.`);
          return;
        }
        if (!r.rows.length) throw new Error("empty");
        setSheet(null);
        setAi(r);
        setMapping(mappingFromAi(r.mapping));
        setStep(1);
      } catch (e) {
        if (seq !== readSeq.current) return;
        if (e instanceof Error && e.message === "empty") throw e;
        if (!aiUnreachable(e)) {
          setReadError(aiErrorMessage(e, AI_FILE));
          return;
        }
        await readLocally(f, FALLBACK_NOTE);
      } finally {
        if (seq === readSeq.current) setReading(false);
      }
    } catch {
      if (seq === readSeq.current) setReadError("Couldn't read that file. Use an .xlsx, .xls or .csv file with one header row.");
    }
  };

  /** AI mode: a changed column or sheet re-reads the file with the person's choices; the rows come back re-checked. */
  const reread = async (next: Mapping | null, sheetName: string | null) => {
    if (!file || !ai) return;
    const seq = ++readSeq.current;
    if (next) setMapping(next);
    setRefused(null);
    setReading(true);
    try {
      const r = await parseMaterialFactorSheet(file, { sheetName, mapping: next ? mappingOverride(next) : undefined });
      if (seq !== readSeq.current) return;
      setAi(r);
      setMapping(mappingFromAi(r.mapping));
    } catch (e) {
      if (seq !== readSeq.current) return;
      setReadError(aiUnreachable(e) ? "The AI sheet reader stopped answering. Choose the file again to continue." : aiErrorMessage(e, "Couldn't re-read the sheet with those columns."));
    } finally {
      if (seq === readSeq.current) setReading(false);
    }
  };
  const changeMapping = (field: keyof Mapping, header: string | null) => {
    const next = { ...mapping, [field]: header ?? undefined };
    if (ai) void reread(next, ai.sheet_name);
    else setMapping(next);
  };

  const parsed = useMemo(
    () => (ai ? rowsFromAi(ai.rows) : sheet ? sheet.rows.map((r) => ({ line: r.line, ...toRow(r.raw, mapping) })) : []),
    [ai, sheet, mapping],
  );
  const lowConfidence = useMemo(() => (ai ? ai.rows.filter((r) => r.confidence < 60) : []), [ai]);
  const missing = missingRequired(mapping);
  const withProblems = parsed.filter((p) => p.problems.length);
  const serverErrors = importErrors(run.error);
  const body = useMemo(
    () => ({ ...(props.role === "Superadmin" ? { company_id: companyId } : {}), rows: parsed.map((p): MaterialFactorBody => p.row) }),
    [props.role, companyId, parsed],
  );
  const loaded = !!ai || !!sheet;
  const clientOk = loaded && !reading && missing.length === 0 && withProblems.length === 0;
  // The server dry run also finds rows already in the library. If it can't run, the import itself still checks everything.
  const check = useImportCheck(body, clientOk && step === 1);
  const canImport = clientOk && !run.isPending && refused !== body && (check.data ? check.data.valid : !!check.error);

  const submit = () => {
    setRefused(null);
    run.mutate(body, {
      onSuccess: () => setStep(2),
      onError: (e) => {
        const status = (e as { response?: { status?: number } })?.response?.status;
        // 400 / 409: the rows themselves were refused, so the same rows would fail again.
        if (status === 400 || status === 409) setRefused(body);
      },
    });
  };

  const companyOptions = [{ value: 0, label: "Global library" }, ...props.companies.map((c) => ({ value: c.company_id, label: c.name }))];
  const headerOptions = (ai?.headers ?? sheet?.headers ?? []).map((h) => ({ value: h, label: h }));
  const sheetOptions = (ai?.sheet_names ?? []).map((n) => ({ value: n, label: n }));

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
              help="Excel or CSV in any layout, one factor per row, up to 1,000 rows. The AI reader finds the columns."
              items={items}
              onAdd={(f) => void onAdd(f)}
              onRemove={() => {
                readSeq.current++;
                setItems([]);
                setFile(null);
                setReadError(null);
                setReading(false);
              }}
              accept={[".xlsx", ".xls", ".csv"]}
              maxSize={5 * 1024 * 1024}
              multiple={false}
              disabled={reading}
            />
            {reading && (
              <p className="text-sm text-muted" role="status">
                Reading the sheet…
              </p>
            )}
            {readError && <Callout tone="warn">{readError}</Callout>}
            <Button variant="ghost" icon={<Download aria-hidden className="size-4" />} onClick={downloadTemplate}>
              Download the column template
            </Button>
          </div>
        )}

        {step === 1 && loaded && (
          <div className="space-y-5">
            {fallbackNote && <Callout tone="info">{fallbackNote}</Callout>}
            {readError && <Callout tone="warn">{readError}</Callout>}
            <section aria-labelledby="import-columns" className="space-y-3">
              <h3 id="import-columns" className="text-sm font-semibold text-ink">
                Columns
              </h3>
              <p className="text-sm text-muted">
                {ai
                  ? `${ai.ai_used ? "The AI reader" : "We"} matched your headers${ai.header_line > 1 ? ` (header on row ${ai.header_line})` : ""}. Change any match that is wrong; the rows are re-read.`
                  : "We matched your headers by name. Change any match that is wrong."}
              </p>
              {sheetOptions.length > 1 && (
                <Select<string> label="Sheet" value={ai?.sheet_name ?? sheetOptions[0].value} onChange={(v) => v && void reread(null, v)} options={sheetOptions} className="sm:w-1/2" disabled={reading} />
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {SHEET_FIELDS.map((f) => {
                  const match = ai?.mapping[f.field];
                  return (
                    <Select<string>
                      key={f.field}
                      label={f.label}
                      required={f.required}
                      value={mapping[f.field] ?? null}
                      onChange={(v) => changeMapping(f.field, v)}
                      options={headerOptions}
                      placeholder="Not in the sheet"
                      disabled={reading}
                      help={
                        match && mapping[f.field] === match.header ? (
                          <span className="inline-flex flex-wrap items-center gap-1">
                            {match.by === "ai" && (
                              <Badge tone={match.confidence < 60 ? "warn" : "neutral"} className="gap-1">
                                <Sparkles aria-hidden className="size-3" /> AI {match.confidence}%
                              </Badge>
                            )}
                            {match.reason}
                          </span>
                        ) : undefined
                      }
                    />
                  );
                })}
              </div>
              {ai?.sheet_unit && <p className="text-sm text-muted">{ai.sheet_unit.reason}.</p>}
              {missing.length > 0 && <Callout tone="warn">Pick a column for {missing.join(", ")}.</Callout>}
              {reading && (
                <p className="text-sm text-muted" role="status">
                  Re-reading the sheet…
                </p>
              )}
            </section>

            {missing.length === 0 && (
              <section aria-labelledby="import-rows" className="space-y-3">
                <h3 id="import-rows" className="text-sm font-semibold text-ink">
                  Rows
                </h3>
                {ai && ai.warnings.length > 0 && (
                  <Callout tone="info">
                    <ul className="space-y-1">
                      {ai.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </Callout>
                )}
                {lowConfidence.length > 0 && (
                  <Callout tone="warn" title={`${lowConfidence.length} ${lowConfidence.length === 1 ? "row was" : "rows were"} read with low confidence. Check ${lowConfidence.length === 1 ? "it" : "them"} before importing.`}>
                    <RowList items={lowConfidence.map((r) => ({ line: r.line, text: `${r.reason}${r.warnings.length ? ` (${r.warnings.join("; ")})` : ""}` }))} />
                  </Callout>
                )}
                {withProblems.length > 0 ? (
                  <Callout tone="warn" title={`${withProblems.length} of ${parsed.length} rows need fixing in the sheet`}>
                    <RowList items={withProblems.map((p) => ({ line: p.line, text: p.problems.join("; ") }))} />
                  </Callout>
                ) : (
                  <p className="text-sm text-muted" role="status">
                    {check.isFetching
                      ? `All ${parsed.length} rows look complete. Checking them against the library…`
                      : refused === body
                        ? `Nothing was imported. Fix the rows below in the sheet or the columns, then import again.`
                        : check.data?.valid
                        ? `All ${parsed.length} rows are ready to import.`
                        : check.data
                          ? `Some rows can't be imported yet.`
                          : `All ${parsed.length} rows look complete. We couldn't check them against the library, so duplicates are checked when you import; nothing is saved if any row fails.`}
                  </p>
                )}
                {!check.isFetching && check.data && !check.data.valid && refused !== body && (
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

            {!!run.error && (refused === null || refused === body) && (
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
