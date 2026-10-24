// DS-2 · Report details (01-contracts §2.1, 05-ux S2 step 3 and the Data drawer):
// the disclosures the data can't know. Each field shows where its value came
// from ("From company settings", "From KPI values", "Typed"); missing ones are
// allowed and listed as "We'll flag these in checks".
//
//   ReportDetailsForm   controlled: `stored` inputs + `prefill`, onChange(next) (new-design flow)
//   DocReportDetails    a doc's inputs: GET /studio/docs/:id/inputs, PATCH with its rev
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  CONFORMANCE_CODES,
  GWP_SETS,
  VERIFICATION_STATUSES,
  inputKeysFor,
  type InputPrefill,
  type InputSource,
  type ReportInputKey,
  type ReportInputs,
  type ReportInputValues,
  type ReportKind,
} from "../../../lib/studio/contracts";
import { Badge, Button, Callout, NumberField, SkeletonText, Select, TextField, Textarea, cn, focusRing, useToast } from "../../../ui";
import { inputIssues, isRevConflict, studioErrorMessage, useDocInputs, useSaveDocInputs } from "./data/api";
import { FLAGGED_WHEN_TYPED, INPUT_LABELS, SOURCE_LABELS, effectiveInput, inputsPatch, missingInputs } from "./data/logic";

const HELP: Partial<Record<ReportInputKey, string>> = {
  consolidation_approach: "Operational control, financial control or equity share.",
  responsible_person: "Name and role of the person responsible (ISO 14064-1).",
  recalculation_policy: "When the base year is recalculated, for example structural changes or errors.",
  significance_threshold_pct: "Change in base-year emissions that triggers a recalculation.",
  exclusions: "Each excluded source or Scope 3 category needs a reason.",
  scope2_instruments: "Certificates or contracts you hold. ESGLite doesn't record market-based Scope 2 yet.",
  revenue: "In the unit your report uses (for example ₹ crore).",
  output_units: "Total output in the year, for intensity per unit.",
};

const VERIFICATION_LABELS: Record<(typeof VERIFICATION_STATUSES)[number], string> = { none: "Not verified", limited: "Limited assurance", reasonable: "Reasonable assurance" };
const CONFORMANCE_LABELS: Record<(typeof CONFORMANCE_CODES)[number], string> = { GHGP: "GHG Protocol", ISO14064: "ISO 14064-1" };
const LONG_TEXT: ReadonlySet<ReportInputKey> = new Set(["recalculation_policy", "scope2_instruments", "uncertainty_statement", "leadership_message", "about_company"]);

export interface ReportDetailsFormProps {
  kind: ReportKind;
  stored: ReportInputs;
  prefill: InputPrefill;
  /** Called with the whole next set of stored inputs. */
  onChange: (next: ReportInputs) => void;
  loading?: boolean;
  disabled?: boolean;
  /** Per-key error text (a failed save). */
  errors?: Partial<Record<ReportInputKey, string>>;
}

const entry = <K extends ReportInputKey>(value: ReportInputValues[K], source: InputSource = "typed") => ({ value, source, updatedBy: null, updatedAt: new Date().toISOString() });

