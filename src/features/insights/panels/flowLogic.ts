// IN-6 · Data-to-disclosure flow (05-ux §4 E, decision I9): shapes the
// server's `Flow` into an ECharts sankey, its table rows, its one-sentence
// summary and its drill-down targets. No figure is computed here: tonnes and
// counts are the server's; the only number made up is the drawn width of a
// count link (see `countWidth`), which never reaches a tooltip or the table.
import type { EChartsOption } from "echarts";
import type { Flow } from "../../../lib/insights/contracts";
import { entrance } from "../../../lib/insights/motion";
import { FIT_LABEL } from "../../../lib/kpi/labels";
import type { ChartTheme } from "../../../theme";
import { emissionsParts, formatEmissions, formatNumber } from "../../../ui/format";

export type FlowNode = Flow["nodes"][number];
export type FlowLink = Flow["links"][number];
export type Fit = NonNullable<FlowLink["fit"]>;
export type FlowTheme = Pick<ChartTheme, "color" | "scopes" | "pillars" | "ui">;

export const FITS: Fit[] = ["exact", "partial", "derived"];

/**
 * ECharts sankey links can't be dashed, so a count link's fit is drawn by
 * opacity (solid → faint) and always said in words in the tooltip, the
 * legend and the table (05-ux §2.3: colour never alone).
 */
export const FIT_OPACITY: Record<Fit, number> = { exact: 0.55, partial: 0.32, derived: 0.16 };
/** tCO₂e links: source → target colour gradient at this opacity. */
export const TONNES_OPACITY = 0.45;

/** The legend's words for the count links (I9). */
export const COUNT_LEGEND_TITLE = "Count of disclosures each KPI feeds";

/** KPI tracking on: the server sends a disclosure column (3) and count links. Off: sites → scopes → top categories. */
export const hasDisclosures = (flow: Flow): boolean => flow.nodes.some((n) => n.column === 3) || flow.links.some((l) => l.measure === "count");

const byColumn = (flow: Flow, column: number) => flow.nodes.filter((n) => n.column === column);

/** `disc:<framework>:<code>` → the framework, else null. */
export function disclosureFramework(id: string): string | null {
  const m = /^disc:([^:]+):/.exec(id);
  return m ? m[1] : null;
}

/** The fixed route for a disclosure without a server link (05-ux §4 E). */
export function disclosureRoute(id: string): string | null {
  const fw = disclosureFramework(id);
  return fw ? `/kpi/reports/${encodeURIComponent(fw)}` : null;
}

/** What a node is, in words (column 2 holds categories when KPI tracking is off). */
export function kindWord(node: FlowNode, kpiOn: boolean): string {
  if (node.kind === "site") return "Site";
  if (node.kind === "scope") return "Scope";
  if (node.kind === "disclosure") return "Disclosure";
  if (node.kind === "category") return "Category";
  return kpiOn ? "KPI" : "Category";
}

/** Node colour by kind: sites the series palette, scopes their scope token, KPIs and categories pillar E, disclosures muted. */
export function nodeColor(node: FlowNode, siteIndex: number, t: FlowTheme): string {
  if (node.kind === "site") return t.color[siteIndex % t.color.length] ?? t.ui.brand;
  if (node.kind === "scope") {
    const n = /^scope:(\d)$/.exec(node.id)?.[1];
    return n === "1" ? t.scopes.s1 : n === "2" ? t.scopes.s2 : n === "3" ? t.scopes.s3 : t.ui.brand;
  }
  if (node.kind === "kpi" || node.kind === "category") return t.pillars.environment;
  return t.ui.muted;
}

/**
 * Drawn width of one count link. The server sends value 1 per mapping (I9);
 * at the tonnes' scale that is invisible, so a mapping is drawn as a fixed
 * slice of the widest tonnes link: the busiest KPI's disclosures together are
 * never wider than that link. Drawing only: tooltips and the table show the
 * server's count.
 */
