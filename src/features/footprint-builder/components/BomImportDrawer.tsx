import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Sparkles } from "lucide-react";
import { Badge, Button, Callout, Drawer, FileDrop, type FileDropItem, NumberField, Select, Stepper, cn } from "../../../ui";
import { type BomResponse, type MappingOverride, aiErrorMessage, aiUnreachable } from "../../../services/pcfAiService";
import { linesFromBom } from "../ai";
import { useParseBom } from "../api";
import type { Line } from "../logic";

const STEPS = [
  { id: "upload", label: "Upload file" },
  { id: "review", label: "Check lines" },
];
const PREVIEW = 12;
/** How long the batch-size field waits after the last keystroke before the file is re-read. */
const REREAD_DELAY_MS = 600;
const BATCH_HELP = (unit: string) => `1 when the file lists what goes into one ${unit}; a batch size (e.g. 25) when it lists a whole batch or order. At least 1.`;
const BOM_FIELDS: { field: string; label: string; required?: boolean }[] = [
  { field: "name", label: "Material", required: true },
  { field: "quantity", label: "Quantity", required: true },
  { field: "unit", label: "Unit", required: true },
  { field: "stage", label: "Stage" },
  { field: "supplier_name", label: "Supplier" },
  { field: "origin_country", label: "Origin" },
  { field: "recycled_share_pct", label: "Recycled share %" },
];

type Props = {
  open: boolean;
  studyId: number;
  massPerUnitKg: number | null;
  unitLabel: string;
  onImport: (lines: Line[], fileName: string) => void;
  onClose: () => void;
};

/**
 * Import BOM (E2): an ERP export or spec sheet (xlsx, csv or pdf) read by the
 * AI service into material lines. Every line arrives AI-suggested with its
 * confidence; the person checks them here and again in the table.
 */
