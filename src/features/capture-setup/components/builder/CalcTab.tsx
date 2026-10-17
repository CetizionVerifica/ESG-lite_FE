import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, SegmentedControl, Select, TextField, cn, focusRing, panel } from "../../../../ui";
import { ROW_METHOD_COLUMN } from "../../../../lib/emissions/emissionCalc";
import { ROW_METHOD_KEYS, methodLabel } from "../../../../lib/scope3/labels";
import {
  type BuilderDraft,
  type CalcMode,
  addRowMethod,
  addUnitMethod,
  calcMode,
  describeMethod,
  fieldTitle,
  isNumber,
  isSelect,
  removeMethod,
  setCalcMode,
  setIdentity,
  setMethodField,
  toggleIn,
  updateMethod,
} from "../../builder";
import { isGhgCategoryNumber } from "../../../../lib/scope3/contracts";
import { SUPPORTED_CURRENCIES } from "../../../../lib/scope3/spend";
import type { RowMethod } from "../../../../lib/scope3/dq";
import { fixableUnits, setFixedCurrency, setFixedUnit } from "../../formSettings";
import { MethodSection } from "./MethodSection";

export type CalcTabProps = {
  draft: BuilderDraft;
  onChange: (update: (d: BuilderDraft) => BuilderDraft) => void;
  /** The form's GHG Protocol category (Scope 3): shows how the category is calculated (SE-3). */
  ghgCategory?: number | null;
  /** SE-3: adds a method's recipe (fields, creating any the library lacks, and formula). */
  onApplyRecipe?: (method: RowMethod) => void;
  /** SE-3: adds a "What does your record show?" choice field. */
  onAddQuestion?: () => void;
  /** A recipe or the question is being added. */
  busy?: boolean;
};

const MODES: { value: CalcMode; label: string }[] = [
  { value: "none", label: "None" },
  { value: "per_method", label: "Per method" },
  { value: "per_unit", label: "Per unit" },
];

const HELP: Record<CalcMode, string> = {
  none: "The entry's one amount × the factor.",
  per_method: "A select field, or the row's calculation method, picks which numbers multiply together (e.g. Use of sold products).",
  per_unit: "The entry's unit picks which numbers multiply (e.g. tonne.km = Weight × Distance).",
};

function Chip({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      onClick={onToggle}
      className={cn("rounded-chip border px-2.5 py-1 text-xs", on ? "border-brand bg-brand text-on-brand" : "border-line bg-panel text-ink hover:bg-tint", focusRing)}
    >
      {label}
    </button>
  );
}

