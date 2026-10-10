import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2 } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { feraCategoryIds } from "../../lib/emissions/pendingCount";
import { useFyStartMonth } from "../../lib/fiscalYear";
import {
  Button,
  Callout,
  ContextChips,
  EmptyState,
  type Kpi,
  KpiStrip,
  PageHeader,
  ScopeBar,
  cn,
  focusRing,
  formatNumber,
  periodLabel,
  periodRange,
  shiftPeriod,
  useContextParams,
} from "../../ui";
import { useIntensity, useOverview, usePendingEntries, usePendingProduction, useSubmission, useThreshold } from "./api";
import { AttentionList } from "./components/AttentionList";
import { CategoryBars } from "./components/CategoryBars";
import { LowerTabs } from "./components/LowerTabs";
import { SitesTable } from "./components/SitesTable";
import { SubmissionPanel } from "./components/SubmissionPanel";
import { TrendChart } from "./components/TrendChart";
import {
  PERIOD_KINDS,
  attentionItems,
  categoryBars,
  defaultPeriod,
  insightText,
  lastYearCaption,
  listLink,
  missingBySite,
  submissionMonths,
  supportedPeriod,
  thresholdAlerts,
  toOverviewPeriod,
  usersOnSites,
} from "./logic";

type SiteOption = { site_id: number; name: string; company?: { company_id: number; name: string }; categories?: { category_id: number; category_name: string }[] };

function useManagerSites(): SiteOption[] {
  const { user } = useAuth();
  return useMemo(() => {
    const list = (user?.sites as SiteOption[] | undefined) ?? [];
    return list.length > 0 ? list : user?.site ? [user.site as SiteOption] : [];
  }, [user]);
}

const LOAD_ERROR = "Couldn't load this panel.";

/**
 * P06 Overview (Manager home): how the sites are doing this period and what
 * needs the manager today. Figures come from B4 (approved entries only).
 */
