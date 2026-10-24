/**
 * Wave E · ESG dashboard logic (pure): words, tones and groupings for the
 * pillar cards, topic bars, trend charts, heat table and movers. Every figure
 * is the server's (`GET /kpi/esg`); this only words, filters and orders it.
 */
import type { DirectionGood, KpiDashboardCard, KpiEsgPillar, KpiEsgTopic, KpiEsgTrend, KpiGap, KpiPillar, KpiTopic } from "../../../lib/kpi/contracts";
import { KPI_PILLARS } from "../../../lib/kpi/contracts";
import { PILLAR_LABEL } from "../../../lib/kpi/labels";
import { formatNumber } from "../../../ui/format";

const plural = (n: number, one: string, many = `${one}s`) => `${formatNumber(n)} ${n === 1 ? one : many}`;

/** "34 of 40 KPIs approved" (not-due KPIs aren't counted). */
export function approvedText(p: Pick<KpiEsgPillar, "approved" | "kpis" | "not_due">): string {
  const due = Math.max(0, p.kpis - (p.not_due ?? 0));
  if (!due) return p.kpis ? "Nothing due yet" : "No KPIs yet";
  return `${formatNumber(p.approved)} of ${plural(due, "KPI")} approved`;
}

/** "2 missing · 3 pending", "1 not due yet" or "All approved". */
export function leftText(p: Pick<KpiEsgPillar, "missing" | "pending" | "not_due" | "kpis" | "approved">): string {
  const parts: string[] = [];
  if (p.missing) parts.push(`${formatNumber(p.missing)} missing`);
  if (p.pending) parts.push(`${formatNumber(p.pending)} pending`);
  if (p.not_due) parts.push(`${formatNumber(p.not_due)} not due yet`);
  if (!parts.length) return p.kpis ? "All approved" : "Choose some in KPI setup";
  return parts.join(" · ");
}

export type Tone = "good" | "bad" | "neutral";

/** A change, worded so good or bad never rests on colour alone: an arrow, a number and a word. */
export interface ChangeWords {
  arrow: "up" | "down" | "flat";
  /** "−7 %", "+6 pts". */
  amount: string;
  /** "Better", "Worse", or null when the KPI has no good direction. */
  word: "Better" | "Worse" | null;
  tone: Tone;
  /** The full sentence for screen readers and tooltips. */
  sentence: string;
}

/** Year-on-year change of a KPI, read against its good direction (`direction_good`). */
export function changeWords(changePct: number | null, direction: DirectionGood, vsLabel: string): ChangeWords | null {
  if (changePct === null || !Number.isFinite(changePct)) return null;
  const r = Math.round(changePct * 10) / 10;
  const arrow = r > 0 ? "up" : r < 0 ? "down" : "flat";
  const amount = `${r > 0 ? "+" : r < 0 ? "−" : "±"}${formatNumber(Math.abs(r), Math.abs(r) % 1 ? 1 : 0)} %`;
  const good = direction === null || arrow === "flat" ? null : direction === arrow;
  const word = good === null ? null : good ? "Better" : "Worse";
  const how = arrow === "flat" ? "No change" : `${arrow === "up" ? "Up" : "Down"} ${formatNumber(Math.abs(r), Math.abs(r) % 1 ? 1 : 0)} %`;
  return { arrow, amount, word, tone: good === null ? "neutral" : good ? "good" : "bad", sentence: `${how} on ${vsLabel}${word ? `: ${word.toLowerCase()}` : ""}.` };
}

/** A pillar's coverage against last year, in percentage points ("+26 pp on last year"): more approved is better. */
export function coverageChangeWords(points: number | null): ChangeWords | null {
  if (points === null || !Number.isFinite(points)) return null;
  const r = Math.round(points);
  const arrow = r > 0 ? "up" : r < 0 ? "down" : "flat";
  const word = arrow === "flat" ? null : arrow === "up" ? "Better" : "Worse";
  return {
    arrow,
    amount: `${r > 0 ? "+" : r < 0 ? "−" : "±"}${formatNumber(Math.abs(r))} pp on last year`,
    word,
    tone: word === null ? "neutral" : word === "Better" ? "good" : "bad",
    sentence: arrow === "flat" ? "Same coverage as last year." : `${formatNumber(Math.abs(r))} percentage ${Math.abs(r) === 1 ? "point" : "points"} ${arrow === "up" ? "more" : "less"} covered than last year.`,
  };
}

/** A mover's change: Better / Worse from the server's `good`, neutral when the good direction isn't known. */
export function moverWords(m: { name: string; change_pct: number; direction_good: DirectionGood; good: boolean }, vsLabel: string): ChangeWords | null {
  const c = changeWords(m.change_pct, m.direction_good, vsLabel);
  if (!c) return null;
  if (m.direction_good === null || c.arrow === "flat") return { ...c, word: null, tone: "neutral", sentence: `${m.name}: ${c.sentence}` };
  const word = m.good ? "Better" : "Worse";
  const how = c.sentence.replace(/: (better|worse)\.$/, "").replace(/\.$/, "");
  return { ...c, word, tone: m.good ? "good" : "bad", sentence: `${m.name}: ${how}: ${word.toLowerCase()}.` };
}

