import { NumberField, Select, TextField, Textarea } from "../../../ui";
import type { ExtraFieldDefinition, ModalRow } from "../types";

type Props = {
  fields: ExtraFieldDefinition[];
  row: ModalRow;
  onChange: (key: string, value: string) => void;
};

/** extra_fields for the row's category (stored in extra_data; not part of the calculation). */
export function ExtraFields({ fields, row, onChange }: Props) {
  const values = (row._extra_data ?? {}) as Record<string, string>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {fields.map((f) => {
        const value = String(values[f.key] ?? "");
        const common = { label: f.label, required: f.required };
        switch (f.type) {
          case "select":
            return (
              <Select<string>
                key={f.key}
                {...common}
                value={value || null}
                onChange={(v) => onChange(f.key, v ?? "")}
                options={(f.options ?? []).map((o) => ({ value: o, label: o }))}
                placeholder="Select…"
              />
            );
          case "number":
            return (
              <NumberField
                key={f.key}
                {...common}
                value={value === "" || !Number.isFinite(Number(value)) ? null : Number(value)}
                onChange={(n) => onChange(f.key, n === null ? "" : String(n))}
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
