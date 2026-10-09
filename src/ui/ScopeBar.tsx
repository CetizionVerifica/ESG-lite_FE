import { EmptyState } from "./EmptyState";
import { Skeleton } from "./Skeleton";
import { cn } from "./cn";
import { formatEmissions, formatPercent } from "./format";

export type ScopeTotals = { scope1: number; scope2: number; scope3: number };

const SCOPES = [
  { key: "scope1", label: "Scope 1", fill: "bg-s1" },
  { key: "scope2", label: "Scope 2", fill: "bg-s2" },
  { key: "scope3", label: "Scope 3", fill: "bg-s3" },
] as const;

export type ScopeBarProps = {
  /** Tonnes CO₂e per scope. */
  totals: ScopeTotals | null | undefined;
  loading?: boolean;
  /** Hide the legend when the page shows the figures elsewhere. */
  hideLegend?: boolean;
  className?: string;
};

/** Stacked Scope 1/2/3 bar with legend. Colours come from --t-s1/2/3 only. */
export function ScopeBar({ totals, loading, hideLegend, className }: ScopeBarProps) {
  if (loading)
    return (
      <div role="status" aria-busy="true" className={cn("space-y-3", className)}>
        <span className="sr-only">Loading</span>
        <Skeleton className="h-3 w-full rounded-full" />
        {!hideLegend && <Skeleton className="h-4 w-2/3" />}
      </div>
    );
  const total = totals ? totals.scope1 + totals.scope2 + totals.scope3 : 0;
  if (!totals || total <= 0) return <EmptyState compact title="No emissions recorded for this period." className={className} />;

  const parts = SCOPES.map((s) => ({ ...s, value: totals[s.key], pct: (totals[s.key] / total) * 100 }));
  const summary = parts.map((p) => `${p.label} ${formatPercent(p.pct, 0)}`).join(", ");

  return (
    <div className={cn("space-y-3", className)}>
      <div role="img" aria-label={`Emissions by scope: ${summary}`} className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-tint">
        {parts.map((p) => (p.value > 0 ? <span key={p.key} className={cn("h-full", p.fill)} style={{ width: `${p.pct}%` }} /> : null))}
      </div>
      {!hideLegend && (
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {parts.map((p) => (
            <li key={p.key} className="flex items-center gap-1.5">
              <span aria-hidden className={cn("size-2.5 rounded-full", p.fill)} />
              <span className="text-muted">{p.label}</span>
              <span className="font-num tabular-nums text-ink">{formatEmissions(p.value)}</span>
              <span className="font-num text-xs tabular-nums text-muted">{formatPercent(p.pct, 0)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
