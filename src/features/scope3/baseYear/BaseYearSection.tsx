import { useEffect, useRef, useState } from "react";
import { Button, EmptyState, NumberField, Select, SkeletonText, TextField, Textarea, cn, formatDate, panel, useToast } from "../../../ui";
import { errorMessage, useBaseYear, useSaveBaseYear } from "./api";
import { type BaseYearDraft, changesYear, draftErrors, draftFrom, isDirty, policyOnly, toBody, withYearType, yearOptions } from "./logic";
import { FreezeModal } from "./components/FreezeModal";
import { RecalculationsPanel } from "./components/RecalculationsPanel";
import { TotalsTable } from "./components/TotalsTable";

const YEAR_TYPES = [
  { value: "CY" as const, label: "Calendar year" },
  { value: "FY" as const, label: "Financial year" },
];

/**
 * S3-14 `/settings/scope3#base-year`: the company's Scope 3 base year with
 * rationale and recalculation policy, the frozen totals, and recalculations.
 * Admin and Superadmin edit; Managers read.
 */
export function BaseYearSection({ companyId, ready }: { companyId: number | null; ready: boolean }) {
  const { toast } = useToast();
  const now = new Date();
  const q = useBaseYear(companyId, ready);
  const save = useSaveBaseYear(companyId);
  const row = q.data?.base_year ?? null;
  const editable = !!q.data?.can_edit;

  // /settings/scope3#base-year: the section loads after the page, so scroll once its data is in.
  const sectionRef = useRef<HTMLElement>(null);
  const loaded = q.isSuccess;
  useEffect(() => {
    if (loaded && window.location.hash === "#base-year") sectionRef.current?.scrollIntoView({ block: "start" });
  }, [loaded]);

  const [draft, setDraft] = useState<BaseYearDraft | null>(null);
  const [tried, setTried] = useState(false);
  const [freezing, setFreezing] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  // Edits belong to one client and one saved version.
  const stamp = `${companyId}:${row?.updated_at ?? ""}`;
  const [draftFor, setDraftFor] = useState(stamp);
  if (draftFor !== stamp) {
    setDraftFor(stamp);
    setDraft(null);
    setTried(false);
  }

  const d = draft ?? draftFrom(row, now);
  const errors = draftErrors(d, row);
  const hasErrors = Object.keys(errors).length > 0;
  const dirty = isDirty(d, row);
  const set = (patch: Partial<BaseYearDraft>) => setDraft({ ...d, ...patch });
  const years = yearOptions(now, d.year_type, row);

  const submit = () => {
    setSaveErr(null);
    save.mutate(toBody(d, row), {
      onSuccess: () => {
        toast({ title: policyOnly(d, row) ? "Base year policy saved" : `${d.base_year} frozen as the Scope 3 base year`, tone: "good" });
        setFreezing(false);
        setDraft(null);
        setTried(false);
      },
      onError: (e) => setSaveErr(errorMessage(e, "The base year wasn't saved. Try again.")),
    });
  };
  const onSave = () => {
    setTried(true);
    if (hasErrors || !dirty) return;
    if (policyOnly(d, row)) submit();
    else {
      setSaveErr(null);
      setFreezing(true);
    }
  };

  return (
    <section ref={sectionRef} id="base-year" aria-labelledby="base-year-title" className={cn(panel, "scroll-mt-20 space-y-5 p-4")} data-testid="base-year">
      <div>
        <h2 id="base-year-title" className="text-base font-medium text-ink">Base year</h2>
        <p className="text-sm text-muted">
          The year Scope 3 is measured against. ESGLite checks it every night and proposes a recalculation when changes move it by your threshold or more.
        </p>
      </div>

      {!ready ? null : q.isLoading ? (
        <SkeletonText lines={4} />
      ) : q.isError ? (
        <EmptyState
          compact
          variant="error"
          title="Couldn't load the base year."
          description={errorMessage(q.error, "Check your connection and try again.")}
          action={<Button size="sm" onClick={() => q.refetch()}>Try again</Button>}
        />
      ) : (
        <>
          {row?.snapshot && (
            <div className="space-y-2" data-testid="frozen-totals">
              <p className="text-sm text-ink">
                <span className="font-medium">
                  {row.year_type === "FY" ? "FY" : ""}
                  {row.base_year}
                </span>{" "}
                frozen {formatDate(row.snapshot.frozen_at)} (version {row.snapshot.version}). Recalculated when changes reach {row.significance_pct} %.
              </p>
              <TotalsTable caption={`Frozen Scope 3 base year ${row.base_year}`} totals={row.snapshot.categories} />
            </div>
          )}
          {!row && !editable && <p className="text-sm text-muted">No Scope 3 base year set. An Admin sets it.</p>}

          {(editable || row) && (
            <fieldset disabled={!editable} className="grid gap-4 sm:grid-cols-2">
              <legend className="sr-only">Base year settings</legend>
              <Select<number>
                label="Base year"
                value={d.base_year}
                options={years.map((y) => ({ value: y, label: d.year_type === "FY" ? `FY${y}` : String(y) }))}
                onChange={(v) => v !== null && set({ base_year: v })}
                disabled={!editable}
              />
              <Select<"CY" | "FY">
                label="Year type"
                value={d.year_type}
                options={YEAR_TYPES}
                onChange={(v) => v && setDraft(withYearType(d, v, now, row))}
                disabled={!editable}
              />
              <NumberField
                label="Significance threshold"
                help="Changes this big (net) trigger a recalculation. The GHG Protocol's example is 10 %."
                unit="%"
                min={0}
                max={100}
                step={0.5}
                value={d.significance_pct}
                onChange={(v) => set({ significance_pct: v })}
                error={tried ? errors.significance_pct : undefined}
                disabled={!editable}
              />
              <TextField
                label="Rationale"
                help="Why this year: for example, the first year with supplier data."
                value={d.rationale}
                onChange={(v) => set({ rationale: v })}
                error={tried ? errors.rationale : undefined}
                required
                disabled={!editable}
              />
              <Textarea
                className="sm:col-span-2"
                label="Recalculation policy"
                help="Shown in the GHG report with the threshold."
                value={d.policy_note}
                onChange={(v) => set({ policy_note: v })}
                disabled={!editable}
              />
              {changesYear(d, row) && (
                <Textarea
                  className="sm:col-span-2"
                  label="Why the base year moves"
                  help="Recorded as a recalculation in the report."
                  value={d.note}
                  onChange={(v) => set({ note: v })}
                  error={tried ? errors.note : undefined}
                  required
                />
              )}
            </fieldset>
          )}

          {editable && (
            <div className="flex flex-wrap items-center justify-end gap-3">
              {saveErr && !freezing && (
                <p role="alert" className="mr-auto text-sm text-bad">{saveErr}</p>
              )}
              {draft && dirty && (
                <Button variant="ghost" onClick={() => setDraft(null)} disabled={save.isPending}>Discard</Button>
              )}
              <Button variant="primary" onClick={onSave} loading={save.isPending && !freezing} disabled={!dirty}>
                {row && policyOnly(d, row) ? "Save policy" : "Freeze base year"}
              </Button>
            </div>
          )}

          {row?.snapshot && <RecalculationsPanel companyId={companyId} row={row} editable={editable} />}

          <FreezeModal
            open={freezing}
            companyId={companyId}
            year={d.base_year}
            yearType={d.year_type}
            moving={changesYear(d, row)}
            saving={save.isPending}
            saveError={saveErr}
            onClose={() => setFreezing(false)}
            onConfirm={submit}
          />
        </>
      )}
    </section>
  );
}
