// DS-8 · pure chart edits and helpers (no React). Kind rules come from the
// renderer mirror (render/charts/ghg/kinds.ts), so the drawer, the kind
// picker and the server's checks read the same table. Doc edits go through
// docOps; nothing here formats or adds up a reported figure.
import type { Binding, ChartKind, CustomData, Element, GhgBinding, KpiBinding, ReportDoc } from "../../../../lib/studio/contracts";
import { findElement, updateProps } from "../../../../lib/studio/docOps";
import { CHART_KIND_LABELS, CUSTOM_MAX_COLS, CUSTOM_MAX_ROWS, GHG_CHART_KINDS, chartKindValidity, defaultGhgChart, reservedLabel, validChartKinds, type ChartBindingLike, type GhgChartKind } from "../../../../lib/studio/render";

export type ChartOptions = Extract<Element, { type: "chart" }>["props"]["options"];
export type FigureBinding = GhgBinding | KpiBinding;

export const kindLabel = (k: string): string => CHART_KIND_LABELS[k] ?? k.replace(/_/g, " ");
export const isGhgKind = (k: string): k is GhgChartKind => (GHG_CHART_KINDS as readonly string[]).includes(k);
const like = (b: Binding | undefined): ChartBindingLike | null => (b ? (b as unknown as ChartBindingLike) : null);

/** Kinds that can draw this binding (GHG kinds first). */
export const kindsFor = (b: Binding | undefined): ChartKind[] => validChartKinds(like(b)) as ChartKind[];
export const kindCheck = (k: string, b: Binding | undefined) => chartKindValidity(k, like(b));

/** Default frames (mm) of the data elements a drawer adds. */
export const FRAMES = { chart: { w: 90, h: 60 }, table: { w: 90, h: 45 }, big_number: { w: 70, h: 28 }, kpi_tile: { w: 56, h: 32 } } as const;
const frame = (k: keyof typeof FRAMES) => ({ x: 0, y: 0, ...FRAMES[k], rotation: 0 });

export function chartTemplate(kind: ChartKind, binding: Binding, extra: { title?: string; options?: ChartOptions } = {}): Element {
  return { id: "chart", type: "chart", frame: frame("chart"), z: 0, source: "user", props: { binding, kind, options: extra.options ?? {}, ...(extra.title ? { title: extra.title } : {}) } };
}

/** The chart a GHG kind starts with in the Charts drawer (e.g. category_bars → Scope 3, this year, top 8). */
export function ghgChartFor(kind: GhgChartKind, doc: Pick<ReportDoc, "meta">, baseYear?: number | null): Element {
  const d = defaultGhgChart(kind, { year: doc.meta.year, baseYear });
  return chartTemplate(kind, d.binding as GhgBinding, { title: d.title, options: d.options as ChartOptions });
}

/** RS kinds from the drawer: GHG docs chart emissions; sustainability docs chart the first KPI given. */
export function rsChartFor(kind: "bar" | "line" | "stacked_bar" | "donut", doc: Pick<ReportDoc, "kind">, kpi?: KpiBinding | null): Element | null {
  if (doc.kind === "ghg") {
    const split = kind === "stacked_bar" || kind === "donut";
    const b: GhgBinding = split ? { source: "ghg", metric: "total", breakdown: "scope", years: { last: kind === "donut" ? 1 : 3 }, sites: "all" } : { source: "ghg", metric: "total", years: { last: 5 }, sites: "all" };
    return chartTemplate(kind, b, { title: split ? "Emissions by scope" : "Total emissions", options: { greyPrior: true } });
  }
  if (!kpi) return null;
  const b: KpiBinding = { ...kpi, years: { last: kind === "donut" ? 1 : 3 } };
  return kindCheck(kind, b).ok ? chartTemplate(kind, b, { options: { greyPrior: true } }) : null;
}

/** A typed-data chart: a two-column starter table, always shown as unlinked. */
export const customChart = (): Element =>
  chartTemplate("bar", { source: "custom", columns: ["Item", "Value"], rows: [["First", 10], ["Second", 20], ["Third", 15]] }, { title: "Typed data", options: { horizontal: true } });

