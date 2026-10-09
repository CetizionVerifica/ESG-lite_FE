import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { OverviewResponse } from "../../../services/overviewService";
import { useTheme } from "../../../theme";
import { ChartFrame, MONTH_SHORT, TabPanel, Tabs, cn, focusRing, formatEmissions, formatNumber } from "../../../ui";
import { useScope2Entries, useSiteIntensityMonthly, useYearTrends } from "../api";
import { intensityMonthly, lastYearCaption, monthLabel, recentYears, scope2Monthly, shortMonth, yearsOf } from "../logic";

type View = "intensity" | "scope2" | "yoy" | "sites";
const VIEWS: View[] = ["intensity", "scope2", "yoy", "sites"];
const ID = "overview-more";
const LOAD_ERROR = "Couldn't load this chart.";

const lastDay = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

/**
 * Below-the-fold charts. Only the open tab is mounted, so each loads its data
 * when first opened; all follow the header's sites, category and period.
 */
export function LowerTabs(props: { overview: OverviewResponse | undefined; siteIds: number[]; categoryId: number | null; now: Date }) {
  const [params, setParams] = useSearchParams();
  const raw = params.get("view") as View | null;
  const view: View = raw && VIEWS.includes(raw) ? raw : "intensity";
  const setView = (v: View) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set("view", v);
        return next;
      },
      { replace: true },
    );
  const months = props.overview?.trend.map((t) => t.month) ?? [];

  return (
    <section aria-label="More charts" className="space-y-3">
      <Tabs<View>
        label="More charts"
        idBase={ID}
        value={view}
        onChange={setView}
        items={[
          { value: "intensity", label: "Intensity" },
          { value: "scope2", label: "Scope 2 electricity" },
          { value: "yoy", label: "Year over year" },
          { value: "sites", label: "Site comparison" },
        ]}
      />
      <TabPanel idBase={ID} value="intensity" current={view}>
        {months.length > 0 && <IntensityChart siteIds={props.siteIds} months={months} />}
      </TabPanel>
      <TabPanel idBase={ID} value="scope2" current={view}>
        {months.length > 0 && <Scope2Chart siteIds={props.siteIds} categoryId={props.categoryId} months={months} />}
      </TabPanel>
      <TabPanel idBase={ID} value="yoy" current={view}>
        <YearOverYear siteIds={props.siteIds} categoryId={props.categoryId} now={props.now} />
      </TabPanel>
      <TabPanel idBase={ID} value="sites" current={view}>
        <SiteComparison overview={props.overview} />
      </TabPanel>
    </section>
  );
}

function IntensityChart({ siteIds, months }: { siteIds: number[]; months: string[] }) {
  const { tokens } = useTheme();
  const q = useSiteIntensityMonthly(siteIds, `${months[0]}-01`, lastDay(months[months.length - 1]));
  const rows = q.data ? intensityMonthly(q.data, months) : [];
  return (
    <ChartFrame
      title="Intensity trend"
      unit="tCO₂e per unit produced"
      subtitle={siteIds.length > 1 ? "Gross emissions over production, combined across sites; the line is intensity (right axis). Not filtered by category." : "Gross emissions over production; the line is intensity (right axis). Not filtered by category."}
      loading={q.isPending}
      error={q.isError ? LOAD_ERROR : null}
      onRetry={q.refetch}
      empty={!rows.some((r) => r.production > 0)}
      emptyText="No approved production data in these months."
      exportName="overview-intensity"
      table={{
        columns: [
          { id: "month", header: "Month" },
          { id: "emissions", header: "Gross tCO₂e", numeric: true, decimals: 3 },
          { id: "production", header: "Production", numeric: true, decimals: 2 },
          { id: "intensity", header: "Intensity", numeric: true, decimals: 4 },
        ],
        rows: rows.map((r) => ({ ...r, month: monthLabel(r.month) })),
      }}
      option={{
        grid: { left: 8, right: 8, top: 32, bottom: 4, containLabel: true },
        legend: { top: 0, left: 0 },
        tooltip: { trigger: "axis" },
        xAxis: { type: "category", data: months.map(shortMonth) },
        yAxis: [
          { type: "value" },
          { type: "value", splitLine: { show: false } },
        ],
        series: [
          { name: "Gross tCO₂e", type: "bar", barMaxWidth: 24, itemStyle: { color: tokens.tint, borderColor: tokens.brand, borderWidth: 1 }, data: rows.map((r) => r.emissions) },
          { name: "Intensity", type: "line", yAxisIndex: 1, connectNulls: false, itemStyle: { color: tokens.brand }, lineStyle: { color: tokens.brand }, data: rows.map((r) => (r.intensity === null ? null : Number(r.intensity.toFixed(4)))) },
        ],
      }}
    />
  );
}

