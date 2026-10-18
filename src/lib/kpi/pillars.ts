/**
 * D19 (wave E) · ESG pillars: which pillar a KPI or topic sits in, and the
 * grouping every KPI screen uses (pillar first, then topic). Pure.
 */
import { KPI_PILLARS, KPI_TOPICS, type KpiPillar, type KpiTopic, TOPIC_PILLAR } from "./contracts";
import { PILLAR_LABEL, TOPIC_LABEL } from "./labels";

export const isPillar = (v: unknown): v is KpiPillar => (KPI_PILLARS as readonly unknown[]).includes(v);

/** `?pillar=` read safely: a full name or a letter (`e`, `S`); anything else is no filter. */
export function pillarParam(v: string | null | undefined): KpiPillar | null {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (isPillar(s)) return s;
  return KPI_PILLARS.find((p) => p[0] === s) ?? null;
}

/** The KPI's own pillar, else its topic's (an older server sends no `pillar`). */
export function pillarOf(row: { topic: KpiTopic; pillar?: KpiPillar | string | null }): KpiPillar {
  return isPillar(row.pillar) ? row.pillar : (TOPIC_PILLAR[row.topic] ?? "governance");
}

/** True when a KPI's pillar was set apart from its topic's (a Superadmin's override). */
export const differsFromTopicPillar = (row: { topic: KpiTopic; pillar?: KpiPillar | string | null }): boolean => pillarOf(row) !== TOPIC_PILLAR[row.topic];

/** "Differs from its topic (Diversity → Social)". */
export const topicPillarNote = (topic: KpiTopic): string => `Differs from its topic (${TOPIC_LABEL[topic]} → ${PILLAR_LABEL[TOPIC_PILLAR[topic]]})`;

export interface PillarGroup<T> {
  pillar: KpiPillar;
  label: string;
  items: T[];
}

/** Items under their pillar in E, S, G order; empty pillars are left out unless `keepEmpty`. Order inside a pillar is kept. */
export function groupByPillar<T>(items: T[], pillar: (item: T) => KpiPillar, keepEmpty = false): PillarGroup<T>[] {
  return KPI_PILLARS.map((p) => ({ pillar: p, label: PILLAR_LABEL[p], items: items.filter((i) => pillar(i) === p) })).filter((g) => keepEmpty || g.items.length > 0);
}

/** Topics under their default pillar, in `KPI_TOPICS` order (step 4 rows, library headings). */
export function topicsByPillar(topics: KpiTopic[]): PillarGroup<KpiTopic>[] {
  const ordered = KPI_TOPICS.filter((t) => topics.includes(t));
  return groupByPillar(ordered, (t) => TOPIC_PILLAR[t]);
}

/** Pillar rank, for sorting E before S before G. */
export const pillarRank = (p: KpiPillar): number => KPI_PILLARS.indexOf(p);
