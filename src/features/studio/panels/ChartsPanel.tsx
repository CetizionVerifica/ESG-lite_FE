// DS-8 · the Charts drawer (05-ux "Charts"): chart kinds as thumbnails, each
// added (click) or dropped (drag) with a sensible default binding, e.g.
// Scope 3 categories → Scope 3 by category, this year, top 8. A kind whose
// data isn't there for this report (one /resolve of the defaults) is disabled
// with the reason. Below: tables, and "Custom data chart" with its Unlinked
// badge. Thumbnails are the renderer's own SVG over a fixed sample shape (no
// reported figure, no value labels).
import { useMemo } from "react";
import { Table2, Unlink } from "lucide-react";
import type {
  Element,
  GhgBinding,
  KpiBinding,
} from "../../../lib/studio/contracts";
import {
  GHG_CHART_KINDS,
  buildTheme,
  chartRenderer,
  defaultGhgChart,
  type GhgChartKind,
  type RenderValue,
  type Theme,
} from "../../../lib/studio/render";
import { Badge, SkeletonText, Tooltip, cn, focusRing } from "../../../ui";
import { DND_ELEMENT } from "../editor/dnd";
import type { DrawerProps } from "../editor/registry";
import { scopeOf } from "../editor/renderInputs";
import {
  customChart,
  ghgChartFor,
  kindLabel,
  rsChartFor,
} from "../editor/charts/chartOps";
import { setChartsUi } from "../editor/charts/store";
import {
  boundTableTemplate,
  staticTableTemplate,
} from "../editor/tables/tableOps";
import { UNAVAILABLE_TEXT } from "./data/logic";
import { useDataCatalog, useDocInputs, useResolve } from "./data/api";

const ser = (label: string, pairs: [string, number][]) => ({
  label,
  values: pairs.map(([key, value]) => ({ key, value })),
});
const v = (
  series: RenderValue["series"],
  extra: Partial<RenderValue> = {},
): RenderValue => ({ display: "", value: null, unit: null, series, ...extra });
const MONTHS = [
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
].map((m) => `2025-${m}`);

/** Thumbnail shapes (illustrative only; never shown on a page). */
const SAMPLES: Record<string, RenderValue> = {
  scope_split: v([
    ser("2025", [
      ["Scope 1", 3],
      ["Scope 2", 5],
      ["Scope 3", 4],
    ]),
  ]),
  category_bars: v([
    ser("2025", [
      ["1", 9],
      ["4", 6],
      ["6", 4],
      ["7", 3],
      ["Other", 2],
    ]),
  ]),
  gas_split: v([
    ser("2025", [
      ["CO₂", 9],
      ["CH₄", 3],
      ["N₂O", 1.5],
    ]),
  ]),
  site_bars: v([
    ser("2025", [
      ["A", 8],
      ["B", 5],
      ["C", 3],
      ["D", 2],
    ]),
  ]),
  monthly_stack: v(
    [
      ser(
        "2025",
        MONTHS.map((m) => [m, 1]),
      ),
    ],
    {
      stacks: [
        ser(
          "Scope 1",
          MONTHS.map((m, i) => [m, 2 + (i % 3)]),
        ),
        ser(
          "Scope 2",
          MONTHS.map((m, i) => [m, 3 + ((i + 1) % 4)]),
        ),
        ser(
          "Scope 3",
          MONTHS.map((m) => [m, 2]),
        ),
      ],
    },
  ),
  base_year_waterfall: v([
    ser("2022", [
      ["Scope 1", 5],
      ["Scope 2", 6],
      ["Scope 3", 4],
    ]),
    ser("2025", [
      ["Scope 1", 4],
      ["Scope 2", 4.5],
      ["Scope 3", 4.5],
    ]),
  ]),
  intensity_line: v([
    ser("Intensity", [
      ["21", 9],
      ["22", 8.2],
      ["23", 7.5],
      ["24", 6.6],
      ["25", 6],
    ]),
  ]),
  treemap: v([
    ser("2025", [
      ["1", 9],
      ["4", 5],
      ["6", 3],
      ["7", 2.5],
      ["5", 1.5],
      ["2", 1],
    ]),
  ]),
  bar: v([
    ser("Total", [
      ["21", 9],
      ["22", 8.5],
      ["23", 8],
      ["24", 7.2],
      ["25", 6.8],
    ]),
  ]),
  line: v([
    ser("Total", [
      ["21", 9],
      ["22", 8.5],
      ["23", 8],
      ["24", 7.2],
      ["25", 6.8],
    ]),
  ]),
  stacked_bar: v([
    ser("Scope 1", [
      ["23", 3],
      ["24", 2.8],
      ["25", 2.6],
    ]),
    ser("Scope 2", [
      ["23", 5],
      ["24", 4.6],
      ["25", 4.2],
    ]),
    ser("Scope 3", [
      ["23", 4],
      ["24", 4.2],
      ["25", 4],
    ]),
  ]),
  donut: v([
    ser("2025", [
      ["Scope 1", 3],
      ["Scope 2", 5],
      ["Scope 3", 4],
    ]),
  ]),
};

