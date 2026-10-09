import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Field, type FieldBaseProps, cn, focusRing, inputBase } from "../../../ui";

export type PasswordFieldProps = FieldBaseProps & {
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  name?: string;
  placeholder?: string;
};

/** Password input with a show/hide toggle. */
export function PasswordField({ value, onChange, autoComplete, name, placeholder, ...field }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <Field {...field}>
      {(control) => (
        <div className="relative">
          <input
            {...control}
            name={name}
            type={visible ? "text" : "password"}
            autoComplete={autoComplete}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={cn(inputBase, "h-10 pr-10")}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
            className={cn("absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-control text-muted hover:text-ink", focusRing)}
          >
            {visible ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
          </button>
        </div>
      )}
    </Field>
  );
}
