import { MapPin } from "lucide-react";
import { Button, DynamicField, NumberField, formatNumber } from "../../../ui";
import { columnTitle, type FormModel } from "../../../lib/emissions/form";
import type { ColumnEntity, ModalRow } from "../../../lib/emissions/types";
import { distanceKey, multiplierKey, type DistanceField } from "../logic/distance";

type Props = {
  model: FormModel;
  column: ColumnEntity;
  row: ModalRow;
  field: DistanceField;
  onChange: (column: string, value: string) => void;
  onCalculate: () => void;
  labelExtra?: React.ReactNode;
};

const num = (v: unknown) => {
  const n = Number(String(v ?? ""));
  return String(v ?? "").trim() === "" || !Number.isFinite(n) ? null : n;
};

/** A distance column: count × distance for composite units, and a button that works the distance out on a map. */
export function DistanceInput({ model, column, row, field, onChange, onCalculate, labelExtra }: Props) {
  const name = column.column_name;
  const calculate = (
    <Button size="sm" variant="secondary" icon={<MapPin className="size-4" />} onClick={onCalculate}>
      Calculate distance
    </Button>
  );
  if (field.kind === "plain") {
    return (
      <div className="space-y-1.5">
        <DynamicField model={model} column={column} row={row} onChange={onChange} labelExtra={labelExtra} />
        {calculate}
      </div>
    );
  }
  const product = num(row[name]);
  return (
    <fieldset className="space-y-1.5 sm:col-span-2">
      <legend className="mb-1 text-sm font-medium text-ink">
        {columnTitle(name)} <span className="font-normal text-muted">({row.activity_data_unit})</span>
      </legend>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label={columnTitle(field.multiplier)}
          value={num(row[multiplierKey(name)])}
          onChange={(n) => onChange(multiplierKey(name), n === null ? "" : String(n))}
          min={0}
        />
        <NumberField
          label={`Distance (${field.distance})`}
          value={num(row[distanceKey(name)])}
          onChange={(n) => onChange(distanceKey(name), n === null ? "" : String(n))}
          min={0}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {calculate}
        {product !== null && (
          <span className="font-num text-xs text-muted">
            = {formatNumber(product, 2)} {row.activity_data_unit}
          </span>
        )}
      </div>
    </fieldset>
  );
}
