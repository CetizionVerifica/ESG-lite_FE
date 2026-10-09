import { useEffect, useState } from "react";
import { cn } from "../cn";
import { inputBase } from "../styles";
import { Field, type FieldBaseProps } from "./Field";

export type NumberFieldProps = FieldBaseProps & {
  value: number | null;
  onChange: (value: number | null) => void;
  /** Shown inside the field on the right, e.g. "kWh". */
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
};

function parse(text: string): number | null {
  const cleaned = text.replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Numeric input with an optional unit suffix. Figures are set in the mono face
 * and right-aligned. Accepts thousands separators while typing; reports null
 * for empty or invalid text.
 */
export function NumberField({ value, onChange, unit, min, max, step, placeholder, ...field }: NumberFieldProps) {
  const [text, setText] = useState(value === null ? "" : String(value));

  // Follow outside changes without clobbering what the user is typing.
  useEffect(() => {
    setText((current) => (parse(current) === value ? current : value === null ? "" : String(value)));
  }, [value]);

  return (
    <Field {...field}>
      {(control) => (
        <div className="relative">
          <input
            {...control}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder={placeholder}
            value={text}
            aria-valuemin={min}
            aria-valuemax={max}
            onChange={(e) => {
              setText(e.target.value);
              onChange(parse(e.target.value));
            }}
            onKeyDown={(e) => {
              if (!step || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
              e.preventDefault();
              let next = (value ?? 0) + (e.key === "ArrowUp" ? step : -step);
              if (min !== undefined) next = Math.max(min, next);
              if (max !== undefined) next = Math.min(max, next);
              setText(String(next));
              onChange(next);
            }}
            className={cn(inputBase, "h-9 text-right font-num tabular-nums", unit && "pr-14")}
          />
          {unit && (
            <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted">
              {unit}
            </span>
          )}
        </div>
      )}
    </Field>
  );
}