function Scope2Chart({ siteIds, categoryId, months }: { siteIds: number[]; categoryId: number | null; months: string[] }) {
  const { tokens } = useTheme();
  const q = useScope2Entries(siteIds, categoryId, yearsOf(months));
  const { unit, rows } = scope2Monthly(q.data?.flat() ?? [], months);
  return (
    <ChartFrame
      title="Scope 2 electricity"
      unit="tCO₂e"
      subtitle={`Approved monthly entries; the line is the ${unit} reported (right axis).`}
      loading={q.isPending}
      error={q.isError ? LOAD_ERROR : null}
      onRetry={q.refetch}
      empty={!rows.some((r) => r.emissions > 0 || r.activity > 0)}
      emptyText="No approved Scope 2 entries in these months."
      exportName="overview-scope2"
      table={{
        columns: [
          { id: "month", header: "Month" },
          { id: "emissions", header: "tCO₂e", numeric: true, decimals: 3 },
          { id: "activity", header: unit, numeric: true, decimals: 0 },
        ],
        rows: rows.map((r) => ({ ...r, month: monthLabel(r.month) })),
      }}
      option={{
        grid: { left: 8, right: 8, top: 32, bottom: 4, containLabel: true },
        legend: { top: 0, left: 0 },
        tooltip: { trigger: "axis" },
        xAxis: { type: "category", data: months.map(shortMonth) },
        yAxis: [
          { type: "value" },
          { type: "value", splitLine: { show: false } },
        ],
        series: [
          { name: "tCO₂e", type: "bar", barMaxWidth: 24, itemStyle: { color: tokens.s2 }, data: rows.map((r) => r.emissions) },
          { name: unit, type: "line", yAxisIndex: 1, itemStyle: { color: tokens.ink }, lineStyle: { color: tokens.ink }, data: rows.map((r) => r.activity) },
        ],
      }}
    />
  );
}

function YearOverYear({ siteIds, categoryId, now }: { siteIds: number[]; categoryId: number | null; now: Date }) {
  const options = recentYears(now);
  const [years, setYears] = useState<number[]>(options.slice(0, 2));
  const shown = [...years].sort((a, b) => a - b);
  const q = useYearTrends(shown, siteIds, categoryId);
  const toggle = (y: number) => setYears((cur) => (cur.includes(y) ? (cur.length > 1 ? cur.filter((x) => x !== y) : cur) : [...cur, y]));
  const lines = shown.map((year, i) => ({ year, net: q.data?.[i]?.trend.map((t) => t.net) ?? [] }));
  return (
    <ChartFrame
      title="Year over year"
      unit="tCO₂e, net"
      subtitle="Calendar years, approved monthly entries."
      loading={q.isPending}
      error={q.isError ? LOAD_ERROR : null}
      onRetry={q.refetch}
      empty={!lines.some((l) => l.net.some((v) => v !== 0))}
      emptyText="Nothing approved in these years."
      exportName="overview-year-over-year"
      actions={
        <div role="group" aria-label="Years" className="flex flex-wrap gap-1">
          {options.map((y) => (
            <button
              key={y}
              type="button"
              aria-pressed={years.includes(y)}
              onClick={() => toggle(y)}
              className={cn(
                "rounded-chip border px-2 py-0.5 font-num text-xs",
                years.includes(y) ? "border-brand bg-tint text-ink" : "border-line text-muted hover:text-ink",
                focusRing,
              )}
            >
              {y}
            </button>
          ))}
        </div>
      }
      table={{
        columns: [{ id: "month", header: "Month" }, ...shown.map((y) => ({ id: String(y), header: String(y), numeric: true, decimals: 3 }))],
        rows: MONTH_SHORT.map((m, i) => Object.fromEntries([["month", m], ...lines.map((l) => [String(l.year), l.net[i] ?? null])])),
      }}
      option={{
        grid: { left: 8, right: 8, top: 32, bottom: 4, containLabel: true },
        legend: { top: 0, left: 0 },
        tooltip: { trigger: "axis", valueFormatter: (v) => (typeof v === "number" ? formatEmissions(v) : "—") },
        xAxis: { type: "category", data: MONTH_SHORT },
        yAxis: { type: "value" },
        series: lines.map((l) => ({ name: String(l.year), type: "line" as const, data: l.net })),
      }}
    />
  );
}

function SiteComparison({ overview }: { overview: OverviewResponse | undefined }) {
  const { tokens } = useTheme();
  const sites = [...(overview?.by_site ?? [])].sort((a, b) => b.net - a.net);
  const caption = lastYearCaption(overview?.last_year);
  const ly = caption ? new Map(overview?.last_year?.by_site.map((s) => [s.site_id, s.net])) : null;
  return (
    <ChartFrame
      title="Site comparison"
      unit="tCO₂e, net"
      subtitle={ly ? `Bars for this period; outlined bars ${caption}.` : undefined}
      loading={!overview}
      empty={!sites.some((s) => s.net !== 0)}
      emptyText="Nothing approved for these sites yet."
      exportName="overview-site-comparison"
      height={Math.max(200, sites.length * 44 + 60)}
      table={{
        columns: [
          { id: "site", header: "Site" },
          { id: "net", header: "Net tCO₂e", numeric: true, decimals: 3 },
          ...(ly ? [{ id: "ly", header: "Last year", numeric: true, decimals: 3 }] : []),
        ],
        rows: sites.map((s) => ({ site: s.name, net: s.net, ...(ly ? { ly: ly.get(s.site_id) ?? null } : {}) })),
      }}
      option={{
        grid: { left: 8, right: 16, top: ly ? 32 : 8, bottom: 4, containLabel: true },
        legend: ly ? { top: 0, left: 0 } : { show: false },
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => (typeof v === "number" ? formatEmissions(v) : "—") },
        xAxis: { type: "value", axisLabel: { formatter: (v: number) => formatNumber(v) } },
        yAxis: { type: "category", inverse: true, data: sites.map((s) => s.name) },
        series: [
          { name: "This period", type: "bar", barMaxWidth: 18, itemStyle: { color: tokens.brand }, data: sites.map((s) => s.net) },
          ...(ly
            ? [{ name: "Last year", type: "bar" as const, barMaxWidth: 18, itemStyle: { color: tokens.tint, borderColor: tokens.muted, borderWidth: 1 }, data: sites.map((s) => ly.get(s.site_id) ?? null) }]
            : []),
        ],
      }}
    />
  );
}
