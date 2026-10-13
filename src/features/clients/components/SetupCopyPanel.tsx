import { useEffect, useState } from "react";
import { Download, Upload } from "lucide-react";
import { Button, Callout, FileDrop, SegmentedControl, Select, Skeleton, cn } from "../../../ui";
import type { Company, Site } from "../logic";
import { type CopyDraft, type CopyReport, type SetupSource, type SiteTarget, INCLUDE_ITEMS, availableYears, defaultFactorYears, parseBundleFile, sourceName } from "../setupCopy";

export type PreviewState = { data: CopyReport | undefined; loading: boolean; error: string | null };

type SourceKind = "none" | "client" | "file";

export type SetupCopyPanelProps = {
  draft: CopyDraft;
  onChange: (next: CopyDraft) => void;
  /** Clients that can be copied from (the target itself left out). */
  companies: Company[];
  /** Onboarding: a "Start empty" choice; the first source site fills the new client's main site. */
  onboarding: boolean;
  /** Client page: the target's sites, so each source site can go to one of them. */
  targetSites?: Site[];
  preview: PreviewState;
  onDownloadSource?: (companyId: number) => void;
};

/** The form both copy entry points share: source, what to include, factor years, where sites go, and the preview. */
export function SetupCopyPanel({ draft, onChange, companies, onboarding, targetSites, preview, onDownloadSource }: SetupCopyPanelProps) {
  const kind: SourceKind = draft.source?.kind ?? "none";
  // Which source tab shows before a source is picked, and a bad file's message.
  const [kindOverride, setKindOverride] = useState<SourceKind | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const set = (patch: Partial<CopyDraft>) => onChange({ ...draft, ...patch });
  const setSource = (source: SetupSource | null) => onChange({ ...draft, source, factorYears: null, sites: {} });
  const years = availableYears(preview.data);
  // Once the preview says which years the source has, start from the newest and the current year.
  const yearsKey = years.join(",");
  useEffect(() => {
    if (draft.factorYears === null && years.length) onChange({ ...draft, factorYears: defaultFactorYears(years) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the source's years arrive, not on every draft edit
  }, [yearsKey, draft.factorYears === null]);

  const readFile = async (file: File) => {
    const parsed = parseBundleFile(await file.text());
    if ("error" in parsed) {
      onChange({ ...draft, source: null, factorYears: null, sites: {} });
      setFileError(parsed.error);
      return;
    }
    setFileError(null);
    setSource({ kind: "file", bundle: parsed.bundle, fileName: file.name });
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">Source</h3>
        <SegmentedControl<SourceKind>
          label="Where the setup comes from"
          value={shown(kind, kindOverride)}
          onChange={(v) => {
            setFileError(null);
            if (v === "none") setSource(null);
            else if (v === "client") setSource(kind === "client" ? draft.source : null);
            else setSource(null);
            setKindOverride(v);
          }}
          options={[...(onboarding ? [{ value: "none" as const, label: "Start empty" }] : []), { value: "client" as const, label: "An existing client" }, { value: "file" as const, label: "A setup file" }]}
        />
        {shown(kind, kindOverride) === "none" && onboarding && <p className="text-sm text-muted">The client starts with its main site and nothing else. You can copy a setup later from its page.</p>}
        {shown(kind, kindOverride) === "client" && (
          <div className="flex flex-wrap items-end gap-3">
            <Select<number>
              className="min-w-64"
              label="Client"
              placeholder="Choose a client"
              value={draft.source?.kind === "client" ? draft.source.companyId : null}
              onChange={(v) => {
                const c = companies.find((x) => x.company_id === v);
                setSource(c ? { kind: "client", companyId: c.company_id, name: c.name } : null);
              }}
              options={companies.map((c) => ({ value: c.company_id, label: c.name }))}
              emptyText="No other client to copy from"
            />
            {onDownloadSource && draft.source?.kind === "client" && (
              <Button icon={<Download aria-hidden className="size-4" />} onClick={() => onDownloadSource((draft.source as { companyId: number }).companyId)}>
                Download its setup file
              </Button>
            )}
          </div>
        )}
        {shown(kind, kindOverride) === "file" && (
          <div className="space-y-2">
            <FileDrop
              label="Setup file"
              help="A .json file downloaded from a client's page (Download setup). Up to 5 MB."
              accept={["application/json", ".json"]}
              maxSize={5 * 1024 * 1024}
              multiple={false}
              maxFiles={1}
              items={draft.source?.kind === "file" ? [{ id: "bundle", file: new File([], draft.source.fileName), status: "done" }] : []}
              onAdd={(files) => files[0] && void readFile(files[0])}
              onRemove={() => setSource(null)}
            />
            {fileError && <p className="text-sm text-warn">{fileError}</p>}
            {draft.source?.kind === "file" && (
              <p className="text-sm text-muted">
                Setup of <span className="font-medium text-ink">{draft.source.bundle.source.company_name}</span>, taken {draft.source.bundle.source.taken_at.slice(0, 10)}: {draft.source.bundle.sites.length}{" "}
                {draft.source.bundle.sites.length === 1 ? "site" : "sites"}.
              </p>
            )}
          </div>
        )}
      </section>

      {draft.source && (
        <>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-ink">What to copy</h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {INCLUDE_ITEMS.map((item) => (
                <li key={item.key}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-control border border-line p-3 hover:bg-tint">
                    <input type="checkbox" className="mt-0.5 size-4 accent-accent" checked={draft.include[item.key]} onChange={(e) => set({ include: { ...draft.include, [item.key]: e.target.checked } })} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">{item.label}</span>
                      <span className="block text-xs text-muted">{item.help}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {draft.include.factors && years.length > 0 && (
              <fieldset>
                <legend className="text-sm font-medium text-ink">Factor years</legend>
                <div className="mt-1 flex flex-wrap gap-2">
                  {years.map((y) => {
                    const on = draft.factorYears === null || draft.factorYears.includes(y);
                    return (
                      <label key={y} className={cn("inline-flex cursor-pointer items-center gap-1.5 rounded-chip border px-2.5 py-1 text-sm", on ? "border-accent bg-tint text-ink" : "border-line text-muted")}>
                        <input
                          type="checkbox"
                          className="accent-accent"
                          checked={on}
                          onChange={(e) => {
                            const current = draft.factorYears ?? years;
                            const next = e.target.checked ? [...current, y] : current.filter((x) => x !== y);
                            set({ factorYears: next.sort((a, b) => b - a) });
                          }}
                        />
                        {y}
                      </label>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-muted">The newest and the current year are on; tick older years to copy them too.</p>
              </fieldset>
            )}
            {!onboarding && (
              <Select<"skip" | "rename">
                className="max-w-sm"
                label="When a form with the same name is already here"
                value={draft.formConflict}
                onChange={(v) => set({ formConflict: v ?? "skip" })}
                options={[
                  { value: "skip", label: "Keep the existing form, skip the copy" },
                  { value: "rename", label: "Add the copy as “… (copy)”" },
                ]}
              />
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-ink">Sites</h3>
            {preview.loading && !preview.data && <Skeleton className="h-24 w-full" />}
            {preview.error && (
              <Callout tone="warn" title="Couldn't build the preview">
                {preview.error}
              </Callout>
            )}
            {preview.data && (
              <>
                {preview.data.errors.length > 0 && (
                  <Callout tone="warn" title="This copy can't run yet">
                    <ul className="list-disc pl-5">
                      {preview.data.errors.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  </Callout>
                )}
                <div className="overflow-x-auto rounded-control border border-line">
                  <table className="w-full text-sm">
                    <thead className="bg-tint text-left text-xs uppercase tracking-wide text-muted">
                      <tr>
                        <th className="px-3 py-2 font-medium">Source site</th>
                        <th className="px-3 py-2 font-medium">Goes to</th>
                        <th className="px-3 py-2 text-right font-medium">Forms</th>
                        <th className="px-3 py-2 text-right font-medium">Units</th>
                        <th className="px-3 py-2 text-right font-medium">Factors</th>
                        <th className="px-3 py-2 text-right font-medium">Products</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {preview.data.sites.map((s, i) => (
                        <tr key={s.key} className="align-top">
                          <td className="px-3 py-2">
                            <span className="block font-medium text-ink">{s.name}</span>
                            {s.country_name && <span className="block text-xs text-muted">{s.country_name}</span>}
                            {s.warnings.map((w, wi) => (
                              <span key={wi} className="mt-1 block text-xs text-warn">
                                {w}
                              </span>
                            ))}
                          </td>
                          <td className="px-3 py-2">
                            {onboarding ? (
                              <span className="text-muted">{i === 0 ? "The new client's main site" : "A new site"}</span>
                            ) : (
                              <Select<string>
                                label={`Where ${s.name} goes`}
                                hideLabel
                                value={String(draft.sites[s.key] ?? "create")}
                                onChange={(v) => {
                                  const target: SiteTarget = v === "create" || v === "skip" ? v : Number(v);
                                  set({ sites: { ...draft.sites, [s.key]: target } });
                                }}
                                options={[
                                  { value: "create", label: s.target.kind === "reuse" && (draft.sites[s.key] ?? "create") === "create" ? `${s.target.site_name} (same name)` : "A new site" },
                                  { value: "skip", label: "Skip this site" },
                                  ...(targetSites ?? []).map((t) => ({ value: String(t.site_id), label: t.name })),
                                ]}
                              />
                            )}
                          </td>
                          <Cell c={s.counts.forms} skipped={s.skipped.forms} />
                          <Cell c={s.counts.units} skipped={s.skipped.units} />
                          <Cell c={s.counts.factors} />
                          <Cell c={s.counts.products} skipped={s.skipped.products} />
                        </tr>
                      ))}
                      {preview.data.sites.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-3 text-muted">
                            The source has no sites.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                  <Line label="Category mappings" value={countText(preview.data.mappings)} />
                  <Line label="Threshold" value={{ create: "Copied", keep: "Kept (the client has one)", none: "The source has none", skip: "Not copied" }[preview.data.threshold]} />
                  {draft.include.material_factors && (
                    <Line
                      label="Material factors"
                      value={`${countText(preview.data.material_factors)}${preview.data.material_factors.licensed_excluded ? `, ${preview.data.material_factors.licensed_excluded} licensed left out` : ""}`}
                    />
                  )}
                  {preview.data.columns_created.length > 0 && <Line label="New library columns" value={preview.data.columns_created.join(", ")} />}
                </dl>
                {preview.data.warnings.map((w, wi) => (
                  <Callout key={wi} tone="warn">
                    {w}
                  </Callout>
                ))}
              </>
            )}
          </section>
        </>
      )}
      {!draft.source && !onboarding && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Upload aria-hidden className="size-4" /> Pick a client or upload a setup file to see what would be copied. Source: {sourceName(draft.source) || "none"}
        </p>
      )}
    </div>
  );
}

function shown(kind: SourceKind, override: SourceKind | null): SourceKind {
  return kind === "none" && override ? override : kind;
}

function Cell({ c, skipped }: { c: { create: number; skip: number }; skipped?: string[] }) {
  return (
    <td className="px-3 py-2 text-right tabular-nums">
      <span className="text-ink">{c.create}</span>
      {c.skip > 0 && (
        <span className="block text-xs text-muted" title={skipped?.join(", ")}>
          {c.skip} kept
        </span>
      )}
    </td>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}

const countText = (c: { create: number; skip: number }) => (c.create || c.skip ? `${c.create} copied${c.skip ? `, ${c.skip} kept` : ""}` : "None");
