import type { TargetStatus } from "../../../lib/kpi/contracts";
import { TARGET_STATUS_LABEL, TARGET_STATUS_TONE } from "../../../lib/kpi/labels";
import { Badge, cn, formatNumber } from "../../../ui";

/**
 * KPI-9 · A target's progress where the KPI shows (targets list, dashboard
 * cards): its words, a bar with the server's percent, and the status.
 */
export function TargetProgress({ label, pct, status, compact = false, className }: { label: string | null; pct: number | null; status: TargetStatus | null; compact?: boolean; className?: string }) {
  const width = pct === null || !Number.isFinite(pct) ? 0 : Math.max(0, Math.min(100, pct));
  const text = pct === null ? "No approved value yet" : `${formatNumber(pct, pct % 1 ? 1 : 0)} % of the way`;
  const s = status ?? (pct === null ? "no_data" : null);
  return (
    <div className={cn("space-y-1", className)} data-testid="kpi-target-progress">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
        {label && <span className="text-muted">Target: {label}</span>}
        {s && !compact && <Badge tone={TARGET_STATUS_TONE[s]}>{TARGET_STATUS_LABEL[s]}</Badge>}
      </div>
      <div role="progressbar" aria-label={`${label ? `Target ${label}: ` : ""}${text}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(width)} className="h-1.5 overflow-hidden rounded-full bg-tint">
        <span className={cn("block h-full rounded-full", s === "behind" ? "bg-warn" : "bg-good")} style={{ width: `${width}%` }} />
      </div>
      <p className="flex items-center justify-between gap-2 text-xs text-muted">
        <span>{text}</span>
        {s && compact && <span>{TARGET_STATUS_LABEL[s]}</span>}
      </p>
    </div>
  );
}