/** How the activity amount is worked out, in plain words. */
export function CalcTab({ draft, onChange, ghgCategory, onApplyRecipe, onAddQuestion, busy }: CalcTabProps) {
  const mode = calcMode(draft);
  const calc = draft.calculation;
  const numbers = draft.fields.filter(isNumber);
  const selects = draft.fields.filter(isSelect);
  const [unit, setUnit] = useState("");
  const rowMethod = calc?.mode === "per_method" && calc.method_column === ROW_METHOD_COLUMN;
  const freeMethods = rowMethod ? ROW_METHOD_KEYS.filter((k) => !calc.methods[k]) : [];

  return (
    <div className="space-y-4">
      {isGhgCategoryNumber(ghgCategory) && (
        <MethodSection draft={draft} onChange={onChange} ghgCategory={ghgCategory} onApplyRecipe={(m) => onApplyRecipe?.(m)} onAddQuestion={() => onAddQuestion?.()} busy={busy} />
      )}
      <UnitAndCurrency draft={draft} onChange={onChange} />
      <div className="space-y-1">
        <SegmentedControl<CalcMode> label="Calculation" value={mode} onChange={(m) => onChange((d) => setCalcMode(d, m))} options={MODES} />
        <p className="text-sm text-muted">{HELP[mode]}</p>
      </div>

      {calc?.mode === "per_method" && (
        <Select<string>
          label="Field that decides the formula"
          value={calc.method_column ?? null}
          onChange={(v) => v && onChange((d) => setMethodField(d, v))}
          options={[
            ...selects.map((f) => ({ value: f.column_name, label: fieldTitle(f.column_name) })),
            { value: ROW_METHOD_COLUMN, label: "Row's method" },
          ]}
          placeholder="Choose a select field"
          help={rowMethod ? "The entry picks its calculation method (e.g. Distance travelled); add the methods below." : undefined}
        />
      )}

      {calc && (
        <ol className="space-y-3">
          {Object.entries(calc.methods).map(([key, m]) => (
            <li key={key} className={cn(panel, "space-y-3 p-3")} data-method={key}>
              <p className="text-sm font-medium text-ink">{describeMethod(draft, key)}</p>
              <div className="space-y-1">
                <p className="text-xs text-muted">Multiply</p>
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Fields to multiply for ${key}`}>
                  {numbers.length === 0 && <span className="text-xs text-muted">This form has no number fields.</span>}
                  {numbers.map((f) => (
                    <Chip key={f.column_name} on={m.multiply.includes(f.column_name)} label={fieldTitle(f.column_name)} onToggle={() => onChange((d) => updateMethod(d, key, { multiply: toggleIn(m.multiply, f.column_name) }))} />
                  ))}
                </div>
              </div>
              {m.multiply.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted">Divide by</p>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Fields to divide by for ${key}`}>
                    {numbers
                      .filter((f) => !m.multiply.includes(f.column_name))
                      .map((f) => (
                        <Chip key={f.column_name} on={!!m.divide?.includes(f.column_name)} label={fieldTitle(f.column_name)} onToggle={() => onChange((d) => updateMethod(d, key, { divide: toggleIn(m.divide, f.column_name) }))} />
                      ))}
                  </div>
                </div>
              )}
              {m.multiply.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-muted">Entered as a percentage (divided by 100)</p>
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Percentage fields for ${key}`}>
                    {[...m.multiply, ...(m.divide ?? [])].map((f) => (
                      <Chip key={f} on={!!m.percent?.includes(f)} label={`${fieldTitle(f)} (%)`} onToggle={() => onChange((d) => updateMethod(d, key, { percent: toggleIn(m.percent, f) }))} />
                    ))}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-48">
                  <TextField label="Result unit" value={m.activity_unit ?? ""} onChange={(v) => onChange((d) => updateMethod(d, key, { activity_unit: v }))} placeholder="e.g. kWh" help="Preselected on the entry." />
                </div>
                {(calc.mode === "per_unit" || rowMethod) && (
                  <Button size="sm" variant="ghost" icon={<Trash2 aria-hidden className="size-4" />} onClick={() => onChange((d) => removeMethod(d, key))}>
                    Remove {rowMethod ? methodLabel(key) : key}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {rowMethod && freeMethods.length > 0 && (
        <div className="w-64">
          <Select<string>
            label="Add a method"
            value={null}
            onChange={(v) => v && onChange((d) => addRowMethod(d, v))}
            options={freeMethods.map((k) => ({ value: k, label: methodLabel(k) }))}
            placeholder="Choose a method"
          />
        </div>
      )}

      {calc?.mode === "per_unit" && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onChange((d) => addUnitMethod(d, unit));
            setUnit("");
          }}
        >
          <div className="w-48">
            <TextField label="Add a unit" value={unit} onChange={setUnit} placeholder="e.g. tonne.km" />
          </div>
          <Button type="submit" icon={<Plus aria-hidden className="size-4" />} disabled={!unit.trim() || !!calc.methods[unit.trim()]}>
            Add unit
          </Button>
        </form>
      )}

      {calc && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-ink">Duplicate check</p>
          <p className="text-xs text-muted">Two entries for the same month count as duplicates only when these fields match too.</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Fields in the duplicate check">
            {draft.fields
              .filter((f) => !isNumber(f))
              .map((f) => (
                <Chip
                  key={f.column_name}
                  on={!!calc.identity_columns?.includes(f.column_name)}
                  label={fieldTitle(f.column_name)}
                  onToggle={() => onChange((d) => setIdentity(d, toggleIn(d.calculation?.identity_columns, f.column_name)))}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** SE-3 · A fixed unit hides the unit select for contributors; a fixed currency hides the Currency field. */
function UnitAndCurrency({ draft, onChange }: Pick<CalcTabProps, "draft" | "onChange">) {
  const units = fixableUnits(draft);
  const spend = draft.methodOptions.some((o) => o.method === "spend_based");
  const ANY = "";
  return (
    <section aria-labelledby="unit-currency-title" className="space-y-3 border-b border-line pb-4" data-testid="unit-currency">
      <h3 id="unit-currency-title" className="text-sm font-medium text-ink">
        Unit{spend ? " and currency" : ""}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {units.length > 0 ? (
          <Select<string>
            label="Unit"
            value={draft.fixedUnit ?? ANY}
            onChange={(v) => onChange((d) => setFixedUnit(d, v || null))}
            options={[{ value: ANY, label: "Contributors choose" }, ...units.map((u) => ({ value: u, label: `Always ${u}` }))]}
            help="A fixed unit is shown as text; rows in another unit are refused."
          />
        ) : (
          <TextField
            label="Fixed unit (optional)"
            value={draft.fixedUnit ?? ""}
            onChange={(v) => onChange((d) => setFixedUnit(d, v))}
            placeholder="Contributors choose"
            help="A fixed unit is shown as text; rows in another unit are refused."
          />
        )}
        {spend && (
          <Select<string>
            label="Currency"
            value={draft.fixedCurrency ?? ANY}
            onChange={(v) => onChange((d) => setFixedCurrency(d, v || null))}
            options={[{ value: ANY, label: "The client's default" }, ...SUPPORTED_CURRENCIES.map((c) => ({ value: c, label: `Always ${c}` }))]}
            help="With one currency the Currency field is hidden."
          />
        )}
      </div>
    </section>
  );
}