export function BomImportDrawer({ open, studyId, massPerUnitKg, unitLabel, onImport, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [items, setItems] = useState<FileDropItem[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [batchUnits, setBatchUnits] = useState<number | null>(1);
  const [result, setResult] = useState<BomResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const rereadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parse = useParseBom();
  const batchOk = batchUnits != null && batchUnits >= 1;

  const cancelReread = () => {
    if (rereadTimer.current) clearTimeout(rereadTimer.current);
    rereadTimer.current = null;
  };
  useEffect(() => cancelReread, []);

  const reset = () => {
    seq.current++;
    cancelReread();
    setStep(0);
    setItems([]);
    setFile(null);
    setBatchUnits(1);
    setResult(null);
    setError(null);
    parse.reset();
  };
  const close = () => {
    if (parse.isPending) return;
    reset();
    onClose();
  };

  /**
   * Reads the file. The first read of a file keeps it as evidence on the AI
   * service; every re-read (a changed column, sheet or batch size) sends
   * `keep_evidence=false` so the same file isn't stored again.
   */
  const read = (f: File, opts: { sheetName?: string | null; mapping?: MappingOverride; batch?: number | null; first?: boolean } = {}) => {
    cancelReread();
    const batch = opts.batch ?? batchUnits;
    if (batch == null || batch < 1) {
      setError(`Enter how many ${unitLabel} the file's quantities cover (at least 1) before the file is read.`);
      return;
    }
    const mine = ++seq.current;
    setError(null);
    parse.mutate(
      { file: f, studyId, batchUnits: batch, massPerUnitKg, sheetName: opts.sheetName ?? result?.sheet_name ?? null, mapping: opts.mapping, keepEvidence: opts.first ? undefined : false },
      {
        onSuccess: (r) => {
          if (mine !== seq.current) return;
          if (!Array.isArray(r.lines)) {
            setError("The AI service gave an answer this page can't read. Try again later.");
            return;
          }
          // A re-read returns no evidence row; the first read's one still stands.
          setResult((prev) => ({ ...r, evidence: r.evidence ?? (opts.first ? null : (prev?.evidence ?? null)) }));
          setStep(1);
        },
        onError: (e) => {
          if (mine !== seq.current) return;
          setError(aiUnreachable(e) ? "The AI service can't be reached right now, so the file can't be read. Add the materials by hand or try again later." : aiErrorMessage(e, "Couldn't read that file."));
        },
      },
    );
  };

  const onAdd = (files: File[]) => {
    const f = files[0];
    setItems([{ id: f.name, file: f }]);
    setFile(f);
    setResult(null);
    read(f, { sheetName: null, first: true });
  };

  const mapping = useMemo(() => Object.fromEntries(Object.entries(result?.mapping ?? {}).map(([f, m]) => [f, m.header])) as Record<string, string | undefined>, [result]);
  const changeMapping = (field: string, header: string | null) => {
    if (!file || !result) return;
    const next = { ...mapping, [field]: header ?? undefined };
    read(file, { mapping: Object.fromEntries(BOM_FIELDS.map((f) => [f.field, next[f.field] ?? null])) });
  };
  const currentMapping = (): MappingOverride => Object.fromEntries(BOM_FIELDS.map((f) => [f.field, mapping[f.field] ?? null]));
  /** Step 2 batch size: re-read once typing pauses, never below 1. */
  const changeBatch = (v: number | null) => {
    setBatchUnits(v);
    cancelReread();
    if (!file || v == null || v < 1) return;
    rereadTimer.current = setTimeout(() => read(file, { batch: v, mapping: currentMapping() }), REREAD_DELAY_MS);
  };
  const headerOptions = (result?.headers ?? []).map((h) => ({ value: h, label: h }));
  const sheetOptions = (result?.sheet_names ?? []).map((n) => ({ value: n, label: n }));
  const lines = result?.lines ?? [];
  const usable = lines.filter((l) => !l.problems.length);
  const low = lines.filter((l) => l.confidence < 60).length;

  const submit = () => {
    if (!result || !file) return;
    onImport(linesFromBom(lines), file.name);
    reset();
    onClose();
  };

  return (
    <Drawer
      open={open}
      size="lg"
      onClose={close}
      title="Import BOM"
      subtitle="Nothing is saved until you add the lines; every line stays editable."
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          {step === 1 && (
            <Button onClick={reset} disabled={parse.isPending}>
              Choose another file
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button onClick={close} disabled={parse.isPending}>
              Cancel
            </Button>
            {step === 1 && (
              <Button variant="primary" onClick={submit} disabled={parse.isPending || lines.length === 0}>
                Add {lines.length} {lines.length === 1 ? "line" : "lines"}
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
            <NumberField
              label="Quantities in the file cover"
              unit={unitLabel}
              value={batchUnits}
              min={1}
              onChange={setBatchUnits}
              help={BATCH_HELP(unitLabel)}
              error={batchOk ? undefined : "At least 1."}
              className="w-72"
            />
            <FileDrop
              label="Bill of materials"
              help="An ERP export or spec sheet: Excel, CSV or PDF, up to 10 MB. The AI reader finds the material, quantity and unit columns."
              items={items}
              onAdd={onAdd}
              onRemove={() => {
                seq.current++;
                setItems([]);
                setFile(null);
                setError(null);
                parse.reset();
              }}
              accept={[".xlsx", ".csv", ".pdf"]}
              maxSize={10 * 1024 * 1024}
              multiple={false}
              disabled={parse.isPending || !batchOk}
            />
            {parse.isPending && (
              <p className="text-sm text-muted" role="status">
                Reading the file…
              </p>
            )}
            {error && <Callout tone="warn">{error}</Callout>}
          </div>
        )}

        {step === 1 && result && (
          <div className="space-y-5">
            {error && <Callout tone="warn">{error}</Callout>}
            {result.headers.length > 0 && (
              <section aria-labelledby="bom-columns" className="space-y-3">
                <h3 id="bom-columns" className="text-sm font-semibold text-ink">
                  Columns
                </h3>
                <p className="text-sm text-muted">
                  {result.ai_used ? "The AI reader" : "We"} matched the columns{result.header_line > 1 ? ` (header on row ${result.header_line})` : ""}. Change any match that is wrong; the lines are re-read.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {sheetOptions.length > 1 && (
                    <Select<string> label="Sheet" value={result.sheet_name ?? sheetOptions[0].value} onChange={(v) => file && v && read(file, { sheetName: v })} options={sheetOptions} disabled={parse.isPending} />
                  )}
                  <NumberField
                    label="Quantities in the file cover"
                    unit={unitLabel}
                    value={batchUnits}
                    min={1}
                    onChange={changeBatch}
                    error={batchOk ? undefined : "At least 1."}
                    disabled={parse.isPending}
                  />
                  {BOM_FIELDS.map((f) => {
                    const match = result.mapping[f.field];
                    return (
                      <Select<string>
                        key={f.field}
                        label={f.label}
                        required={f.required}
                        value={mapping[f.field] ?? null}
                        onChange={(v) => changeMapping(f.field, v)}
                        options={headerOptions}
                        placeholder="Not in the file"
                        disabled={parse.isPending}
                        help={
                          match ? (
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
              </section>
            )}

            <section aria-labelledby="bom-lines" className="space-y-3">
              <h3 id="bom-lines" className="text-sm font-semibold text-ink">
                Lines
              </h3>
              {parse.isPending && (
                <p className="text-sm text-muted" role="status">
                  Re-reading the file…
                </p>
              )}
              {result.warnings.length > 0 && (
                <Callout tone="info">
                  <ul className="space-y-1">
                    {result.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </Callout>
              )}
              <p className="text-sm text-muted" role="status">
                {lines.length === 0
                  ? "No lines with a quantity were found."
                  : `${lines.length} ${lines.length === 1 ? "line" : "lines"} read${result.batch_units !== 1 ? `, quantities divided by ${result.batch_units}` : ""}.${
                      lines.length - usable.length ? ` ${lines.length - usable.length} need finishing in the table.` : ""
                    }${low ? ` ${low} read with low confidence: confirm ${low === 1 ? "it" : "them"} before Calculate.` : ""}`}
              </p>
              {lines.length > 0 && (
                <div className="overflow-x-auto rounded-control border border-line">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Lines read from the file</caption>
                    <thead className="bg-tint text-left text-xs text-muted">
                      <tr>
                        <th scope="col" className="px-3 py-2 font-medium">Material</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">Qty per {unitLabel}</th>
                        <th scope="col" className="px-3 py-2 font-medium">Unit</th>
                        <th scope="col" className="px-3 py-2 font-medium">Stage</th>
                        <th scope="col" className="px-3 py-2 font-medium">Read</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {lines.slice(0, PREVIEW).map((l) => {
                        const v = l.values;
                        const notes = [...l.problems, ...l.warnings];
                        return (
                          <tr key={l.line} className={cn(l.confidence < 60 && "bg-warn-soft")}>
                            <td className="px-3 py-2 text-ink">
                              {String(v.name ?? "") || "—"}
                              {v.supplier_name ? <span className="block text-xs text-muted">{String(v.supplier_name)}</span> : null}
                            </td>
                            <td className="px-3 py-2 text-right font-num">{v.quantity == null ? "—" : Number(v.quantity).toLocaleString("en-GB", { maximumFractionDigits: 6 })}</td>
                            <td className="px-3 py-2">{String(v.unit ?? "") || "—"}</td>
                            <td className="px-3 py-2">{String(v.stage ?? "A1")}</td>
                            <td className="px-3 py-2">
                              <Badge tone={l.confidence < 60 ? "warn" : "neutral"} className="gap-1">
                                <Sparkles aria-hidden className="size-3" /> AI {l.confidence}%
                              </Badge>
                              <span className="block text-xs text-muted">{notes.length ? notes.join("; ") : l.reason}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {lines.length > PREVIEW && <p className="text-xs text-muted">Showing the first {PREVIEW} of {lines.length} lines; all of them are added.</p>}
              {result.evidence ? (
                <p className="inline-flex items-center gap-1 text-xs text-muted">
                  <FileText aria-hidden className="size-3.5" /> {result.evidence.document_name} is kept as evidence for this footprint.
                </p>
              ) : (
                <p className="text-xs text-muted">The file couldn't be kept as evidence; keep your own copy.</p>
              )}
            </section>
          </div>
        )}
      </div>
    </Drawer>
  );
}
