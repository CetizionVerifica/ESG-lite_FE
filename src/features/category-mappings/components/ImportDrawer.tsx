import { useMemo, useState } from "react";
import { Button, Callout, Combobox, Drawer, FileDrop, type FileDropItem, Modal, Select, Stepper, cn, focusRing, inputBase } from "../../../ui";
import { errorMessage, useFactorIndex, useImportMappings, useParseSheet } from "../api";
import {
  type Category,
  type Company,
  type ImportRow,
  type ImportTarget,
  type Mapping,
  type Site,
  checkImport,
  importPayloads,
  importRows,
  summarizeImport,
} from "../logic";
import { MatchMark } from "./cells";

type Props = {
  open: boolean;
  defaults: ImportTarget;
  existing: Mapping[];
  companies: Company[];
  categories: Category[];
  sites: Site[];
  userId: number | null;
  onClose: () => void;
};

type Result = { created: number; skipped: number; errors: string[] };

const STEPS = [
  { id: "upload", label: "Upload" },
  { id: "review", label: "Review" },
  { id: "result", label: "Result" },
];

/**
 * Import a client's mapping sheet: pick where it applies, let the AI service
 * read it, review and fix rows, then add them in one go. Mount with `key` so
 * each opening starts clean.
 */
export function ImportDrawer(props: Props) {
  const [step, setStep] = useState(0);
  const [target, setTarget] = useState<ImportTarget>(props.defaults);
  const [file, setFile] = useState<FileDropItem | null>(null);
  const [touched, setTouched] = useState(false);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const parse = useParseSheet();
  const save = useImportMappings();
  const factors = useFactorIndex(target.category_id === null ? [] : [target.category_id]);

  const checks = useMemo(() => checkImport(rows, target, props.existing, factors.index, props.sites), [rows, target, props.existing, factors.index, props.sites]);
  const summary = summarizeImport(rows, checks);
  const company = props.companies.find((c) => c.company_id === target.company_id) ?? null;
  const clientSites = target.company_id === null ? [] : props.sites.filter((s) => s.company?.company_id === target.company_id).sort((a, b) => a.name.localeCompare(b.name));

  const uploadErrors = {
    company: target.company_id === null ? "Choose the client this sheet is for." : undefined,
    category: target.category_id === null ? "Choose the category." : undefined,
    file: file ? undefined : "Add the sheet (.xlsx).",
  };
  const read = () => {
    setTouched(true);
    if (uploadErrors.company || uploadErrors.category || !file) return;
    parse.mutate(file.file, {
      onSuccess: (res) => {
        setRows(importRows(res.mappings ?? []));
        setWarnings(res.warnings ?? []);
        setStep(1);
      },
    });
  };

  const submit = () => {
    const payloads = importPayloads(rows, checks, target, company?.name ?? "", props.userId);
    if (!payloads.length) return;
    save.mutate(payloads, {
      onSuccess: (res) => {
        setResult({ created: res.created ?? 0, skipped: res.skipped ?? 0, errors: res.errors ?? [] });
        setStep(2);
      },
    });
  };

  const patch = (key: number, change: Partial<ImportRow>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...change } : r)));
  const allOn = rows.length > 0 && rows.every((r) => r.include);

  // Leaving with a read sheet that wasn't added asks first.
  const unsaved = step === 1 && rows.length > 0;
  const close = () => (unsaved && !save.isPending ? setConfirmClose(true) : props.onClose());

  const footer =
    step === 0 ? (
      <div className="ml-auto flex gap-2">
        <Button onClick={close}>Cancel</Button>
        <Button variant="primary" onClick={read} loading={parse.isPending} disabled={parse.isPending}>
          Read sheet
        </Button>
      </div>
    ) : step === 1 ? (
      <div className="flex w-full flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={() => setStep(0)} disabled={save.isPending}>
          Back
        </Button>
        <div className="ml-auto flex gap-2">
          <Button onClick={close} disabled={save.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={save.isPending} disabled={save.isPending || summary.included === 0}>
            {summary.included === 1 ? "Add 1 mapping" : `Add ${summary.included} mappings`}
          </Button>
        </div>
      </div>
    ) : (
      <div className="ml-auto flex gap-2">
        <Button variant="primary" onClick={props.onClose}>
          Done
        </Button>
      </div>
    );

  return (
    <>
      <Drawer open={props.open} size="lg" onClose={close} title="Import mapping sheet" subtitle="A sheet with the client's names and the factor names they mean." footer={footer}>
        <div className="space-y-5">
          <Stepper steps={STEPS} current={step} completed={STEPS.slice(0, step).map((s) => s.id)} canJump={() => false} label="Import progress" />

          {step === 0 && (
            <div className="space-y-4">
              {parse.isError && (
                <Callout tone="warn" title="Couldn't read the sheet">
                  {errorMessage(parse.error, "Check it is an .xlsx file with a column for the client's names and one for the factor names.")}
                </Callout>
              )}
              <Combobox<number>
                label="Client"
                required
                placeholder="Search clients…"
                value={target.company_id}
                onChange={(v) => setTarget((t) => (v === t.company_id ? t : { ...t, company_id: v, site_id: null }))}
                options={props.companies.map((c) => ({ value: c.company_id, label: c.name }))}
                error={touched ? uploadErrors.company : undefined}
              />
              <Select<number>
                label="Category"
                required
                placeholder="Choose a category"
                value={target.category_id}
                onChange={(v) => setTarget((t) => ({ ...t, category_id: v }))}
                options={props.categories.map((c) => ({ value: c.category_id, label: c.category_name }))}
                error={touched ? uploadErrors.category : undefined}
              />
              <Select<number>
                label="Site"
                placeholder="All sites"
                help="Leave on All sites for mappings that apply at every site of the client."
                value={target.site_id}
                onChange={(v) => setTarget((t) => ({ ...t, site_id: v }))}
                options={clientSites.map((s) => ({ value: s.site_id, label: s.name }))}
              />
              <FileDrop
                label="Mapping sheet"
                help="Excel (.xlsx), up to 10 MB. Row 1 holds the column names."
                accept={[".xlsx"]}
                maxSize={10 * 1024 * 1024}
                items={file ? [file] : []}
                onAdd={(files) => files[0] && setFile({ id: `${files[0].name}-${files[0].size}`, file: files[0], status: "queued" })}
                onRemove={() => setFile(null)}
                disabled={parse.isPending}
              />
              {touched && uploadErrors.file && <p className="text-sm text-bad">{uploadErrors.file}</p>}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-ink" data-testid="import-summary">
                <span className="font-num">{summary.matched}</span> of <span className="font-num">{summary.included}</span> match existing factors
                {summary.blocked > 0 && (
                  <>
                    {" "}
                    · <span className="font-num">{summary.blocked}</span> can't be added
                  </>
                )}
              </p>
              {summary.missing > 0 && (
                <Callout tone="warn">
                  {summary.missing === 1 ? "1 row names a factor" : `${summary.missing} rows name factors`} that doesn't exist for this client yet. They're added anyway; entries can't use them until the factor exists.
                </Callout>
              )}
              {factors.failed && <Callout tone="warn">Couldn't load this category's factors, so matches aren't checked.</Callout>}
              {warnings.length > 0 && (
                <Callout tone="info" title="Notes from reading the sheet">
                  <ul className="list-disc pl-4">
                    {warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </Callout>
              )}
              {save.isError && (
                <Callout tone="warn" title="Nothing was added">
                  {errorMessage(save.error, "Try again.")}
                </Callout>
              )}
              {rows.length === 0 ? (
                <p className="text-sm text-muted">The sheet has no rows to add.</p>
              ) : (
                <div className="overflow-x-auto rounded-control border border-line">
                  <table className="w-full text-sm" aria-label="Rows read from the sheet">
                    <thead className="bg-tint text-left text-xs text-muted">
                      <tr>
                        <th className="w-10 px-3 py-2">
                          <input
                            type="checkbox"
                            aria-label="Include every row"
                            className={cn("size-4 accent-accent", focusRing)}
                            checked={allOn}
                            onChange={(e) => setRows((list) => list.map((r) => ({ ...r, include: e.target.checked })))}
                          />
                        </th>
                        <th className="px-3 py-2 font-medium">Client's name</th>
                        <th className="px-3 py-2 font-medium">Global factor name</th>
                        <th className="px-3 py-2 font-medium">Check</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {rows.map((r, i) => {
                        const c = checks.get(r.key);
                        return (
                          <tr key={r.key} className={cn(!r.include && "opacity-60", r.include && c?.match.state === "missing" && !c.problem && "bg-warn-soft")}>
                            <td className="px-3 py-1.5">
                              <input
                                type="checkbox"
                                aria-label={`Include row ${i + 1}`}
                                className={cn("size-4 accent-accent", focusRing)}
                                checked={r.include}
                                onChange={(e) => patch(r.key, { include: e.target.checked })}
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                aria-label={`Client's name, row ${i + 1}`}
                                className={cn(inputBase, "h-8")}
                                value={r.company_category_name}
                                onChange={(e) => patch(r.key, { company_category_name: e.target.value })}
                              />
                            </td>
                            <td className="px-3 py-1.5">
                              <input
                                aria-label={`Global factor name, row ${i + 1}`}
                                className={cn(inputBase, "h-8")}
                                value={r.global_category_name}
                                onChange={(e) => patch(r.key, { global_category_name: e.target.value })}
                              />
                              {r.sheetFactor && <span className="mt-0.5 block text-xs text-muted">Sheet: <span className="font-num">{r.sheetFactor}</span></span>}
                            </td>
                            <td className="px-3 py-1.5 whitespace-nowrap">
                              {c?.problem ? <span className="text-xs text-bad">{c.problem}</span> : c ? <MatchMark match={c.match} /> : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {step === 2 && result && (
            <div className="space-y-4" data-testid="import-result">
              <Callout tone={result.created > 0 ? "info" : "warn"} title={result.created === 1 ? "1 mapping added" : `${result.created} mappings added`}>
                {result.skipped > 0 ? `${result.skipped} skipped.` : "Nothing was skipped."}
              </Callout>
              {result.errors.length > 0 && (
                <div>
                  <h3 className="mb-1 text-sm font-medium text-ink">Skipped rows</h3>
                  <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted">
                    {result.errors.map((e) => (
                      <li key={e}>{e}</li>
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
        title="Leave without adding?"
        description="The rows read from this sheet haven't been added."
        cancelLabel="Keep reviewing"
        primaryAction={{
          label: "Leave",
          onClick: () => {
            setConfirmClose(false);
            props.onClose();
          },
        }}
      />
    </>
  );
}
