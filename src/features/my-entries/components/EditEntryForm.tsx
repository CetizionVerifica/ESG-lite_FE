import { useMemo, useState } from "react";
import { applyChange, formColumns, isColumnVisible, mappingKeyLabel, offeredUnits, sameUnit, toFormModel, unitsForRow, useEmissionCalc, type EmissionFactor, type ModalRow } from "../../../lib/emissions";
import { Button, DynamicField, EmptyState, MonthPicker, Select, SkeletonText, Textarea, cn, formatEntryEmissions, formatTonnes } from "../../../ui";
import { useEditSetup } from "../api";
import { type EditIssue, type EntryUpdate, buildUpdate, editAddsWtt, editIssue, editedDate, entryMonth, factorYearFor, feraCategoryIdOf, monthBounds, rowFromEntry } from "../edit";
import { type EntryRow, periodText } from "../logic";
import { plainProblem } from "../../../lib/entryDetail";
import type { SaveProblem } from "../../../lib/saveProblem";
import { SaveProblemNote } from "../../../lib/SaveProblemNote";
import { useCalcDetailForSite } from "../../../lib/useCalcDetail";
import { columnTitle } from "../../../lib/emissions/form";
import { settingFor } from "../../../lib/forms/settings";
import { splitFeraFactors } from "../../../lib/scope3/fera";
import { withWttInRow } from "../../../lib/scope3/wtt";
import { useAuth } from "../../../context/AuthContext";

export const EDIT_FORM_ID = "edit-entry-form";

const NO_FACTORS: EmissionFactor[] = [];

type Props = {
  entry: EntryRow;
  saveError: SaveProblem | null;
  /** keepBoth: the person chose Keep both on a duplicate, so the entry is saved beside the other one. */
  onSubmit: (update: EntryUpdate, opts?: { keepBoth?: boolean }) => void;
};

/**
 * Edit a pending or rejected entry: the same fields as Add data, with the
 * live tCO₂e result. Loads the setup, then hands over to the form so the row
 * starts from the entry once the config is known.
 */
export function EditEntryForm({ entry, saveError, onSubmit }: Props) {
  const [month, setMonth] = useState(() => entryMonth(entry));
  const date = editedDate(entry, month);
  const factorYear = factorYearFor(date);
  const { user } = useAuth();
  const setup = useEditSetup(entry.site?.site_id, entry.category?.category_id, factorYear, feraCategoryIdOf(user, entry.site?.site_id));
  // The config doesn't change with the factor year, so the row survives a month change.
  const [config, setConfig] = useState(setup.data?.config);
  if (setup.data && config === undefined) setConfig(setup.data.config);

  if (config === undefined) {
    if (setup.isError) {
      return (
        <EmptyState
          compact
          variant="error"
          title="Couldn't load the form for this entry."
          action={
            <Button size="sm" onClick={() => void setup.refetch()}>
              Try again
            </Button>
          }
        />
      );
    }
    return <SkeletonText lines={5} />;
  }
  return (
    <Fields
      entry={entry}
      config={config}
      factors={setup.data?.factors ?? []}
      feraFactors={setup.data?.feraFactors ?? NO_FACTORS}
      units={setup.data?.units ?? []}
      unitOptions={setup.data?.unitOptions ?? null}
      loadingFactors={setup.isFetching}
      month={month}
      onMonthChange={setMonth}
      date={date}
      factorYear={factorYear}
      saveError={saveError}
      onSubmit={onSubmit}
    />
  );
}

type FieldsProps = Props & {
  config: NonNullable<ReturnType<typeof useEditSetup>["data"]>["config"];
  factors: NonNullable<ReturnType<typeof useEditSetup>["data"]>["factors"];
  feraFactors: NonNullable<ReturnType<typeof useEditSetup>["data"]>["feraFactors"];
  units: string[];
  unitOptions: NonNullable<ReturnType<typeof useEditSetup>["data"]>["unitOptions"];
  loadingFactors: boolean;
  month: string;
  onMonthChange: (month: string) => void;
  date: string;
  factorYear: number;
};