export function ReportDetailsForm({ kind, stored, prefill, onChange, loading, disabled, errors = {} }: ReportDetailsFormProps) {
  const keys = useMemo(() => inputKeysFor(kind), [kind]);
  const missing = useMemo(() => missingInputs(kind, stored, prefill), [kind, stored, prefill]);
  if (loading) return <SkeletonText lines={6} />;

  const set = (key: ReportInputKey, value: unknown) => {
    const next = { ...stored } as Record<string, unknown>;
    const empty = value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);
    if (empty) delete next[key];
    else next[key] = entry(value as never);
    onChange(next as ReportInputs);
  };

  return (
    <form className="space-y-4" aria-label="Report details" onSubmit={(e) => e.preventDefault()}>
      {missing.length > 0 && (
        <Callout tone="info" title={`${missing.length} detail${missing.length === 1 ? "" : "s"} still empty`}>
          We'll flag these in checks: {missing.map((k) => INPUT_LABELS[k]).join(", ")}.
        </Callout>
      )}
      {keys.map((key) => {
        const eff = effectiveInput(key, stored, prefill);
        return (
          <div key={key} data-testid={`input-${key}`} className="space-y-1">
            <InputField keyName={key} value={eff.value} disabled={disabled} error={errors[key]} onChange={(v) => set(key, v)} />
            <SourceLine source={eff.source} stored={eff.stored} note={eff.note} keyName={key} missing={missing.includes(key)} onUsePrefill={eff.stored && prefill[key] ? () => set(key, null) : undefined} />
          </div>
        );
      })}
    </form>
  );
}

function SourceLine({ source, stored, note, keyName, missing, onUsePrefill }: { source: InputSource | null; stored: boolean; note?: string; keyName: ReportInputKey; missing: boolean; onUsePrefill?: () => void }) {
  if (missing) return <p className="text-xs text-muted">Empty · we'll flag it in checks</p>;
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
      {source && <span>{SOURCE_LABELS[source]}{note ? ` (${note})` : ""}</span>}
      {source === "typed" && FLAGGED_WHEN_TYPED.has(keyName) && <Badge tone="warn">Typed, not from data</Badge>}
      {!stored && source && <Badge tone="neutral">Prefilled</Badge>}
      {onUsePrefill && (
        <button type="button" onClick={onUsePrefill} className={cn("text-brand-text hover:underline", focusRing)}>
          Use the value from data
        </button>
      )}
    </p>
  );
}

function InputField({ keyName, value, onChange, disabled, error }: { keyName: ReportInputKey; value: unknown; onChange: (v: unknown) => void; disabled?: boolean; error?: string }) {
  const label = INPUT_LABELS[keyName];
  const help = HELP[keyName];
  switch (keyName) {
    case "base_year":
    case "significance_threshold_pct":
    case "revenue":
    case "revenue_ppp_rate":
    case "output_units":
    case "employees":
      return (
        <NumberField
          label={label}
          help={help}
          error={error}
          disabled={disabled}
          value={typeof value === "number" ? value : null}
          onChange={onChange}
          min={keyName === "base_year" ? 1990 : 0}
          max={keyName === "significance_threshold_pct" ? 100 : keyName === "base_year" ? 2100 : undefined}
          unit={keyName === "significance_threshold_pct" ? "%" : undefined}
        />
      );
    case "gwp_set":
      return <Select label={label} error={error} disabled={disabled} value={(value as string) ?? null} onChange={onChange} placeholder="Choose" options={GWP_SETS.map((g) => ({ value: g, label: g === "MIXED" ? "More than one set" : `IPCC ${g}` }))} />;
    case "verification": {
      const v = (value as ReportInputValues["verification"] | null) ?? null;
      return (
        <fieldset className="space-y-2" disabled={disabled}>
          <Select
            label={label}
            error={error}
            value={v?.status ?? null}
            placeholder="Choose"
            onChange={(status) => onChange(status ? { ...(v ?? {}), status } : null)}
            options={VERIFICATION_STATUSES.map((s) => ({ value: s, label: VERIFICATION_LABELS[s] }))}
          />
          {v && v.status !== "none" && <TextField label="Verified by" value={v.provider ?? ""} onChange={(provider) => onChange({ ...v, provider: provider || undefined })} />}
        </fieldset>
      );
    }
    case "conformance": {
      const list = (value as string[] | null) ?? [];
      return (
        <fieldset disabled={disabled}>
          <legend className="text-sm font-medium text-ink">{label}</legend>
          <div className="mt-1 flex gap-4">
            {CONFORMANCE_CODES.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={list.includes(c)} onChange={(e) => onChange(e.target.checked ? [...list, c] : list.filter((x) => x !== c))} />
                {CONFORMANCE_LABELS[c]}
              </label>
            ))}
          </div>
          {error && <p className="text-xs text-bad">{error}</p>}
        </fieldset>
      );
    }
    case "exclusions":
      return <ExclusionsField label={label} help={help} value={(value as ReportInputValues["exclusions"] | null) ?? []} onChange={onChange} disabled={disabled} error={error} />;
    default:
      return LONG_TEXT.has(keyName) ? (
        <Textarea label={label} help={help} error={error} disabled={disabled} value={(value as string) ?? ""} onChange={onChange} rows={3} />
      ) : (
        <TextField label={label} help={help} error={error} disabled={disabled} value={(value as string) ?? ""} onChange={onChange} />
      );
  }
}

