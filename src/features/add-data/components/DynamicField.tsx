import { NumberField, Select, TextField } from "../../../ui";
import { columnOptionsFor, columnTitle, isDependentColumn, isSelectColumn, parentColumnOf, rowValue, type FormModel } from "../logic/form";
import type { ColumnEntity, ModalRow } from "../types";

type Props = {
  model: FormModel;
  column: ColumnEntity;
  row: ModalRow;
  onChange: (column: string, value: string) => void;
  error?: string;
};

const toNumber = (text: unknown): number | null => {
  const n = Number(String(text ?? "").replace(/,/g, ""));
  return String(text ?? "").trim() === "" || !Number.isFinite(n) ? null : n;
};

/** One ColumnConfig column: a (dependent) select, a number or text. */
export function DynamicField({ model, column, row, onChange, error }: Props) {
  const name = column.column_name;
  const label = columnTitle(name);
  const parent = parentColumnOf(model, name);
  const parentValue = parent ? rowValue(row, parent) : undefined;
  const options = columnOptionsFor(model, column, parentValue);
  const value = String(row[name] ?? "");

  if (isSelectColumn(model, column) && (options.length > 0 || isDependentColumn(model, name))) {
    const waiting = isDependentColumn(model, name) && !parentValue;
    return (
      <Select<string>
        label={label}
        value={value === "" ? null : value}
        onChange={(v) => onChange(name, v ?? "")}
        options={options.map((o) => ({ value: String(o.id), label: o.label }))}
        placeholder={`Select ${label.toLowerCase()}`}
        emptyText={waiting && parent ? `Select ${columnTitle(parent).toLowerCase()} first` : "No options"}
        disabled={waiting}
      />
    );
  }

  if (column.column_type === "number") {
    return (
      <NumberField
        label={label}
        value={toNumber(value)}
        onChange={(n) => onChange(name, n === null ? "" : String(n))}
        min={0}
        error={error}
      />
    );
  }

  return <TextField label={label} value={value} onChange={(v) => onChange(name, v)} type={column.column_type === "date" ? "date" : "text"} />;
}
