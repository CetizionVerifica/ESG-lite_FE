// "By scope and site" (05-ux §3, without KPI tracking): the flow panel's
// site → scope links (tCO₂e, server values) as a treemap and a table. Shapes
// options and rows only; ECharts sizes each site box from its scope leaves.
import type { EChartsOption } from "echarts";
import type { Flow } from "../../../lib/insights/contracts";
import type { ChartTheme } from "../../../theme";
import { esc } from "./shared";
import { formatEmissions } from "../../../ui/format";

export interface SiteScopeRow {
  site: string;
  scope: string;
  scopeKey: "s1" | "s2" | "s3" | null;
  value: number;
}

/** One row per site → scope link carrying tonnes, in the server's order. */
export function scopeSiteRows(flow: Flow): SiteScopeRow[] {
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  return flow.links
    .filter((l) => l.measure === "tCO2e" && byId.get(l.source)?.kind === "site" && byId.get(l.target)?.kind === "scope")
    .map((l) => {
      const scope = byId.get(l.target)!;
      const n = /^scope:(\d)$/.exec(scope.id)?.[1];
      return { site: byId.get(l.source)!.label, scope: scope.label, scopeKey: n === "1" || n === "2" || n === "3" ? (`s${n}` as const) : null, value: l.value };
    });
}

export function scopeSiteOption(rows: SiteScopeRow[], t: ChartTheme, motion: object = {}): EChartsOption {
  const sites = [...new Set(rows.map((r) => r.site))];
  return {
    ...motion,
    tooltip: {
      confine: true,
      formatter: (p: unknown) => {
        const d = p as { name: string; value: number; treePathInfo?: { name: string }[] };
        const path = (d.treePathInfo ?? []).map((x) => x.name).filter(Boolean);
        return `${esc(path.join(" · ") || d.name)}<br/>${formatEmissions(d.value)}`;
      },
    },
    series: [
      {
        type: "treemap",
        id: "scope-site",
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        width: "100%",
        height: "100%",
        top: 0,
        left: 0,
        upperLabel: { show: true, height: 20, color: t.ui.ink, fontWeight: 600 },
        label: { show: true, color: t.ui.ink, textBorderColor: t.ui.panel, textBorderWidth: 2, formatter: (p: unknown) => (p as { name: string }).name },
        levels: [{ itemStyle: { borderColor: t.ui.panel, borderWidth: 2, gapWidth: 2 } }, { itemStyle: { borderColor: t.ui.panel, borderWidth: 1, gapWidth: 1 }, upperLabel: { show: true } }, {}],
        data: sites.map((site) => ({
          name: site,
          itemStyle: { color: t.ui.tint },
          children: rows
            .filter((r) => r.site === site)
            .map((r) => ({ name: r.scope, value: r.value, itemStyle: { color: r.scopeKey ? t.scopes[r.scopeKey] : t.ui.muted } })),
        })),
      },
    ],
  };
}

export const SCOPE_SITE_COLUMNS = [
  { id: "site", header: "Site" },
  { id: "scope", header: "Scope" },
  { id: "value", header: "tCO₂e", numeric: true, decimals: 0 },
];

export const scopeSiteTable = (rows: SiteScopeRow[]) => ({ columns: SCOPE_SITE_COLUMNS, rows: rows.map((r) => ({ site: r.site, scope: r.scope, value: r.value })) });

/** "Emissions by site and scope for 3 sites; the largest box is Nagpur plant · Scope 1 (8,020 tCO₂e)." */
export function scopeSiteAria(rows: SiteScopeRow[]): string {
  if (rows.length === 0) return "No approved emissions by site and scope yet.";
  const sites = new Set(rows.map((r) => r.site)).size;
  const top = rows.reduce((a, b) => (b.value > a.value ? b : a));
  return `Emissions by site and scope for ${sites} ${sites === 1 ? "site" : "sites"}; the largest box is ${top.site} · ${top.scope} (${formatEmissions(top.value)}).`;
}