function Thumb({ kind, theme }: { kind: string; theme: Theme }) {
  const svg = useMemo(() => {
    const r = chartRenderer(kind);
    const value = SAMPLES[kind];
    return r && value
      ? r({
          value,
          w: 160,
          h: 100,
          theme,
          options: { showValues: false, showLegend: false, basisNote: false },
          label: kindLabel(kind),
        })
      : "";
  }, [kind, theme]);
  // Our own renderer's static SVG (no user text): safe to inline.
  return (
    <span
      aria-hidden
      className="block h-16 w-full overflow-hidden rounded-[4px] bg-panel p-1"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function KindTile({
  kind,
  label,
  theme,
  template,
  disabledReason,
  onAdd,
  testId,
}: {
  kind: string;
  label: string;
  theme: Theme;
  template: Element | null;
  disabledReason: string | null;
  onAdd: () => void;
  testId: string;
}) {
  const disabled = !template || !!disabledReason;
  const tile = (
    <button
      type="button"
      disabled={disabled}
      aria-label={
        disabledReason ? `${label}: ${disabledReason}` : `Add ${label}`
      }
      draggable={!disabled}
      onDragStart={(e) => {
        if (!template) return;
        e.dataTransfer.effectAllowed = "copy";
        e.dataTransfer.setData(DND_ELEMENT, JSON.stringify(template));
      }}
      onClick={onAdd}
      data-testid={testId}
      className={cn(
        "flex w-full flex-col gap-1 rounded-control border border-line bg-tint p-1.5 text-left text-xs text-ink hover:border-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line",
        focusRing,
      )}
    >
      <Thumb kind={kind} theme={theme} />
      <span className="truncate px-0.5 font-medium">{label}</span>
    </button>
  );
  return disabledReason ? (
    <Tooltip content={disabledReason}>
      {<span className="block">{tile}</span>}
    </Tooltip>
  ) : (
    tile
  );
}

export function ChartsPanel({ docId, editor }: DrawerProps) {
  const doc = editor.doc;
  const scope = scopeOf(doc);
  const theme = useMemo(
    () => buildTheme(doc.design.theme, editor.render.brand),
    [doc.design.theme, editor.render.brand],
  );
  const inputs = useDocInputs(docId);
  const baseYear = (inputs.data?.inputs.base_year?.value ??
    inputs.data?.prefill.base_year?.value ??
    null) as number | null;
  const defaults = useMemo(
    () => GHG_CHART_KINDS.map((k) => ghgChartFor(k, doc, baseYear)),
    [doc, baseYear],
  );
  const bindings = useMemo(
    () =>
      GHG_CHART_KINDS.map(
        (k) =>
          defaultGhgChart(k, { year: doc.meta.year, baseYear })
            .binding as GhgBinding,
      ),
    [doc.meta.year, baseYear],
  );
  const probe = useResolve({ ...scope, bindings, tokens: [], docId });
  const catalog = useDataCatalog(scope);
  const firstKpi = useMemo(() => {
    if (doc.kind !== "sustainability") return null;
    for (const g of catalog.data?.groups ?? [])
      for (const i of g.items)
        if (i.binding.source === "kpi") return i.binding as KpiBinding;
    return null;
  }, [catalog.data, doc.kind]);
  const canAdd = !editor.readOnly && !!editor.page;

  const reasonFor = (i: number): string | null => {
    const r = probe.data?.values[i];
    if (!r) return null;
    if (r.unavailable)
      return (
        UNAVAILABLE_TEXT[r.unavailable.reason] ?? "Not reported for this report"
      );
    const pts = (r.series ?? [])
      .flatMap((s) => s.values)
      .filter((p) => p.value !== null && p.value !== 0);
    return pts.length ? null : "No approved data for this year";
  };
  const add = (el: Element | null, label: string) => {
    if (!el || !canAdd) return;
    editor.insertElement(el, { label: `Add ${label.toLowerCase()}` });
  };
  const general = (["bar", "line", "stacked_bar", "donut"] as const).map(
    (k) => ({ k, el: rsChartFor(k, doc, firstKpi) }),
  );
  const boundTable: Element | null =
    doc.kind === "ghg"
      ? boundTableTemplate({
          source: "ghg",
          metric: "total",
          breakdown: "scope",
          years: { last: 3 },
          sites: "all",
        })
      : firstKpi
        ? boundTableTemplate({ ...firstKpi, years: { last: 3 } })
        : null;

  return (
    <section
      aria-label="Charts"
      className="space-y-4"
      data-testid="charts-panel"
    >
      <header>
        <h2 className="text-base font-semibold text-ink">Charts</h2>
        <p className="text-xs text-muted">
          Click to add, or drag onto the page. Charts show approved data; change
          it with Edit data.
        </p>
      </header>
      {!editor.page && (
        <p className="text-sm text-muted">
          Pick a free-form page to add charts to it.
        </p>
      )}

      <section aria-labelledby="charts-ghg" className="space-y-2">
        <h3
          id="charts-ghg"
          className="text-xs font-semibold uppercase tracking-wide text-muted"
        >
          Emissions charts
        </h3>
        {probe.isPending && <SkeletonText lines={1} />}
        <div className="grid grid-cols-2 gap-2">
          {GHG_CHART_KINDS.map((k: GhgChartKind, i) => (
            <KindTile
              key={k}
              kind={k}
              label={kindLabel(k)}
              theme={theme}
              template={canAdd ? defaults[i] : null}
              disabledReason={reasonFor(i)}
              onAdd={() => add(defaults[i], kindLabel(k))}
              testId={`chart-kind-${k}`}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="charts-general" className="space-y-2">
        <h3
          id="charts-general"
          className="text-xs font-semibold uppercase tracking-wide text-muted"
        >
          {doc.kind === "ghg" ? "General charts" : "KPI charts"}
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {general.map(({ k, el }) => (
            <KindTile
              key={k}
              kind={k}
              label={kindLabel(k)}
              theme={theme}
              template={canAdd ? el : null}
              disabledReason={!el ? "Select KPIs in KPI setup first" : null}
              onAdd={() => add(el, kindLabel(k))}
              testId={`chart-kind-${k}`}
            />
          ))}
        </div>
        <p className="text-xs text-muted">
          Any figure in the Data panel can become a chart: drag it onto the
          page.
        </p>
      </section>

      <section aria-labelledby="charts-tables" className="space-y-2">
        <h3
          id="charts-tables"
          className="text-xs font-semibold uppercase tracking-wide text-muted"
        >
          Tables
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!canAdd || !boundTable}
            onClick={() => add(boundTable, "table of figures")}
            className={cn(
              "flex h-16 items-center gap-2 rounded-control border border-line bg-tint px-2 text-left text-xs text-ink hover:border-accent disabled:opacity-50",
              focusRing,
            )}
          >
            <Table2 aria-hidden className="size-4 text-muted" />
            Table of figures
          </button>
          <button
            type="button"
            disabled={!canAdd}
            onClick={() => add(staticTableTemplate(), "table")}
            className={cn(
              "flex h-16 items-center gap-2 rounded-control border border-line bg-tint px-2 text-left text-xs text-ink hover:border-accent disabled:opacity-50",
              focusRing,
            )}
          >
            <Table2 aria-hidden className="size-4 text-muted" />
            Blank table
          </button>
        </div>
      </section>

      <section
        aria-labelledby="charts-custom"
        className="space-y-2 border-t border-line pt-3"
      >
        <h3
          id="charts-custom"
          className="text-xs font-semibold uppercase tracking-wide text-muted"
        >
          Typed data
        </h3>
        <button
          type="button"
          disabled={!canAdd}
          data-testid="chart-kind-custom"
          onClick={() => {
            if (!editor.page) return;
            const id = editor.insertElement(customChart(), {
              label: "Add custom data chart",
            });
            if (id)
              setChartsUi({ grid: { pageId: editor.page.id, elementId: id } });
          }}
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-control border border-dashed border-line px-3 py-2 text-left text-sm text-ink hover:border-accent disabled:opacity-50",
            focusRing,
          )}
        >
          <span className="flex items-center gap-2">
            <Unlink aria-hidden className="size-4 text-warn" />
            Custom data chart
          </span>
          <Badge tone="warn">Unlinked</Badge>
        </button>
        <p className="text-xs text-muted">
          For numbers that aren't in ESGLite. They're marked "Unlinked data" in
          the editor and listed in checks.
        </p>
      </section>
    </section>
  );
}
