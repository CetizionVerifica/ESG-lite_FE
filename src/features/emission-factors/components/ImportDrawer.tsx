import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, FileSpreadsheet, Sparkles } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  type Column,
  DataTable,
  Drawer,
  EmptyState,
  FileDrop,
  type FileDropItem,
  Modal,
  Select,
  Stepper,
  TextField,
  cn,
  focusRing,
  inputBase,
} from "../../../ui";
import { errorMessage, useImportFactors } from "../api";
import {
  type CategoryMap,
  type ImportRow,
  type JobResult,
  SHEET_ACCEPT,
  SHEET_MAX,
  type Target,
  distinctYears,
  formTargets,
  parseSimpleRows,
  planUpload,
  previewRows,
  rowProblem,
  totals,
} from "../importLogic";
import { type Category, type Company, type Site, categoriesFor } from "../logic";

type Mode = "simple" | "ai";
const STEPS = [
  { id: "upload", label: "Upload", description: "Choose the sheet" },
  { id: "preview", label: "Preview", description: "Check and edit rows" },
  { id: "result", label: "Result", description: "What was saved" },
];

type Props = {
  open: boolean;
  onClose: () => void;
  sites: Site[];
  companies: Company[];
  categories: Category[];
  /** Client and site from the page filters. */
  defaults: { clientId: number | null; siteId: number | null; categoryId: number | null };
};

/** Reads the first sheet of a workbook into header-keyed rows. */
async function readSheet(file: File): Promise<Record<string, unknown>[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
  const first = wb.SheetNames[0];
  return first ? XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[first]) : [];
}

/**
 * Import factors: Upload → Preview → Result. Simple sheets are read in the
 * browser; the AI path (Check layout, Map to categories) arrives in P22 3/3.
 * Mount it fresh for each import so it starts empty.
 */
