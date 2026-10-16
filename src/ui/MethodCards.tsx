import { useId } from "react";
import { Calculator } from "lucide-react";
import { methodHint, methodLabel } from "../lib/scope3/dq";
import { cn } from "./cn";
import { focusRing } from "./styles";

export type MethodCardsProps = {
  /** Method keys the form offers, most specific first. */
  methods: readonly string[];
  /** The chosen method key, or null. */
  value: string | null;
  onChange: (method: string) => void;
  /** GHG Protocol category (1–15): methods are worded the category's way. */
  ghgCategory?: number | null;
  /** Group label; "How is this calculated?" by default. */
  label?: string;
  /** Shown under the cards in the error tone (e.g. METHOD_NOT_ALLOWED from the server). */
  error?: string;
  className?: string;
};

/**
 * How a row is calculated (S3-3, canvas screen 3): one radio card per method
 * the form offers, most specific first, each with a one-line plain
 * explanation. Native radios, so arrow keys move between them. A form that
 * offers one method shows it as a read-only line instead.
 */
export function MethodCards({ methods, value, onChange, ghgCategory, label = "How is this calculated?", error, className }: MethodCardsProps) {
  const name = useId();
  const errorId = `${name}-error`;
  if (methods.length === 0) return null;
  if (methods.length === 1) {
    return (
      <p className={cn("flex flex-wrap items-baseline gap-x-1.5 text-sm", className)} data-testid="method-line">
        <Calculator aria-hidden className="size-4 shrink-0 self-center text-muted" />
        <span className="text-muted">Calculated:</span>
        <span className="font-medium text-ink">{methodLabel(methods[0], ghgCategory)}</span>
        <span className="text-xs text-muted">{methodHint(methods[0])}</span>
        {error && <span className="block w-full text-xs text-bad">{error}</span>}
      </p>
    );
  }
  return (
    <fieldset className={cn("space-y-2", className)} aria-describedby={error ? errorId : undefined} aria-invalid={error ? true : undefined}>
      <legend className="mb-2 text-xs font-medium text-muted">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {methods.map((m, i) => {
          const checked = value === m;
          const titleId = `${name}-${m}`;
          return (
            <label
              key={m}
              className={cn(
                "flex cursor-pointer gap-3 rounded-control border p-3 transition-colors",
                checked ? "border-accent bg-tint" : "border-line hover:bg-tint",
                error && checked && "border-bad",
              )}
            >
              <input
                type="radio"
                name={name}
                value={m}
                checked={checked}
                onChange={() => onChange(m)}
                // The method's name only; the hint is its description.
                aria-labelledby={titleId}
                aria-describedby={`${titleId}-hint`}
                className={cn("mt-0.5 size-4 shrink-0 accent-brand", focusRing)}
              />
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink">
                  <span id={titleId}>{methodLabel(m, ghgCategory)}</span>
                  {i === 0 && <span className="text-[11px] font-normal text-muted">Most specific</span>}
                </span>
                <span id={`${titleId}-hint`} className="block text-xs text-muted">
                  {methodHint(m)}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <p id={errorId} className="text-xs text-bad">
          {error}
        </p>
      )}
    </fieldset>
  );
}
