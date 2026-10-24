// DS-9 · the budget meter in the AI panel header (D10: $5 or 200 calls per
// design per day, $50 per company per month). "Paused" when a limit is reached.
import type { AiUsage } from "../../../lib/studio/contracts";
import { Badge, Tooltip, cn, focusRing } from "../../../ui";
import { budgetState } from "./logic";

export function BudgetMeter({ usage }: { usage: AiUsage | undefined }) {
  const b = budgetState(usage);
  if (!b || !usage) return <span className="h-4 w-24 animate-pulse rounded-chip bg-tint" aria-hidden />;
  const tip = `${usage.calls} of ${usage.callBudget} AI calls today · $${usage.monthUsd.toFixed(2)} of $${usage.monthBudgetUsd} this month for your company`;
  return (
    <Tooltip content={tip}>
      <span tabIndex={0} className={cn("flex items-center gap-2 rounded-chip", focusRing)} data-testid="ai-budget">
        {b.paused && <Badge tone="warn">AI paused</Badge>}
        <span className="font-mono text-[11px] tabular-nums text-muted">{b.label}</span>
        <span className="h-1 w-12 overflow-hidden rounded-chip bg-tint" role="meter" aria-label="AI budget used today" aria-valuemin={0} aria-valuemax={100} aria-valuenow={b.pct}>
          <span className={cn("block h-full rounded-chip", b.pct >= 90 ? "bg-warn" : "bg-brand")} style={{ width: `${b.pct}%` }} />
        </span>
      </span>
    </Tooltip>
  );
}
