import { useId, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "../cn";

export type FieldControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
  disabled?: boolean;
};

export type FieldBaseProps = {
  label: ReactNode;
  /** Help text under the control. Hidden while an error shows. */
  help?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** Disables the control and says it is loading (e.g. options being fetched). */
  loading?: boolean;
  disabled?: boolean;
  /** Visually hides the label (it stays for screen readers). */
  hideLabel?: boolean;
  className?: string;
  id?: string;
};

type FieldProps = FieldBaseProps & {
  children: (control: FieldControlProps) => ReactNode;
  /** Use a <fieldset>/<legend> for groups of controls (MonthPicker). */
  group?: boolean;
};

/** Label, help, error and required marker around one control. Every field in the set uses this. */
export function Field({ label, help, error, required, loading, disabled, hideLabel, className, id, group, children }: FieldProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const helpId = `${controlId}-help`;
  const errorId = `${controlId}-error`;
  const describedBy = [error ? errorId : help ? helpId : null, loading ? `${controlId}-loading` : null]
    .filter(Boolean)
    .join(" ");

  const labelContent = (
    <>
      {label}
      {required && (
        <span aria-hidden className="ml-0.5 text-bad">
          *
        </span>
      )}
    </>
  );
  const labelClass = cn("mb-1 block text-sm font-medium text-ink", hideLabel && "sr-only");
  const Wrapper = group ? "fieldset" : "div";

  return (
    <Wrapper className={cn("min-w-0", className)}>
      {group ? <legend className={labelClass}>{labelContent}</legend> : (
        <label htmlFor={controlId} className={labelClass}>
          {labelContent}
        </label>
      )}
      {children({
        id: controlId,
        "aria-describedby": describedBy || undefined,
        "aria-invalid": error ? true : undefined,
        "aria-required": required ? true : undefined,
        disabled: disabled || loading,
      })}
      {loading && (
        <p id={`${controlId}-loading`} className="mt-1 flex items-center gap-1 text-xs text-muted">
          <Loader2 aria-hidden className="size-3 animate-spin" /> Loading…
        </p>
      )}
      {error ? (
        <p id={errorId} className="mt-1 text-xs text-bad">
          {error}
        </p>
      ) : (
        help && (
          <p id={helpId} className="mt-1 text-xs text-muted">
            {help}
          </p>
        )
      )}
    </Wrapper>
  );
}