export function ImportDrawer({ open, onClose, sites, companies, categories, defaults }: Props) {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<Mode>("simple");
  const [file, setFile] = useState<File | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [rows, setRows] = useState<ImportRow[]>([]);

  // Target: a site id, or "client:<id>" for every site of a client that reports the category.
  const [clientId, setClientId] = useState<number | null>(defaults.clientId ?? sites.find((s) => s.site_id === defaults.siteId)?.company?.company_id ?? null);
  const [targetValue, setTargetValue] = useState<string | null>(defaults.siteId ? String(defaults.siteId) : null);
  const [categoryId, setCategoryId] = useState<number | null>(defaults.categoryId);
  const [filter, setFilter] = useState<{ year: number | null; q: string }>({ year: null, q: "" });
  const [touched, setTouched] = useState(false);
  const [results, setResults] = useState<JobResult[] | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const save = useImportFactors();

  const clientSites = useMemo(
    () => sites.filter((s) => !clientId || s.company?.company_id === clientId).sort((a, b) => a.name.localeCompare(b.name)),
    [sites, clientId],
  );
  const target: Target | null = targetValue?.startsWith("client:")
    ? { kind: "client", clientId: Number(targetValue.slice(7)) }
    : targetValue
      ? { kind: "site", siteId: Number(targetValue) }
      : null;
  const targetSiteId = target?.kind === "site" ? target.siteId : null;
  const categoryOptions = useMemo(() => {
    // A client-wide import may use any category; sites that don't report it are skipped and listed.
    const list = categoriesFor(targetSiteId, sites, categories);
    return list.map((c) => ({ value: c.category_id, label: c.category_name }));
  }, [targetSiteId, sites, categories]);

  const map: CategoryMap = { "": categoryId };
  const plan = target ? planUpload(rows, map, target, sites, categories) : null;
  const included = rows.filter((r) => !r.excluded);
  const invalid = included.filter((r) => rowProblem(r));
  const shown = previewRows(rows, { group: null, ...filter });
  const years = distinctYears(rows);
  const catName = (id: number) => categories.find((c) => c.category_id === id)?.category_name ?? `Category ${id}`;

  const dirty = !!file && !results;
  const close = () => (dirty && !save.isPending ? setConfirmClose(true) : onClose());

  const onFile = (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setFile(f);
    setReadError(null);
    setParseErrors([]);
    setRows([]);
  };

  const readFile = async () => {
    if (!file) return;
    setReading(true);
    setReadError(null);
    try {
      const json = await readSheet(file);
      const parsed = parseSimpleRows(json);
      if (!json.length) setReadError("The first sheet is empty.");
      else if (!parsed.rows.length) setReadError("No row has both a year and a factor. Check the headers: year, factor_value, unit, source, emission_category_name.");
      setRows(parsed.rows);
      setParseErrors(parsed.errors);
      if (parsed.rows.length) setStep(1);
    } catch {
      setReadError("This file couldn't be read as an Excel workbook. Save it as .xlsx and try again.");
    } finally {
      setReading(false);
    }
  };

  const update = (key: string, patch: Partial<ImportRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const targetError = touched && !target ? "Choose a site, or all of a client's sites." : undefined;
  const categoryError = touched && !categoryId ? "Choose the category these factors belong to." : undefined;
  const canSave = !!target && !!categoryId && !!plan && plan.rowCount > 0 && invalid.length === 0;

  const onSave = () => {
    setTouched(true);
    if (!canSave || !plan) return;
    save.mutate(
      { plan, categoryName: catName },
      {
        onSuccess: (res) => {
          setResults(res);
          setStep(2);
        },
      },
    );
  };

  const numberCell = (r: ImportRow, field: "year" | "factor_value", label: string) => (
    <input
      type="text"
      inputMode="decimal"
      aria-label={`${label}, row ${r.key.slice(1)}`}
      defaultValue={String(r[field])}
      disabled={r.excluded}
      onBlur={(e) => {
        const n = field === "year" ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
        update(r.key, { [field]: Number.isFinite(n) ? n : NaN });
      }}
      className={cn(inputBase, "h-8 w-24 px-2 font-num", focusRing)}
    />
  );
  const textCell = (r: ImportRow, field: "emission_category_name" | "denominator_unit" | "source", label: string, width: string) => (
    <input
      type="text"
      aria-label={`${label}, row ${r.key.slice(1)}`}
      value={r[field]}
      disabled={r.excluded}
      onChange={(e) => update(r.key, { [field]: e.target.value })}
      className={cn(inputBase, "h-8 px-2", width, focusRing)}
    />
  );
  const previewColumns: Column<ImportRow>[] = [
    {
      id: "include",
      header: "Include",
      hideable: false,
      width: "4.5rem",
      value: (r) => (r.excluded ? "No" : "Yes"),
      cell: (r) => (
        <input
          type="checkbox"
          aria-label={`Include row ${r.key.slice(1)}`}
          checked={!r.excluded}
          onChange={(e) => update(r.key, { excluded: !e.target.checked })}
          className={cn("size-4 accent-brand", focusRing)}
        />
      ),
    },
    { id: "name", header: "Emission category name", hideable: false, value: (r) => r.emission_category_name, cell: (r) => textCell(r, "emission_category_name", "Name", "w-48") },
    { id: "year", header: "Year", hideable: false, value: (r) => r.year, cell: (r) => numberCell(r, "year", "Year") },
    { id: "factor", header: "Factor", hideable: false, value: (r) => r.factor_value, cell: (r) => numberCell(r, "factor_value", "Factor") },
    { id: "unit", header: "Unit", value: (r) => r.denominator_unit, cell: (r) => textCell(r, "denominator_unit", "Unit", "w-24") },
    { id: "source", header: "Source", value: (r) => r.source, cell: (r) => textCell(r, "source", "Source", "w-36") },
    {
      id: "problem",
      header: "",
      hideable: false,
      width: "8rem",
      value: (r) => (r.excluded ? null : rowProblem(r)),
      cell: (r) => {
        const p = r.excluded ? null : rowProblem(r);
        return p ? <span className="text-xs text-bad">{p}</span> : null;
      },
    },
  ];

  const sum = results ? totals(results) : null;
  const forms = results ? formTargets(results) : [];

  const footer =
    step === 0 ? (
      <div className="flex w-full justify-end gap-2">
        <Button onClick={close}>Cancel</Button>
        <Button variant="primary" onClick={() => void readFile()} disabled={!file || mode !== "simple" || reading} loading={reading}>
          Read sheet
        </Button>
      </div>
    ) : step === 1 ? (
      <div className="flex w-full flex-wrap items-center gap-2">
        <Button onClick={() => setStep(0)} disabled={save.isPending}>
          Back
        </Button>
        <span className="text-sm text-muted" data-testid="import-count">
          {plan && target ? `${plan.rowCount} ${plan.rowCount === 1 ? "factor" : "factors"} to save` : `${included.length} of ${rows.length} rows included`}
        </span>
        <Button variant="primary" className="ml-auto" onClick={onSave} loading={save.isPending} disabled={save.isPending || (touched && !canSave)}>
          Save factors
        </Button>
      </div>
    ) : (
      <div className="flex w-full justify-end">
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      </div>
    );

  return (
    <>
      <Drawer open={open} size="lg" onClose={close} title="Import factors" subtitle="Upload a sheet, check the rows, then save." footer={footer}>
        <div className="space-y-5">
          <Stepper steps={STEPS} current={step} completed={STEPS.slice(0, step).map((s) => s.id)} label="Import steps" />

          {step === 0 && (
            <div className="space-y-4">
              <fieldset className="space-y-2">
                <legend className="mb-1 text-sm font-medium text-ink">What kind of sheet is it?</legend>
                <label className={cn("flex cursor-pointer gap-3 rounded-control border p-3", mode === "simple" ? "border-accent bg-tint" : "border-line")}>
                  <input type="radio" name="ef-mode" checked={mode === "simple"} onChange={() => setMode("simple")} className={cn("mt-0.5 size-4 accent-brand", focusRing)} />
                  <span>
                    <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      <FileSpreadsheet aria-hidden className="size-4" /> Simple sheet
                    </span>
                    <span className="block text-xs text-muted">One row per factor with columns year, factor_value, unit, source and emission_category_name. Read in your browser.</span>
                  </span>
                </label>
                <label className={cn("flex gap-3 rounded-control border border-line p-3 opacity-60")}>
                  <input type="radio" name="ef-mode" disabled checked={mode === "ai"} onChange={() => setMode("ai")} className="mt-0.5 size-4" />
                  <span>
                    <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      <Sparkles aria-hidden className="size-4" /> Any other layout (AI read)
                    </span>
                    <span className="block text-xs text-muted">DEFRA-style workbooks with sub-columns or groups. Coming in the next update.</span>
                  </span>
                </label>
              </fieldset>
              <FileDrop
                label="Sheet"
                help=".xlsx or .xls, up to 10 MB. Only the first sheet is read."
                accept={SHEET_ACCEPT}
                maxSize={SHEET_MAX}
                multiple={false}
                items={file ? [{ id: "sheet", file } satisfies FileDropItem] : []}
                onAdd={onFile}
                onRemove={() => {
                  setFile(null);
                  setRows([]);
                  setReadError(null);
                }}
              />
              {readError && (
                <Callout tone="warn" title="Couldn't read the sheet">
                  {readError}
                </Callout>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Select<number>
                  label="Client"
                  placeholder="Any client"
                  value={clientId}
                  onChange={(v) => {
                    setClientId(v);
                    setTargetValue(null);
                  }}
                  options={[...companies].sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ value: c.company_id, label: c.name }))}
                />
                <Select<string>
                  label="Save to"
                  required
                  placeholder="Choose a site"
                  value={targetValue}
                  onChange={(v) => {
                    setTargetValue(v);
                    if (v && !v.startsWith("client:") && categoryId) {
                      const s = sites.find((x) => x.site_id === Number(v));
                      if (s && !(s.categories ?? []).some((c) => c.category_id === categoryId)) setCategoryId(null);
                    }
                  }}
                  options={[
                    ...(clientId ? [{ value: `client:${clientId}`, label: `All sites of ${companies.find((c) => c.company_id === clientId)?.name ?? "this client"}` }] : []),
                    ...clientSites.map((s) => ({ value: String(s.site_id), label: clientId ? s.name : `${s.name} · ${s.company?.name ?? ""}` })),
                  ]}
                  error={targetError}
                />
                <Select<number>
                  label="Category"
                  required
                  placeholder="Choose a category"
                  value={categoryId}
                  onChange={setCategoryId}
                  options={categoryOptions}
                  emptyText="This site reports no categories"
                  error={categoryError}
                />
              </div>
              {parseErrors.length > 0 && (
                <Callout tone="warn" title={`${parseErrors.length} ${parseErrors.length === 1 ? "row was" : "rows were"} left out`}>
                  <ul className="list-disc pl-5">
                    {parseErrors.slice(0, 5).map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                    {parseErrors.length > 5 && <li>and {parseErrors.length - 5} more.</li>}
                  </ul>
                </Callout>
              )}
              {plan && plan.notAssigned.length > 0 && (
                <Callout tone="info" title="Some sites don't report this category">
                  These are skipped: {plan.notAssigned.map((n) => n.site).join(", ")}.
                </Callout>
              )}
              {save.error && (
                <Callout tone="warn" title="Nothing was saved">
                  {errorMessage(save.error, "Try again.")}
                </Callout>
              )}
              <div className="flex flex-wrap items-end gap-3">
                <Select<number>
                  label="Year"
                  placeholder="All years"
                  value={filter.year}
                  onChange={(v) => setFilter((f) => ({ ...f, year: v }))}
                  options={years.map((y) => ({ value: y, label: String(y) }))}
                  className="w-36"
                />
                <TextField label="Search rows" value={filter.q} onChange={(v) => setFilter((f) => ({ ...f, q: v }))} className="w-60" />
              </div>
              <p className="text-xs text-muted">Factors that already exist for the same site, category, year and name are skipped.</p>
              <DataTable<ImportRow>
                label="Rows to import"
                rows={shown}
                columns={previewColumns}
                getRowId={(r) => r.key}
                rowLabel={(r) => r.emission_category_name || `Row ${r.key.slice(1)}`}
                empty={<EmptyState icon={FileSpreadsheet} title="No rows match." />}
                pagination={{ mode: "client", pageSize: 50 }}
                maxHeight="50vh"
              />
              {invalid.length > 0 && (
                <p role="alert" className="text-sm text-bad">
                  Fix or exclude {invalid.length} {invalid.length === 1 ? "row" : "rows"} before saving.
                </p>
              )}
            </div>
          )}

          {step === 2 && results && sum && (
            <div className="space-y-4">
              <Callout tone={sum.failed ? "warn" : "brand"} title={`${sum.created} ${sum.created === 1 ? "factor" : "factors"} added, ${sum.skipped} skipped`}>
                {sum.skipped > 0 && "Skipped factors already existed for that site, category, year and name. "}
                {sum.failed > 0 && `${sum.failed} ${sum.failed === 1 ? "site" : "sites"} failed; the others were saved.`}
              </Callout>
              <ul className="divide-y divide-line rounded-control border border-line" aria-label="Saved per site">
                {results.map((r) => (
                  <li key={`${r.siteId}-${r.categoryId}`} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <span className="font-medium text-ink">{r.site}</span>
                    <span className="text-muted">{r.category}</span>
                    <span className="ml-auto flex items-center gap-2">
                      {r.error ? (
                        <Badge tone="bad">{r.error}</Badge>
                      ) : (
                        <>
                          <Badge tone="good">{r.created} added</Badge>
                          {r.skipped > 0 && <Badge tone="neutral">{r.skipped} skipped</Badge>}
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {plan && plan.notAssigned.length > 0 && (
                <Callout tone="info" title="Not saved to these sites">
                  They don't report the category: {plan.notAssigned.map((n) => `${n.site} (${n.category})`).join(", ")}. Add it to them on the Sites page, then import again.
                </Callout>
              )}
              {forms.length > 0 && (
                <div className="space-y-2 rounded-control border border-line p-3">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                    <CheckCircle2 aria-hidden className="size-4 text-good" /> Generate data-entry forms for these categories
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {forms.map((f) => (
                      <li key={`${f.siteId}-${f.categoryId}`}>
                        <Link
                          to={`/capture/forms?site=${f.siteId}&category=${f.categoryId}&generate=1`}
                          className={cn("inline-flex rounded-chip border border-line px-2.5 py-1 text-sm text-brand hover:bg-tint", focusRing)}
                        >
                          {f.site} · {f.category}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </Drawer>
      <Modal
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title="Stop this import?"
        description="Nothing from this sheet has been saved yet."
        cancelLabel="Keep going"
        primaryAction={{
          label: "Stop import",
          onClick: () => {
            setConfirmClose(false);
            onClose();
          },
        }}
      />
    </>
  );
}
