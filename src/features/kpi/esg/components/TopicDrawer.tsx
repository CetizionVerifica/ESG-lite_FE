import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { KpiDefinition, KpiEsgPillar, KpiEsgTrend, KpiTopic, YearType } from "../../../../lib/kpi/contracts";
import { PILLAR_LABEL, TOPIC_LABEL } from "../../../../lib/kpi/labels";
import { pillarOf } from "../../../../lib/kpi/pillars";
import { formatWithUnit } from "../../../../lib/kpi/units";
import { Badge, Drawer, EmptyState, StatusPill, cn, focusRing } from "../../../../ui";
import { PillarBadge } from "../../components/PillarBadge";
import { Sparkline } from "../../components/Sparkline";
import { kpiErrorMessage, useTopicDetail } from "../api";
import { STATE_ORDER, changeWords, kpiState, topicCountsText, topicRows } from "../logic";
import { ChangeChip } from "./ChangeChip";

const linkClass = cn("text-xs font-medium text-brand-text underline", focusRing);
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const periodLabel = (p: string) => (/^\d{4}-\d{2}$/.test(p) ? `${MONTH[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}` : p);

type Props = {
  topic: KpiTopic | null;
  year: number;
  yearType: YearType;
  site: number | null;
  pillars: KpiEsgPillar[];
  trends: KpiEsgTrend[];
  /** The KPIs the company tracks (catalogue × setup). */
  selected: KpiDefinition[];
  canReview: boolean;
  vsLabel: string;
  onClose: () => void;
};

/**
 * Wave E · One topic's KPIs: value, unit, change on last year, a sparkline
 * and status. Pending ones link to review, missing ones to the KPI
 * dashboard's gaps list (who owes what). Read from the KPI dashboard's answer
 * for the topic, so every figure is still the server's.
 */
export function TopicDrawer({ topic, year, yearType, site, pillars, trends, selected, canReview, vsLabel, onClose }: Props) {
  const { dashboard, pending } = useTopicDetail(year, site, topic, yearType);
  const rows = topic ? topicRows(pillars, topic) : [];
  const pendingIds = useMemo(() => new Set((pending.data ?? []).map((v) => v.kpi_definition_id)), [pending.data]);
  if (!topic) return <Drawer open={false} onClose={onClose} title="" />;

  const label = rows[0]?.label ?? TOPIC_LABEL[topic];
  const cards = dashboard.data?.cards ?? [];
  const gaps = dashboard.data?.gaps ?? [];
  const defs = selected.filter((d) => d.topic === topic && (!site || d.level === "site"));
  const items = defs
    .map((d) => {
      const card = cards.find((c) => c.kpi_definition_id === d.id);
      return { def: d, card, state: kpiState(d.id, card, gaps, pendingIds), trend: trends.find((t) => t.code === d.code) };
    })
    .sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || a.def.name.localeCompare(b.def.name));
  const gapsLink = `/kpi/dashboard?topic=${topic}${year !== new Date().getFullYear() ? `&year=${year}` : ""}${site ? `&site=${site}` : ""}`;

  return (
    <Drawer
      open
      onClose={onClose}
      size="md"
      title={label}
      subtitle={
        <span className="flex flex-wrap items-center gap-1.5" data-testid="esg-drawer-summary">
          {rows.map((r) => (
            <span key={r.pillar} className="inline-flex items-center gap-1">
              <PillarBadge pillar={r.pillar} />
              <span>{rows.length > 1 ? `${PILLAR_LABEL[r.pillar]}: ` : ""}{topicCountsText(r)}</span>
            </span>
          ))}
        </span>
      }
      loading={dashboard.isPending}
      error={dashboard.error ? kpiErrorMessage(dashboard.error, "Couldn't load this topic's KPIs.") : null}
      onRetry={() => void dashboard.refetch()}
    >
      {items.length === 0 ? (
        <EmptyState compact title={`No ${label.toLowerCase()} KPIs here.`} description={site ? "None of this topic's KPIs are entered per site." : "Your admin chooses KPIs in KPI setup."} />
      ) : (
        <ul className="divide-y divide-line" aria-label={`${label} KPIs`}>
          {items.map(({ def, card, state, trend }) => {
            const unit = card?.unit ?? def.canonical_unit;
            const change = changeWords(card?.change_pct ?? null, trend?.direction_good ?? null, vsLabel);
            const points = (card?.series ?? []).map((p) => ({ label: periodLabel(p.period), value: p.value }));
            return (
              <li key={def.id} className="space-y-1.5 py-3" data-testid="esg-drawer-kpi">
                <div className="flex flex-wrap items-center gap-2">
                  <PillarBadge pillar={card?.pillar ?? pillarOf(def)} />
                  <b className="min-w-0 flex-1 text-sm font-medium text-ink">{def.name}</b>
                  {state === "none" ? <Badge tone="neutral">No value yet</Badge> : <StatusPill size="sm" status={state} />}
                </div>
                <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-num text-base font-semibold text-ink">{formatWithUnit(card?.value ?? null, unit, card?.decimals ?? def.decimals)}</span>
                  {change && <ChangeChip change={{ ...change, amount: `${change.amount} vs ${vsLabel}` }} />}
                </p>
                {points.length > 1 && <Sparkline name={def.name} unit={unit} points={points} height={36} pillar={card?.pillar ?? pillarOf(def)} />}
                {state === "pending" &&
                  (canReview ? (
                    <Link to="/data/approvals?view=kpi" className={linkClass}>
                      Review pending values
                    </Link>
                  ) : (
                    <p className="text-xs text-muted">Waiting for a manager's review.</p>
                  ))}
                {state === "missing" && (
                  <Link to={gapsLink} className={linkClass}>
                    See what's missing and who owes it
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Drawer>
  );
}
