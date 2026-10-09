import { ChevronDown } from "lucide-react";
import { cn } from "../cn";
import { inputBase } from "../styles";
import { Field, type FieldBaseProps } from "./Field";

export type Option<V extends string | number = string> = { value: V; label: string; disabled?: boolean };

export type SelectProps<V extends string | number> = FieldBaseProps & {
  value: V | null;
  onChange: (value: V | null) => void;
  options: Option<V>[];
  /** Shown as the empty choice. Omit to force a value. */
  placeholder?: string;
  /** Shown (disabled) when there are no options, e.g. "Choose a site first". */
  emptyText?: string;
};

/** Native select: best keyboard and mobile behaviour. Use Combobox when the list needs search. */
export function Select<V extends string | number>({ value, onChange, options, placeholder, emptyText = "No options", ...field }: SelectProps<V>) {
  const empty = options.length === 0;
  return (
    <Field {...field} disabled={field.disabled || empty}>
      {(control) => (
        <div className="relative">
          <select
            {...control}
            value={value === null ? "" : String(value)}
            onChange={(e) => {
              const hit = options.find((o) => String(o.value) === e.target.value);
              onChange(hit ? hit.value : null);
            }}
            className={cn(inputBase, "h-9 appearance-none pr-8")}
          >
            {empty ? (
              <option value="">{emptyText}</option>
            ) : (
              (placeholder !== undefined || value === null) && <option value="">{placeholder ?? "Select…"}</option>
            )}
            {options.map((o) => (
              <option key={String(o.value)} value={String(o.value)} disabled={o.disabled}>
                {o.label}
              </option>
            ))}
          </select>
          <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
        </div>
      )}
    </Field>
  );
}
