import { type ReactNode, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, FileBarChart } from "lucide-react";
import { useTheme } from "../../theme";
import { useAuth } from "../../context/AuthContext";
import { useClientContext } from "../../lib/clientContext";
import {
  Button,
  Callout,
  type Column,
  DataTable,
  EmptyState,
  type Kpi,
  KpiStrip,
  PageHeader,
  ReportFilters,
  type SiteOption,
  SkeletonChart,
  categoryOptions,
  clientSites,
  cn,
  formatEmissions,
  formatNumber,
  readPeriod,
  supportedPeriod,
  useDebounced,
  useFilterParams,
  useToast,
  writePeriod,
} from "../../ui";
import { useAdminSites, useEdeReport } from "./api";
import { IntensityTrend } from "./components/IntensityTrend";
import { MonthlyBySite } from "./components/MonthlyBySite";
import { SiteBars } from "./components/SiteBars";
import { SiteFootprint } from "./components/SiteFootprint";
import {
  EDE_SUPPORTS,
  EDE_UNSUPPORTED_HINT,
  type EdeQuery,
  edeFigures,
  edePeriodLabel,
  monthlyGrid,
  overallTotals,
  reportSites,
  siteColorIndex,
} from "./logic";

function useManagerSites(): SiteOption[] {
  const { user } = useAuth();
  return useMemo(() => {
    const list = (user?.sites as SiteOption[] | undefined) ?? [];
    return list.length > 0 ? list : user?.site ? [user.site as SiteOption] : [];
  }, [user]);
}

const numbers = (values: string[] | undefined) => (values ?? []).map(Number).filter((n) => Number.isInteger(n));

/** The EDE endpoint answers 400/500 with `{ message }`. */
function serverMessage(e: unknown, fallback: string): string {
  const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof msg === "string" && msg ? msg : fallback;
}

type TotalRow = ReturnType<typeof overallTotals>[number];
const TOTAL_COLUMNS: Column<TotalRow>[] = [
  { id: "metric", header: "Metric", value: (r) => r.metric, sortable: false },
  {
    id: "value",
    header: "Value",
    value: (r) => r.value,
    cell: (r) => (r.unit === "kWh" ? `${formatNumber(r.value, 0)} kWh` : formatEmissions(r.value)),
    numeric: true,
    sortable: false,
  },
];

/**
 * P11 EDE report: approved data by site, month by month, with renewables and
 * intensity. Same header filters as P10, kept in the URL; results update in
 * place after a 400ms pause.
 */