export default function OverviewPage({ pcfKpi }: { pcfKpi?: Kpi | null } = {}) {
  const navigate = useNavigate();
  const sites = useManagerSites();
  const now = useMemo(() => new Date(), []);
  const fallback = useMemo(() => defaultPeriod(now), [now]);
  const [ctx] = useContextParams({ period: fallback });
  const period = supportedPeriod(ctx.period, now);
  const scopeSites = ctx.siteIds.length ? ctx.siteIds : sites.map((s) => s.site_id);
  const fyStartMonth = useFyStartMonth();
  const range = periodRange(period, fyStartMonth);

  const overview = useOverview(toOverviewPeriod(period), scopeSites, ctx.categoryId);
  // Threshold alerts compare a month or quarter with the one before.
  const comparable = period.kind === "month" || period.kind === "quarter";
  const previousPeriod = shiftPeriod(period, -1);
  const previous = useOverview(comparable ? toOverviewPeriod(previousPeriod) : null, scopeSites, ctx.categoryId);
  const intensity = useIntensity(scopeSites, range.from, range.to);
  const feraIds = useMemo(() => feraCategoryIds(sites.filter((s) => scopeSites.includes(s.site_id))), [sites, scopeSites]);
  const pendingEntries = usePendingEntries(scopeSites, feraIds);
  const pendingProduction = usePendingProduction(scopeSites);
  const companyId = sites[0]?.company?.company_id ?? null;
  const threshold = useThreshold(companyId);

  const data = overview.data;
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);
  const month = pickedMonth ?? data?.submission.month ?? null;
  const submission = useSubmission(month);
  const siteNames = ctx.siteIds.length ? sites.filter((s) => ctx.siteIds.includes(s.site_id)).map((s) => s.name) : null;

  const categories = useMemo(() => {
    const map = new Map<number, string>();
    for (const s of sites) if (!ctx.siteIds.length || ctx.siteIds.includes(s.site_id)) s.categories?.forEach((c) => map.set(c.category_id, c.category_name));
    return [...map].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [sites, ctx.siteIds]);

  const title = periodLabel(period, fyStartMonth);
  const chips = (
    <ContextChips
      chips={["site", "category", "period"]}
      sites={sites.map((s) => ({ value: s.site_id, label: s.name }))}
      categories={categories}
      periodKinds={PERIOD_KINDS}
      fyStartMonth={fyStartMonth}
      defaults={{ period: fallback }}
    />
  );

  if (sites.length === 0)
    return (
      <div className="space-y-6">
        <PageHeader title="Overview" />
        <EmptyState icon={Building2} title="You don't manage any sites yet." description="Ask your admin to assign one." />
      </div>
    );

  const links = {
    approvals: listLink("/data/approvals", { siteIds: ctx.siteIds }),
    approvalsInPeriod: listLink("/data/approvals", { siteIds: ctx.siteIds, categoryId: ctx.categoryId, period }),
    approved: listLink("/data/ledger", { siteIds: ctx.siteIds, categoryId: ctx.categoryId, period, status: "approved" }),
    site: (id: number) => listLink("/data/ledger", { siteIds: [id], categoryId: ctx.categoryId, period, status: "approved" }),
    category: (id: number) => listLink("/data/ledger", { siteIds: ctx.siteIds, categoryId: id, period, status: "approved" }),
    production: listLink("/data/production", { siteIds: ctx.siteIds, status: "pending" }),
  };

  const k = data?.kpis;
  const nothingApproved = !!k && k.approved_count === 0;
  const lyCaption = lastYearCaption(data?.last_year);
  const lyNet = lyCaption ? data?.last_year?.kpis.net : null;
  const err = (q: { isError: boolean }) => (q.isError ? LOAD_ERROR : null);
  const figure = (v: number | undefined) => (nothingApproved ? null : v);

  const kpis: Kpi[] = [
    {
      label: "Net emissions",
      value: figure(k?.net),
      format: "emissions",
      previous: lyNet,
      compareLabel: lyCaption ?? undefined,
      primary: true,
      hint: k && (
        <Link to={links.approved} className={cn("relative rounded underline-offset-2 hover:underline", focusRing)}>
          {k.approved_count} approved {k.approved_count === 1 ? "entry" : "entries"}
        </Link>
      ),
    },
    {
      label: "Intensity",
      value: intensity.data?.value ?? null,
      format: "number",
      decimals: 3,
      unit: intensity.data ? (intensity.data.combined ? "tCO₂e/unit, combined" : `tCO₂e/${intensity.data.unit}`) : undefined,
      hint:
        intensity.isSuccess && !intensity.data ? (
          <Link to="/data/production" className={cn("relative rounded underline-offset-2 hover:underline", focusRing)}>
            Add production data
          </Link>
        ) : intensity.isError ? (
          "Couldn't load intensity"
        ) : intensity.data?.otherUnits ? (
          `Products in ${intensity.data.otherUnits} other ${intensity.data.otherUnits === 1 ? "unit" : "units"} not included`
        ) : undefined,
    },
    { label: "Saved (renewables)", value: figure(k?.saved), format: "emissions" },
    {
      label: "Gross",
      value: figure(k?.gross),
      format: "emissions",
      hint: k && !nothingApproved && k.gross > 0 && (
        <span className="mt-1 block w-full basis-full">
          <ScopeBar hideLegend totals={{ scope1: k.scope_1, scope2: k.scope_2, scope3: k.scope_3 }} />
          <span className="mt-1 block font-num">
            S1 {formatNumber(k.scope_1)} · S2 {formatNumber(k.scope_2)} · S3 {formatNumber(k.scope_3)}
          </span>
        </span>
      ),
    },
    ...(pcfKpi ? [pcfKpi] : []),
  ];

  const alerts =
    comparable && data && previous.data && threshold.data !== undefined ? thresholdAlerts(data.by_category, previous.data.by_category, threshold.data) : [];
  const attention = attentionItems({
    pendingEntries: pendingEntries.data ?? null,
    pendingProduction: pendingProduction.data ?? null,
    missingPeople: data?.submission.missing ?? null,
    missingMonth: data?.submission.month ?? null,
    overThreshold: alerts,
    threshold: threshold.data ?? null,
    previousLabel: comparable ? periodLabel(previousPeriod, fyStartMonth) : null,
    links: { approvals: links.approvals, production: links.production, team: "#submission-status", category: links.category },
  });
  const insight = data ? insightText(data.by_category, data.kpis.gross) : null;

  return (
    <div className="space-y-6">
      <PageHeader title={title} context={chips} />

      <KpiStrip items={kpis} loading={overview.isPending} error={err(overview)} onRetry={() => overview.refetch()} />

      {nothingApproved && (
        <Callout
          tone="info"
          title={`Nothing approved for ${title} yet.`}
          action={
            k.pending_count > 0 ? (
              <Button size="sm" onClick={() => navigate(links.approvalsInPeriod)}>
                Review entries
              </Button>
            ) : undefined
          }
        >
          {k.pending_count > 0
            ? `${k.pending_count} ${k.pending_count === 1 ? "entry" : "entries"} from this period ${k.pending_count === 1 ? "is" : "are"} waiting for you.`
            : "No entries from this period are waiting for approval."}
        </Callout>
      )}

      {/* On phones "Needs your attention" comes straight after the figures. */}
      <div className="grid gap-6 lg:grid-cols-5 lg:grid-rows-[auto_1fr]">
        <AttentionList
          className="lg:col-span-2 lg:col-start-4 lg:row-start-1 lg:self-start"
          items={attention}
          loading={overview.isPending || pendingEntries.isPending}
          error={overview.isError || pendingEntries.isError ? LOAD_ERROR : null}
          onRetry={() => {
            overview.refetch();
            pendingEntries.refetch();
          }}
        />
        <div className="min-w-0 space-y-6 lg:col-span-3 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <TrendChart
            trend={data?.trend}
            yearlyTotal={data?.yearly_total ?? 0}
            loading={overview.isPending}
            error={err(overview)}
            onRetry={() => overview.refetch()}
          />
          <SitesTable
            sites={data?.by_site ?? []}
            missing={missingBySite(data?.submission.users ?? [])}
            loading={overview.isPending}
            error={err(overview)}
            onRetry={() => overview.refetch()}
            linkFor={links.site}
          />
          <CategoryBars
            bars={categoryBars(data?.by_category ?? [])}
            loading={overview.isPending}
            error={err(overview)}
            onRetry={() => overview.refetch()}
            linkFor={links.category}
          />
        </div>
        <div className="min-w-0 space-y-6 lg:col-span-2 lg:col-start-4 lg:row-start-2 lg:self-start">
          {insight && <Callout tone="brand" title="Largest source">{insight}</Callout>}
          {month && (
            <SubmissionPanel
              month={month}
              months={submissionMonths(now)}
              onMonthChange={setPickedMonth}
              users={submission.data && usersOnSites(submission.data, siteNames)}
              loading={submission.isPending}
              error={err(submission)}
              onRetry={() => submission.refetch()}
            />
          )}
        </div>
      </div>

      <LowerTabs overview={data} siteIds={scopeSites} categoryId={ctx.categoryId} now={now} />
    </div>
  );
}
