import { useState } from "react";
import { Button, Callout, DateField, Select, SkeletonText, TextField, Textarea } from "../../../ui";
import { errorMessage, useColumnConfig, useFactorNames, useManagerEdit, useUnits } from "../api";
import {
  type Activity,
  applyChange,
  editErrors,
  editPayload,
  editableKeys,
  fieldOptions,
  isNumberField,
  parentPrompt,
  prefillFromCategory,
} from "../editLogic";
import { type ColumnConfig, type LedgerRow, humanize } from "../logic";

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
  const [activity, setActivity] = useState<Activity>(() => prefillFromCategory(config, { ...row.activity_data }));
  const [date, setDate] = useState(row.date_of_reporting.slice(0, 10));
  const [unit, setUnit] = useState(row.activity_data_unit ?? "");
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);

  const hasMapping = Object.keys(config?.emission_category_mapping ?? {}).length > 0;
  const units = useUnits(siteId, categoryId);
  const factorYear = new Date(row.date_of_reporting).getFullYear() - 1;
  const names = useFactorNames(siteId, categoryId, factorYear, !hasMapping);
  const save = useManagerEdit();
  const category = String(activity.emission_category ?? "");
  const errors = editErrors(reason, category);

  const submit = () => {
    setTried(true);
    if (errors.reason || errors.category) return;
    save.mutate({ id: row.pk_id, body: editPayload(activity, date, unit, reason) }, { onSuccess: (data) => onDone(data?.emission) });
  };
  return (
    <form
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
          {tried && errors.category && (
            <p role="alert" className="mt-1 text-bad">
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
          onChange={(v) => setActivity((a) => ({ ...a, emission_category: v ?? "" }))}
          error={tried ? errors.category : undefined}
        />
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {editableKeys(config, activity).map((key) => {
          const value = activity[key] ?? "";
          const options = fieldOptions(config, key, activity);
          const waiting = parentPrompt(config, key);
          const blocked = !!waiting && !options;
          const set = (v: string) => setActivity((a) => applyChange(config, a, key, v));
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
              label={humanize(key)}
              type={isNumberField(config, key, value) ? "number" : "text"}
              step="any"
              inputMode={isNumberField(config, key, value) ? "decimal" : undefined}
              value={String(value)}
              onChange={set}
            />
          );
        })}
        {units.data && units.data.length > 0 ? (
          <Select<string>
            label="Unit"
            value={unit || null}
            placeholder="Choose a unit"
            options={[...new Set([...units.data.map((u) => u.unit_name), ...(unit ? [unit] : [])])].map((u) => ({ value: u, label: u }))}
            onChange={(v) => setUnit(v ?? "")}
          />
        ) : (
          <TextField label="Unit" value={unit} readOnly help={units.isPending ? "Loading units…" : undefined} onChange={setUnit} />
        )}
        <DateField label="Date of reporting" required value={date} onChange={setDate} />
      </div>

      <Textarea
        label="Reason for the change"
        required
        value={reason}
        onChange={setReason}
        rows={2}
        placeholder="Why is this entry being changed?"
        error={tried ? errors.reason : undefined}
      />

      {save.isError && (
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
