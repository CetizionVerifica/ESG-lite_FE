import { useId, useRef, useState } from "react";
import { Button, Callout, Select, SkeletonText, TextField, Textarea } from "../../../ui";
import { errorMessage, useColumnConfig, useFactorNames, useManagerEdit, useUnitOptions, useUnits } from "../api";
import { sameUnit, unitForCategory, unitsForRow } from "../../../lib/emissions/unitOptions";
import {
  type Activity,
  type EditStart,
  AMOUNT_ERROR,
  amountErrors,
  applyChange,
  blockedMessage,
  editErrors,
  editPayload,
  editableKeys,
  fieldOptions,
  isNumberField,
  initialActivity,
  parentPrompt,
  unitOfferError,
} from "../editLogic";
import { type ColumnConfig, type LedgerRow, humanize } from "../logic";
import { EditPeriodField } from "./EditPeriodField";

/** Edit mode inside the record drawer (replaces the old wide edit modal). */
/** `onDone` gets the saved entry from the server when it sends one back. */
export function EditForm({ row, onDone, onCancel }: { row: LedgerRow; onDone: (saved?: Partial<LedgerRow>) => void; onCancel: () => void }) {
  const config = useColumnConfig(row.site?.site_id, row.category?.category_id);
  if (config.isPending && row.site && row.category) return <SkeletonText lines={6} />;
  return <Loaded row={row} config={config.data ?? undefined} onDone={onDone} onCancel={onCancel} />;
}

