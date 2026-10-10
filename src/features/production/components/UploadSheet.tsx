import { useMemo, useState } from "react";
import { CheckCircle2, Download, Trash2 } from "lucide-react";
import type { Product } from "../../../services/productService";
import {
  Badge,
  Button,
  Callout,
  DateField,
  Drawer,
  FileDrop,
  type FileDropItem,
  NumberField,
  Select,
  Stepper,
  TextField,
  overlapsFor,
  shortRange,
} from "../../../ui";
import { errorMessage, useProductionMutations } from "../api";
import type { ProductionRow, SiteOption } from "../logic";
import { downloadTemplate, readSheet } from "../sheet";
import {
  type ExcludedRow,
  MAX_FILE_BYTES,
  type ParsedRow,
  type ReviewRow,
  bulkEntries,
  failedLines,
  headerProblem,
  isValidRow,
  parseRows,
  rowErrors,
  toReview,
} from "../upload";

const STEPS = [
  { id: "upload", label: "Upload" },
  { id: "review", label: "Review" },
  { id: "result", label: "Result" },
];

type Result = { created: number; failed: { line: number | null; message: string }[]; leftOut: number };

/**
 * Upload sheet: file → review and fix rows → result. Rows whose product isn't
 * on the site are excluded with a reason; rows that still need a fix are left
 * out of the upload and counted in the result.
 */
