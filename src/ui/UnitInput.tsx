import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./cn";
import { Field, type FieldBaseProps } from "./fields/Field";
import { formatNumber } from "./format";
import { focusRing, inputBase } from "./styles";
import { matchUnit } from "./unitMatch";

export type UnitInputValue = { value: number | null; unit: string };

export type UnitInputProps = FieldBaseProps & {
  value: UnitInputValue;
  onChange: (value: UnitInputValue) => void;
  /** Unit names offered (e.g. from unitService UnitData.unit_name). */
  units: string[];
  /** The unit the emission factor expects; drives the mismatch / convert hint. */
  expectedUnit?: string | null;
  placeholder?: string;
};

function parse(text: string): number | null {
  const cleaned = text.replace(/,/g, "").trim();
  if (!cleaned || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Number + unit in one control. Replaces UserDataEntry's UnitSelector: same
 * conversion rules (utils/unitConversions), token colours, and an inline
 * "Use kWh" fix when a conversion exists.
 */
export function UnitInput({ value, onChange, units, expectedUnit, placeholder, error, help, ...field }: UnitInputProps) {
  const [text, setText] = useState(value.value === null ? "" : String(value.value));
  useEffect(() => {
    setText((t) => (parse(t) === value.value ? t : value.value === null ? "" : String(value.value)));
  }, [value.value]);

  const match = matchUnit(value.unit, expectedUnit);
  const mismatchError = match.state === "mismatch" ? `This factor needs ${expectedUnit}. Pick ${expectedUnit} or a unit that converts to it.` : undefined;
  const hint =
    match.state === "convertible" ? (
      <span>
        1 {value.unit} = {formatNumber(match.factor, 6).replace(/\.?0+$/, "")} {expectedUnit}
        {value.value !== null && (
          <>
            {" "}
            · {formatNumber(value.value * match.factor, 2)} {expectedUnit}
          </>
        )}
        {" · "}
        <button
          type="button"
          onClick={() =>
            onChange({ value: value.value === null ? null : value.value * match.factor, unit: expectedUnit ?? value.unit })
          }
          className={cn("rounded-chip font-medium text-brand-text underline", focusRing)}
        >
          Convert to {expectedUnit}
        </button>
      </span>
    ) : expectedUnit ? (
      help ?? `Expected unit: ${expectedUnit}`
    ) : (
      help
    );

  return (
    <Field {...field} error={error ?? mismatchError} help={hint}>
      {(control) => (
        <div className="flex">
          <input
            {...control}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder={placeholder}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              onChange({ ...value, value: parse(e.target.value) });
            }}
            className={cn(inputBase, "h-9 rounded-r-none text-right font-num tabular-nums")}
          />
          <div className="relative -ml-px">
            <select
              aria-label="Unit"
              aria-invalid={match.state === "mismatch" || undefined}
              disabled={control.disabled}
              value={value.unit}
              onChange={(e) => onChange({ ...value, unit: e.target.value })}
              className={cn(inputBase, "h-9 w-32 appearance-none rounded-l-none pr-7", match.state === "convertible" && "border-warn")}
            >
              {!value.unit && <option value="">Unit</option>}
              {units.map((u) => (
                <option key={u} value={u}>
                  {u}
                  {expectedUnit && u.toLowerCase() === expectedUnit.toLowerCase() ? " (expected)" : ""}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted" />
          </div>
        </div>
      )}
    </Field>
  );
}
