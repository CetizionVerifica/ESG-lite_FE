// IN-2 · ESG ring (05-ux §4 A): shapes the server's EsgRing into a sunburst
// option, its table, its aria sentence and the pillar filter it drives. Every
// figure (coverage, approved, auto share, overall %) is the server's; the
// only arithmetic is the display mapping coverage → opacity.
import type { EChartsOption } from "echarts";
import type { EsgRing, EsgRingTopic, Pillar } from "../../../lib/insights/contracts";
import { entrance } from "../../../lib/insights/motion";
import { PILLAR_LABEL, PILLAR_LETTER } from "../../../lib/kpi/labels";
import { formatNumber } from "../../../ui/format";
import type { ChartTableColumn } from "../../../ui";
import type { ChartTheme } from "../../../theme";
import { esc, pctText } from "./shared";

type RingPillar = EsgRing["pillars"][number];

/** A text marker for topics partly filled from the company's own data (`auto_share > 0`). */
export const AUTO_GLYPH = "⛁";

/** The sunburst node, with what a click needs to know. */
export type RingNode =
  | { kind: "pillar"; id: string; pillar: Pillar; name: string; value: number; children: RingNode[]; itemStyle: Record<string, unknown>; label: Record<string, unknown> }
  | { kind: "topic"; id: string; pillar: Pillar; name: string; value: number; topic: EsgRingTopic; itemStyle: Record<string, unknown>; label: Record<string, unknown> };

/** The pillars on show: the page's `pillar` zooms the ring onto that one (all of them when it isn't in the data). */
export function visiblePillars(data: EsgRing, pillar: Pillar | null): RingPillar[] {
  if (!pillar) return data.pillars;
  const one = data.pillars.filter((p) => p.pillar === pillar);
  return one.length ? one : data.pillars;
}

/** The pillar the ring is zoomed on, or null when it shows all of them. */
export function zoomedPillar(data: EsgRing, pillar: Pillar | null): RingPillar | null {
  return pillar ? (data.pillars.find((p) => p.pillar === pillar) ?? null) : null;
}

/** Display mapping (05-ux §4 A): a topic's fill opacity, 0.25 at no coverage to 1 at full. */
export function topicOpacity(coveragePct: number): number {
  const c = Math.max(0, Math.min(100, Number.isFinite(coveragePct) ? coveragePct : 0));
  return 0.25 + (0.75 * c) / 100;
}

/** "Climate ⛁" for a topic with KPIs filled from data, else the label. */
export const topicLabel = (t: EsgRingTopic) => (t.auto_share > 0 ? `${t.label} ${AUTO_GLYPH}` : t.label);

/** The sunburst data: pillars (inner ring, letter labels) → topics (outer ring, sized by KPI count). */
export function ringNodes(data: EsgRing, pillar: Pillar | null, t: ChartTheme): RingNode[] {
  return visiblePillars(data, pillar).map((p) => ({
    kind: "pillar" as const,
    id: `pillar:${p.pillar}`,
    pillar: p.pillar,
    name: p.label,
    value: p.kpis,
    itemStyle: { color: t.pillars[p.pillar], borderColor: t.ui.panel, borderWidth: 2 },
    label: { formatter: PILLAR_LETTER[p.pillar] },
    children: p.topics.map((topic) => ({
      kind: "topic" as const,
      id: `topic:${p.pillar}:${topic.topic}`,
      pillar: p.pillar,
      name: topic.label,
      value: topic.kpis,
      topic,
      itemStyle: { color: t.pillars[p.pillar], opacity: topicOpacity(topic.coverage_pct), borderColor: t.ui.panel, borderWidth: 1 },
      label: { formatter: topicLabel(topic) },
    })),
  }));
}

/** "Energy · 3 of 4 KPIs approved (75%) · 50% filled from your data" as tooltip HTML. */
export function ringTooltip(node: RingNode | undefined, data: EsgRing): string {
  if (!node) return "";
  if (node.kind === "pillar") {
    const p = data.pillars.find((x) => x.pillar === node.pillar);
    if (!p) return esc(node.name);
    return [
      `<b>${esc(PILLAR_LABEL[p.pillar])} (${PILLAR_LETTER[p.pillar]})</b>`,
      `${pctText(p.coverage_pct)} of KPI values approved`,
      `${formatNumber(p.approved)} of ${formatNumber(p.kpis)} KPIs`,
      `Click to show ${esc(PILLAR_LABEL[p.pillar])} only`,
    ].join("<br/>");
  }
  const tp = node.topic;
  return [
    `<b>${esc(tp.label)}</b> · ${esc(PILLAR_LABEL[node.pillar])}`,
    `${pctText(tp.coverage_pct)} of KPI values approved`,
    `${formatNumber(tp.approved)} of ${formatNumber(tp.kpis)} KPIs`,
    ...(tp.auto_share > 0 ? [`${AUTO_GLYPH} ${pctText(tp.auto_share)} filled from your data`] : []),
  ].join("<br/>");
}

