import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDown, Copy, Trash2 } from "lucide-react";
import { Badge, Button, DataQualityBadge, FileDrop, InfoTerm, MethodCards, Select, cn, formatNumber, panel, type FileDropItem } from "../../../ui";
import type { EmissionCalculator } from "../hooks/emissionCalc";
import { resolveSpecMethod } from "../hooks/emissionCalc";
import { formColumns, isColumnVisible, rowMethodChoices, visibleExtraFields, type FormModel } from "../logic/form";
import { unitOptionsForRow, type RowIssue } from "../logic/entry";
import type { CategoryMapping } from "../api";
import type { EmissionFactor, ModalRow } from "../types";
import { billOf, isAiField, LOW_CONFIDENCE } from "../logic/bill";
import { AiChip, AiLabel, ConfidenceBadge } from "./AiMarks";
import { DynamicField } from "./DynamicField";
import { DistanceInput } from "./DistanceInput";
import { distanceFieldFor, type DistanceField } from "../logic/distance";
import { ExtraFields } from "./ExtraFields";
import { TRANSPORT_MODE_COLUMN, transportUnitHelp } from "../logic/transport";
import { TripCalculator } from "./TripCalculator";
import { ROW_METHOD_COLUMN } from "../../../lib/emissions/emissionCalc";
import { isGhgCategoryNumber } from "../../../lib/scope3/contracts";
import { methodLabel } from "../../../lib/scope3/labels";
import { DATA_TYPE_LABELS, autoDq, dataTypeFor, isMethod, unitsForMethod, type Method } from "../../../lib/scope3/dq";
import { TRAVEL_MODE_NOTE, distanceFieldOf } from "../../../lib/scope3/travel";
import { SPEND_FIELDS, spendPreviewLine } from "../../../lib/scope3/spend";
import { CAT3_PREVIEW_PREFIX, cat3PreviewText, type Scope3Sub } from "../../../lib/scope3/fera";
import { allMethodUnits, methodForUnit, plainProblem } from "../../../lib/entryDetail";
import { supplierMethodOf } from "../logic/supplier";
import { SpendFields } from "./SpendFields";

const SPEND_EXTRA_KEYS = new Set<string>(Object.values(SPEND_FIELDS));

/**
 * The Category 3 (FERA) rows an entry adds on save (S3-7): the upstream twin
 * against the site's FERA factors (td_loss ones left out), and for a Scope 2
 * category the T&D-loss twin against its td_loss factors.
 */
export type Cat3Calc = { upstream: EmissionCalculator | null; tdLoss: EmissionCalculator | null; upstreamSub: Scope3Sub };

export type RowComparison = { text: string; overThreshold: boolean; threshold: number; previousLabel: string } | null;

type Props = {
  index: number;
  row: ModalRow;
  model: FormModel;
  calc: EmissionCalculator;
  feraCalc: Cat3Calc | null;
  factors: EmissionFactor[];
  mappings: CategoryMapping[];
  units: string[];
  factorYear: number;
  reportingYear: number;
  issue: RowIssue | null;
  showIssue: boolean;
  /** S3-15 live checks: what the save would refuse; shown on its field when the form has nothing to say there. */
  serverIssue?: RowIssue | null;
  comparison: RowComparison;
  canRemove: boolean;
  /** The category's GHG Protocol number (Scope 3 only); picks method labels and travel copy. */
  ghgCategory?: number | null;
  onChange: (column: string, value: string) => void;
  /**
   * SE-1: sets the method a User's unit says, as is: unlike onChange it preselects no unit or
   * percentages and clears nothing, and the method alone isn't input (rowHasInput).
   */
  onRowMethod?: (method: string) => void;
  onExtraChange: (key: string, value: string) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  /** Opens the distance drawer for a distance column. */
  onCalculateDistance: (column: string, field: DistanceField) => void;
  /** Evidence files for a typed row; bill rows have their bill. */
  evidence?: { items: FileDropItem[]; onAdd: (files: File[]) => void; onRemove: (id: string) => void };
  /** S3-6: the Supplier field of a Category 1 or 2 row. */
  supplierSlot?: ReactNode;
  /** The site's country (ISO alpha-2), for the data quality preview (S3-3). */
  siteCountry?: string | null;
  /** The server refused the row's method (METHOD_NOT_ALLOWED): its words, shown on the method cards. */
  methodError?: string;
  /**
   * SE-1: the calculation detail is for Managers and above (or a company set to full detail): method
   * cards, data quality, the factor line and spend/FX preview, "(factor unit)", the Global chip and the
   * Category 3 line. A contributor sees their fields and the total; their row keeps the form's first
   * method (simple-entry §8 decision 2).
   */
  showCalcDetail?: boolean;
};