function ExclusionsField({ label, help, value, onChange, disabled, error }: { label: string; help?: string; value: ReportInputValues["exclusions"]; onChange: (v: unknown) => void; disabled?: boolean; error?: string }) {
  const update = (i: number, patch: Partial<{ what: string; reason: string }>) => onChange(value.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium text-ink">{label}</legend>
      {help && <p className="text-xs text-muted">{help}</p>}
      {value.map((e, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
          <TextField label="What" value={e.what} onChange={(what) => update(i, { what })} />
          <TextField label="Reason" value={e.reason} onChange={(reason) => update(i, { reason })} error={e.reason.trim() ? undefined : "A reason is required"} />
          <Button variant="ghost" aria-label={`Remove ${e.what || "exclusion"}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <Trash2 aria-hidden className="size-4" />
          </Button>
        </div>
      ))}
      <Button variant="secondary" onClick={() => onChange([...value, { what: "", reason: "" }])}>
        <Plus aria-hidden className="size-4" /> Add exclusion
      </Button>
      {error && <p className="text-xs text-bad">{error}</p>}
    </fieldset>
  );
}

/** A doc's report details: edits locally, saves the changed keys with the doc's rev. */
export function DocReportDetails({ docId, kind }: { docId: number; kind: ReportKind }) {
  const query = useDocInputs(docId);
  const save = useSaveDocInputs(docId);
  const { toast } = useToast();
  const [draft, setDraft] = useState<ReportInputs | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    if (query.data) setDraft(query.data.inputs);
  }, [query.data]);

  if (query.isPending || !draft) return <SkeletonText lines={6} />;
  if (query.isError) return <Callout tone="warn" title="Report details couldn't be loaded.">{studioErrorMessage(query.error, "Try again in a moment.")}</Callout>;
  const patch = inputsPatch(query.data.inputs, draft);
  const dirty = Object.keys(patch).length > 0;

  const onSave = () =>
    save.mutate(
      { rev: query.data.rev, inputs: patch },
      {
        onSuccess: () => {
          setErrors({});
          setConflict(false);
          toast({ tone: "good", title: "Report details saved" });
        },
        onError: (e) => {
          if (isRevConflict(e)) setConflict(true);
          else setErrors(inputIssues(e));
          if (!isRevConflict(e) && !Object.keys(inputIssues(e)).length) toast({ tone: "bad", title: studioErrorMessage(e, "Report details weren't saved.") });
        },
      },
    );

  return (
    <div className="space-y-3">
      {conflict && (
        <Callout tone="warn" title="Someone else changed this design." action={<Button variant="secondary" onClick={() => void query.refetch().then(() => setConflict(false))}>Reload</Button>}>
          Reload to see their changes, then make yours again.
        </Callout>
      )}
      <ReportDetailsForm kind={kind} stored={draft} prefill={query.data.prefill} onChange={setDraft} errors={errors} disabled={save.isPending} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" disabled={!dirty || save.isPending} onClick={() => setDraft(query.data.inputs)}>
          Discard
        </Button>
        <Button disabled={!dirty} loading={save.isPending} onClick={onSave}>
          Save details
        </Button>
      </div>
    </div>
  );
}