export default function EdeReportPage() {
  const { role } = useAuth();
  const isStaff = role === "Superadmin";
  const { clientId } = useClientContext();
  const managerSites = useManagerSites();
  const adminSites = useAdminSites(isStaff);
  const sites = useMemo(() => (isStaff ? clientSites(adminSites.data ?? [], clientId) : managerSites), [isStaff, adminSites.data, clientId, managerSites]);

  const now = useMemo(() => new Date(), []);
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useFilterParams(["site", "category"]);

  // An FY or quarterly link (e.g. copied from the GHG report) falls back to the nearest calendar period.
  const draftPeriod = supportedPeriod(readPeriod(params, now), EDE_SUPPORTS);
  const pickedSites = numbers(filters.filters.site).filter((id) => sites.some((s) => s.site_id === id));
  const siteIds = pickedSites.length ? pickedSites : sites.map((s) => s.site_id);
  const categories = categoryOptions(sites, pickedSites);
  const categoryIds = numbers(filters.filters.category).filter((id) => categories.some((c) => c.value === id));

  const draft: EdeQuery = { siteIds, categoryIds, period: draftPeriod };
  const settledKey = useDebounced(JSON.stringify(draft), 400);
  const query = useMemo(() => JSON.parse(settledKey) as EdeQuery, [settledKey]);
  const report = useEdeReport(sites.length ? query : null);
  const data = report.data;
  const stale = report.isPlaceholderData;
  const period = (data?.query ?? query).period;

  const figures = useMemo(() => (data ? edeFigures(data) : null), [data]);
  const siteRefs = useMemo(() => (data ? reportSites(data) : []), [data]);
  const colorIndex = useMemo(() => siteColorIndex(siteRefs), [siteRefs]);
  const grid = useMemo(() => (data ? monthlyGrid(data, period, siteRefs) : null), [data, period, siteRefs]);

  const setPeriod = (p: typeof period) => setParams((cur) => writePeriod(cur, p), { replace: true });

  const company = sites[0]?.company?.name;
  const { pack } = useTheme();
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const downloadPdf = async () => {
    if (!data) return;
    setGenerating(true);
    try {
      // Loaded on demand: @react-pdf and the print charts stay out of the page bundle.
      const { downloadEdePdf } = await import("./pdf/download");
      const shown = data.query;
      const siteNames = sites.filter((s) => shown.siteIds.includes(s.site_id)).map((s) => s.name);
      const categoryNames = categories.filter((c) => shown.categoryIds.includes(c.value)).map((c) => c.label);
      await downloadEdePdf({
        data,
        period: shown.period,
        company,
        sitesText: siteNames.length === sites.length ? `All sites (${siteNames.length})` : siteNames.join(", "),
        categoriesText: categoryNames.length ? categoryNames.join(", ") : "All categories",
        brand: isStaff && clientId !== null ? { clientId } : { pack },
      });
    } catch {
      toast({ tone: "bad", title: "Couldn't create the PDF.", description: "Try again; if it keeps failing, use the chart and table exports." });
    } finally {
      setGenerating(false);
    }
  };
  const header = (context?: ReactNode) => (
    <PageHeader
      title="EDE report"
      crumb={company ? [{ label: company }] : undefined}
      context={context}
      primaryAction={
        context
          ? {
              label: generating ? "Generating…" : "Download PDF",
              icon: <Download className="h-4 w-4" aria-hidden />,
              onClick: downloadPdf,
              loading: generating,
              disabled: generating || !data || !figures || figures.empty || report.isPlaceholderData,
            }
          : undefined
      }
    />
  );

  if (isStaff && clientId === null)
    return (
      <div className="space-y-6">
        {header()}
        <Callout tone="warn" title="Pick a client first">
          Choose a client with the switcher at the top; the report covers that client's sites.
        </Callout>
      </div>
    );

  if (isStaff && adminSites.isError)
    return (
      <div className="space-y-6">
        {header()}
        <EmptyState variant="error" title="Couldn't load this client's sites." action={<Button onClick={() => adminSites.refetch()}>Try again</Button>} />
      </div>
    );

  if (sites.length === 0 && !(isStaff && adminSites.isPending))
    return (
      <div className="space-y-6">
        {header()}
        <Callout tone="warn" title={isStaff ? "This client has no sites yet" : "You don't have any sites yet"}>
          {isStaff ? "Add a site for this client, then come back to report on it." : "Ask your admin to assign a site to you, then come back to report on it."}
        </Callout>
      </div>
    );

  const f = figures;
  const kpis: Kpi[] = [
    {
      label: "Total emissions",
      value: f?.total,
      format: "emissions",
      primary: true,
      hint: "Scope 1 + 2 + 3",
    },
    { label: "Scope 1", value: f?.scope1, format: "emissions" },
    { label: "Scope 2", value: f?.scope2, format: "emissions" },
    { label: "Scope 3", value: f?.scope3, format: "emissions" },
    {
      label: "Renewable produced",
      value: f?.renewableKwh,
      format: "number",
      unit: "kWh",
    },
    {
      label: "Saved",
      value: f?.saved,
      format: "emissions",
      hint: "by renewables",
    },
  ];

  const error = report.isError ? serverMessage(report.error, "Couldn't load the report.") : null;
  const firstLoad = report.isPending || (isStaff && adminSites.isPending);

  return (
    <div className="space-y-6">
      {header(
        <ReportFilters
          sites={sites.map((s) => ({ value: s.site_id, label: s.name }))}
          categories={categories}
          filters={filters}
          onFilters={setFilters}
          period={draftPeriod}
          onPeriod={setPeriod}
          fyStartMonth={1}
          now={now}
          loading={isStaff && adminSites.isPending}
          supports={EDE_SUPPORTS}
          unsupportedHint={EDE_UNSUPPORTED_HINT}
        />,
      )}

      <p className="text-sm text-muted" aria-live="polite">
        Approved data for <span className="font-medium text-ink">{edePeriodLabel(period)}</span>
        {report.isFetching && !firstLoad && <span className="ml-2">· Updating…</span>}
      </p>

      {error ? (
        <EmptyState variant="error" title={error} action={<Button onClick={() => report.refetch()}>Try again</Button>} />
      ) : (
        <div aria-busy={stale} className={cn("space-y-6 transition-opacity", stale && "opacity-60")}>
          <KpiStrip items={kpis} loading={firstLoad} />
          {firstLoad || !data || !f || !grid ? (
            <div className="grid gap-6 xl:grid-cols-2">
              <SkeletonChart />
              <SkeletonChart />
            </div>
          ) : f.empty ? (
            <EmptyState
              icon={FileBarChart}
              title={`Nothing approved for ${edePeriodLabel(period)}.`}
              description="Try another period or widen the sites and categories."
              action={
                <Button onClick={() => setPeriod({ ...period, year: period.year - 1 })}>Try {edePeriodLabel({ ...period, year: period.year - 1 })}</Button>
              }
            />
          ) : (
            <>
              <SiteFootprint rows={data.bySite} colorIndex={colorIndex} />
              <MonthlyBySite months={grid.months} series={grid.series} colorIndex={colorIndex} />
              <div className="grid gap-6 xl:grid-cols-2">
                <SiteBars
                  title="Renewables produced"
                  unit="kWh"
                  subtitle="Activity data of renewable electricity rows."
                  rows={data.renewableKwhBySite.map((r) => ({
                    siteId: r.siteId,
                    siteName: r.siteName,
                    value: Number(r.kwh) || 0,
                  }))}
                  colorIndex={colorIndex}
                  format={(v) => `${formatNumber(v, 0)} kWh`}
                  emptyText="No renewable electricity recorded."
                  exportName="ede-renewables-produced"
                />
                <SiteBars
                  title="Emissions saved"
                  unit="tCO₂e"
                  subtitle="Avoided by renewables; not part of the scope totals."
                  rows={data.savedBySite.map((r) => ({
                    siteId: r.siteId,
                    siteName: r.siteName,
                    value: Number(r.saved) || 0,
                  }))}
                  colorIndex={colorIndex}
                  format={formatEmissions}
                  emptyText="No emissions saved by renewables."
                  exportName="ede-emissions-saved"
                />
              </div>
              <IntensityTrend data={data} period={period} sites={siteRefs} colorIndex={colorIndex} />
              <section aria-labelledby="ede-totals" className="space-y-2">
                <h2 id="ede-totals" className="text-sm font-semibold text-ink">
                  Overall totals
                </h2>
                <DataTable<TotalRow>
                  label="Overall totals"
                  rows={overallTotals(f)}
                  columns={TOTAL_COLUMNS}
                  getRowId={(r) => r.metric}
                  exportName="ede-overall-totals"
                />
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
