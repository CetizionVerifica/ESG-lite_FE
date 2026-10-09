import { ChevronDown } from "lucide-react";
import { cn } from "../cn";
import { MONTH_SHORT } from "../period";
import { formatReportingYear } from "../format";
import { inputBase } from "../styles";
import { Field, type FieldBaseProps } from "./Field";

function yearsBetween(from: number, to: number): number[] {
  const out: number[] = [];
  for (let y = to; y >= from; y--) out.push(y);
  return out;
}

const selectClass = cn(inputBase, "h-9 appearance-none pr-8");
const Chevron = () => (
  <ChevronDown aria-hidden className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
);

export type MonthPickerProps = FieldBaseProps & {
  /** "YYYY-MM" or null. */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Inclusive "YYYY-MM" bounds. Defaults to the last 7 years up to this month. */
  min?: string;
  max?: string;
};

/**
 * Month + year as two native selects in one fieldset: works with keyboard and
 * screen readers everywhere (type="month" is missing in Safari and Firefox).
 */
export function MonthPicker({ value, onChange, min, max, ...field }: MonthPickerProps) {
  const now = new Date();
  const maxV = max ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const minV = min ?? `${now.getFullYear() - 6}-01`;
  const [vy, vm] = value ? value.split("-").map(Number) : [null, null];
  const years = yearsBetween(Number(minV.slice(0, 4)), Number(maxV.slice(0, 4)));
  const year = vy ?? years[0];

  const emit = (y: number, m: number | null) => {
    if (m === null) return onChange(null);
    const next = `${y}-${String(m).padStart(2, "0")}`;
    onChange(next < minV ? minV : next > maxV ? maxV : next);
  };

  return (
    <Field {...field} group>
      {(control) => (
        <div className="grid grid-cols-[1fr_6.5rem] gap-2">
          <div className="relative">
            <select
              {...control}
              aria-label="Month"
              value={vm ?? ""}
              onChange={(e) => emit(year, e.target.value ? Number(e.target.value) : null)}
              className={selectClass}
            >
              <option value="">Month</option>
              {MONTH_SHORT.map((label, i) => {
                const key = `${year}-${String(i + 1).padStart(2, "0")}`;
                return (
                  <option key={label} value={i + 1} disabled={key < minV || key > maxV}>
                    {label}
                  </option>
                );
              })}
            </select>
            <Chevron />
          </div>
          <div className="relative">
            <select
              aria-label="Year"
              aria-describedby={control["aria-describedby"]}
              disabled={control.disabled}
              value={year}
              onChange={(e) => emit(Number(e.target.value), vm)}
              className={cn(selectClass, "font-num")}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <Chevron />
          </div>
        </div>
      )}
    </Field>
  );
}

export type YearPickerProps = FieldBaseProps & {
  value: number | null;
  onChange: (value: number | null) => void;
  /** Labels options "CY 2025" or "FY 2025-26". Plain years when omitted. */
  yearType?: "CY" | "FY";
  fyStartMonth?: number;
  from?: number;
  to?: number;
};

export function YearPicker({ value, onChange, yearType, fyStartMonth, from, to, ...field }: YearPickerProps) {
  const thisYear = new Date().getFullYear();
  const years = yearsBetween(from ?? thisYear - 6, to ?? thisYear);
  return (
    <Field {...field}>
      {(control) => (
        <div className="relative">
          <select
            {...control}
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
            className={selectClass}
          >
            {value === null && <option value="">Year</option>}
            {years.map((y) => (
              <option key={y} value={y}>
                {yearType ? formatReportingYear(y, yearType, fyStartMonth) : y}
              </option>
            ))}
          </select>
          <Chevron />
        </div>
      )}
    </Field>
  );
}
