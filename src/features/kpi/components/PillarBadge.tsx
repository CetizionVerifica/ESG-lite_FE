import type { KpiPillar } from "../../../lib/kpi/contracts";
import { PILLAR_COLOR, PILLAR_LABEL, PILLAR_LETTER } from "../../../lib/kpi/labels";
import { cn } from "../../../ui";

/**
 * D19 · The pillar's letter (E, S or G) beside a dot in the pillar colour.
 * The letter is the secondary encoding, so pillars are never told apart by
 * colour alone; the text stays in ink. Screen readers hear the full name.
 */
export function PillarBadge({ pillar, withLabel = false, className }: { pillar: KpiPillar; withLabel?: boolean; className?: string }) {
  return (
    <span
      title={PILLAR_LABEL[pillar]}
      data-testid="pillar-badge"
      data-pillar={pillar}
      className={cn("inline-flex shrink-0 items-center gap-1 rounded-chip border border-line bg-panel px-1.5 py-0.5 text-[11px] font-semibold leading-none text-ink", className)}
    >
      <span aria-hidden className={cn("size-2 rounded-full", PILLAR_COLOR[pillar].bg)} />
      <span aria-hidden>{PILLAR_LETTER[pillar]}</span>
      {withLabel ? <span className="font-medium">{PILLAR_LABEL[pillar]}</span> : <span className="sr-only">{PILLAR_LABEL[pillar]}</span>}
    </span>
  );
}
