import { type ReactNode, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Download, FileBarChart, FileSpreadsheet, LayoutTemplate } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useClientContext } from "../../lib/clientContext";
import { useDesignStudio } from "../../lib/studio/switch"; // DS-5
import { designThisReportLink } from "../../lib/studio/designLink"; // DS-5
import {
  Button,
  Callout,
  cn,
  EmptyState,
  type Kpi,
  KpiStrip,
  PageHeader,
  SkeletonChart,
  TabPanel,
  Tabs,
  formatEmissions,
  previousReportPeriod,
  reportPeriodLabel,
  useFilterParams,
  useToast,
} from "../../ui";
import {
  downloadWorkbook,
  fetchReportDetails,
  fetchScope3BaseYear, // S3-14
  fetchScope3Report,
  useAdminSites,
  useBrandedPdf,
  useDebounced,
  useFyStartMonth,
  useReportDetails,
  useReportTables,
  useScope3Report,
  useScope3BaseYear,
} from "./api";
import { AboutPanel } from "./components/AboutPanel";
import { FindingsTab } from "./components/FindingsTab";
import { CategoryTable } from "./components/CategoryTable";
import { LocationTab } from "./components/LocationTab";
import { MethodologySection } from "./components/MethodologySection";
import { BaseYearBlock } from "./components/BaseYearBlock"; // S3-14
import { hasScope3 } from "../../lib/scope3/report";
import { ReportFilters } from "./components/ReportFilters";
import { ScopeChart } from "./components/ScopeChart";
import { Scope3Tab } from "./components/Scope3Tab";
import { ScopeTab } from "./components/ScopeTab";
import { ScopeTable } from "./components/ScopeTable";
import {
  type ReportQuery,
  type ScopeName,
  type SiteOption,
  categoryOptions,
  clientSites,
  exportSheets,
  fileStem,
  findings,
  locationRows,
  readPeriod,
  recommendedActions,
  reportFigures,
  scopeDetails,
  scopeDistribution,
  serverMessage,
  shortPeriodLabel,
  topCategories,
  withoutKeys,
  writePeriod,
  requestPayload,
} from "./logic";

type Tab = "summary" | "location" | "scope1" | "scope2" | "scope3" | "methodology" | "findings";
const TABS: { value: Tab; label: string }[] = [
  { value: "summary", label: "Summary" },
  { value: "location", label: "By location" },
  { value: "scope1", label: "Scope 1" },
  { value: "scope2", label: "Scope 2" },
  { value: "scope3", label: "Scope 3" },
  { value: "methodology", label: "Methodology" },
  { value: "findings", label: "Findings" },
];
const SCOPE_TABS: { tab: Tab; scope: ScopeName }[] = [
  { tab: "scope1", scope: "Scope 1" },
  { tab: "scope2", scope: "Scope 2" },
  { tab: "scope3", scope: "Scope 3" },
];
const isTab = (v: string | null): v is Tab => TABS.some((t) => t.value === v);

function useManagerSites(): SiteOption[] {
  const { user } = useAuth();
  return useMemo(() => {
    const list = (user?.sites as SiteOption[] | undefined) ?? [];
    return list.length > 0 ? list : user?.site ? [user.site as SiteOption] : [];
  }, [user]);
}

const numbers = (values: string[] | undefined) =>
  (values ?? []).map(Number).filter((n) => Number.isInteger(n));

/**
 * P10 GHG report: this period against the same period last year, on one live
 * page. Filters live in the URL; results update in place (400ms debounce).
 */
