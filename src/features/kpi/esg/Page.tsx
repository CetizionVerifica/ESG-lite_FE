import { Link, useSearchParams } from "react-router-dom";
import { LayoutDashboard, Leaf } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { KPI_PILLARS, KPI_TOPICS, type KpiPillar, type KpiTopic } from "../../../lib/kpi/contracts";
import { KpiNotAvailable } from "../../../lib/kpi/KpiNotAvailable";
import { PILLAR_LABEL } from "../../../lib/kpi/labels";
import { pillarParam } from "../../../lib/kpi/pillars";
import { canReviewKpis, isKpiTrackingOff } from "../../../lib/kpi/switch";
import { Button, Callout, EmptyState, PageHeader, Select, Skeleton, cn, focusRing, panel } from "../../../ui";
import { useKpiLookup } from "../components/lookup";
import { PillarBadge } from "../components/PillarBadge";
import { kpiErrorMessage, useEsg } from "./api";
import { Movers } from "./components/Movers";
import { PillarCards } from "./components/PillarCards";
import { SitesHeat } from "./components/SitesHeat";
import { TopicCoverage } from "./components/TopicCoverage";
import { TopicDrawer } from "./components/TopicDrawer";
import { TrendChart } from "./components/TrendChart";
import { filterNote, noHeadlinesText, pillarsShown, trendsByPillar } from "./logic";

const linkButton = cn("inline-flex h-9 items-center gap-2 rounded-control border border-line bg-panel px-3.5 text-sm font-medium text-ink hover:bg-tint", focusRing);
const chip = (on: boolean) =>
  cn("inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors", on ? "border-brand bg-tint text-ink" : "border-line bg-panel text-muted hover:bg-tint hover:text-ink", focusRing);

/** Years to pick: from the year KPI tracking started (or one back) to this one, newest first. */
function yearOptions(firstYear: number | null | undefined, thisYear: number): number[] {
  const out: number[] = [];
  for (let y = thisYear; y >= Math.min(firstYear ?? thisYear, thisYear) - 1; y -= 1) out.push(y);
  return out;
}

/**
 * Wave E `/kpi/esg` · The ESG dashboard for managers (plans/kpi/wave-e.md):
 * a card per pillar (click to filter the page), coverage by topic (click a
 * topic for its KPIs), headline trends per pillar, sites × pillars, the
 * biggest changes and what's still waiting for review. Every filter is in the
 * URL (`?year=&site=&pillar=&topic=`); every figure is the server's.
 */