/** One entry as a card: what it is, its values, more details, and the live result. */
export function EntryRow(p: Props) {
  const { row, model, calc } = p;
  const mapped = Object.keys(model.mapping).length > 0;
  // S3-6: a supplier-method row is calculated from the supplier's figures, not the activity's factor.
  const supplierMethod = supplierMethodOf(row);
  const factor = row.emission_category && !supplierMethod ? calc.getEmissionFactor(row.emission_category) : undefined;
  const result = calc.calculateEmission(row);
  const twin = (c: EmissionCalculator | null | undefined) => (c && row.emission_category && c.getEmissionFactor(row.emission_category) ? c.calculateEmission(row).value : null);
  const cat3 = p.feraCalc
    ? cat3PreviewText(
        [
          { sub: p.feraCalc.upstreamSub, value: twin(p.feraCalc.upstream) },
          { sub: "3c_td_losses", value: twin(p.feraCalc.tdLoss) },
        ],
        (n) => formatNumber(n, 2),
      )
    : null;
  const expectedUnit =
    (row.emission_category && calc.getExpectedUnit(row.emission_category)) ||
    (model.spec?.mode === "per_method" ? resolveSpecMethod(model.spec, row)?.method.activity_unit : null) ||
    null;
  const allExtras = visibleExtraFields(model, row);
  const localShown = p.showIssue && !!p.issue;
  // SE-1: a User reads the local problem in plain words; server issues already are (serverIssueOf).
  const localMessage = (m: string) => (p.showCalcDetail ? m : plainProblem(m));
  const fieldError = (f: RowIssue["field"]) =>
    localShown && p.issue?.field === f ? localMessage(p.issue.message) : !localShown && p.serverIssue?.field === f ? p.serverIssue.message : undefined;
  // A server problem on the values (no factor, a field it refuses) shows under the result.
  const serverValues = !localShown && p.serverIssue?.field === "values" ? p.serverIssue.message : null;
  const categoryOptions =
    p.mappings.length > 0
      ? p.mappings.map((m) => ({ value: m.global_category_name, label: m.company_category_name }))
      : [...new Set(p.factors.map((f) => f.emission_category_name))].map((name) => ({ value: name, label: name }));
  const bill = billOf(row);
  const aiCategory = isAiField(row, "emission_category");
  const confidence = aiCategory ? (bill?.confidence ?? null) : null;
  const unsure = confidence !== null && confidence < LOW_CONFIDENCE;
  const ghg = isGhgCategoryNumber(p.ghgCategory) ? p.ghgCategory : null;
  // S3-3: the form's method_options, or (S3-9) a spec whose method_column is "@method", let the row pick its method.
  // A contributor gets no S3-3 method choice. A form whose own fields depend on the row's method
  // (an S3-9 "@method" spec with no method_options) keeps the plain select it has on production.
  const rowMethods = p.showCalcDetail || !model.methodOptions.length ? rowMethodChoices(model) : [];
  const legacyMethodSelect = !p.showCalcDetail && rowMethods.length > 1;
  const rowMethod = String(row[ROW_METHOD_COLUMN] ?? "");
  // SE-1: a form offering several methods whose fields don't depend on the method (the S3-8 transport
  // forms) and that asks a User no question yet (SE-3/SE-5): the User picks from every method's units
  // (spend keeps its own Amount and Currency fields), and the unit says which method the row is, as the
  // engine records it (methodForUnit). Before, the units of the form's first method were the only ones.
  const methodPicksFields = model.spec?.mode === "per_method" && model.spec.method_column === ROW_METHOD_COLUMN;
  const byUnit = !p.showCalcDetail && model.methodOptions.length > 1 && !methodPicksFields;
  const unitMethods = model.methodOptions.filter((o) => o.method !== "spend_based");
  const unitMethod = byUnit ? methodForUnit(unitMethods, row.activity_data_unit) : null;
  const setRowMethod = useRef(p.onRowMethod);
  setRowMethod.current = p.onRowMethod;
  useEffect(() => {
    if (unitMethod && rowMethod !== unitMethod) setRowMethod.current?.(unitMethod);
  }, [unitMethod, rowMethod]);
  const methodUnits = byUnit ? allMethodUnits(unitMethods) : unitsForMethod(model.methodOptions, rowMethod);
  const tripField = ghg === 7 && rowMethod === "distance_based" ? distanceFieldOf(model.spec?.methods[rowMethod]) : null;
  // S3-5: a row calculated from the amount spent takes Amount, Currency and Invoice date instead of
  // the quantity fields, unless its method multiplies fields into the amount (Category 15).
  const spend = calc.spendDetail(row);
  const spendForm = calc.usesSpendForm(row);
  // The live data quality line mirrors the engine: a row priced from spend is spend_based (S3-5's file
  // says so); else the row's method, else the form's first, else average data (Scope 3 only).
  const dqMethod: Method | null = spend ? "spend_based" : isMethod(rowMethod) ? rowMethod : (model.methodOptions[0]?.method ?? (ghg !== null ? "average_data" : null));
  const hasEvidence = !!bill || (p.evidence?.items.length ?? 0) > 0;
  const dq = dqMethod && factor && ghg !== null ? autoDq({ method: dqMethod, factor, siteCountry: p.siteCountry, reportingYear: p.reportingYear, hasEvidence }) : null;
  const visible = formColumns(model).filter((c) => isColumnVisible(model, c, row) && (!spendForm || c.column_type === "select"));
  // The spend form's own fields replace the form's older "Spent value" / "Currency" extras.
  const extras = spendForm ? allExtras.filter((f) => !SPEND_EXTRA_KEYS.has(f.key)) : allExtras;
  const firstSelect = visible.find((c) => c.column_type === "select")?.column_name;
  // A method that names its units (S3-3 method_options) offers only those; else the units the activity's factor takes.
  const unitOptions = methodUnits
    ? [...new Set([...methodUnits, ...(row.activity_data_unit ? [row.activity_data_unit] : [])])]
    : unitOptionsForRow(row, calc, p.units, expectedUnit);

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
              {p.showCalcDetail && row._ecmKey && row._ecmKey !== row.emission_category && <span className="text-muted">· Global: {row.emission_category}</span>}
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

      {legacyMethodSelect ? (
        <Select<string>
          label={p.showCalcDetail ? "Calculation method" : "Type of record"}
          value={rowMethod || null}
          onChange={(v) => p.onChange(ROW_METHOD_COLUMN, v ?? "")}
          options={rowMethods.map((k) => ({ value: k, label: methodLabel(k, ghg) }))}
          placeholder={p.showCalcDetail ? "Choose how this row is calculated" : "Choose one"}
          className="sm:max-w-sm"
        />
      ) : p.showCalcDetail ? (
        <MethodCards
          methods={rowMethods}
          value={rowMethod || null}
          onChange={(v) => p.onChange(ROW_METHOD_COLUMN, v)}
          ghgCategory={ghg}
          label={`How is row ${p.index + 1} calculated?`}
          error={p.methodError}
        />
      ) : p.methodError ? (
        <p className="text-xs text-bad">{p.methodError}</p>
      ) : null}

      {p.supplierSlot}

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
                help={p.showCalcDetail && ghg === 6 && c.column_name === firstSelect ? TRAVEL_MODE_NOTE : undefined}
              />
            );
          })}
        {spendForm ? (
          <SpendFields row={row} onChange={p.onChange} amountError={fieldError("values")} currencyError={fieldError("currency")} showCalcDetail={p.showCalcDetail} />
        ) : (
          <Select<string>
            label={<AiLabel text="Unit" ai={isAiField(row, "activity_data_unit")} />}
            value={row.activity_data_unit || null}
            onChange={(v) => p.onChange("activity_data_unit", v ?? "")}
            options={unitOptions.map((u) => ({ value: u, label: p.showCalcDetail && u === expectedUnit ? `${u} (factor unit)` : u }))}
            placeholder="Choose a unit"
            help={
              transportUnitHelp(model.spec, row.activity_data_unit, row[TRANSPORT_MODE_COLUMN]) ??
              (p.showCalcDetail && expectedUnit ? `The factor is per ${expectedUnit}; other units are converted where possible.` : undefined)
            }
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
          {/* SE-1: the factor line and the spend/FX preview are calculation detail. */}
          {!p.showCalcDetail ? null : spend?.outcome.ok ? (
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
          ) : supplierMethod ? (
            p.showCalcDetail ? <>From the supplier's figures · {methodLabel(supplierMethod, ghg)}</> : null
          ) : row.emission_category ? (
            <span className="text-bad">No factor for this category</span>
          ) : null}
          {p.showCalcDetail && dq && dqMethod && (
            <span className="mt-1 flex flex-wrap items-center gap-1.5" data-testid="row-dq">
              Data quality <DataQualityBadge dq={dq} />
              <span>
                {DATA_TYPE_LABELS[dataTypeFor({ method: dqMethod, hasEvidence })]} data
                {row._estimates?.length ? " · estimated distance" : ""}
                {p.evidence && !hasEvidence && dataTypeFor({ method: dqMethod }) === "secondary" ? " · evidence makes it primary" : ""}
              </span>
            </span>
          )}
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
              {p.showCalcDetail &&
                result.notes?.map((n) => (
                  <span key={n} className="block text-xs font-normal text-muted" data-testid="calc-note">
                    {n}
                  </span>
                ))}
            </p>
          ) : (
            // No issue but no figure: a spend rate loading or that failed to load; a muted note, never an error.
            <p className={cn("text-sm", localShown || serverValues ? "text-bad" : "text-muted")}>{p.issue ? localMessage(p.issue.message) : (serverValues ?? (p.showCalcDetail ? result.status : plainProblem(result.status)))}</p>
          )}
          {result.value !== null && serverValues && <p className="text-xs text-bad">{serverValues}</p>}
          {p.showCalcDetail && cat3 && (
            <p className="font-num text-xs text-muted">
              + <InfoTerm id="fera">Cat 3</InfoTerm> {cat3.slice(CAT3_PREVIEW_PREFIX.length)}
            </p>
          )}
        </div>
      </footer>
    </section>
  );
}
