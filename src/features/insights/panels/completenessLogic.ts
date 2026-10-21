// IN-4 · Completeness (05-ux §4 G): heatmap and table shaping only. `pct`,
// expected and approved counts are the server's; a cell with `pct: null`
// (future month, nothing expected) is left blank, never drawn as 0.
import type { EChartsOption } from "echarts";
import type { ChartTableColumn } from "../../../ui";
import { formatNumber, formatPercent } from "../../../ui/format";
import type { Completeness, CompletenessCell } from "../../../lib/insights/contracts";
import { monthLabel } from "../../../lib/insights/labels";
import { entrance } from "../../../lib/insights/motion";
import type { ChartTheme } from "../../../theme";

/** The heat ramp's five steps (low → high completeness), with their legend words. */
export const HEAT_STEPS = [
  { min: 0, max: 49.999, label: "Below 50%" },
  { min: 50, max: 74.999, label: "50–74%" },
  { min: 75, max: 89.999, label: "75–89%" },
  { min: 90, max: 99.999, label: "90–99%" },
  { min: 100, max: Infinity, label: "100%" },
] as const;

/** Tailwind classes for each step (legend and drawer chips). */
export const HEAT_CLASS = ["bg-heat-1 text-on-heat-1", "bg-heat-2 text-on-heat-2", "bg-heat-3 text-on-heat-3", "bg-heat-4 text-on-heat-4", "bg-heat-5 text-on-heat-5"] as const;

/** The ramp step (0–4) for a server percentage; null for a blank cell. */
export function heatStep(pct: number | null): number | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  const i = HEAT_STEPS.findIndex((s) => pct <= s.max);
  return i < 0 ? HEAT_STEPS.length - 1 : i;
}

/** "Jan" from "2026-01" (axis labels); the year is in the panel's subtitle. */
export const shortMonth = (ym: string) => monthLabel(ym).split(" ")[0];

/** What a heatmap data item carries back on click. */
export interface CellRef {
  row: number;
  col: number;
}

export function completenessOption(data: Completeness, t: ChartTheme): EChartsOption {
  // y runs top to bottom in the server's site order.
  const sites = data.rows.map((r) => r.site);
  const cells = data.rows.flatMap((r, row) =>
    r.cells.flatMap((c) => {
      const col = data.months.indexOf(c.month);
      const step = heatStep(c.pct);
      if (col < 0 || step === null) return []; // blank, not 0
      return [
        {
          value: [col, row, c.pct],
          row,
          col,
          itemStyle: { color: t.heat[step] },
          label: { color: t.onHeat[step] },
        },
      ];
    }),
  );
  return {
    ...entrance(1),
    grid: { left: 8, right: 8, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      trigger: "item",
      formatter: (p: unknown) => {
        const d = (p as { data?: { row: number; col: number } }).data;
        const cell = d ? data.rows[d.row]?.cells.find((c) => c.month === data.months[d.col]) : undefined;
        if (!d || !cell) return "";
        return `${data.rows[d.row].site} · ${monthLabel(cell.month)}<br/>${formatPercent(cell.pct, 0)} complete<br/>${cellWords(cell).emissions}`;
      },
    },
    xAxis: { type: "category", data: data.months.map(shortMonth), splitArea: { show: false }, axisTick: { show: false }, axisLine: { show: false } },
    yAxis: { type: "category", data: sites, inverse: true, axisTick: { show: false }, axisLine: { show: false } },
    series: [
      {
        id: "completeness",
        name: "Completeness",
        type: "heatmap",
        data: cells,
        label: { show: true, fontSize: 11, formatter: (p: unknown) => formatNumber(((p as { value: number[] }).value[2] as number) ?? null, 0) },
        itemStyle: { borderColor: t.ui.panel, borderWidth: 2, borderRadius: 3 },
        emphasis: { itemStyle: { borderColor: t.ui.ink, borderWidth: 2 } },
        cursor: "pointer",
      },
    ],
  } as EChartsOption;
}

/** A cell's server counts in words: "19 of 25 emission entries approved". */
export function cellWords(c: CompletenessCell): { emissions: string; kpi: string | null } {
  return {
    emissions: c.emissions_expected ? `${formatNumber(c.emissions_approved)} of ${formatNumber(c.emissions_expected)} emission entries approved` : "No emission entries expected",
    kpi: c.kpi_expected ? `${formatNumber(c.kpi_approved)} of ${formatNumber(c.kpi_expected)} KPI values approved` : null,
  };
}

export const COMPLETENESS_COLUMNS: ChartTableColumn[] = [
  { id: "site", header: "Site" },
  { id: "month", header: "Month" },
  { id: "pct", header: "Complete" },
  { id: "emissions", header: "Emission entries approved" },
  { id: "kpi", header: "KPI values approved" },
];

export interface CompletenessRow {
  site: string;
  month: string;
  pct: string | null;
  emissions: string | null;
  kpi: string | null;
  cell: CellRef;
}

/** Table rows: one per site and month, in the server's order. Blank months read "Not due". */
export function completenessRows(data: Completeness): CompletenessRow[] {
  return data.rows.flatMap((r, row) =>
    r.cells.map((c) => ({
      site: r.site,
      month: monthLabel(c.month),
      pct: c.pct === null ? "Not due" : formatPercent(c.pct, 0),
      emissions: c.emissions_expected ? `${formatNumber(c.emissions_approved)} of ${formatNumber(c.emissions_expected)}` : null,
      kpi: c.kpi_expected ? `${formatNumber(c.kpi_approved)} of ${formatNumber(c.kpi_expected)}` : null,
      cell: { row, col: data.months.indexOf(c.month) },
    })),
  );
}

/** The cell a click (or a table button) names. */
export function cellAt(data: Completeness, ref: CellRef): { site: string; site_id: number; cell: CompletenessCell } | null {
  const r = data.rows[ref.row];
  const cell = r?.cells.find((c) => c.month === data.months[ref.col]);
  return r && cell ? { site: r.site, site_id: r.site_id, cell } : null;
}

/** One sentence for screen readers. */
export function completenessAria(data: Completeness): string {
  const due = data.rows.flatMap((r) => r.cells).filter((c) => c.pct !== null);
  const below = data.rows.flatMap((r) => r.cells.filter((c) => c.pct !== null && (c.pct as number) < 100).map((c) => `${r.site} ${monthLabel(c.month)}`));
  if (!due.length) return `Data completeness for ${data.rows.length} sites: no months are due yet.`;
  const first = data.months[0];
  const last = data.months[data.months.length - 1];
  return `Data completeness for ${data.rows.length} site${data.rows.length === 1 ? "" : "s"} by month, ${monthLabel(first)} to ${monthLabel(last)}: ${
    below.length ? `${below.length} site-month${below.length === 1 ? " is" : "s are"} not complete yet` : "every month that is due is complete"
  }.`;
}