export default function GhgReportPage() {
  const { role } = useAuth();
  const isStaff = role === "Superadmin";
  const { clientId } = useClientContext();
  const managerSites = useManagerSites();
  const adminSites = useAdminSites(isStaff);
  const sites = useMemo(
    () =>
      isStaff ? clientSites(adminSites.data ?? [], clientId) : managerSites,
    [isStaff, adminSites.data, clientId, managerSites],
  );

  const calendarFy = useFyStartMonth();
  const now = useMemo(() => new Date(), []);
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useFilterParams(["site", "category"]);

  // Results carry the FY start the server used; prefer it once it's known.
  const draftPeriod = readPeriod(params, now, calendarFy);
  const pickedSites = numbers(filters.filters.site).filter((id) =>
    sites.some((s) => s.site_id === id),
  );
  const siteIds = pickedSites.length
    ? pickedSites
    : sites.map((s) => s.site_id);
  const categories = categoryOptions(sites, pickedSites);
  const categoryIds = numbers(filters.filters.category).filter((id) =>
    categories.some((c) => c.value === id),
  );

  const draft: ReportQuery = { siteIds, categoryIds, period: draftPeriod };
  const settledKey = useDebounced(JSON.stringify(draft), 400);
  const query = useMemo(
    () => JSON.parse(settledKey) as ReportQuery,
    [settledKey],
  );
  const tables = useReportTables(sites.length ? query : null);
  const data = tables.data;
  const fy = data?.filters.fiscalYearStartMonth ?? calendarFy;

  // Labels and coverage follow the query behind the numbers on screen, which
  // lags the filters while a new period loads.
  const shown = data?.query ?? query;
  const stale = tables.isPlaceholderData;
  const period = shown.period;
  const prev = previousReportPeriod(period);
  const selLabel = shortPeriodLabel(period, fy);
  const prevLabel = shortPeriodLabel(prev, fy);
  const askedSites = useMemo(
    () => sites.filter((s) => shown.siteIds.includes(s.site_id)),
    [sites, shown.siteIds],
  );
  const figures = useMemo(
    () => (data ? reportFigures(data, askedSites) : null),
    [data, askedSites],
  );

  const tabParam = params.get("tab");
  const tab: Tab = isTab(tabParam) ? tabParam : "summary";
  // Detail rows are only needed on the Scope tabs; fetched the first time one opens.
  const details = useReportDetails(
    sites.length ? query : null,
    tab.startsWith("scope"),
  );
  // S3-13: Scope 3 by GHG category, for the Scope 3 and Methodology tabs.
  const scope3 = useScope3Report(
    sites.length ? query : null,
    tab === "scope3" || tab === "methodology",
  );
  // S3-14: the company's Scope 3 base year for the Methodology tab (company from the Scope 3 report for a Superadmin).
  const baseYearCompany = isStaff ? (scope3.data?.company_id ?? null) : null;
  const baseYearEnabled = tab === "methodology" && (!isStaff || baseYearCompany !== null);
  const baseYear = useScope3BaseYear(baseYearCompany, baseYearEnabled);
  // Staff wait for the Scope 3 report to name the company; until then the block is loading, not "none set".
  const baseYearLoading = baseYearEnabled ? baseYear.isPending : tab === "methodology" && isStaff && !scope3.isError;
  // SBTi 40 % rule: Scope 3 and the total from the same filters; off while a category filter narrows the report.
  const sameQuery = JSON.stringify(requestPayload(shown)) === JSON.stringify(requestPayload(query));
  const sbtiTotal = query.categoryIds.length || !sameQuery ? 0 : (figures?.selected.total ?? 0);
  const scope3Error = scope3.isError
    ? serverMessage(scope3.error, "Couldn't load Scope 3 by category.")
    : null;
  const locations = useMemo(
    () => (data ? locationRows(data, askedSites) : []),
    [data, askedSites],
  );
  const setTab = (t: Tab) =>
    setParams(
      (p) => {
        const next = withoutKeys(p, ["tab"]);
        if (t !== "summary") next.set("tab", t);
        return next;
      },
      { replace: true },
    );
  const setPeriod = (p: typeof period) =>
    setParams((cur) => writePeriod(cur, p), { replace: true });

  const { toast } = useToast();
  const pdf = useBrandedPdf();
  const stem = fileStem(reportPeriodLabel(period, fy));
  const downloadPdf = () => {
    toast({
      title: "Generating the branded PDF",
      description: "This can take up to a minute; it downloads when ready.",
    });
    pdf.mutate(
      { query, fileStem: stem },
      {
        onSuccess: () =>
          toast({ title: "Branded PDF downloaded", tone: "good" }),
        onError: (e) =>
          toast({
            title: "Couldn't create the PDF",
            description: serverMessage(e, "Please try again."),
            tone: "bad",
          }),
      },
    );
  };
  const queryClient = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const exportTables = async () => {
    if (!data || !figures) return;
    setExporting(true);
    try {
      // Fetched for the query behind the figures, so every sheet describes the same period.
      // The Scope 3 sheets are extra: if they can't load, the existing sheets still export.
      const [detailRows, scope3Report] = await Promise.all([
        fetchReportDetails(queryClient, shown).then((d) => d.rows),
        fetchScope3Report(queryClient, shown).catch(() => null),
      ]);
      // S3-14: the base year for the methodology sheet (a Superadmin's client comes from the report).
      const baseYearData =
        scope3Report && hasScope3(scope3Report)
          ? await fetchScope3BaseYear(queryClient, isStaff ? scope3Report.company_id : null).catch(() => "error" as const)
          : null;
      if (!scope3Report)
        toast({ title: "Scope 3 sheets left out", description: "Scope 3 by category couldn't load; the other sheets are in the file.", tone: "neutral" });
      const sheets = exportSheets({
        figures,
        categories: topCategories(data, Number.POSITIVE_INFINITY),
        locations,
        details: detailRows,
        findings: findings(
          figures,
          locations,
          reportPeriodLabel(period, fy),
          reportPeriodLabel(prev, fy),
        ),
        actions: recommendedActions(figures),
        prevLabel,
        selLabel,
        scope3: scope3Report ?? undefined,
        baseYear: baseYearData,
      });
      await downloadWorkbook(sheets, stem);
    } catch (e) {
      toast({
        title: "Couldn't export the tables",
        description: serverMessage(e, "Please try again."),
        tone: "bad",
      });
    } finally {
      setExporting(false);
    }
  };
  const ready = !!figures && !figures.empty && !tables.isFetching;
  // DS-5: "Design this report" opens the Design Studio's new-design flow with these filters, when the studio is on.
  const studio = useDesignStudio();
  const navigate = useNavigate();
  const designAction = studio.kinds.ghg
    ? [{ label: "Design this report", onClick: () => navigate(designThisReportLink({ year: period.year, yearType: period.yearType, compareYear: prev.year, siteIds: pickedSites })), icon: <LayoutTemplate aria-hidden className="size-4" /> }]
    : [];

  const header = (context?: ReactNode, actions = false) => (
    <PageHeader
      title="GHG report"
      context={context}
      primaryAction={
        actions
          ? {
              label: "Download branded PDF",
              onClick: downloadPdf,
              loading: pdf.isPending,
              disabled: !ready,
              icon: <Download aria-hidden className="size-4" />,
            }
          : undefined
      }
      secondaryActions={
        actions
          ? [
              {
                label: "Export tables",
                onClick: () => void exportTables(),
                disabled: !ready || exporting,
                icon: <FileSpreadsheet aria-hidden className="size-4" />,
              },
              ...designAction, // DS-5
            ]
          : []
      }
    />
  );

  if (isStaff && clientId === null)
    return (
      <div className="space-y-6">
        {header()}
        <Callout tone="warn" title="Pick a client first">
          Choose a client with the switcher at the top; the report covers that
          client's sites.
        </Callout>
      </div>
    );

  if (isStaff && adminSites.isError)
    return (
      <div className="space-y-6">
        {header()}
        <EmptyState
          variant="error"
          title="Couldn't load this client's sites."
          action={
            <Button onClick={() => adminSites.refetch()}>Try again</Button>
          }
        />
      </div>
    );

  if (sites.length === 0 && !(isStaff && adminSites.isPending))
    return (
      <div className="space-y-6">
        {header()}
        <Callout
          tone="warn"
          title={
            isStaff
              ? "This client has no sites yet"
              : "You don't have any sites yet"
          }
        >
          {isStaff
            ? "Add a site for this client, then come back to report on it."
            : "Ask your admin to assign a site to you, then come back to report on it."}
        </Callout>
      </div>
    );

  const k = figures;
  const kpis: Kpi[] = [
    {
      label: "Total emissions",
      value: k?.selected.total,
      format: "emissions",
      previous: k?.previous.total,
      compareLabel: `vs ${prevLabel}`,
      primary: true,
      hint:
        k && k.renewable > 0
          ? `Saved ${formatEmissions(k.renewable)} from renewables`
          : undefined,
    },
    {
      label: "Scope 1",
      value: k?.selected["Scope 1"],
      format: "emissions",
      previous: k?.previous["Scope 1"],
    },
    {
      label: "Scope 2",
      value: k?.selected["Scope 2"],
      format: "emissions",
      previous: k?.previous["Scope 2"],
    },
    {
      label: "Scope 3",
      value: k?.selected["Scope 3"],
      format: "emissions",
      previous: k?.previous["Scope 3"],
    },
    {
      label: "Data coverage",
      value: k?.coverage.percent,
      format: "percent",
      decimals: 0,
      hint:
        k &&
        `${k.coverage.withData} of ${k.coverage.selected} ${k.coverage.selected === 1 ? "site" : "sites"}`,
    },
    {
      label: "Largest source",
      value: k?.largestSource?.share ?? null,
      format: "percent",
      decimals: 0,
      hint: k?.largestSource?.name ?? (k ? "No Scope 1–3 data" : undefined),
    },
  ];

  const error = tables.isError
    ? serverMessage(tables.error, "Couldn't load the report.")
    : null;
  const firstLoad = tables.isPending || (isStaff && adminSites.isPending);

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
          fyStartMonth={fy}
          now={now}
          loading={isStaff && adminSites.isPending}
        />,
        true,
      )}

      <AboutPanel />

      <p className="text-sm text-muted" aria-live="polite">
        Comparing{" "}
        <span className="font-medium text-ink">
          {reportPeriodLabel(period, fy)}
        </span>{" "}
        with{" "}
        <span className="font-medium text-ink">
          {reportPeriodLabel(prev, fy)}
        </span>
        {tables.isFetching && !firstLoad && (
          <span className="ml-2">· Updating…</span>
        )}
      </p>

      {error ? (
        <EmptyState
          variant="error"
          title={error}
          action={<Button onClick={() => tables.refetch()}>Try again</Button>}
        />
      ) : (
        <div
          aria-busy={stale}
          className={cn("space-y-6 transition-opacity", stale && "opacity-60")}
        >
          <KpiStrip items={kpis} loading={firstLoad} />
          {k && !stale && k.coverage.missing.length > 0 && (
            <Callout
              tone="warn"
              title={`${k.coverage.missing.length} of ${k.coverage.selected} sites have no data for ${selLabel}`}
            >
              {k.coverage.missing.join(", ")}. Their emissions aren't in these
              totals.
            </Callout>
          )}
          {firstLoad || !data || !k ? (
            <SkeletonChart />
          ) : k.empty ? (
            <EmptyState
              icon={FileBarChart}
              title={`Nothing recorded for ${reportPeriodLabel(period, fy)}.`}
              description="Try another period or widen the sites and categories."
              action={
                <Button onClick={() => setPeriod(prev)}>
                  Try {reportPeriodLabel(prev, fy)}
                </Button>
              }
            />
          ) : (
            <div className="space-y-4">
              <Tabs<Tab>
                label="Report sections"
                idBase="ghg"
                items={TABS}
                value={tab}
                onChange={setTab}
              />
              <TabPanel<Tab>
                idBase="ghg"
                value="summary"
                current={tab}
                className="space-y-6"
              >
                <ScopeChart
                  figures={k}
                  prevLabel={prevLabel}
                  selLabel={selLabel}
                />
                <ScopeTable
                  figures={k}
                  prevLabel={prevLabel}
                  selLabel={selLabel}
                />
                <CategoryTable
                  rows={topCategories(data)}
                  prevLabel={prevLabel}
                  selLabel={selLabel}
                />
              </TabPanel>
              <TabPanel<Tab> idBase="ghg" value="location" current={tab}>
                <LocationTab
                  rows={locations}
                  prevLabel={prevLabel}
                  selLabel={selLabel}
                />
              </TabPanel>
              {SCOPE_TABS.map(({ tab: value, scope }) => (
                <TabPanel<Tab>
                  key={value}
                  idBase="ghg"
                  value={value}
                  current={tab}
                >
                  {scope === "Scope 3" && (
                    <div
                      aria-busy={scope3.isPlaceholderData}
                      className={cn(
                        "mb-8 transition-opacity",
                        scope3.isPlaceholderData && "opacity-60",
                      )}
                    >
                      <Scope3Tab
                        report={scope3.data}
                        loading={scope3.isPending}
                        error={scope3Error}
                        onRetry={() => scope3.refetch()}
                        grandTotal={sbtiTotal}
                      />
                      <h3 className="mt-8 text-sm font-semibold text-ink">
                        Scope 3 entries by category and site
                      </h3>
                    </div>
                  )}
                  <div
                    aria-busy={details.isPlaceholderData}
                    className={cn(
                      "transition-opacity",
                      details.isPlaceholderData && "opacity-60",
                    )}
                  >
                    <ScopeTab
                      scope={scope}
                      rows={scopeDetails(details.data?.rows ?? [], scope)}
                      distribution={scopeDistribution(
                        details.data?.rows ?? [],
                        scope,
                      )}
                      prevLabel={prevLabel}
                      selLabel={selLabel}
                      loading={details.isPending}
                      error={
                        details.isError
                          ? serverMessage(
                              details.error,
                              "Couldn't load the detail rows.",
                            )
                          : null
                      }
                      onRetry={() => details.refetch()}
                    />
                  </div>
                </TabPanel>
              ))}
              <TabPanel<Tab> idBase="ghg" value="methodology" current={tab}>
                <div
                  aria-busy={scope3.isPlaceholderData}
                  className={cn(
                    "transition-opacity",
                    scope3.isPlaceholderData && "opacity-60",
                  )}
                >
                  <MethodologySection
                    report={scope3.data}
                    loading={scope3.isPending}
                    error={scope3Error}
                    onRetry={() => scope3.refetch()}
                    baseYear={
                      <BaseYearBlock
                        data={baseYear.data}
                        loading={baseYearLoading}
                        error={baseYear.isError ? serverMessage(baseYear.error, "Couldn't load the Scope 3 base year.") : null}
                        onRetry={() => void baseYear.refetch()}
                        report={scope3.data}
                      />
                    }
                  />
                </div>
              </TabPanel>
              <TabPanel<Tab> idBase="ghg" value="findings" current={tab}>
                <FindingsTab
                  findings={findings(
                    k,
                    locations,
                    reportPeriodLabel(period, fy),
                    reportPeriodLabel(prev, fy),
                  )}
                  actions={recommendedActions(k)}
                />
              </TabPanel>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