function Fields(p: FieldsProps) {
  const { entry } = p;
  const model = useMemo(() => toFormModel(p.config, p.unitOptions), [p.config, p.unitOptions]);
  const [row, setRow] = useState<ModalRow>(() => rowFromEntry(model, entry));
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  // What the last save sent, bar the reason: Keep both is offered only while the month and values are the
  // ones the duplicate warning was about, so a change since is checked again rather than kept unseen.
  const [sentTarget, setSentTarget] = useState<string | null>(null);

  const baseCalc = useEmissionCalc({
    emissionFactors: p.factors,
    targetYear: p.factorYear,
    columns: model.columns,
    calculationSpec: model.spec,
  });
  // D6a: a Category 4, 6, 7 or 9 row's total includes its WTT part, as the save adds it. An entry
  // saved with a Category 3 twin keeps its WTT there (the server's keep_fera_twin); spec forms get none.
  const wttHere = editAddsWtt(entry, model);
  const wttFactors = useMemo(() => (wttHere ? splitFeraFactors(p.feraFactors, p.factorYear).upstream : NO_FACTORS), [wttHere, p.feraFactors, p.factorYear]);
  const wttCalc = useEmissionCalc({ emissionFactors: wttFactors, targetYear: p.factorYear, columns: model.columns });
  const calc = wttHere ? withWttInRow(baseCalc, wttCalc) : baseCalc;
  const result = calc.calculateEmission(row);
  const factor = row.emission_category ? calc.getEmissionFactor(row.emission_category) : undefined;
  const expectedUnit = row.emission_category ? calc.getExpectedUnit(row.emission_category) : null;
  // #183: the units the emission category offers; the entry's own unit stays selectable as "(no longer offered)".
  const offered = offeredUnits(model, row);
  const issue = editIssue(row, calc, entry.status, reason, { offered, stored: entry.activity_data_unit });
  // SE-1: a User sees their fields and the total; problems in plain words.
  const detail = useCalcDetailForSite(entry.site?.site_id);
  const say = (message: string) => (detail ? message : plainProblem(message));
  const shown = (field: EditIssue["field"]) => (tried && issue?.field === field ? say(issue.message) : undefined);

  const mapped = Object.keys(model.mapping).length > 0;
  const categoryOptions = [...new Set([...p.factors.map((f) => f.emission_category_name), ...(row.emission_category ? [row.emission_category] : [])])];
  const factorUnit = unitsForRow(model.unitOptions, row.emission_category)?.factorUnit || expectedUnit;
  const currentUnit = row.activity_data_unit || "";
  const notOffered = offered && currentUnit && !offered.some((u) => sameUnit(u, currentUnit)) ? currentUnit : null;
  const unitsWaitForCategory = !!model.unitOptions && !row.emission_category;
  const unitOptions = unitsWaitForCategory
    ? []
    : offered
      ? [...offered, ...(notOffered ? [notOffered] : [])]
      : [...new Set([...(expectedUnit ? [expectedUnit] : []), ...p.units, ...(currentUnit ? [currentUnit] : [])])];
  const change = (column: string, value: string) => setRow((r) => applyChange(model, r, column, value));

  const target = JSON.stringify({ ...buildUpdate(row, p.date, reason), reason: undefined });
  const send = (keepBoth: boolean) => {
    setTried(true);
    if (issue || p.loadingFactors) return;
    setSentTarget(target);
    p.onSubmit(buildUpdate(row, p.date, reason), { keepBoth });
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    send(false);
  };

  return (
    <form id={EDIT_FORM_ID} onSubmit={submit} noValidate className="space-y-5">
      {mapped ? (
        <div className="text-sm">
          <span className="block text-xs font-medium text-muted">Emission category</span>
          {row.emission_category ? (
            <span className="mt-1 inline-flex flex-wrap items-center gap-1 rounded-chip bg-tint px-2 py-1 text-ink">
              {row._ecmKey ? mappingKeyLabel(String(row._ecmKey)) : row.emission_category}
            </span>
          ) : (
            <span className={cn("mt-1 block", shown("emission_category") ? "text-bad" : "text-muted")}>Set by your choices below</span>
          )}
        </div>
      ) : (
        <Select<string>
          label="Emission category"
          value={row.emission_category || null}
          onChange={(v) => change("emission_category", v ?? "")}
          options={categoryOptions.map((c) => ({ value: c, label: c }))}
          placeholder="Choose what this entry is"
          error={shown("emission_category")}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {formColumns(model)
          .filter((c) => isColumnVisible(model, c, row) && !settingFor(model.settings.fieldSettings, c.column_name)?.hidden)
          .map((c) => (
            <DynamicField
              key={c.pk_id}
              model={model}
              column={c}
              row={row}
              onChange={change}
              // SE-3: the form's own words, help and read-only fields, as in Add data.
              labelText={settingFor(model.settings.fieldSettings, c.column_name)?.label ?? columnTitle(c.column_name)}
              help={settingFor(model.settings.fieldSettings, c.column_name)?.help}
              readOnly={!!settingFor(model.settings.fieldSettings, c.column_name)?.readonly}
            />
          ))}
        <Select<string>
          label="Unit"
          value={unitsWaitForCategory ? null : row.activity_data_unit || null}
          onChange={(v) => change("activity_data_unit", v ?? "")}
          options={unitOptions.map((u) => ({
            value: u,
            label: u === notOffered ? `${u} (no longer offered)` : detail && sameUnit(u, factorUnit) ? `${u} (factor unit)` : u,
          }))}
          placeholder="Choose a unit"
          emptyText={mapped ? "Make your choices above first" : "Choose the emission category first"}
          error={shown("activity_data_unit")}
        />
        {entry.reporting_period === "yearly" ? (
          <div className="text-sm">
            <span className="block text-xs font-medium text-muted">Period</span>
            <span className="mt-2 block text-ink">Yearly · {periodText(entry)}</span>
          </div>
        ) : (
          <MonthPicker
            label="Month"
            help="Within the same year. To file it under another year, add it again there."
            value={p.month}
            onChange={(v) => v && p.onMonthChange(v)}
            {...monthBounds(entry)}
          />
        )}
      </div>

      <div className="flex flex-col gap-1 rounded-control border border-line p-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="text-xs text-muted">
          {!detail ? null : p.loadingFactors ? (
            "Loading factors…"
          ) : factor ? (
            <>
              Factor {factor.factor_value} kgCO₂e per {factor.denominator_unit}, {factor.year}
            </>
          ) : row.emission_category ? (
            <span className="text-bad">No factor for this category</span>
          ) : null}
          {detail && result.value !== null && result.wtt_kg !== undefined && (
            <span className="mt-1 block font-num">Includes {formatTonnes(result.wtt_kg / 1000)} tCO₂e well-to-tank (WTT)</span>
          )}
          {detail && entry.fera && <span className="mt-1 block">Linked Category 3 entries are recalculated when you save.</span>}
        </div>
        <div className="text-right" aria-live="polite">
          {result.value !== null ? (
            <p className="font-num text-base font-semibold text-ink">= {formatEntryEmissions(result.value)}</p>
          ) : (
            <p className={cn("text-sm", shown("values") ? "text-bad" : "text-muted")}>{say(result.status)}</p>
          )}
          <p className="font-num text-xs text-muted">was {formatEntryEmissions(Number(entry.total_emission))}</p>
        </div>
      </div>

      <Textarea
        label={entry.status === "rejected" ? "What did you change?" : "Reason for the change"}
        help={entry.status === "rejected" ? "The reviewer sees this with your resubmission." : "Optional. Kept in the entry's history."}
        required={entry.status === "rejected"}
        value={reason}
        onChange={setReason}
        error={shown("reason")}
      />

      {p.saveError && <SaveProblemNote problem={p.saveError} onKeepBoth={sentTarget === target ? () => send(true) : undefined} />}
    </form>
  );
}
