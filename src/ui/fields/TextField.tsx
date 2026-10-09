import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "../cn";
import { inputBase } from "../styles";
import { Field, type FieldBaseProps } from "./Field";

type Native = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "value" | "onChange" | "disabled" | "required">;

export type TextFieldProps = FieldBaseProps &
  Native & {
    value: string;
    onChange: (value: string) => void;
  };

export function TextField({ label, help, error, required, loading, disabled, hideLabel, className, id, value, onChange, type = "text", ...rest }: TextFieldProps) {
  return (
    <Field {...{ label, help, error, required, loading, disabled, hideLabel, className, id }}>
      {(control) => (
        <input
          {...rest}
          {...control}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputBase, "h-9")}
        />
      )}
    </Field>
  );
}

export type TextareaProps = FieldBaseProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id" | "value" | "onChange" | "disabled" | "required"> & {
    value: string;
    onChange: (value: string) => void;
  };

export function Textarea({ label, help, error, required, loading, disabled, hideLabel, className, id, value, onChange, rows = 3, ...rest }: TextareaProps) {
  return (
    <Field {...{ label, help, error, required, loading, disabled, hideLabel, className, id }}>
      {(control) => (
        <textarea
          {...rest}
          {...control}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputBase, "py-2")}
        />
      )}
    </Field>
  );
}

export type DateFieldProps = FieldBaseProps & {
  /** ISO date, "YYYY-MM-DD", or "" when empty. */
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
};

export function DateField({ value, onChange, min, max, ...field }: DateFieldProps) {
  return (
    <Field {...field}>
      {(control) => (
        <input
          {...control}
          type="date"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputBase, "h-9 font-num")}
        />
      )}
    </Field>
  );
}
