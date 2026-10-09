import { useEffect, useState } from "react";
import { cn } from "../cn";
import { focusRing, inputBase } from "../styles";
import { Field, type FieldBaseProps } from "./Field";

const HEX = /^#[0-9a-f]{6}$/i;
// Not a UI colour: the native colour input needs some valid value to show.
const PICKER_FALLBACK = "#000000";

export type ColourFieldProps = FieldBaseProps & {
  /** "#rrggbb". This is brand data being edited, not a UI colour. */
  value: string;
  onChange: (value: string) => void;
};

/** Swatch picker + hex text input, kept in sync. Invalid hex is held locally until fixed. */
export function ColourField({ value, onChange, error, ...field }: ColourFieldProps) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const invalid = text !== "" && !HEX.test(text);

  return (
    <Field {...field} error={error ?? (invalid ? "Use a 6-digit hex colour, like #1f2a44" : undefined)}>
      {(control) => (
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label="Pick colour"
            disabled={control.disabled}
            value={HEX.test(value) ? value : PICKER_FALLBACK}
            onChange={(e) => onChange(e.target.value)}
            className={cn("h-9 w-11 shrink-0 cursor-pointer rounded-control border border-line bg-panel p-1", focusRing)}
          />
          <input
            {...control}
            type="text"
            spellCheck={false}
            value={text}
            onChange={(e) => {
              const next = e.target.value.trim();
              setText(next);
              if (HEX.test(next)) onChange(next.toLowerCase());
            }}
            className={cn(inputBase, "h-9 font-num uppercase")}
          />
        </div>
      )}
    </Field>
  );
}
