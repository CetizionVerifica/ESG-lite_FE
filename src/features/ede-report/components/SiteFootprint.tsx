import { useState } from "react";
import type { BySiteRow } from "../../../services/reportService";
import { ChartFrame, type Column, DataTable, SegmentedControl, formatEmissions, formatPercent } from "../../../ui";
import { useChartTheme } from "../../../theme";

type Measure = "pct" | "t";

type Props = { rows: BySiteRow[]; colorIndex: Map<number, number> };

/** Footprint by site (table with a share bar) next to one donut that toggles % / tCO₂e. */
export function SiteFootprint({ rows, colorIndex }: Props) {
  const [measure, setMeasure] = useState<Measure>("pct");
  const theme = useChartTheme();
  const colorOf = (siteId: number) => theme.color[colorIndex.get(siteId) ?? 0];
  const pct = measure === "pct";

  const columns: Column<BySiteRow>[] = [
    {
      id: "site",
      header: "Site",
      value: (r) => r.siteName,
      cell: (r) => (
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorOf(r.siteId) }} />
          {r.siteName}
        </span>
      ),
    },
    {
      id: "total",
      header: "Total",
      value: (r) => r.total,
      cell: (r) => <strong>{formatEmissions(r.total)}</strong>,
      numeric: true,
    },
    {
      id: "scope1",
      header: "Scope 1",
      value: (r) => r.scope1,
      cell: (r) => formatEmissions(r.scope1),
      numeric: true,
    },
    {
      id: "scope2",
      header: "Scope 2",
      value: (r) => r.scope2,
      cell: (r) => formatEmissions(r.scope2),
      numeric: true,
    },
    {
      id: "scope3",
      header: "Scope 3",
      value: (r) => r.scope3,
      cell: (r) => formatEmissions(r.scope3),
      numeric: true,
    },
    {
      id: "share",
      header: "Share",
      value: (r) => r.pctOfTotal,
      numeric: true,
      width: "9rem",
      cell: (r) => (
        <span className="flex items-center justify-end gap-2">
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-tint" aria-hidden>
            <span
              className="block h-full rounded-full"
              style={{
                width: `${Math.min(100, Math.max(0, r.pctOfTotal))}%`,
                background: colorOf(r.siteId),
              }}
            />
          </span>
          {formatPercent(r.pctOfTotal)}
        </span>
      ),
    },
  ];

  const data = rows.filter((r) => r.total > 0);

  return (
    <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
      <section aria-labelledby="ede-footprint" className="min-w-0 space-y-2">
        <h2 id="ede-footprint" className="text-sm font-semibold text-ink">
          Footprint by site
        </h2>
        <DataTable<BySiteRow>
          label="Footprint by site"
          rows={rows}
          columns={columns}
          getRowId={(r) => r.siteId}
          exportName="ede-footprint-by-site"
          defaultSort={{ id: "total", dir: "desc" }}
        />
      </section>
      <ChartFrame
        title="Share by site"
        unit={pct ? "% of Scope 1 + 2 + 3" : "tCO₂e"}
        empty={data.length === 0}
        emptyText="No Scope 1–3 emissions at these sites."
        exportName="ede-share-by-site"
        actions={
          <SegmentedControl<Measure>
            size="sm"
            label="Show as"
            value={measure}
            onChange={setMeasure}
            options={[
              { value: "pct", label: "%" },
              { value: "t", label: "tCO₂e" },
            ]}
          />
        }
        table={{
          columns: [
            { id: "site", header: "Site" },
            { id: "total", header: "tCO₂e", numeric: true, decimals: 3 },
            { id: "pct", header: "%", numeric: true, decimals: 1 },
          ],
          rows: data.map((r) => ({
            site: r.siteName,
            total: r.total,
            pct: r.pctOfTotal,
          })),
        }}
        option={{
          tooltip: {
            trigger: "item",
            valueFormatter: (v) => (typeof v !== "number" ? "—" : pct ? formatPercent(v) : formatEmissions(v)),
          },
          legend: { bottom: 0, type: "scroll" },
          series: [
            {
              type: "pie",
              radius: ["50%", "72%"],
              center: ["50%", "45%"],
              avoidLabelOverlap: true,
              label: {
                formatter: (p: { value?: unknown }) => (typeof p.value !== "number" ? "" : pct ? formatPercent(p.value, 0) : formatEmissions(p.value)),
              },
              data: data.map((r) => ({
                name: r.siteName,
                value: pct ? r.pctOfTotal : r.total,
                itemStyle: { color: colorOf(r.siteId) },
              })),
            },
          ],
        }}
      />
    </div>
  );
}
