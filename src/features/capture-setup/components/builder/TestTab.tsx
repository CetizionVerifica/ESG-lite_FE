import { useMemo, useState } from "react";
import { Calculator, RotateCcw } from "lucide-react";
import { applyChange, formColumns, isColumnVisible, newRow, toFormModel } from "../../../../lib/emissions/form";
import { calculateEmission, findEmissionFactor, resolveSpecMethod, type EmissionCalcInput } from "../../../../lib/emissions/emissionCalc";
import type { EmissionFactor, ModalRow } from "../../../../lib/emissions/types";
import { Button, DynamicField, EmptyState, Select, SkeletonText, cn } from "../../../../ui";
import { type BuilderDraft, toPreviewConfig } from "../../builder";
import { describeResult, factorYears, factorsFor } from "../../sampleCalc";

export type TestTabProps = {
  draft: BuilderDraft;
  formId: number;
  setup: { factors: EmissionFactor[]; units: string[] } | undefined;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
};

/**
 * Sample values through the unsaved form and the site's real factors, with
 * the calculator Add data uses. Nothing typed here is saved.
 */
export function TestTab({ draft, formId, setup, loading, error, onRetry }: TestTabProps) {
  const model = useMemo(() => toFormModel(toPreviewConfig(draft, formId)), [draft, formId]);
  const [row, setRow] = useState<ModalRow>(() => newRow(model, 1));
  const years = useMemo(() => factorYears(setup?.factors ?? []), [setup]);
  const [pickedYear, setYear] = useState<number | null>(null);
  const year = pickedYear ?? years[0] ?? null;

  if (loading) return <SkeletonText lines={4} />;
  if (error) return <EmptyState variant="error" compact title="Couldn't load this site's factors." action={<Button onClick={onRetry}>Try again</Button>} />;
  if (!setup || setup.factors.length === 0) {
    return <EmptyState icon={Calculator} compact title="No emission factors for this site and category." description="Add factors on the Emission factors page, then test the form here." />;
  }

  const factors = factorsFor(setup.factors, year);
  const input: EmissionCalcInput = {
    emissionFactors: factors,
    targetYear: year ?? undefined,
    columns: model.columns,
    calculationSpec: model.spec,
  };
  const mapped = Object.keys(model.mapping).length > 0;
  const factor = row.emission_category ? findEmissionFactor(input, row.emission_category) : undefined;
  const expectedUnit = factor?.denominator_unit ?? (model.spec?.mode === "per_method" ? resolveSpecMethod(model.spec, row)?.method.activity_unit : undefined) ?? null;
  const units = [...new Set([...(expectedUnit ? [expectedUnit] : []), ...setup.units, ...(row.activity_data_unit ? [row.activity_data_unit] : [])])];
  const outcome = describeResult(calculateEmission(input, row), factor);
  const change = (name: string, value: string) => setRow((r) => applyChange(model, r, name, value));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-prose text-sm text-muted">Enter sample values to see the tCO₂e this form gives with the real factor. Nothing here is saved.</p>
        <div className="flex items-end gap-2">
          <Select<number>
            label="Factor year"
            value={year}
            onChange={(v) => v !== null && setYear(v)}
            options={years.map((y) => ({ value: y, label: String(y) }))}
            className="w-32"
          />
          <Button variant="ghost" icon={<RotateCcw aria-hidden className="size-4" />} onClick={() => setRow(newRow(model, 1))}>
            Clear
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {mapped ? (
          <div className="text-sm sm:col-span-2">
            <span className="block text-xs font-medium text-muted">Emission category</span>
            <span className="mt-1 inline-block rounded-chip bg-tint px-2 py-1 text-ink">{row.emission_category || "Set by the choices below"}</span>
          </div>
        ) : (
          <Select<string>
            label="Emission category"
            className="sm:col-span-2"
            value={row.emission_category || null}
            onChange={(v) => change("emission_category", v ?? "")}
            options={[...new Set(factors.map((f) => f.emission_category_name))].map((n) => ({ value: n, label: n }))}
            placeholder="Choose a factor"
          />
        )}
        {formColumns(model)
          .filter((c) => isColumnVisible(model, c, row))
          .map((c) => (
            <DynamicField key={c.pk_id} model={model} column={c} row={row} onChange={change} />
          ))}
        <Select<string>
          label="Unit"
          value={row.activity_data_unit || null}
          onChange={(v) => change("activity_data_unit", v ?? "")}
          options={units.map((u) => ({ value: u, label: u === expectedUnit ? `${u} (factor unit)` : u }))}
          placeholder="Select…"
        />
      </div>

      <div
        role="status"
        aria-live="polite"
        data-testid="test-result"
        className={cn(
          "rounded-control border px-4 py-3",
          outcome.tone === "good" ? "border-good/40 bg-good-soft" : outcome.tone === "warn" ? "border-warn/40 bg-warn-soft" : "border-line bg-tint",
        )}
      >
        <p className={cn("font-num", outcome.tone === "good" ? "text-2xl font-semibold text-ink" : "text-sm text-ink")}>{outcome.headline}</p>
        {outcome.detail && <p className="mt-1 text-xs text-muted">{outcome.detail}</p>}
      </div>
    </div>
  );
}
