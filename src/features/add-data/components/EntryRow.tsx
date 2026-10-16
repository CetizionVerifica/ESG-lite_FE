import { ChevronDown, Copy, Trash2 } from "lucide-react";
import { Badge, Button, FileDrop, InfoTerm, Select, cn, formatNumber, panel, type FileDropItem } from "../../../ui";
import type { EmissionCalculator } from "../hooks/emissionCalc";
import { resolveSpecMethod } from "../hooks/emissionCalc";
import { formColumns, isColumnVisible, visibleExtraFields, type FormModel } from "../logic/form";
import type { RowIssue } from "../logic/entry";
import type { CategoryMapping } from "../api";
import type { EmissionFactor, ModalRow } from "../types";
import { billOf, isAiField, LOW_CONFIDENCE } from "../logic/bill";
import { AiChip, AiLabel, ConfidenceBadge } from "./AiMarks";
import { DynamicField } from "./DynamicField";
import { DistanceInput } from "./DistanceInput";
import { distanceFieldFor, type DistanceField } from "../logic/distance";
import { ExtraFields } from "./ExtraFields";
import { TripCalculator } from "./TripCalculator";
import { ROW_METHOD_COLUMN } from "../../../lib/emissions/emissionCalc";
import { isGhgCategoryNumber } from "../../../lib/scope3/contracts";
import { methodLabel } from "../../../lib/scope3/methods";
import { TRAVEL_MODE_NOTE, distanceFieldOf } from "../../../lib/scope3/travel";
import { SPEND_FIELDS, isSpendRow, spendPreviewLine } from "../../../lib/scope3/spend";
import { SpendFields } from "./SpendFields";

const SPEND_EXTRA_KEYS = new Set<string>(Object.values(SPEND_FIELDS));

export type RowComparison = { text: string; overThreshold: boolean; threshold: number; previousLabel: string } | null;

