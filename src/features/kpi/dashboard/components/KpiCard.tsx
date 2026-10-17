import { Database } from "lucide-react";
import type { KpiDashboardCard, KpiTargetWithProgress } from "../../../../lib/kpi/contracts";
import { TARGET_STATUS_LABEL } from "../../../../lib/kpi/labels";
import { targetText } from "../../../../lib/kpi/targets";
import { formatWithUnit } from "../../../../lib/kpi/units";
import { cn, panel } from "../../../../ui";
import { Sparkline } from "../../components/Sparkline";
import { TargetProgress } from "../../components/TargetProgress";
import { changeText, periodShort } from "../logic";

const DOT = { on_track: "bg-good", behind: "bg-warn", no_data: "bg-line" } as const;

/**
 * KPI-10 · One KPI for the year (05-ux S5): the server's value and change on
 * last year, a 12-period line (tooltip per month), target progress (KPI-9)
 * and a status dot.
 */
export function KpiCard({ card, year, topic, target }: { card: KpiDashboardCard; year: number; topic: string; target: KpiTargetWithProgress | null }) {
  const change = changeText(card, year);
  const status = card.target?.status ?? target?.status ?? null;
  const label = card.target?.label ?? (target ? targetText(target) : null);
  const pct = card.target?.progress_pct ?? target?.progress_pct ?? null;
  // A change is only good or bad against a target's direction; otherwise it's just shown.
  const c = card.change_pct ?? 0;
  const tone = target?.direction === "reduce" ? (c <= 0 ? "text-good" : "text-warn") : target?.direction === "increase" ? (c >= 0 ? "text-good" : "text-warn") : "text-muted";
  return (
    <article className={cn(panel, "relative space-y-2 p-4")} aria-label={card.name} data-testid="kpi-card">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{topic}</p>
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-ink">
          {status && (
            <span className={cn("size-2 shrink-0 rounded-full", DOT[status])}>
              <span className="sr-only">{TARGET_STATUS_LABEL[status]}</span>
            </span>
          )}
          {card.name}
        </h3>
        {card.source === "auto" && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-chip bg-info-soft px-1.5 py-0.5 text-[11px] font-medium leading-none text-info">
            <Database aria-hidden className="size-3" />
            From your data
          </span>
        )}
      </div>
      <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="font-num text-xl font-semibold text-ink" data-testid="kpi-card-value">
          {formatWithUnit(card.value, card.unit, card.decimals ?? undefined)}
        </span>
        {change && <span className={cn("text-xs font-medium", tone)}>{change}</span>}
      </p>
      {card.series.length > 1 && <Sparkline name={card.name} unit={card.unit} points={card.series.map((p) => ({ label: periodShort(p.period), value: p.value }))} />}
      {(label || pct !== null) && <TargetProgress compact label={label} pct={pct} status={status} />}
    </article>
  );
}