/** Data elements a dropped figure can become (05-ux: "Big number · Tile · Chart"). */
export type DropChoice = "big_number" | "kpi_tile" | "chart";

export function elementForFigure(choice: DropChoice, b: FigureBinding, label: string): Element {
  if (choice === "big_number") return { id: "data", type: "big_number", frame: frame("big_number"), z: 0, source: "user", props: { binding: b, label, showDelta: true } };
  if (choice === "kpi_tile") return { id: "data", type: "kpi_tile", frame: frame("kpi_tile"), z: 0, source: "user", props: { binding: b, label, showDelta: true, showSparkline: false, variant: "card" } };
  const kinds = kindsFor(b);
  if (kinds.length) return chartTemplate(kinds[0], b, { title: label, options: { greyPrior: true } });
  // A single value: chart it over five years.
  const over = { ...b, years: { last: 5 } } as FigureBinding;
  return chartTemplate("bar", over, { title: label, options: { greyPrior: true } });
}

/** Chart choice is possible for any figure (a single value becomes a five-year bar). */
export const BOUND_TYPES = new Set(["chart", "table", "big_number", "kpi_tile", "progress"]);

/**
 * Replace the binding of a data element (drop on a chart, or a row clicked
 * while the Data drawer edits it). A chart keeps its kind when the kind can
 * draw the new data, else takes the first kind that can.
 */
export function rebind(doc: ReportDoc, pageId: string, id: string, b: Binding): ReportDoc {
  const el = findElement(doc, pageId, id);
  if (!el) return doc;
  switch (el.type) {
    case "chart": {
      const kinds = kindsFor(b);
      const kind = kindCheck(el.props.kind, b).ok ? el.props.kind : (kinds[0] ?? el.props.kind);
      return updateProps(doc, pageId, [id], "chart", { binding: b, kind });
    }
    case "table":
      return updateProps(doc, pageId, [id], "table", { binding: b, columns: undefined, merges: undefined });
    case "big_number":
    case "kpi_tile":
    case "progress":
      if (b.source === "custom") return doc;
      return updateProps(doc, pageId, [id], el.type, { binding: b } as never);
    default:
      return doc;
  }
}

export const setKind = (doc: ReportDoc, pageId: string, ids: string[], kind: ChartKind): ReportDoc => updateProps(doc, pageId, ids, "chart", { kind });

export function setOptions(doc: ReportDoc, pageId: string, id: string, patch: Partial<ChartOptions>): ReportDoc {
  const el = findElement(doc, pageId, id);
  if (!el || el.type !== "chart") return doc;
  const options = { ...el.props.options, ...patch };
  for (const k of Object.keys(options) as (keyof ChartOptions)[]) if (options[k] === undefined) delete options[k];
  return updateProps(doc, pageId, [id], "chart", { options });
}

/** Top n on a GHG binding with a breakdown (category_bars, site_bars); undefined = all. */
export function setTop(doc: ReportDoc, pageId: string, id: string, top: number | undefined): ReportDoc {
  const el = findElement(doc, pageId, id);
  if (!el || (el.type !== "chart" && el.type !== "table")) return doc;
  const b = el.props.binding;
  if (!b || b.source !== "ghg") return doc;
  const next: GhgBinding = { ...b };
  if (top) next.top = top;
  else delete next.top;
  return rebind(doc, pageId, id, next);
}

/** Does the binding have a breakdown that a top n folds? */
export const takesTop = (b: Binding | undefined): boolean => !!b && b.source === "ghg" && !!b.breakdown && ["scope3_category", "site", "source_category", "fuel"].includes(b.breakdown);

/** Can the binding show earlier years greyed? (several years) */
export const hasPriorYears = (b: Binding | undefined): boolean => !!b && (b.source === "ghg" || b.source === "kpi") && (Array.isArray(b.years) ? b.years.length > 1 : b.years.last > 1);

// ---------------------------------------------------------------------------
// Typed (custom) data
// ---------------------------------------------------------------------------

export type Grid = string[][];

