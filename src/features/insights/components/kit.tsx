// Small shared pieces for Insights panels: status chip, pillar letter, change
// chip and legend swatches. Colour is never the only signal (05-ux §2.3):
// status carries a word and an icon, pillars their letter, changes an arrow
// and the words "up" / "down".
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, CircleDashed, Flag, OctagonAlert, TriangleAlert } from "lucide-react";
import type { Pillar, TargetStatus } from "../../../lib/insights/contracts";
import { NO_TARGET, STATUS_TONE, STATUS_WORD, TONE_CLASS, type ChangeText } from "../../../lib/insights/labels";
import { PILLAR_COLOR, PILLAR_LABEL, PILLAR_LETTER } from "../../../lib/kpi/labels";
import { cn } from "../../../ui";


const STATUS_ICON: Record<TargetStatus, typeof CheckCircle2> = {
  on_track: CheckCircle2,
  at_risk: TriangleAlert,
  off_track: OctagonAlert,
  reached: Flag,
  no_data: CircleDashed,
};

/** A target status as icon + word in its fixed status colour. `null` reads "No target". */
export function StatusChip({ status, className }: { status: TargetStatus | null; className?: string }) {
  const Icon = status ? STATUS_ICON[status] : CircleDashed;
  return (
    <span data-testid="status-chip" data-status={status ?? "none"} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", TONE_CLASS[status ? STATUS_TONE[status] : "neutral"], className)}>
      <Icon aria-hidden className="size-3.5" />
      {status ? STATUS_WORD[status] : NO_TARGET}
    </span>
  );
}

/** The pillar's letter on a dot of its colour (as the KPI PillarBadge); screen readers hear the name. */
export function PillarLetter({ pillar, withLabel = false, className }: { pillar: Pillar; withLabel?: boolean; className?: string }) {
  return (
    <span title={PILLAR_LABEL[pillar]} data-testid="pillar-letter" data-pillar={pillar} className={cn("inline-flex shrink-0 items-center gap-1 rounded-chip border border-line bg-panel px-1.5 py-0.5 text-[11px] font-semibold leading-none text-ink", className)}>
      <span aria-hidden className={cn("size-2 rounded-full", PILLAR_COLOR[pillar].bg)} />
      <span aria-hidden>{PILLAR_LETTER[pillar]}</span>
      {withLabel ? <span className="font-medium">{PILLAR_LABEL[pillar]}</span> : <span className="sr-only">{PILLAR_LABEL[pillar]}</span>}
    </span>
  );
}

const ARROW = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight } as const;

/** A server change: arrow + "down 8.1% on 2025", tone from the server's good/bad. */
export function ChangeChip({ change, className }: { change: ChangeText; className?: string }) {
  const Icon = ARROW[change.arrow];
  return (
    <span data-testid="change-chip" data-tone={change.tone} className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[11px] font-medium", TONE_CLASS[change.tone], className)}>
      <Icon aria-hidden className="size-3" />
      {change.words}
    </span>
  );
}

/** One legend entry: a swatch (box, line or dashed line) in a CSS colour class and a label. */
export function LegendItem({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <span aria-hidden className="inline-flex items-center">
        {swatch}
      </span>
      {children}
    </li>
  );
}

/** A small line swatch; `dash` for dashed series. Colour via `className` (e.g. "text-brand"). */
export function LineSwatch({ dash, className }: { dash?: boolean; className?: string }) {
  return (
    <svg width="18" height="6" aria-hidden className={className}>
      <line x1="0" y1="3" x2="18" y2="3" stroke="currentColor" strokeWidth="2" strokeDasharray={dash ? "4 3" : undefined} />
    </svg>
  );
}

export function Legend({ children, label = "Legend" }: { children: ReactNode; label?: string }) {
  return (
    <ul aria-label={label} className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {children}
    </ul>
  );
}