export function UploadSheet({
  open,
  onClose,
  sites,
  defaultSiteId,
  products,
  rows: existing,
}: {
  open: boolean;
  onClose: () => void;
  sites: SiteOption[];
  defaultSiteId: number | null;
  products: Product[];
  rows: ProductionRow[];
}) {
  const [step, setStep] = useState(0);
  const [siteId, setSiteId] = useState<number | null>(defaultSiteId);
  const [items, setItems] = useState<FileDropItem[]>([]);
  const [readError, setReadError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [excluded, setExcluded] = useState<ExcludedRow[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const { bulk } = useProductionMutations();

  const site = sites.find((s) => s.site_id === siteId) ?? null;
  const siteProducts = useMemo(() => products.filter((p) => p.site?.site_id === siteId), [products, siteId]);

  const reset = () => {
    setStep(0);
    setItems([]);
    setReadError(null);
    setParsed([]);
    setRows([]);
    setExcluded([]);
    setResult(null);
    bulk.reset();
  };
  const close = () => {
    if (bulk.isPending) return;
    reset();
    onClose();
  };

  const review = (list: ParsedRow[], forSite: number | null) => {
    const name = sites.find((s) => s.site_id === forSite)?.name ?? "your site";
    const split = toReview(list, products.filter((p) => p.site?.site_id === forSite), name);
    setRows(split.rows);
    setExcluded(split.excluded);
  };

  const onAdd = async (files: File[]) => {
    const file = files[0];
    setItems([{ id: file.name, file }]);
    setReadError(null);
    try {
      const sheet = await readSheet(file);
      if (sheet.rows.length === 0) {
        setReadError("The file has no data rows. Fill in the template below the header row.");
        return;
      }
      const problem = headerProblem(sheet.headers);
      if (problem) {
        setReadError(problem);
        return;
      }
      const list = parseRows(sheet.headers, sheet.rows);
      setParsed(list);
      review(list, siteId);
      setStep(1);
    } catch {
      setReadError("Couldn't read that file. Use an .xlsx, .xls or .csv file with one header row.");
    }
  };

  const updateRow = (line: number, patch: Partial<ReviewRow>) => setRows((rs) => rs.map((r) => (r.line === line ? { ...r, ...patch } : r)));
  const removeRow = (line: number) => setRows((rs) => rs.filter((r) => r.line !== line));

  const ready = rows.filter(isValidRow);
  const needsFix = rows.length - ready.length;

  const submit = () => {
    if (!siteId || ready.length === 0) return;
    const sent = ready;
    bulk.mutate(bulkEntries(sent, siteId), {
      onSuccess: (res) => {
        setResult({ created: res.created, failed: failedLines(sent, res.errors ?? []), leftOut: needsFix });
        setStep(2);
      },
    });
  };

  const productOptions = siteProducts.map((p) => ({ value: p.product_id, label: p.name }));

  return (
    <Drawer
      open={open}
      size="lg"
      onClose={close}
      title="Upload sheet"
      subtitle={site ? `Production for ${site.name}` : "Production from a spreadsheet"}
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          {step === 1 && (
            <Button onClick={reset} disabled={bulk.isPending}>
              Choose another file
            </Button>
          )}
          {step === 2 && <Button onClick={reset}>Upload another</Button>}
          <div className="ml-auto flex gap-2">
            <Button onClick={close} disabled={bulk.isPending}>
              {step === 2 ? "Close" : "Cancel"}
            </Button>
            {step === 1 && (
              <Button variant="primary" onClick={submit} loading={bulk.isPending} disabled={ready.length === 0 || !siteId}>
                Upload {ready.length} {ready.length === 1 ? "row" : "rows"}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <Stepper steps={STEPS} current={step} completed={STEPS.slice(0, step).map((s) => s.id)} label="Upload progress" />

        {step === 0 && (
          <div className="space-y-4">
            {sites.length > 1 && (
              <Select<number>
                label="Site"
                required
                value={siteId}
                onChange={setSiteId}
                options={sites.map((s) => ({ value: s.site_id, label: s.name }))}
                placeholder="Choose a site"
                help="Products in the sheet are matched to this site's products."
              />
            )}
            <FileDrop
              label="Production sheet"
              help="Excel or CSV up to 5 MB: product, quantity, unit and date (or month and year) columns."
              items={items}
              onAdd={(f) => void onAdd(f)}
              onRemove={() => {
                setItems([]);
                setReadError(null);
              }}
              accept={[".xlsx", ".xls", ".csv"]}
              maxSize={MAX_FILE_BYTES}
              multiple={false}
              disabled={!siteId}
            />
            {!siteId && <p className="text-sm text-muted">Choose a site first.</p>}
            {readError && (
              <Callout tone="warn" title="Couldn't use this file">
                {readError}
              </Callout>
            )}
            <p className="text-sm text-muted">
              Dates can be written as 19-03-2027, 03-2027, March 2027, 2027-03-19 or an Excel date; each row is logged for its whole month.
            </p>
            <Button variant="ghost" icon={<Download aria-hidden className="size-4" />} onClick={downloadTemplate}>
              Download template
            </Button>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2" data-testid="upload-counts">
              <Badge tone="neutral">Total {parsed.length}</Badge>
              <Badge tone="good">Valid {ready.length}</Badge>
              <Badge tone={needsFix ? "warn" : "neutral"}>Needs fix {needsFix}</Badge>
              <Badge tone={excluded.length ? "bad" : "neutral"}>Excluded {excluded.length}</Badge>
            </div>
            {rows.length === 0 ? (
              <Callout tone="warn" title="No rows can be uploaded">
                None of the sheet's products are set up for {site?.name ?? "this site"}. Check the product names against the list your admin set up.
              </Callout>
            ) : (
              <ReviewGrid rows={rows} productOptions={productOptions} existing={existing} siteId={siteId} onChange={updateRow} onRemove={removeRow} />
            )}
            {needsFix > 0 && ready.length > 0 && (
              <p className="text-sm text-muted">
                {needsFix} {needsFix === 1 ? "row needs" : "rows need"} a fix and will be left out unless you fix {needsFix === 1 ? "it" : "them"}.
              </p>
            )}
            {excluded.length > 0 && <ExcludedTable rows={excluded} />}
            {bulk.isError && (
              <p role="alert" className="rounded-control bg-bad-soft px-3 py-2 text-sm text-bad">
                {errorMessage(bulk.error, "The upload failed. Nothing was saved; try again.")}
              </p>
            )}
          </div>
        )}

        {step === 2 && result && (
          <div className="space-y-4" data-testid="upload-result">
            {result.created > 0 ? (
              <Callout tone="info" icon={CheckCircle2} title={`${result.created} ${result.created === 1 ? "record" : "records"} added`}>
                They are pending until your manager approves them.
              </Callout>
            ) : (
              <Callout tone="warn" title="Nothing was added">
                Every row was refused. The reasons are below.
              </Callout>
            )}
            {result.failed.length > 0 && (
              <section aria-labelledby="upload-failed" className="space-y-2">
                <h3 id="upload-failed" className="text-sm font-semibold text-ink">
                  {result.failed.length} {result.failed.length === 1 ? "row" : "rows"} failed
                </h3>
                <ul className="space-y-1 text-sm">
                  {result.failed.map((f, i) => (
                    <li key={i} className="rounded-control bg-bad-soft px-3 py-1.5 text-bad">
                      {f.line ? `Row ${f.line}: ` : ""}
                      {f.message}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {(result.leftOut > 0 || excluded.length > 0) && (
              <p className="text-sm text-muted">
                Not uploaded: {[result.leftOut ? `${result.leftOut} that needed a fix` : null, excluded.length ? `${excluded.length} excluded` : null].filter(Boolean).join(", ")}.
              </p>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}

function ReviewGrid({
  rows,
  productOptions,
  existing,
  siteId,
  onChange,
  onRemove,
}: {
  rows: ReviewRow[];
  productOptions: { value: number; label: string }[];
  existing: ProductionRow[];
  siteId: number | null;
  onChange: (line: number, patch: Partial<ReviewRow>) => void;
  onRemove: (line: number) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-control border border-line">
      <table className="w-full min-w-[62rem] text-sm">
        <caption className="sr-only">Rows to upload; fix any marked rows</caption>
        <thead className="bg-tint text-left text-xs text-muted">
          <tr>
            <th scope="col" className="px-2 py-2 font-medium">Row</th>
            <th scope="col" className="px-2 py-2 font-medium">Product</th>
            <th scope="col" className="px-2 py-2 font-medium">Quantity</th>
            <th scope="col" className="px-2 py-2 font-medium">Unit</th>
            <th scope="col" className="px-2 py-2 font-medium">Start</th>
            <th scope="col" className="px-2 py-2 font-medium">End</th>
            <th scope="col" className="px-2 py-2 font-medium">Notes</th>
            <th scope="col" className="px-2 py-2 font-medium"><span className="sr-only">Remove</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const e = rowErrors(r);
            const problems = Object.keys(e);
            const clash = overlapsFor(existing, { siteId, productId: r.productId, start: r.start, end: r.end })[0];
            const label = (what: string) => `Row ${r.line} ${what}`;
            return (
              <tr key={r.line} className="border-t border-line align-top" data-testid={`review-row-${r.line}`}>
                <td className="px-2 py-2 font-num tabular-nums text-muted">{r.line}</td>
                <td className="min-w-[10rem] px-2 py-2">
                  <Select<number> label={label("product")} hideLabel value={r.productId} onChange={(productId) => onChange(r.line, { productId })} options={productOptions} error={e.product} />
                </td>
                <td className="w-28 px-2 py-2">
                  <NumberField label={label("quantity")} hideLabel value={r.quantity} onChange={(quantity) => onChange(r.line, { quantity })} error={e.quantity} />
                </td>
                <td className="w-20 px-2 py-2">
                  <TextField label={label("unit")} hideLabel value={r.unit} onChange={(unit) => onChange(r.line, { unit })} error={e.unit} />
                </td>
                <td className="px-2 py-2">
                  <DateField label={label("start")} hideLabel value={r.start} onChange={(start) => onChange(r.line, { start })} error={e.start} />
                </td>
                <td className="px-2 py-2">
                  <DateField label={label("end")} hideLabel value={r.end} min={r.start || undefined} onChange={(end) => onChange(r.line, { end })} error={e.end} />
                </td>
                <td className="min-w-[8rem] px-2 py-2">
                  <TextField label={label("notes")} hideLabel value={r.notes} onChange={(notes) => onChange(r.line, { notes })} />
                  {problems.length === 0 && clash && (
                    <p className="mt-1 text-xs text-warn">
                      Overlaps an existing record ({shortRange(clash.start_date, clash.end_date)}, {clash.status}).
                    </p>
                  )}
                </td>
                <td className="px-2 py-2">
                  <Button size="sm" variant="ghost" aria-label={`Leave out row ${r.line}`} onClick={() => onRemove(r.line)}>
                    <Trash2 aria-hidden className="size-4" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ExcludedTable({ rows }: { rows: ExcludedRow[] }) {
  return (
    <section aria-labelledby="upload-excluded" className="space-y-2">
      <h3 id="upload-excluded" className="text-sm font-semibold text-ink">
        {rows.length} {rows.length === 1 ? "row" : "rows"} excluded
      </h3>
      <ul className="space-y-1 text-sm" data-testid="excluded-rows">
        {rows.map((r) => (
          <li key={r.line} className="flex gap-2">
            <span className="font-num tabular-nums text-muted">Row {r.line}</span>
            <span>{r.reason}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
