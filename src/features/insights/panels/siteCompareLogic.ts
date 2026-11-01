// IN-11 · Sites tab: shapes the server's SiteCompare into a stacked bar option
// (Scope 1, 2 and 3 per site, the fixed scope colours), its table and an aria
// sentence. Format only: every figure (net, change, share, intensity,
// completeness, pending) is the server's.
import type { EChartsOption } from "echarts";
import type { SiteCompare, SiteCompareRow } from "../../../lib/insights/contracts";
import { changeText, unitText } from "../../../lib/insights/labels";
import { entrance, stagger } from "../../../lib/insights/motion";
import { formatEmissions, formatNumber, formatTonnes } from "../../../ui/format";
import type { ChartTableColumn } from "../../../ui";
import type { ChartTheme } from "../../../theme";
import { SCOPE_LABEL } from "./pathwayLogic";
import { esc, pctText } from "./shared";

const SCOPES = ["s1", "s2", "s3"] as const;
type Scope = (typeof SCOPES)[number];
const scopeValue = (r: SiteCompareRow, s: Scope) => (s === "s1" ? r.scope_1 : s === "s2" ? r.scope_2 : r.scope_3);

/** "0.42 tCO₂e/t", or null when the site has no approved production. */
export function intensityText(r: SiteCompareRow): string | null {
  return r.intensity.value === null || !r.intensity.unit ? null : `${formatNumber(r.intensity.value, r.intensity.value < 1 ? 3 : 2)} ${unitText(r.intensity.unit)}`;
}

/** Tooltip HTML for one site: its scopes and net, as the server sent them. */
export function siteTooltip(r: SiteCompareRow | undefined): string {
  if (!r) return "";
  return [`<b>${esc(r.site)}</b>`, ...SCOPES.map((s) => `${SCOPE_LABEL[s]}: ${formatEmissions(scopeValue(r, s))}`), `Net: ${formatEmissions(r.net)}`].join("<br/>");
}

/** Horizontal bars, one per site (largest net on top), stacked Scope 1 → 2 → 3. */
export function siteCompareOption(data: SiteCompare, t: ChartTheme): EChartsOption {
  // A category axis draws its first entry at the bottom: reverse, so the largest site reads first.
  const rows = [...data.rows].reverse();
  return {
    ...entrance(SCOPES.length),
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (p: unknown) => siteTooltip(rows[(p as Array<{ dataIndex: number }>)[0]?.dataIndex ?? -1]),
    },
    grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: "value", axisLabel: { color: t.ui.muted, formatter: (v: number) => formatNumber(v) }, splitLine: { lineStyle: { color: t.ui.line } } },
    yAxis: { type: "category", data: rows.map((r) => r.site), axisLabel: { color: t.ui.ink, fontSize: 11, width: 140, overflow: "truncate" }, axisTick: { show: false } },
    series: SCOPES.map((s, i) => ({
      type: "bar" as const,
      id: `site-${s}`,
      name: SCOPE_LABEL[s],
      stack: "scopes",
      ...stagger(i),
      barMaxWidth: 22,
      itemStyle: { color: t.scopes[s] },
      data: rows.map((r) => scopeValue(r, s)),
    })),
  } as EChartsOption;
}

export const SITE_COLUMNS: ChartTableColumn[] = [
  { id: "site", header: "Site" },
  { id: "net", header: "Net tCO₂e", numeric: true },
  { id: "change", header: "vs last year" },
  { id: "share", header: "Share" },
  { id: "s1", header: "Scope 1", numeric: true },
  { id: "s2", header: "Scope 2", numeric: true },
  { id: "s3", header: "Scope 3", numeric: true },
  { id: "intensity", header: "Intensity" },
  { id: "completeness", header: "Complete" },
  { id: "pending", header: "Pending", numeric: true },
];

/** Table view: one row per site, in the server's order. `vs` names the year compared with ("2025"). */
export function siteTable(data: SiteCompare, vs: string): Array<Record<string, string | number> & { link: string }> {
  return data.rows.map((r) => ({
    site: r.site,
    link: r.link,
    net: formatTonnes(r.net),
    change: changeText(r.change_pct, r.good, vs)?.words ?? "—",
    share: pctText(r.share_pct),
    s1: formatTonnes(r.scope_1),
    s2: formatTonnes(r.scope_2),
    s3: formatTonnes(r.scope_3),
    intensity: intensityText(r) ?? "No production data",
    completeness: pctText(r.completeness_pct),
    pending: r.pending,
  }));
}

/** One sentence for screen readers: "Chennai plant is the largest of 3 sites at 61% of net emissions, down 14.8% on 2025." */
export function siteAria(data: SiteCompare, vs: string): string {
  const top = data.rows[0];
  if (!top) return "No sites to show.";
  const change = changeText(top.change_pct, top.good, vs);
  const count = data.rows.length === 1 ? "the only site" : `the largest of ${data.rows.length} sites`;
  return `${top.site} is ${count} at ${pctText(top.share_pct)} of net emissions${change ? `, ${change.words}` : ""}.`;
}
