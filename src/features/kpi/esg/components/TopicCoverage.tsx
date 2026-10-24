import { BarChart3 } from "lucide-react";
import type { KpiEsgPillar, KpiTopic } from "../../../../lib/kpi/contracts";
import { PILLAR_COLOR } from "../../../../lib/kpi/labels";
import { EmptyState, Tooltip, cn, focusRing, formatNumber, panel } from "../../../../ui";
import { PillarBadge } from "../../components/PillarBadge";
import { topicHover } from "../logic";

/**
 * Wave E · Coverage % per topic as horizontal bars, under pillar headings.
 * One axis (0–100 %), the value printed at the end of each bar, a tooltip on
 * hover or focus ("Water · 5 of 6 approved · 1 missing"). Each bar is a
 * button that opens the topic drawer, so it works by keyboard too.
 */
export function TopicCoverage({ pillars, onOpen }: { pillars: KpiEsgPillar[]; onOpen: (topic: KpiTopic) => void }) {
  const withTopics = pillars.filter((p) => p.topics.length);
  return (
    <section aria-labelledby="esg-topics-title" className={cn(panel, "p-4")}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="esg-topics-title" className="text-sm font-semibold text-ink">
          Coverage by topic
        </h2>
        <p className="text-xs text-muted">Share of each topic's KPIs approved. Choose a topic to see its KPIs.</p>
      </div>
      {withTopics.length === 0 ? (
        <EmptyState compact icon={BarChart3} title="No topics to show yet." description="Topics appear here once KPIs are chosen in KPI setup." />
      ) : (
        <div className="space-y-4">
          {withTopics.map((p) => (
            <div key={p.pillar} role="group" aria-labelledby={`esg-topics-${p.pillar}`} data-testid="esg-topic-group">
              <h3 id={`esg-topics-${p.pillar}`} className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                <PillarBadge pillar={p.pillar} />
                {p.label}
              </h3>
              <ul className="space-y-1">
                {p.topics.map((t) => {
                  const pct = t.coverage_pct;
                  const hover = topicHover(t);
                  return (
                    <li key={t.topic} className="[&>span]:flex [&>span]:w-full">
                      <Tooltip content={hover}>
                        <button
                          type="button"
                          onClick={() => onOpen(t.topic)}
                          aria-label={`${hover}. ${pct === null ? "Nothing expected" : `${formatNumber(pct)} percent`}. Open ${t.label}.`}
                          data-testid="esg-topic-bar"
                          data-topic={t.topic}
                          className={cn("grid w-full grid-cols-[minmax(6rem,9rem)_1fr_3rem] items-center gap-2 rounded-control px-1 py-1 text-left text-sm hover:bg-tint", focusRing)}
                        >
                          <span className="truncate text-ink">{t.label}</span>
                          <span aria-hidden className="relative block h-3 rounded-full bg-tint">
                            {pct !== null && pct > 0 && <span className={cn("absolute inset-y-0 left-0 rounded-full", PILLAR_COLOR[p.pillar].bg)} style={{ width: `${Math.max(2, pct)}%` }} />}
                          </span>
                          <span aria-hidden className="text-right font-num text-xs tabular-nums text-ink">
                            {pct === null ? "—" : `${formatNumber(pct)}%`}
                          </span>
                        </button>
                      </Tooltip>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <p aria-hidden className="grid grid-cols-[minmax(6rem,9rem)_1fr_3rem] gap-2 px-1 text-[11px] text-muted">
            <span />
            <span className="flex justify-between font-num">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </span>
            <span />
          </p>
        </div>
      )}
    </section>
  );
}