/** The centre text: the overall % (or the zoomed pillar's) and what it means. */
export function centreText(data: EsgRing, pillar: Pillar | null): { value: string; caption: string } {
  const z = zoomedPillar(data, pillar);
  if (z) return { value: pctText(z.coverage_pct), caption: `${PILLAR_LABEL[z.pillar]} · back` };
  return { value: pctText(data.pct), caption: "approved" };
}

/** The sunburst option. `onBack` runs when the centre is clicked while zoomed. */
export function ringOption(data: EsgRing, pillar: Pillar | null, t: ChartTheme, onBack?: () => void): EChartsOption {
  const nodes = ringNodes(data, pillar, t);
  const centre = centreText(data, pillar);
  const zoomed = !!zoomedPillar(data, pillar);
  return {
    ...entrance(2),
    tooltip: { trigger: "item", formatter: (p: unknown) => ringTooltip((p as { data?: RingNode }).data, data) },
    graphic: {
      elements: [
        {
          type: "text",
          id: "ring-centre",
          left: "center",
          top: "middle",
          cursor: zoomed ? "pointer" : "default",
          style: {
            text: `{v|${centre.value}}\n{c|${centre.caption}}`,
            align: "center",
            rich: {
              v: { fontSize: 22, fontWeight: 600, fill: t.ui.ink, align: "center", lineHeight: 26 },
              c: { fontSize: 11, fill: t.ui.muted, align: "center", lineHeight: 14 },
            },
          },
          ...(zoomed && onBack ? { onclick: onBack } : {}),
        },
      ],
    },
    series: [
      {
        type: "sunburst",
        id: "esg-ring",
        nodeClick: "rootToNode",
        // Keep the server's order (pillars E, S, G; topics as sent).
        sort: () => 0,
        radius: ["26%", "92%"],
        data: nodes as never,
        emphasis: { focus: "ancestor" },
        levels: [
          {},
          {
            r0: "26%",
            r: "50%",
            label: { rotate: 0, color: t.ui.ink, fontWeight: 600, fontSize: 13, textBorderColor: t.ui.panel, textBorderWidth: 3 },
          },
          {
            r0: "50%",
            r: "92%",
            label: { rotate: "radial", color: t.ui.ink, fontSize: 11, minAngle: 12, width: 70, overflow: "truncate", textBorderColor: t.ui.panel, textBorderWidth: 2 },
          },
        ],
      },
    ],
  } as EChartsOption;
}

/** One sentence for screen readers. */
export function ringAria(data: EsgRing, pillar: Pillar | null): string {
  const z = zoomedPillar(data, pillar);
  if (z) {
    const topics = z.topics.map((tp) => `${tp.label} ${pctText(tp.coverage_pct)}`).join(", ");
    return `${PILLAR_LABEL[z.pillar]}: ${pctText(z.coverage_pct)} of KPI values approved${topics ? ` (${topics})` : ""}.`;
  }
  const pillars = data.pillars.map((p) => `${p.label} ${pctText(p.coverage_pct)}`).join(", ");
  return `ESG data readiness ${pctText(data.pct)} of KPI values approved${pillars ? `: ${pillars}` : ""}.`;
}

export const RING_COLUMNS: ChartTableColumn[] = [
  { id: "pillar", header: "Pillar" },
  { id: "topic", header: "Topic" },
  { id: "kpis", header: "KPIs", numeric: true },
  { id: "approved", header: "Approved", numeric: true },
  { id: "coverage", header: "Coverage" },
  { id: "auto", header: "From data" },
];

/** Table view: one row per topic of the pillars on show. */
export function ringTable(data: EsgRing, pillar: Pillar | null): { columns: ChartTableColumn[]; rows: Array<Record<string, string | number | null>> } {
  const rows = visiblePillars(data, pillar).flatMap((p) =>
    p.topics.map((tp) => ({
      pillar: `${PILLAR_LETTER[p.pillar]} · ${PILLAR_LABEL[p.pillar]}`,
      topic: tp.label,
      kpis: tp.kpis,
      approved: tp.approved,
      coverage: pctText(tp.coverage_pct),
      auto: tp.auto_share > 0 ? pctText(tp.auto_share) : "—",
    })),
  );
  return { columns: RING_COLUMNS, rows };
}

/**
 * The page `pillar` after a click on the ring: a pillar toggles (clicking the
 * zoomed pillar, which sits in the centre, goes back to all); a topic zooms
 * onto its pillar. `undefined` = leave the filter as it is.
 */
export function pillarAfterClick(node: Pick<RingNode, "kind" | "pillar"> | undefined, current: Pillar | null): Pillar | null | undefined {
  if (!node) return undefined;
  if (node.kind === "pillar") return node.pillar === current ? null : node.pillar;
  return node.pillar === current ? undefined : node.pillar;
}