type Props = {
  index: number;
  row: ModalRow;
  model: FormModel;
  calc: EmissionCalculator;
  feraCalc: EmissionCalculator | null;
  factors: EmissionFactor[];
  mappings: CategoryMapping[];
  units: string[];
  factorYear: number;
  reportingYear: number;
  issue: RowIssue | null;
  showIssue: boolean;
  comparison: RowComparison;
  canRemove: boolean;
  /** The category's GHG Protocol number (Scope 3 only); picks method labels and travel copy. */
  ghgCategory?: number | null;
  onChange: (column: string, value: string) => void;
  onExtraChange: (key: string, value: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  /** Opens the distance drawer for a distance column. */
  onCalculateDistance: (column: string, field: DistanceField) => void;
  /** Evidence files for a typed row; bill rows have their bill. */
  evidence?: { items: FileDropItem[]; onAdd: (files: File[]) => void; onRemove: (id: string) => void };
};

/** One entry as a card: what it is, its values, more details, and the live result. */
export function EntryRow(p: Props) {
  const { row, model, calc } = p;
  const mapped = Object.keys(model.mapping).length > 0;
  const factor = row.emission_category ? calc.getEmissionFactor(row.emission_category) : undefined;
  const result = calc.calculateEmission(row);
  const fera = p.feraCalc && row.emission_category && p.feraCalc.getEmissionFactor(row.emission_category) ? p.feraCalc.calculateEmission(row) : null;
  const expectedUnit =
    (row.emission_category && calc.getExpectedUnit(row.emission_category)) ||
    (model.spec?.mode === "per_method" ? resolveSpecMethod(model.spec, row)?.method.activity_unit : null) ||
    null;
  const allExtras = visibleExtraFields(model, row);
  const fieldError = (f: RowIssue["field"]) => (p.showIssue && p.issue?.field === f ? p.issue.message : undefined);
  const categoryOptions =
    p.mappings.length > 0
      ? p.mappings.map((m) => ({ value: m.global_category_name, label: m.company_category_name }))
      : [...new Set(p.factors.map((f) => f.emission_category_name))].map((name) => ({ value: name, label: name }));
  const bill = billOf(row);
  const aiCategory = isAiField(row, "emission_category");
  const confidence = aiCategory ? (bill?.confidence ?? null) : null;
  const unsure = confidence !== null && confidence < LOW_CONFIDENCE;
  const ghg = isGhgCategoryNumber(p.ghgCategory) ? p.ghgCategory : null;
  // S3-9: a spec whose method_column is "@method" lets the row pick its method.
  const rowMethods = model.spec?.mode === "per_method" && model.spec.method_column === ROW_METHOD_COLUMN ? Object.keys(model.spec.methods) : null;
  const rowMethod = String(row[ROW_METHOD_COLUMN] ?? "");
  const tripField = ghg === 7 && rowMethod === "distance_based" ? distanceFieldOf(model.spec?.methods[rowMethod]) : null;
  // S3-5: a row calculated from the amount spent takes Amount, Currency and Invoice date instead of
  // the quantity fields, unless its method multiplies fields into the amount (Category 15).
  const spend = calc.spendDetail(row);
  const specMethod = model.spec ? resolveSpecMethod(model.spec, row) : null;
  const spendForm = isSpendRow(row, factor) && !(specMethod && specMethod.method.multiply.length > 0) && spend?.spend.amount_from !== "quantity";
  const visible = formColumns(model).filter((c) => isColumnVisible(model, c, row) && (!spendForm || c.column_type === "select"));
  // The spend form's own fields replace the form's older "Spent value" / "Currency" extras.
  const extras = spendForm ? allExtras.filter((f) => !SPEND_EXTRA_KEYS.has(f.key)) : allExtras;
  const firstSelect = visible.find((c) => c.column_type === "select")?.column_name;
  const unitOptions = [...new Set([...(expectedUnit ? [expectedUnit] : []), ...p.units, ...(row.activity_data_unit ? [row.activity_data_unit] : [])])];

  return (
    <section aria-label={`Row ${p.index + 1}`} className={cn(panel, "space-y-4 p-4")}>
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">Row {p.index + 1}</h3>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" icon={<Copy className="size-4" />} onClick={p.onDuplicate} aria-label={`Duplicate row ${p.index + 1}`}>
            <span className="hidden sm:inline">Duplicate</span>
          </Button>
          <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={p.onRemove} disabled={!p.canRemove} aria-label={`Remove row ${p.index + 1}`}>
            <span className="hidden sm:inline">Remove</span>
          </Button>
        </div>
      </header>

      <div className={cn(unsure && "rounded-control bg-warn-soft p-2")}>
      {mapped ? (
        <div className="text-sm">
          <span className="block text-xs font-medium text-muted">
            <AiLabel text="Emission category" ai={aiCategory} />
          </span>
          {row.emission_category ? (
            <span className="mt-1 inline-flex flex-wrap items-center gap-1 rounded-chip bg-tint px-2 py-1 text-ink">
              {row._ecmKey || row.emission_category}
              {row._ecmKey && row._ecmKey !== row.emission_category && <span className="text-muted">· Global: {row.emission_category}</span>}
            </span>
          ) : (
            <span className={cn("mt-1 block", fieldError("emission_category") ? "text-bad" : "text-muted")}>
              Set by your choices below
            </span>
          )}
        </div>
      ) : (
        <Select<string>
          label={<AiLabel text="Emission category" ai={aiCategory} />}
          value={row.emission_category || null}
          onChange={(v) => p.onChange("emission_category", v ?? "")}
          options={categoryOptions}
          placeholder="Choose what this row is"
          error={fieldError("emission_category")}
        />
      )}
      {confidence !== null && (
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
          <ConfidenceBadge confidence={confidence} />
          {unsure && <span>The AI isn't sure about this category.</span>}
        </p>
      )}
      </div>

      {rowMethods && (
        <Select<string>
          label="Calculation method"
          value={rowMethod || null}
          onChange={(v) => p.onChange(ROW_METHOD_COLUMN, v ?? "")}
          options={rowMethods.map((k) => ({ value: k, label: methodLabel(k, ghg) }))}
          placeholder="Choose how this row is calculated"
          className="sm:max-w-sm"
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((c) => {
            const labelExtra = isAiField(row, c.column_name) ? <AiChip /> : undefined;
            const distance = distanceFieldFor(model, row, c);
            return distance ? (
              <DistanceInput
                key={c.pk_id}
                model={model}
                column={c}
                row={row}
                field={distance}
                onChange={p.onChange}
                onCalculate={() => p.onCalculateDistance(c.column_name, distance)}
                labelExtra={labelExtra}
              />
            ) : (
              <DynamicField
                key={c.pk_id}
                model={model}
                column={c}
                row={row}
                onChange={p.onChange}
                labelExtra={labelExtra}
                help={ghg === 6 && c.column_name === firstSelect ? TRAVEL_MODE_NOTE : undefined}
              />
            );
          })}
        {spendForm ? (
          <SpendFields row={row} onChange={p.onChange} amountError={fieldError("values")} />
        ) : (
          <Select<string>
            label={<AiLabel text="Unit" ai={isAiField(row, "activity_data_unit")} />}
            value={row.activity_data_unit || null}
            onChange={(v) => p.onChange("activity_data_unit", v ?? "")}
            options={unitOptions.map((u) => ({ value: u, label: u === expectedUnit ? `${u} (factor unit)` : u }))}
            placeholder="Choose a unit"
            help={expectedUnit ? `The factor is per ${expectedUnit}; other units are converted where possible.` : undefined}
            error={fieldError("activity_data_unit")}
          />
        )}
      </div>

      {tripField && <TripCalculator field={tripField} onUse={(km) => p.onChange(tripField, String(km))} />}

      {extras.length > 0 && (
        <details className="group" open={extras.some((f) => f.required)}>
          <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-brand-text">
            <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
            More details
          </summary>
          <div className="pt-3">
            <ExtraFields fields={extras} row={row} onChange={p.onExtraChange} />
          </div>
        </details>
      )}

      {p.evidence && (
        <details className="group" open={p.evidence.items.length > 0}>
          <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-medium text-brand-text">
            <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
            Evidence{p.evidence.items.length > 0 && ` (${p.evidence.items.length})`}
          </summary>
          <div className="pt-3">
            <FileDrop
              label={`Evidence for row ${p.index + 1}`}
              help="PDF, image or spreadsheet, up to 10 MB each. Attached when you send."
              accept={["application/pdf", "image/*", ".xlsx", ".xls", ".csv", ".doc", ".docx"]}
              maxSize={10 * 1024 * 1024}
              multiple
              items={p.evidence.items}
              onAdd={p.evidence.onAdd}
              onRemove={p.evidence.onRemove}
            />
          </div>
        </details>
      )}

      <footer className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="text-xs text-muted">
          {spend?.outcome.ok ? (
            <span className="font-num" data-testid="spend-preview">
              {spendPreviewLine(spend.spend, spend.outcome, spend.factor)}
            </span>
          ) : factor ? (
            <>
              Factor {factor.factor_value} kgCO₂e per {factor.denominator_unit}, {factor.year}
              {factor.year === p.factorYear ? (
                <> · factor year {factor.year} used for {p.reportingYear} data</>
              ) : (
                <> · no {p.factorYear} factor; {factor.year} used for {p.reportingYear} data</>
              )}
            </>
          ) : row.emission_category ? (
            <span className="text-bad">No factor for this category</span>
          ) : null}
          {p.comparison && (
            <span className="mt-1 block">
              <Badge tone={p.comparison.overThreshold ? "warn" : "neutral"}>
                {p.comparison.text} vs {p.comparison.previousLabel}
                {p.comparison.overThreshold && ` (threshold ${p.comparison.threshold}%)`}
              </Badge>
            </span>
          )}
        </div>
        <div className="text-right" aria-live="polite">
          {result.value !== null ? (
            <p className="font-num text-base font-semibold text-ink">
              {/* Exact to the 2 decimals the saved total keeps. */}
              = {formatNumber(result.value, 2)} tCO₂e
              {result.status === "converted" && <span className="block text-xs font-normal text-muted">unit converted</span>}
            </p>
          ) : (
            <p className={cn("text-sm", p.showIssue ? "text-bad" : "text-muted")}>{p.issue?.message ?? result.status}</p>
          )}
          {fera?.value != null && <p className="font-num text-xs text-muted">+ <InfoTerm>FERA</InfoTerm> {formatNumber(fera.value, 2)} tCO₂e (added on save)</p>}
        </div>
      </footer>
    </section>
  );
}
