import { Calculator, Check, CircleAlert, Circle } from "lucide-react";
import { Button, cn, panel } from "../../../ui";
import { type CheckItem, type ResultStage, type RunningTotal, STAGE_LABEL, fmtKg, stageParts } from "../logic";

// Stage tokens in fixed order (docs/pcf): A1 materials, A2 transport, A3 energy, A3 packaging, A3 waste.
const FILL: Record<ResultStage, string> = {
  A1: "bg-series-1",
  A2: "bg-series-2",
  A3_energy: "bg-series-3",
  A3_packaging: "bg-series-4",
  A3_waste: "bg-series-5",
};

type Props = {
  total: RunningTotal;
  unitLabel: string;
  items: CheckItem[];
  canCalculate: boolean;
  calculating: boolean;
  /** Why Calculate is waiting (unsaved changes), shown under the button. */
  waitReason: string | null;
  onCalculate: () => void;
};

/** Right rail: running total per declared unit, stage bar, completeness checklist, Calculate. */
export function TotalRail({ total, unitLabel, items, canCalculate, calculating, waitReason, onCalculate }: Props) {
  const parts = stageParts(total);
  const barText = parts.map((p) => `${STAGE_LABEL[p.stage]} ${Math.round(p.pct)}%`).join(", ");
  return (
    <aside aria-label="Running total" className={cn(panel, "space-y-5 p-4 lg:sticky lg:top-4")}>
      <div>
        <p className="text-sm text-muted">Running total</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-ink" aria-live="polite">
          {fmtKg(total.total)} <span className="text-sm font-normal text-muted">kgCO₂e per {unitLabel}</span>
        </p>
        {total.unpriced.length > 0 && (
          <p className="mt-1 text-xs text-muted">
            Leaves out {total.unpriced.length} line{total.unpriced.length === 1 ? "" : "s"} not priced yet.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <span role="img" aria-label={parts.length ? `By stage: ${barText}` : "No emissions yet"} className="flex h-3 w-full overflow-hidden rounded-full bg-tint">
          {parts.map((p) => (
            <span key={p.stage} className={cn("h-full", FILL[p.stage])} style={{ width: `${p.pct}%` }} />
          ))}
        </span>
        <ul className="space-y-1 text-sm">
          {(Object.keys(FILL) as ResultStage[]).map((s) => (
            <li key={s} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-muted">
                <span aria-hidden className={cn("size-2.5 rounded-full", FILL[s])} />
                {STAGE_LABEL[s]}
              </span>
              <span className="tabular-nums text-ink">{fmtKg(total.byStage[s])}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-sm font-medium text-ink">Ready to calculate</h3>
        <ul className="mt-2 space-y-1.5 text-sm">
          {items.map((i) => {
            const Icon = i.done ? Check : i.blocking ? CircleAlert : Circle;
            return (
              <li key={i.id} className="flex items-start gap-2">
                <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", i.done ? "text-good" : i.blocking ? "text-warn" : "text-muted")} />
                <span className={i.done ? "text-muted" : "text-ink"}>
                  <span className="sr-only">{i.done ? "Done: " : i.blocking ? "To do: " : "Note: "}</span>
                  {i.label}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-1">
        <Button
          variant="primary"
          className="w-full"
          icon={<Calculator aria-hidden className="size-4" />}
          onClick={onCalculate}
          disabled={!canCalculate || !!waitReason}
          loading={calculating}
        >
          Calculate
        </Button>
        {waitReason && <p className="text-xs text-muted">{waitReason}</p>}
      </div>
    </aside>
  );
}
