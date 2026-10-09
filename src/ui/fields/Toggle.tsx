import type { ReactNode } from "react";
import { cn } from "../cn";
import { focusRing } from "../styles";
import { Field, type FieldBaseProps } from "./Field";

export type ToggleProps = Omit<FieldBaseProps, "required"> & {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Text beside the switch, e.g. "On" / "Off" or a short sentence. */
  inlineLabel?: ReactNode;
};

/** On/off switch (role="switch"); Space and Enter toggle it. */
export function Toggle({ checked, onChange, inlineLabel, ...field }: ToggleProps) {
  return (
    <Field {...field}>
      {(control) => (
        <div className="flex items-center gap-2">
          <button
            {...control}
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              checked ? "bg-brand" : "bg-line",
              focusRing,
            )}
          >
            <span
              aria-hidden
              className={cn(
                "inline-block size-4 rounded-full bg-panel shadow transition-transform",
                checked ? "translate-x-4.5" : "translate-x-0.5",
              )}
            />
          </button>
          {inlineLabel && <span className="text-sm text-ink">{inlineLabel}</span>}
        </div>
      )}
    </Field>
  );
}
