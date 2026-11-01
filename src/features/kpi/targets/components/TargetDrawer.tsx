import { useEffect, useState } from "react";
import type { KpiTargetWithProgress, TargetDirection } from "../../../../lib/kpi/contracts";
import { TARGET_DIRECTION_LABEL } from "../../../../lib/kpi/labels";
import { formatWithUnit } from "../../../../lib/kpi/units";
import { Button, Combobox, Drawer, NumberField, SegmentedControl, Select, Textarea } from "../../../../ui";
import type { KpiLookup } from "../../components/lookup";
import { kpiErrorMessage, useBaselineValues, useTargetActions } from "../api";
import { type FormErrors, type TargetForm, baselineYears, checkForm, emptyForm, formOf, suggestDirection, targetText, targetYears, toBody } from "../logic";

/**
 * KPI-9 · "Set a target": pick the KPI (search) and where it applies, the
 * baseline (prefilled from the approved value the server aggregates), the
 * target year and value, with a direction preview ("−20 % by 2030").
 */
export function TargetDrawer({ target, lookup, onClose, onSaved }: { target: KpiTargetWithProgress | null; lookup: KpiLookup; onClose: () => void; onSaved: (title: string) => void }) {
  const thisYear = new Date().getFullYear();
  const [form, setForm] = useState<TargetForm>(() => (target ? formOf(target) : emptyForm(thisYear)));
  const [errors, setErrors] = useState<FormErrors>({});
  const [touchedBaseline, setTouchedBaseline] = useState(!!target);
  const [touchedDirection, setTouchedDirection] = useState(!!target);
  const { save } = useTargetActions();
  const def = form.kpiId ? lookup.definition(form.kpiId) : null;
  const unit = def?.canonical_unit ?? undefined;
  const baseline = useBaselineValues(form.baselineYear, form.siteId, !!form.kpiId && !touchedBaseline);
  const card = baseline.data?.cards.find((c) => c.kpi_definition_id === form.kpiId) ?? null;
  const prefill = card?.value ?? null;

  // Prefill the baseline from the server's approved figure until the Admin types one.
  useEffect(() => {
    if (!touchedBaseline && prefill !== null) setForm((f) => ({ ...f, baselineValue: prefill }));
  }, [prefill, touchedBaseline]);

  const set = (patch: Partial<TargetForm>) =>
    setForm((f) => {
      const next = { ...f, ...patch };
      // Until the Admin picks a direction, it follows the values.
      if (!touchedDirection && !patch.direction) next.direction = suggestDirection(next.baselineValue, next.targetValue) ?? next.direction;
      return next;
    });

  const numeric = lookup.selected.filter((d) => d.value_type !== "text" && d.value_type !== "yes_no" && d.value_type !== "choice");
  const siteOptions = def?.level === "company" ? [] : lookup.sites.map((s) => ({ value: s.site_id, label: s.name }));
  const preview = form.baselineYear && form.targetYear && form.baselineValue !== null && form.targetValue !== null ? targetText({ baseline_value: form.baselineValue, target_value: form.targetValue, baseline_year: form.baselineYear, target_year: form.targetYear, direction: form.direction, unit }) : null;

  const submit = () => {
    const e = checkForm(form, { typedBaseline: !target && (prefill === null || form.baselineValue !== prefill) });
    setErrors(e);
    if (Object.keys(e).length) return;
    save.mutate(toBody(form), {
      onSuccess: () => {
        onSaved(target ? "Target saved" : `Target set for ${def?.name ?? "the KPI"}`);
        onClose();
      },
    });
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={target ? "Edit target" : "Set a target"}
      subtitle="Progress uses approved values only."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={save.isPending} onClick={submit}>
            {target ? "Save target" : "Set target"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Combobox<number>
          label="KPI"
          required
          value={form.kpiId}
          onChange={(kpiId) => {
            setTouchedBaseline(false);
            set({ kpiId, siteId: null, baselineValue: null });
          }}
          options={numeric.map((d) => ({ value: d.id, label: d.name }))}
          placeholder="Search KPIs"
          error={errors.kpi}
          disabled={!!target}
        />
        <Select<number>
          label="Where it applies"
          value={form.siteId}
          onChange={(siteId) => {
            setTouchedBaseline(false);
            set({ siteId });
          }}
          options={siteOptions}
          placeholder="Whole company"
          emptyText="Whole company"
          help={def?.level === "company" ? "This KPI is reported for the company as a whole." : undefined}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select<number>
            label="Baseline year"
            required
            value={form.baselineYear}
            onChange={(baselineYear) => {
              setTouchedBaseline(false);
              set({ baselineYear });
            }}
            options={baselineYears(lookup.setup?.settings.first_year ?? thisYear, thisYear).map((y) => ({ value: y, label: String(y) }))}
            error={errors.baselineYear}
          />
          <NumberField
            label="Baseline value"
            required
            value={form.baselineValue}
            unit={unit}
            onChange={(baselineValue) => {
              setTouchedBaseline(true);
              set({ baselineValue });
            }}
            error={errors.baselineValue}
            help={
              !form.kpiId
                ? undefined
                : prefill !== null && form.baselineValue === prefill
                  ? `Your approved ${form.baselineYear} figure.`
                  : baseline.isFetching
                    ? "Looking up the approved figure…"
                    : "No approved figure for that year: type it and say where it came from in the note."
            }
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select<number>
            label="Target year"
            required
            value={form.targetYear}
            onChange={(targetYear) => set({ targetYear })}
            options={targetYears(form.baselineYear ?? thisYear).map((y) => ({ value: y, label: String(y) }))}
            error={errors.targetYear}
          />
          <NumberField label="Target value" required value={form.targetValue} unit={unit} onChange={(targetValue) => set({ targetValue })} error={errors.targetValue} />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-ink">Direction</p>
          <SegmentedControl<TargetDirection>
            label="Direction"
            value={form.direction}
            onChange={(direction) => {
              setTouchedDirection(true);
              set({ direction });
            }}
            options={(["reduce", "increase", "maintain"] as TargetDirection[]).map((d) => ({ value: d, label: TARGET_DIRECTION_LABEL[d] }))}
          />
          {errors.direction && (
            <p role="alert" className="text-sm text-bad">
              {errors.direction}
            </p>
          )}
        </div>
        {preview && (
          <p className="rounded-control border border-line bg-tint px-3 py-2 text-sm text-ink" aria-live="polite" data-testid="kpi-target-preview">
            <b className="font-semibold">{preview}</b>
            {form.baselineValue !== null && form.targetValue !== null && (
              <span className="block text-xs text-muted">
                {formatWithUnit(form.baselineValue, unit)} in {form.baselineYear} → {formatWithUnit(form.targetValue, unit)} in {form.targetYear}
              </span>
            )}
          </p>
        )}
        <Textarea
          label="Note"
          value={form.note}
          onChange={(note) => set({ note })}
          rows={2}
          error={errors.note}
          help="Optional when the baseline is your approved figure."
          placeholder="For example: SBTi near-term, or where the baseline came from"
        />
        {save.isError && (
          <p role="alert" className="text-sm text-bad">
            {kpiErrorMessage(save.error, "Couldn't save the target. Try again.")}
          </p>
        )}
      </div>
    </Drawer>
  );
}