/** "5 of 6 approved · 1 missing" */
export function topicCountsText(t: Pick<KpiEsgTopic, "approved" | "kpis" | "missing" | "pending">): string {
  const extra = [t.missing ? `${formatNumber(t.missing)} missing` : null, t.pending ? `${formatNumber(t.pending)} pending` : null].filter(Boolean);
  return [`${formatNumber(t.approved)} of ${formatNumber(t.kpis)} approved`, ...extra].join(" · ");
}

/** The topic bar's hover line: "Water · 5 of 6 approved · 1 missing". */
export const topicHover = (t: Pick<KpiEsgTopic, "label" | "approved" | "kpis" | "missing" | "pending">): string => `${t.label} · ${topicCountsText(t)}`;

/** Heat-table step (1–5) for a coverage %, or null when nothing is expected. */
export function heatStep(pct: number | null): 1 | 2 | 3 | 4 | 5 | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  if (pct < 20) return 1;
  if (pct < 40) return 2;
  if (pct < 60) return 3;
  if (pct < 80) return 4;
  return 5;
}

/** The ramp's legend: the five buckets, low to high. */
export const HEAT_LEGEND = ["0–19 %", "20–39 %", "40–59 %", "60–79 %", "80–100 %"] as const;

/** Tailwind classes per heat step (full names so Tailwind keeps them). */
export const HEAT_CLASS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "bg-heat-1 text-on-heat-1",
  2: "bg-heat-2 text-on-heat-2",
  3: "bg-heat-3 text-on-heat-3",
  4: "bg-heat-4 text-on-heat-4",
  5: "bg-heat-5 text-on-heat-5",
};

/** Trends grouped by pillar, in E, S, G order, each pillar's headlines in the server's order. */
/** Every pillar is listed (an empty one gets its own plain empty state), or only the filtered one. */
export function trendsByPillar(trends: KpiEsgTrend[], pillar: KpiPillar | null): { pillar: KpiPillar; label: string; trends: KpiEsgTrend[] }[] {
  return KPI_PILLARS.filter((p) => !pillar || p === pillar).map((p) => ({ pillar: p, label: PILLAR_LABEL[p], trends: trends.filter((t) => t.pillar === p) }));
}

/** "No governance KPIs tracked yet." */
export const noHeadlinesText = (p: KpiPillar) => `No ${PILLAR_LABEL[p].toLowerCase()} KPIs tracked yet.`;

/** Pillars to list in the topic bars: all, or the filtered one. */
export const pillarsShown = (pillars: KpiEsgPillar[], pillar: KpiPillar | null) => pillars.filter((p) => !pillar || p.pillar === pillar);

/** The topic rows the drawer's subtitle reads, one per pillar the topic appears in. */
export const topicRows = (pillars: KpiEsgPillar[], topic: KpiTopic): (KpiEsgTopic & { pillar: KpiPillar })[] =>
  pillars.flatMap((p) => p.topics.filter((t) => t.topic === topic).map((t) => ({ ...t, pillar: p.pillar })));

export type KpiState = "approved" | "pending" | "missing" | "none";

/**
 * A KPI's state in the topic drawer, from the KPI dashboard's answer for the
 * topic and the pending values of the year: missing (a gap), pending (waiting
 * for review), approved (the server has a value), or nothing in yet.
 */
export function kpiState(kpiId: number, card: Pick<KpiDashboardCard, "value"> | undefined, gaps: Pick<KpiGap, "kpi_definition_id" | "pending">[], pendingIds: Set<number>): KpiState {
  const gap = gaps.filter((g) => g.kpi_definition_id === kpiId);
  if (gap.some((g) => !g.pending)) return "missing";
  if (gap.length || pendingIds.has(kpiId)) return "pending";
  if (card && card.value !== null) return "approved";
  return "none";
}

/** Order in the drawer: what needs action first. */
export const STATE_ORDER: Record<KpiState, number> = { missing: 0, pending: 1, none: 2, approved: 3 };

/** "Jan 2026" labels for the x axis: the server's label, else the period. */
export const pointLabel = (p: { label: string; period: string }) => p.label || p.period;

/** The y range for a trend chart: round numbers around the values and the target, from 0 when the values sit near it. */
export function yRange(values: (number | null)[], target: number | null | undefined): { min: number; max: number } | null {
  const known = [...values, target ?? null].filter((v): v is number => v !== null && Number.isFinite(v));
  if (!known.length) return null;
  const lo = Math.min(...known);
  const hi = Math.max(...known);
  const span = hi - lo || Math.abs(hi) || 1;
  const step = 10 ** Math.floor(Math.log10(span / 2));
  const min = Math.floor(lo / step) * step;
  const max = Math.ceil(hi / step) * step;
  const fix = (v: number) => Number(v.toPrecision(12));
  return { min: fix(lo >= 0 && min < 0 ? 0 : min), max: fix(max === min ? max + step : max) };
}

/** "Showing Environment only" or null. */
export const filterNote = (pillar: KpiPillar | null) => (pillar ? `Showing ${PILLAR_LABEL[pillar]} only` : null);

/** Ring arc length for a percent (0–100, kept inside the ring). */
export function ringDash(percent: number, radius: number): { dash: number; circumference: number } {
  const circumference = 2 * Math.PI * radius;
  const p = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  return { dash: (circumference * p) / 100, circumference };
}
