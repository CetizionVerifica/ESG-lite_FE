import { NumberField, Select, TextField, Textarea } from "../../../ui";
import type { ExtraFieldDefinition, ModalRow } from "../types";
import { extraFieldOptions } from "../../../lib/emissions/currencies";
import { PAID_BY_HELP, PAID_BY_KEY } from "../logic/transport";
import { type FieldSettings, settingFor } from "../../../lib/forms/settings";

type Props = {
  fields: ExtraFieldDefinition[];
  row: ModalRow;
  onChange: (key: string, value: string) => void;
  /** SE-3: the form's settings: labels and help in the client's words, hidden and read-only details. */
  settings?: FieldSettings;
};

/** extra_fields for the row's category (stored in extra_data; not part of the calculation). */
export function ExtraFields({ fields, row, onChange, settings = {} }: Props) {
  const values = (row._extra_data ?? {}) as Record<string, string>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {fields
        .filter((f) => !settingFor(settings, f.key)?.hidden)
        .map((f) => {
        const value = String(values[f.key] ?? "");
        const st = settingFor(settings, f.key);
        const common = { label: st?.label ?? f.label, required: f.required || !!st?.required, disabled: !!st?.readonly };
        switch (f.type) {
          case "select":
            return (
              <Select<string>
                key={f.key}
                {...common}
                value={value || null}
                onChange={(v) => onChange(f.key, v ?? "")}
                options={extraFieldOptions(f, value).map((o) => ({ value: o, label: o }))}
                placeholder="Select…"
                help={st?.help ?? (f.key === PAID_BY_KEY ? PAID_BY_HELP : undefined)}
              />
            );
          case "number":
            return (
              <NumberField
                key={f.key}
                {...common}
                value={value === "" || !Number.isFinite(Number(value)) ? null : Number(value)}
                onChange={(n) => onChange(f.key, n === null ? "" : String(n))}
                help={st?.help}
              />
            );
          case "textarea":
            return <Textarea key={f.key} {...common} className="sm:col-span-2" value={value} onChange={(v) => onChange(f.key, v)} rows={2} />;
          default:
            return <TextField key={f.key} {...common} type={f.type === "date" ? "date" : "text"} value={value} onChange={(v) => onChange(f.key, v)} />;
        }
      })}
    </div>
  );
}