function Loaded({
  row,
  config,
  onDone,
  onCancel,
}: {
  row: LedgerRow;
  config: ColumnConfig | undefined;
  onDone: (saved?: Partial<LedgerRow>) => void;
  onCancel: () => void;
}) {
  const siteId = row.site?.site_id;
  const categoryId = row.category?.category_id;
  const [start] = useState<EditStart>(() => ({
    activity: initialActivity(config, { ...row.activity_data }),
    date: row.date_of_reporting.slice(0, 10),
    unit: row.activity_data_unit ?? "",
  }));
  const [activity, setActivity] = useState<Activity>(start.activity);
  const [date, setDate] = useState(start.date);
  const [unit, setUnit] = useState(start.unit);
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);

  const hasMapping = Object.keys(config?.emission_category_mapping ?? {}).length > 0;
  const units = useUnits(siteId, categoryId);
  const unitOptions = useUnitOptions(siteId, categoryId);
  const factorYear = new Date(row.date_of_reporting).getFullYear() - 1;
  const names = useFactorNames(siteId, categoryId, factorYear, !hasMapping);
  const save = useManagerEdit();
  const category = String(activity.emission_category ?? "");
  const payload = editPayload(activity, date, unit, reason, start);
  // The factor and unit are needed only when the values are sent; a date-only fix keeps them as stored.
  const sendsValues = !!payload.activity_data;
  // Amounts are checked only when the values are sent (a date-only fix keeps them as stored).
  const amounts = sendsValues ? amountErrors(config, activity, start.activity) : {};
  // #183: the units the edited emission factor offers; the entry's own unit stays as "(no longer offered)".
  const unitLists = unitOptions.data ?? null;
  const offered = category ? (unitsForRow(unitLists, category)?.units ?? null) : null;
  const notOffered = offered && unit && !offered.some((u) => sameUnit(u, unit)) ? unit : null;
  const offerError = sendsValues ? unitOfferError(unit, category, offered, start.unit) : undefined;
  const errors = {
    ...editErrors(reason, sendsValues ? category : "x", hasMapping, sendsValues ? unit : "x", units.isSuccess ? units.data.length > 0 : true),
    ...(offerError ? { unit: offerError } : {}),
    ...(Object.keys(amounts).length > 0 ? { amount: AMOUNT_ERROR } : {}),
  };
  const notSaved = tried ? blockedMessage(errors) : null;
  const reasonId = useId();
  const unitId = useId();
  const amountId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  // Older entries have no stored factor; say where the one shown came from.
  const derivedFactor = sendsValues && !row.activity_data?.emission_category && !!category;

  // A new emission factor keeps the unit while it still offers it, picks its only unit, else clears it.
  const changeActivity = (next: Activity) => {
    const nextCategory = String(next.emission_category ?? "");
    if (nextCategory !== category) setUnit((u) => unitForCategory(unitLists, nextCategory, u) ?? "");
    setActivity(next);
  };

  const submit = () => {
    setTried(true);
    if (errors.reason || errors.category || errors.unit || errors.amount) {
      // Take the manager to the first field that stops the save; the message by the button says what's missing.
      const selects = [...(formRef.current?.querySelectorAll<HTMLSelectElement>("select:not(:disabled)") ?? [])];
      const target = errors.category
        ? (selects.find((el) => el.value === "" && el.id !== unitId) ?? selects[0])
        : errors.amount
          ? document.getElementById(`${amountId}-${Object.keys(amounts)[0]}`)
          : document.getElementById(errors.unit ? unitId : reasonId);
      target?.focus();
      return;
    }
    save.mutate({ id: row.pk_id, body: payload }, { onSuccess: (data) => onDone(data?.emission) });
  };
  return (
    <form
      ref={formRef}
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {row.status === "approved" && <Callout tone="info">This entry is approved. Changes are logged with your reason.</Callout>}

      {hasMapping ? (
        <div className="text-sm">
          <span className="text-muted">Emission factor: </span>
          {category || <span className="text-muted">choose the options below to set it</span>}
          {derivedFactor && <span className="text-muted"> (set from the options below, saved with this edit)</span>}
          {tried && errors.category && (
            <p className="mt-1 text-bad">
              {errors.category}
            </p>
          )}
        </div>
      ) : (
        <Select<string>
          label="Emission factor"
          value={category || null}
          placeholder="Choose a factor"
          loading={names.isPending && !names.isError}
          options={[...new Set([...(names.data ?? []), ...(category ? [category] : [])])].map((n) => ({ value: n, label: n }))}
          emptyText="No factors for this site and category"
          onChange={(v) => changeActivity({ ...activity, emission_category: v ?? "" })}
          error={tried ? errors.category : undefined}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {editableKeys(config, activity).map((key) => {
          const value = activity[key] ?? "";
          const options = fieldOptions(config, key, activity);
          const waiting = parentPrompt(config, key);
          const blocked = !!waiting && !options;
          const set = (v: string) => changeActivity(applyChange(config, activity, key, v));
          if (options || blocked)
            return (
              <Select<string>
                key={key}
                label={humanize(key)}
                value={value === "" ? null : String(value)}
                placeholder={blocked ? waiting : `Choose ${humanize(key).toLowerCase()}`}
                emptyText={waiting ?? "No options"}
                disabled={blocked}
                options={(options ?? []).map((o) => ({ value: String(o.id), label: o.label }))}
                onChange={(v) => set(v ?? "")}
              />
            );
          return (
            <TextField
              key={key}
              id={`${amountId}-${key}`}
              label={humanize(key)}
              type={isNumberField(config, key, value) ? "number" : "text"}
              step="any"
              inputMode={isNumberField(config, key, value) ? "decimal" : undefined}
              value={String(value)}
              onChange={set}
              error={tried ? amounts[key] : undefined}
            />
          );
        })}
        {unitLists ? (
          <Select<string>
            id={unitId}
            label="Unit"
            error={tried ? errors.unit : undefined}
            value={category ? unit || null : null}
            placeholder="Choose a unit"
            emptyText={hasMapping ? "Choose the options above first" : "Choose the emission factor first"}
            options={(category ? [...(offered ?? []), ...(notOffered ? [notOffered] : [])] : []).map((u) => ({ value: u, label: u === notOffered ? `${u} (no longer offered)` : u }))}
            onChange={(v) => setUnit(v ?? "")}
          />
        ) : units.data && units.data.length > 0 ? (
          <Select<string>
            id={unitId}
            label="Unit"
            error={tried ? errors.unit : undefined}
            value={unit || null}
            placeholder="Choose a unit"
            options={[...new Set([...units.data.map((u) => u.unit_name), ...(unit ? [unit] : [])])].map((u) => ({ value: u, label: u }))}
            onChange={(v) => setUnit(v ?? "")}
          />
        ) : (
          <TextField id={unitId} label="Unit" value={unit} readOnly error={tried ? errors.unit : undefined} help={units.isPending ? "Loading units…" : undefined} onChange={setUnit} />
        )}
        <EditPeriodField row={row} value={date} onChange={setDate} />
      </div>

      <Textarea
        id={reasonId}
        label="Reason for the change"
        required
        value={reason}
        onChange={setReason}
        rows={2}
        placeholder="Why is this entry being changed?"
        error={tried ? errors.reason : undefined}
      />

      {notSaved && (
        <p role="alert" className="rounded-control bg-bad-soft px-3 py-2 text-sm text-bad">
          {notSaved}
        </p>
      )}
      {save.isError && !notSaved && (
        <p role="alert" className="rounded-control bg-bad-soft px-3 py-2 text-sm text-bad">
          {errorMessage(save.error, "Couldn't save the changes. Nothing was changed.")}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onCancel} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