export default function EsgPage() {
  const { role } = useAuth();
  const [params, setParams] = useSearchParams();
  const { lookup } = useKpiLookup();
  const thisYear = new Date().getFullYear();
  const year = Number(params.get("year")) || thisYear;
  const site = Number(params.get("site")) || null;
  const pillar = pillarParam(params.get("pillar"));
  const topicParam = params.get("topic");
  const topic = (KPI_TOPICS as readonly string[]).includes(topicParam ?? "") ? (topicParam as KpiTopic) : null;
  const esg = useEsg(year, site, pillar);

  const setFilters = (patch: Record<string, string | null>) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v);
          else next.delete(k); // data-loss-reviewed: URL param, not a record
        }
        return next;
      },
      { replace: true },
    );
  const togglePillar = (p: KpiPillar) => setFilters({ pillar: pillar === p ? null : p });

  if (esg.error && isKpiTrackingOff(esg.error))
    return (
      <div className="space-y-6 py-6">
        <PageHeader title="ESG dashboard" />
        <KpiNotAvailable />
      </div>
    );

  const data = esg.data;
  const yearType = data?.year_type ?? lookup.yearType;
  const vsLabel = yearType === "FY" ? `FY ${year - 1}` : String(year - 1);
  const siteLabel = site ? lookup.siteName(site) : lookup.sites.length ? `all ${lookup.sites.length} sites` : "all sites";
  const pending = data?.pending_not_in.count ?? 0;
  const nothingChosen = !!data && data.pillars.every((p) => p.kpis === 0);
  const note = filterNote(pillar);
  const groups = data ? trendsByPillar(data.trends, pillar) : [];

  return (
    <div className="space-y-6 py-6">
      <PageHeader
        title="ESG dashboard"
        description={`${data?.label ?? year} · ${siteLabel} · Environment, Social and Governance at a glance. Approved values only.`}
        context={
          <div className="flex flex-wrap items-end gap-3">
            <Select<number>
              label="Year"
              value={year}
              onChange={(y) => setFilters({ year: y && y !== thisYear ? String(y) : null })}
              options={yearOptions(lookup.setup?.settings.first_year, thisYear).map((y) => ({ value: y, label: yearType === "FY" ? `FY ${y}` : String(y) }))}
              className="w-28"
            />
            <Select<number> label="Site" value={site} onChange={(s) => setFilters({ site: s ? String(s) : null })} options={lookup.sites.map((s) => ({ value: s.site_id, label: s.name }))} placeholder="All sites" className="w-44" />
            <div role="group" aria-label="Pillar" className="flex flex-wrap gap-1.5" data-testid="esg-pillar-chips">
              <button type="button" aria-pressed={!pillar} onClick={() => setFilters({ pillar: null })} className={chip(!pillar)}>
                All
              </button>
              {KPI_PILLARS.map((p) => (
                <button key={p} type="button" aria-pressed={pillar === p} onClick={() => togglePillar(p)} className={chip(pillar === p)} aria-label={PILLAR_LABEL[p]}>
                  <PillarBadge pillar={p} className="border-0 bg-transparent px-0" />
                  <span aria-hidden className="hidden sm:inline">
                    {PILLAR_LABEL[p]}
                  </span>
                </button>
              ))}
            </div>
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Link to={`/kpi/dashboard${year !== thisYear ? `?year=${year}` : ""}`} className={linkButton}>
          <LayoutDashboard aria-hidden className="size-4" />
          KPI dashboard
        </Link>
        {note && (
          <p className="flex items-center gap-2 text-sm text-muted" role="status" data-testid="esg-filter-note">
            {note}
            <button type="button" onClick={() => setFilters({ pillar: null })} className={cn("font-medium text-brand-text underline", focusRing)}>
              Show all pillars
            </button>
          </p>
        )}
      </div>

      {esg.isPending ? (
        <div className="space-y-4" aria-busy data-testid="esg-loading">
          <div className="grid gap-3 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[104px] rounded-card" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-72 rounded-card" />
            <Skeleton className="h-72 rounded-card" />
          </div>
        </div>
      ) : esg.error || !data ? (
        <section className={panel}>
          <EmptyState variant="error" title={kpiErrorMessage(esg.error, "Couldn't load the ESG dashboard.")} description="Check your connection and try again." action={<Button onClick={() => void esg.refetch()}>Try again</Button>} />
        </section>
      ) : nothingChosen ? (
        <section className={panel}>
          <EmptyState
            icon={Leaf}
            title="No KPIs to show yet."
            description={site ? "This site has no KPIs to enter. Pick another site or all sites." : "Once KPIs are chosen in KPI setup and values are approved, Environment, Social and Governance show here."}
            action={
              site ? (
                <Button variant="secondary" onClick={() => setFilters({ site: null })}>
                  Show all sites
                </Button>
              ) : role === "Admin" || role === "Superadmin" ? (
                <Link to="/kpi/setup" className={linkButton}>
                  Open KPI setup
                </Link>
              ) : undefined
            }
          />
        </section>
      ) : (
        <div className={cn("space-y-6", esg.isPlaceholderData && "opacity-60 transition-opacity")} aria-busy={esg.isFetching || undefined}>
          {pending > 0 && (
            <Callout
              tone="info"
              title={`${pending} ${pending === 1 ? "value" : "values"} pending review ${pending === 1 ? "isn't" : "aren't"} in these figures.`}
              action={
                canReviewKpis(role) ? (
                  <Link to={data.pending_not_in.link ?? "/data/approvals?view=kpi"} className={cn("text-sm font-medium text-brand-text underline", focusRing)}>
                    Review them
                  </Link>
                ) : undefined
              }
            >
              The dashboard counts approved values only. They're added once a manager approves them.
            </Callout>
          )}

          <PillarCards pillars={data.pillars} active={pillar} onToggle={togglePillar} />

          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
            <TopicCoverage pillars={pillarsShown(data.pillars, pillar)} onOpen={(t) => setFilters({ topic: t })} />
            <div className="space-y-4">
              <SitesHeat sites={data.sites} site={site} pillar={pillar} onPick={(s, p) => setFilters({ site: String(s), pillar: p })} />
              <Movers movers={data.movers.filter((m) => !pillar || m.pillar === pillar)} vsLabel={vsLabel} />
            </div>
          </div>

          <section aria-labelledby="esg-trends-title" className="space-y-3">
            <div className="space-y-0.5">
              <h2 id="esg-trends-title" className="text-base font-semibold text-ink">
                Headline trends
              </h2>
              <p className="text-sm text-muted">The key KPIs of each pillar over the year (or the last five years for yearly KPIs). Hover a line for each value.</p>
            </div>
            {groups.map((g) => (
                <div key={g.pillar} role="group" aria-labelledby={`esg-trends-${g.pillar}`} className="space-y-2" data-testid="esg-trend-group">
                  <h3 id={`esg-trends-${g.pillar}`} className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                    <PillarBadge pillar={g.pillar} />
                    {g.label}
                  </h3>
                  {g.trends.length === 0 ? (
                    <div className={panel} data-testid="esg-trend-empty">
                      <EmptyState compact title={noHeadlinesText(g.pillar)} description="Headlines show here once the company tracks this pillar's key KPIs and values are approved." />
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {g.trends.map((t) => (
                        <TrendChart key={t.code || t.kpi_definition_id} trend={t} vsLabel={vsLabel} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
          </section>
        </div>
      )}

      <TopicDrawer
        topic={data ? topic : null}
        year={year}
        yearType={yearType}
        site={site}
        pillars={data?.pillars ?? []}
        trends={data?.trends ?? []}
        selected={lookup.selected}
        canReview={canReviewKpis(role)}
        vsLabel={vsLabel}
        onClose={() => setFilters({ topic: null })}
      />
    </div>
  );
}
