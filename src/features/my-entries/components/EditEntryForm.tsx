import { useMemo, useState } from "react";
import { applyChange, formColumns, isColumnVisible, toFormModel, useEmissionCalc, type ModalRow } from "../../../lib/emissions";
import { Button, DynamicField, EmptyState, MonthPicker, Select, SkeletonText, Textarea, cn, formatEmissions, formatNumber } from "../../../ui";
import { useEditSetup } from "../api";
import { type EditIssue, type EntryUpdate, buildUpdate, editIssue, editedDate, entryMonth, factorYearFor, monthBounds, rowFromEntry } from "../edit";
import { type EntryRow, periodText } from "../logic";

export const EDIT_FORM_ID = "edit-entry-form";

type Props = {
  entry: EntryRow;
  saveError: string | null;
  onSubmit: (update: EntryUpdate) => void;
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
  const setup = useEditSetup(entry.site?.site_id, entry.category?.category_id, factorYear);
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
      units={setup.data?.units ?? []}
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
  units: string[];
  loadingFactors: boolean;
  month: string;
  onMonthChange: (month: string) => void;
  date: string;
  factorYear: number;
};

function Fields(p: FieldsProps) {
  const { entry } = p;
  const model = useMemo(() => toFormModel(p.config), [p.config]);
  const [row, setRow] = useState<ModalRow>(() => rowFromEntry(model, entry));
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);

  const calc = useEmissionCalc({
    emissionFactors: p.factors,
    targetYear: p.factorYear,
    columns: model.columns,
    calculationSpec: model.spec,
  });
  const result = calc.calculateEmission(row);
  const factor = row.emission_category ? calc.getEmissionFactor(row.emission_category) : undefined;
  const expectedUnit = row.emission_category ? calc.getExpectedUnit(row.emission_category) : null;
  const issue = editIssue(row, calc, entry.status, reason);
  const shown = (field: EditIssue["field"]) => (tried && issue?.field === field ? issue.message : undefined);

  const mapped = Object.keys(model.mapping).length > 0;
  const categoryOptions = [...new Set([...p.factors.map((f) => f.emission_category_name), ...(row.emission_category ? [row.emission_category] : [])])];
  const unitOptions = [...new Set([...(expectedUnit ? [expectedUnit] : []), ...p.units, ...(row.activity_data_unit ? [row.activity_data_unit] : [])])];
  const change = (column: string, value: string) => setRow((r) => applyChange(model, r, column, value));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (issue || p.loadingFactors) return;
    p.onSubmit(buildUpdate(row, p.date, reason));
  };

  return (
    <form id={EDIT_FORM_ID} onSubmit={submit} noValidate className="space-y-5">
      {mapped ? (
        <div className="text-sm">
          <span className="block text-xs font-medium text-muted">Emission category</span>
          {row.emission_category ? (
            <span className="mt-1 inline-flex flex-wrap items-center gap-1 rounded-chip bg-tint px-2 py-1 text-ink">
              {row._ecmKey || row.emission_category}
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
          .filter((c) => isColumnVisible(model, c, row))
          .map((c) => (
            <DynamicField key={c.pk_id} model={model} column={c} row={row} onChange={change} />
          ))}
        <Select<string>
          label="Unit"
          value={row.activity_data_unit || null}
          onChange={(v) => change("activity_data_unit", v ?? "")}
          options={unitOptions.map((u) => ({
            value: u,
            label: u === expectedUnit ? `${u} (factor unit)` : u,
          }))}
          placeholder="Choose a unit"
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
          {p.loadingFactors ? (
            "Loading factors…"
          ) : factor ? (
            <>
              Factor {factor.factor_value} kgCO₂e per {factor.denominator_unit}, {factor.year}
            </>
          ) : row.emission_category ? (
            <span className="text-bad">No factor for this category</span>
          ) : null}
          {entry.fera && <span className="mt-1 block">The linked FERA entry is recalculated when you save.</span>}
        </div>
        <div className="text-right" aria-live="polite">
          {result.value !== null ? (
            <p className="font-num text-base font-semibold text-ink">= {formatNumber(result.value, 2)} tCO₂e</p>
          ) : (
            <p className={cn("text-sm", shown("values") ? "text-bad" : "text-muted")}>{result.status}</p>
          )}
          <p className="font-num text-xs text-muted">was {formatEmissions(Number(entry.total_emission))}</p>
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

      {p.saveError && (
        <p role="alert" className="rounded-control border border-bad/30 bg-bad-soft px-3 py-2 text-sm text-bad">
          {p.saveError}
        </p>
      )}
    </form>
  );
}
