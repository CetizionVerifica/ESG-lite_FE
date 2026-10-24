import type { KpiEsgPillar, KpiPillar } from "../../../../lib/kpi/contracts";
import { PILLAR_COLOR } from "../../../../lib/kpi/labels";
import { cn, focusRing, formatNumber, panel } from "../../../../ui";
import { PillarBadge } from "../../components/PillarBadge";
import { approvedText, coverageChangeWords, leftText, ringDash } from "../logic";
import { ChangeChip } from "./ChangeChip";

const R = 28;

/**
 * Wave E · One card per pillar: a coverage ring in the pillar colour, its
 * letter badge, "34 of 40 KPIs approved", what's missing or pending, and the
 * change on last year. A card is a toggle that filters the whole page.
 */
export function PillarCards({ pillars, active, onToggle }: { pillars: KpiEsgPillar[]; active: KpiPillar | null; onToggle: (p: KpiPillar) => void }) {
  return (
    <div className="grid gap-3 md:grid-cols-3" role="group" aria-label="Coverage by pillar">
      {pillars.map((p) => {
        const pct = p.coverage_pct;
        const { dash, circumference } = ringDash(pct ?? 0, R);
        const pressed = active === p.pillar;
        const change = coverageChangeWords(p.change.approved_pct_vs_last_year);
        const label = `${p.label}: ${pct === null ? "no KPIs yet" : `${formatNumber(pct)} percent covered`}. ${approvedText(p)}. ${leftText(p)}.${change ? ` ${change.sentence}` : ""} ${pressed ? "Showing this pillar only; press again to show all." : "Press to show only this pillar."}`;
        return (
          <button
            key={p.pillar}
            type="button"
            aria-pressed={pressed}
            aria-label={label}
            onClick={() => onToggle(p.pillar)}
            data-testid="esg-pillar-card"
            data-pillar={p.pillar}
            className={cn(panel, "flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-tint", pressed && cn("border-2 bg-tint", PILLAR_COLOR[p.pillar].border), active && !pressed && "opacity-70", focusRing)}
          >
            <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden className="shrink-0">
              <circle cx="36" cy="36" r={R} fill="none" className="stroke-line" strokeWidth="7" />
              {pct !== null && pct > 0 && (
                <circle cx="36" cy="36" r={R} fill="none" className={PILLAR_COLOR[p.pillar].stroke} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${dash} ${circumference}`} transform="rotate(-90 36 36)" />
              )}
              <text x="36" y="40.5" textAnchor="middle" className="fill-ink font-num text-[14px] font-semibold">
                {pct === null ? "—" : `${formatNumber(pct)}%`}
              </text>
            </svg>
            <span className="min-w-0 flex-1 space-y-1">
              <span className="flex flex-wrap items-center gap-1.5">
                <PillarBadge pillar={p.pillar} />
                <b className="text-sm font-semibold text-ink">{p.label}</b>
              </span>
              <span className="block text-sm text-ink" data-testid="esg-pillar-approved">
                {approvedText(p)}
              </span>
              <span className="block text-xs text-muted">{leftText(p)}</span>
              {change && <ChangeChip change={change} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
