import type { ReactNode } from "react";
import { cn } from "./cn";
import { focusRing } from "./styles";
import { useRovingKeys } from "./hooks/useRovingKeys";

export type SegmentedOption<V extends string> = { value: V; label: ReactNode; disabled?: boolean };

export type SegmentedControlProps<V extends string> = {
  label: string;
  options: SegmentedOption<V>[];
  value: V;
  onChange: (value: V) => void;
  size?: "sm" | "md";
  className?: string;
};

/** A small set of mutually exclusive views (radiogroup). Arrow keys move and select. */
export function SegmentedControl<V extends string>({ label, options, value, onChange, size = "md", className }: SegmentedControlProps<V>) {
  const { refs, onKeyDown } = useRovingKeys(options, value, onChange);
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className={cn("inline-flex rounded-control bg-tint p-0.5", className)}>
      {options.map((o) => {
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[o.value] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-chip font-medium disabled:cursor-not-allowed disabled:opacity-50",
              size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm",
              checked ? "bg-panel text-ink shadow-sm" : "text-muted hover:text-ink",
              focusRing,
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