/** A number typed or pasted the way spreadsheets show it ("1,234", "12.5%", "(40)"); else null. */
export function parseCellNumber(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[\s,]/g, "").replace(/^[−–]/, "-");
  if (!/^-?\d+(\.\d+)?%?$/.test(s)) return null;
  const n = Number(s.replace(/%$/, ""));
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** Splits pasted spreadsheet text (TSV; one row per line, quoted cells allowed). */
export function parseTsv(text: string): Grid {
  const rows: Grid = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const s = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Pastes a grid into another at (r, c), growing it; the result is capped at 200 data rows × 20 columns (+ the header row). */
export function pasteInto(grid: Grid, at: { r: number; c: number }, pasted: Grid): { grid: Grid; clipped: boolean } {
  const out = grid.map((r) => [...r]);
  let clipped = false;
  pasted.forEach((pr, i) => {
    const r = at.r + i;
    if (r > CUSTOM_MAX_ROWS) {
      clipped = true;
      return;
    }
    while (out.length <= r) out.push([]);
    pr.forEach((v, j) => {
      const c = at.c + j;
      if (c >= CUSTOM_MAX_COLS) {
        clipped = true;
        return;
      }
      out[r][c] = v;
    });
  });
  const cols = Math.min(CUSTOM_MAX_COLS, Math.max(...out.map((r) => r.length)));
  return { grid: out.map((r) => Array.from({ length: cols }, (_, j) => r[j] ?? "")), clipped };
}

/** Grid (header row first) → CustomData: numbers become numbers, empty rows go. */
export function gridToCustom(grid: Grid): CustomData {
  const cols = Math.min(CUSTOM_MAX_COLS, Math.max(1, ...grid.map((r) => r.length)));
  const head = Array.from({ length: cols }, (_, j) => (grid[0]?.[j] ?? "").trim() || `Column ${j + 1}`);
  const rows = grid
    .slice(1, CUSTOM_MAX_ROWS + 1)
    .filter((r) => r.some((c) => (c ?? "").trim() !== ""))
    .map((r) => Array.from({ length: cols }, (_, j) => {
      const raw = r[j] ?? "";
      const n = j > 0 ? parseCellNumber(raw) : null;
      return n ?? raw.trim();
    }));
  return { source: "custom", columns: head, rows };
}

export const customToGrid = (d: CustomData): Grid => [d.columns.map(String), ...d.rows.map((r) => r.map((c) => (typeof c === "number" ? String(c) : c)))];

/** Header or first-column labels that read like a GHG or KPI metric (a warning in the grid). */
export function reservedLabels(grid: Grid, kpiNames: readonly string[] = []): string[] {
  const labels = [...(grid[0] ?? []), ...grid.slice(1).map((r) => r[0] ?? "")];
  return [...new Set(labels.filter((l) => reservedLabel(l, kpiNames)).map((l) => l.trim()))];
}

/** Cells in number columns that aren't numbers (the chart draws them as gaps). */
export function nonNumericCells(d: CustomData): number {
  let n = 0;
  for (const r of d.rows) for (let j = 1; j < r.length; j++) if (typeof r[j] !== "number" && String(r[j]).trim() !== "") n++;
  return n;
}

// ---------------------------------------------------------------------------
// The binding editor (Data drawer focused on a chart): DS-2's metric × breakdown table
// ---------------------------------------------------------------------------

export const METRIC_LABELS: Record<GhgBinding["metric"], string> = {
  total: "Total emissions",
  scope1: "Scope 1",
  scope2_location: "Scope 2 (location-based)",
  scope2_market: "Scope 2 (market-based)",
  scope3: "Scope 3",
  scope3_category: "Scope 3 category",
  biogenic_co2: "Biogenic CO₂",
  gas_co2: "CO₂",
  gas_ch4: "CH₄",
  gas_n2o: "N₂O",
  gas_other: "Other gases",
  intensity_revenue: "Intensity per revenue",
  intensity_output: "Intensity per unit of output",
  intensity_employee: "Intensity per employee",
  base_year_total: "Base year (Scope 3)",
  dq_score: "Scope 3 data quality",
  primary_data_pct: "Scope 3 primary data",
  sites_covered: "Sites with data",
  months_covered: "Months with data",
};

export const BREAKDOWN_LABELS: Record<NonNullable<GhgBinding["breakdown"]>, string> = {
  scope: "By scope",
  scope3_category: "By Scope 3 category",
  site: "By site",
  month: "By month",
  quarter: "By quarter",
  gas: "By gas",
  fuel: "By fuel",
  source_category: "By source",
};

const SPLITS = ["site", "month", "quarter", "gas", "fuel", "source_category"] as const;
/** ESG-lite src/studio/sources/ghg.ts BREAKDOWNS_BY_METRIC (anything else is DS_BINDING_INVALID). */
export const BREAKDOWNS_BY_METRIC: Partial<Record<GhgBinding["metric"], readonly NonNullable<GhgBinding["breakdown"]>[]>> = {
  total: ["scope", ...SPLITS],
  scope1: SPLITS,
  scope2_location: SPLITS,
  scope3: ["scope3_category", ...SPLITS],
  scope3_category: ["scope3_category"],
  intensity_output: ["site", "month"],
};

/** Changes the metric, dropping a breakdown the new metric doesn't have. */
export function withMetric(b: GhgBinding, metric: GhgBinding["metric"]): GhgBinding {
  const next: GhgBinding = { ...b, metric };
  if (next.breakdown && !(BREAKDOWNS_BY_METRIC[metric] ?? []).includes(next.breakdown)) delete next.breakdown;
  if (metric === "scope3_category" && !next.breakdown && !next.scope3Category) next.breakdown = "scope3_category";
  if (metric !== "scope3_category") delete next.scope3Category;
  if (!takesTop(next)) delete next.top;
  return next;
}

export function withBreakdown(b: GhgBinding, breakdown: GhgBinding["breakdown"] | null): GhgBinding {
  const next: GhgBinding = { ...b };
  if (breakdown) next.breakdown = breakdown;
  else delete next.breakdown;
  if (!takesTop(next)) delete next.top;
  return next;
}

/** "Last n years" or an explicit list (base year and this year). */
export function withYears<B extends FigureBinding>(b: B, years: FigureBinding["years"]): B {
  return { ...b, years };
}

export function withCompare<B extends FigureBinding>(b: B, compare: "prior" | "base" | "target" | null): B {
  const next = { ...b } as Record<string, unknown>;
  if (compare) next.compare = compare;
  else delete next.compare;
  return next as B;
}

export function withSites<B extends FigureBinding>(b: B, sites: "all" | number[]): B {
  return { ...b, sites: Array.isArray(sites) && !sites.length ? "all" : sites };
}

/** One line under the drawer header: "Scope 3 · by Scope 3 category · last 1 year · top 8". */
export function bindingSummary(b: Binding): string {
  if (b.source === "custom") return `Typed data · ${b.rows.length} row${b.rows.length === 1 ? "" : "s"} × ${b.columns.length} column${b.columns.length === 1 ? "" : "s"}`;
  if (b.source === "input") return "Report details";
  const years = Array.isArray(b.years) ? b.years.join(" and ") : b.years.last === 1 ? "this year" : `last ${b.years.last} years`;
  const what = b.source === "ghg" ? `${METRIC_LABELS[b.metric]}${b.scope3Category ? ` ${b.scope3Category}` : ""}` : b.kpis.join(", ");
  const by = b.breakdown ? ` · ${(BREAKDOWN_LABELS as Record<string, string>)[b.breakdown]?.toLowerCase() ?? b.breakdown}` : "";
  const top = b.source === "ghg" && b.top ? ` · top ${b.top}` : "";
  const cmp = b.compare ? ` · vs ${b.compare}` : "";
  return `${what}${by} · ${years}${top}${cmp}`;
}

/** The name a data element goes by in the drawer header. */
export function elementTitle(el: Element): string {
  if (el.type === "chart") return el.props.title || `${kindLabel(el.props.kind)} chart`;
  if (el.type === "table") return "Table";
  if (el.type === "big_number" || el.type === "kpi_tile") return el.props.label || (el.type === "big_number" ? "Big number" : "Tile");
  return el.type.replace(/_/g, " ");
}