export function countWidth(flow: Flow): number {
  const tonnes = flow.links.filter((l) => l.measure === "tCO2e").map((l) => l.value);
  const widest = tonnes.length ? Math.max(...tonnes) : 0;
  if (widest <= 0) return 1;
  const out = new Map<string, number>();
  for (const l of flow.links) if (l.measure === "count") out.set(l.source, (out.get(l.source) ?? 0) + 1);
  const busiest = Math.max(4, ...out.values());
  return widest / busiest;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

const plural = (n: number, one: string, many = `${one}s`) => `${formatNumber(n, 0)} ${n === 1 ? one : many}`;

/** "feeds 1 disclosure" / "feeds 2 disclosures" (the server's count). */
export const feedsText = (count: number) => `feeds ${plural(count, "disclosure")}`;

/** Tooltip lines for a link: tonnes formatted, or the count and its fit in words. */
export function linkTooltip(link: FlowLink, labels: Map<string, string>): string {
  const head = `${esc(labels.get(link.source) ?? link.source)} → ${esc(labels.get(link.target) ?? link.target)}`;
  if (link.measure === "tCO2e") return `${head}<br/>${formatEmissions(link.value)}`;
  const fit = link.fit ? ` · ${FIT_LABEL[link.fit]} fit` : "";
  return `${head}<br/>${feedsText(link.value)}${fit}`;
}

/** Tooltip lines for a node: its name and what it is; a disclosure shows its framework with its code. */
export function nodeTooltip(node: FlowNode, kpiOn: boolean): string {
  const fw = node.kind === "disclosure" ? disclosureFramework(node.id) : null;
  return `${esc(node.label)}<br/>${kindWord(node, kpiOn)}${fw ? ` · ${esc(fw)}` : ""}`;
}

interface SankeyNodeDatum {
  name: string;
  display: string;
  depth: number;
  itemStyle: { color: string };
}

interface SankeyLinkDatum {
  source: string;
  target: string;
  value: number;
  /** The server's value (tonnes or count), for the tooltip. */
  raw: number;
  measure: FlowLink["measure"];
  fit?: Fit;
  lineStyle: { color: string; opacity: number };
}

/** The sankey's nodes: `name` is the stable server id, `display` the plain label, `depth` the column. */
export function flowNodes(flow: Flow, t: FlowTheme): SankeyNodeDatum[] {
  let site = 0;
  return flow.nodes.map((n) => ({
    name: n.id,
    display: n.label,
    depth: n.column,
    itemStyle: { color: nodeColor(n, n.kind === "site" ? site++ : 0, t) },
  }));
}

/** The sankey's links: tonnes with a gradient, counts muted with opacity by fit. */
export function flowLinks(flow: Flow, t: FlowTheme): SankeyLinkDatum[] {
  const width = countWidth(flow);
  return flow.links.map((l) =>
    l.measure === "tCO2e"
      ? { source: l.source, target: l.target, value: l.value, raw: l.value, measure: l.measure, lineStyle: { color: "gradient", opacity: TONNES_OPACITY } }
      : { source: l.source, target: l.target, value: width, raw: l.value, measure: l.measure, fit: l.fit, lineStyle: { color: t.ui.muted, opacity: FIT_OPACITY[l.fit ?? "exact"] } },
  );
}

type TooltipParams = { dataType?: string; data?: Partial<SankeyLinkDatum & SankeyNodeDatum> };

/** The full ECharts option for a theme. */
export function flowOption(flow: Flow, t: FlowTheme): EChartsOption {
  const kpiOn = hasDisclosures(flow);
  const labels = new Map(flow.nodes.map((n) => [n.id, n.label]));
  const nodes = new Map(flow.nodes.map((n) => [n.id, n]));
  const formatter = (p: unknown): string => {
    const { dataType, data } = p as TooltipParams;
    if (dataType === "edge" && data?.source && data.target && data.measure) {
      return linkTooltip({ source: data.source, target: data.target, value: data.raw ?? 0, measure: data.measure, fit: data.fit }, labels);
    }
    const node = data?.name ? nodes.get(data.name) : undefined;
    return node ? nodeTooltip(node, kpiOn) : "";
  };
  return {
    ...entrance(1),
    tooltip: { trigger: "item", confine: true, formatter },
    series: [
      {
        type: "sankey",
        left: 8,
        right: 132,
        top: 12,
        bottom: 12,
        nodeAlign: "left",
        nodeWidth: 14,
        nodeGap: 12,
        draggable: false,
        emphasis: { focus: "adjacency" },
        label: { color: t.ui.ink, formatter: (p: unknown) => (p as { data?: { display?: string } }).data?.display ?? "" },
        data: flowNodes(flow, t),
        links: flowLinks(flow, t),
      },
    ],
  } as EChartsOption;
}

/** Chart height: about 420 px, taller when a column holds many nodes. */
export function flowHeight(flow: Flow): number {
  const most = Math.max(0, ...[0, 1, 2, 3].map((c) => byColumn(flow, c).length));
  return Math.max(420, most * 36 + 60);
}

export const MEASURE_WORD: Record<FlowLink["measure"], string> = { tCO2e: "tCO₂e", count: "Count" };

/** The table view (and 390 px default): one row per link, in the server's order. */
export function flowTable(flow: Flow) {
  const kpiOn = hasDisclosures(flow);
  const labels = new Map(flow.nodes.map((n) => [n.id, n.label]));
  const columns = [
    { id: "source", header: "From" },
    { id: "target", header: "To" },
    { id: "value", header: "Value", numeric: true },
    { id: "measure", header: "Measure" },
    ...(kpiOn ? [{ id: "fit", header: "Fit" }] : []),
  ];
  const rows = flow.links.map((l) => ({
    source: labels.get(l.source) ?? l.source,
    target: labels.get(l.target) ?? l.target,
    value: l.measure === "tCO2e" ? emissionsParts(l.value).value : formatNumber(l.value, 0),
    measure: MEASURE_WORD[l.measure],
    ...(kpiOn ? { fit: l.fit ? FIT_LABEL[l.fit] : null } : {}),
  }));
  return { columns, rows };
}

const list = (items: string[]) => (items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

/** "Scope 1, 2 and 3" when every label is "Scope n", else the labels listed. */
function scopePhrase(scopes: FlowNode[]): string {
  const nums = scopes.map((s) => /^Scope (\d)$/.exec(s.label)?.[1]);
  if (nums.length && nums.every(Boolean)) return `Scope ${list(nums as string[])}`;
  return list(scopes.map((s) => s.label));
}

/** One sentence for screen readers, e.g. "3 sites feed Scope 1, 2 and 3; 3 KPIs feed 3 disclosures." */
export function flowAria(flow: Flow): string {
  const sites = byColumn(flow, 0).length;
  const scopes = byColumn(flow, 1);
  const third = byColumn(flow, 2).length;
  const head = `${plural(sites, "site")} ${sites === 1 ? "feeds" : "feed"} ${scopePhrase(scopes) || "no scope"}`;
  if (!hasDisclosures(flow)) return `${head}; the scopes split into ${plural(third, "category", "categories")}.`;
  const discs = byColumn(flow, 3).length;
  return `${head}; ${plural(third, "KPI")} ${third === 1 ? "feeds" : "feed"} ${plural(discs, "disclosure")}.`;
}

/** Where a click goes: the server's link for the node (or `source->target` for a link, then its target), else the fixed disclosure route, else nowhere. */
export function flowTarget(hit: unknown, links: Record<string, string>): string | null {
  const { dataType, data } = (hit ?? {}) as TooltipParams;
  if (!data) return null;
  if (dataType === "edge") {
    if (!data.source || !data.target) return null;
    return links[`${data.source}->${data.target}`] ?? links[data.target] ?? disclosureRoute(data.target);
  }
  if (!data.name) return null;
  return links[data.name] ?? disclosureRoute(data.name);
}
