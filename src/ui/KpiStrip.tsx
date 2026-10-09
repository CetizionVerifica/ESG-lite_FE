import type { ReactNode } from "react";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { SkeletonKpi } from "./Skeleton";
import { cn } from "./cn";
import { focusRing } from "./styles";
import { EMPTY_VALUE, emissionsParts, formatDelta, formatNumber, formatPercent, type Delta } from "./format";

export type KpiFormat = "emissions" | "number" | "percent";

export type Kpi = {
  label: string;
  value: number | null | undefined;
  /** How to print the value. "emissions" takes tonnes and picks t/kg. */
  format?: KpiFormat;
  decimals?: number;
  /** Unit in small text, for number/percent formats ("kWh", "tCO₂e/t"). */
  unit?: string;
  /** Previous value for the delta; lower is better unless lowerIsBetter is false. */
  previous?: number | null;
  lowerIsBetter?: boolean;
  /** Caption after the delta, e.g. "vs Aug 2025". */
  compareLabel?: string;
  /** Small line under the figure, e.g. "3 of 4 sites reported". */
  hint?: ReactNode;
  /** The headline figure: wider and larger. Use on one KPI only. */
  primary?: boolean;
  /** Makes the figure a toggle, e.g. "show only pending". */
  onSelect?: () => void;
  /** Pressed state of an `onSelect` figure. */
  selected?: boolean;
};

export type KpiStripProps = {
  items: Kpi[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
};

function valueParts(k: Kpi): { value: string; unit?: string } {
  if (k.format === "emissions") return emissionsParts(k.value);
  if (k.format === "percent") return { value: formatPercent(k.value, k.decimals ?? 1) };
  return { value: formatNumber(k.value, k.decimals ?? 0), unit: k.value === null || k.value === undefined ? undefined : k.unit };
}

const toneClass: Record<Delta["tone"], string> = { good: "text-good", bad: "text-bad", neutral: "text-muted" };

/** One row of 3–5 figures in one panel. The delta arrow carries direction; colour is fixed good/bad. */
export function KpiStrip({ items, loading, error, onRetry, className }: KpiStripProps) {
  const panel = cn("rounded-card border border-line bg-panel", className);
  if (loading)
    return (
      <div className={cn(panel, "p-5")}>
        <SkeletonKpi count={items.length || 4} />
      </div>
    );
  if (error)
    return (
      <div className={panel}>
        <EmptyState compact variant="error" title={error} action={onRetry && <Button size="sm" onClick={onRetry}>Try again</Button>} />
      </div>
    );

  return (
    <dl className={cn(panel, "grid grid-cols-2 divide-line sm:flex sm:divide-x")}>
      {items.map((k) => {
        const { value, unit } = valueParts(k);
        const delta = formatDelta(k.value, k.previous, { lowerIsBetter: k.lowerIsBetter ?? true });
        return (
          <div
            key={k.label}
            className={cn(
              "relative min-w-0 p-4 sm:p-5",
              k.primary ? "col-span-2 sm:flex-[1.6]" : "sm:flex-1",
              k.onSelect && "[&>dt]:pointer-events-none [&>dd]:pointer-events-none",
              k.selected && "bg-tint",
            )}
          >
            {k.onSelect && (
              // A full-cell toggle behind the figure (a button can't wrap dt/dd).
              <button
                type="button"
                aria-pressed={k.selected ?? false}
                aria-label={`${k.label}: ${k.selected ? "show all" : "show only these"}`}
                onClick={k.onSelect}
                className={cn("absolute inset-0 rounded-card hover:bg-tint/60", focusRing)}
              />
            )}
            <dt className="relative truncate text-xs font-medium text-muted">{k.label}</dt>
            <dd className="relative mt-1">
              <span className={cn("font-num font-semibold tabular-nums text-ink", k.primary ? "text-3xl" : "text-2xl")}>{value}</span>
              {unit && value !== EMPTY_VALUE && <span className="ml-1 text-xs text-muted">{unit}</span>}
            </dd>
            {(delta || k.hint) && (
              <dd className="relative mt-1 flex flex-wrap items-baseline gap-x-1.5 text-xs">
                {delta && <span className={cn("font-num font-medium", toneClass[delta.tone])}>{delta.text}</span>}
                {delta && k.compareLabel && <span className="text-muted">{k.compareLabel}</span>}
                {k.hint && <span className="text-muted">{k.hint}</span>}
              </dd>
            )}
          </div>
        );
      })}
    </dl>
  );
}
