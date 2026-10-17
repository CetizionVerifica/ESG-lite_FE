import { Link, useSearchParams } from "react-router-dom";
import { BarChart3, FileSpreadsheet, Target } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { FRAMEWORK_CODES, type FrameworkCode, KPI_TOPICS, type KpiTopic } from "../../../lib/kpi/contracts";
import { KpiNotAvailable } from "../../../lib/kpi/KpiNotAvailable";
import { TOPIC_LABEL } from "../../../lib/kpi/labels";
import { isKpiTrackingOff } from "../../../lib/kpi/switch";
import { Button, Callout, EmptyState, PageHeader, Select, Skeleton, cn, focusRing, panel } from "../../../ui";
import { useKpiLookup } from "../components/lookup";
import { RefreshFromDataButton } from "../components/RefreshFromDataButton";
import { kpiErrorMessage, useDashboard, useTargetsList } from "./api";
import { CoverageRings } from "./components/CoverageRings";
import { GapsList } from "./components/GapsList";
import { KpiCard } from "./components/KpiCard";
import { cardsByTopic, gapsFor, yearOptions } from "./logic";

const linkButton = cn("inline-flex h-9 items-center gap-2 rounded-control border border-line bg-panel px-3.5 text-sm font-medium text-ink hover:bg-tint", focusRing);

/**
 * KPI-10 `/kpi/dashboard` (05-ux S5): a ring per framework (click to filter
 * the gaps), KPI cards by topic with trend and target, and what's missing
 * with who owes it. Filters live in the URL (`?year=&site=&topic=&fw=`).
 */
export default function DashboardPage() {
  const { role } = useAuth();
  const [params, setParams] = useSearchParams();
  const { lookup } = useKpiLookup();
  const thisYear = new Date().getFullYear();
  const year = Number(params.get("year")) || thisYear;
  const site = Number(params.get("site")) || null;
  const topicParam = params.get("topic");
  const topic = (KPI_TOPICS as readonly string[]).includes(topicParam ?? "") ? (topicParam as KpiTopic) : null;
  const fwParam = params.get("fw")?.toUpperCase();
  const framework = (FRAMEWORK_CODES as readonly string[]).includes(fwParam ?? "") ? (fwParam as FrameworkCode) : null;
  const dash = useDashboard(year, site, topic);
  const targets = useTargetsList();

  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value) next.set(key, value);
        else next.delete(key); // data-loss-reviewed: URL param, not a record
        return next;
      },
      { replace: true },
    );

  if (dash.error && isKpiTrackingOff(dash.error)) return (
      <div className="space-y-6 py-6">
        <PageHeader title="KPIs" />
        <KpiNotAvailable />
      </div>
    );

  const data = dash.data;
  const siteLabel = site ? lookup.siteName(site) : lookup.sites.length ? `All ${lookup.sites.length} sites` : "All sites";
  const gaps = data ? gapsFor(data.gaps, framework, lookup.frameworksOf) : [];
  const topics = [...new Set(lookup.selected.map((d) => d.topic))].sort((a, b) => TOPIC_LABEL[a].localeCompare(TOPIC_LABEL[b]));
  const targetFor = (kpiId: number) => (targets.data ?? []).find((t) => t.kpi_definition_id === kpiId && t.site_id === site) ?? null;
  const pending = data?.pending_not_in.count ?? 0;

  return (
    <div className="space-y-6 py-6">
      <PageHeader
        title="KPIs"
        description={`${year} · ${siteLabel.toLowerCase().startsWith("all") ? siteLabel.toLowerCase() : siteLabel} · readiness by framework`}
        context={
          <div className="flex flex-wrap items-end gap-3">
            <Select<number> label="Year" value={year} onChange={(y) => setParam("year", y && y !== thisYear ? String(y) : null)} options={yearOptions(lookup.setup?.settings.first_year, thisYear).map((y) => ({ value: y, label: String(y) }))} className="w-28" />
            <Select<number> label="Site" value={site} onChange={(s) => setParam("site", s ? String(s) : null)} options={lookup.sites.map((s) => ({ value: s.site_id, label: s.name }))} placeholder="All sites" className="w-44" />
            <Select<KpiTopic> label="Topic" value={topic} onChange={(t) => setParam("topic", t)} options={topics.map((t) => ({ value: t, label: TOPIC_LABEL[t] }))} placeholder="All topics" className="w-44" />
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <RefreshFromDataButton year={year} />
        <Link to="/kpi/targets" className={linkButton}>
          <Target aria-hidden className="size-4" />
          Targets
        </Link>
        <Link to={`/reports/kpi/${framework ?? lookup.frameworks[0] ?? "GRI"}${year !== thisYear ? `?year=${year}` : ""}`} className={linkButton}>
          <FileSpreadsheet aria-hidden className="size-4" />
          Framework reports
        </Link>
      </div>

      {dash.isPending ? (
        <div className="space-y-4" aria-busy>
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[90px] rounded-card" />
            ))}
          </div>
          <Skeleton className="h-72 w-full rounded-card" />
        </div>
      ) : dash.error || !data ? (
        <section className={panel}>
          <EmptyState variant="error" title={kpiErrorMessage(dash.error, "Couldn't load the KPI dashboard.")} action={<Button onClick={() => void dash.refetch()}>Try again</Button>} />
        </section>
      ) : (
        <div className={cn("space-y-6", dash.isPlaceholderData && "opacity-60 transition-opacity")} aria-busy={dash.isFetching || undefined}>
          {pending > 0 && (
            <Callout
              tone="info"
              title={`${pending} ${pending === 1 ? "value" : "values"} pending review ${pending === 1 ? "isn't" : "aren't"} counted yet.`}
              action={
                role === "Manager" ? (
                  <Link to="/data/approvals?view=kpi" className={cn("text-sm font-medium text-brand-text underline", focusRing)}>
                    Review them
                  </Link>
                ) : undefined
              }
            >
              Only approved values count towards readiness and the figures below.
            </Callout>
          )}

          {data.coverage.length ? (
            <CoverageRings coverage={data.coverage} active={framework} onToggle={(f) => setParam("fw", framework === f ? null : f)} />
          ) : (
            <section className={panel}>
              <EmptyState icon={BarChart3} compact title="No frameworks chosen yet." description="Your admin picks GRI, BRSR or ESRS in KPI setup." />
            </section>
          )}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
            <div className="space-y-4">
              {data.cards.length === 0 ? (
                <section className={panel}>
                  <EmptyState compact title={topic ? `No ${TOPIC_LABEL[topic].toLowerCase()} KPIs with values for ${year}.` : `No approved KPI values for ${year} yet.`} />
                </section>
              ) : (
                <section aria-label="KPIs by topic" className="grid gap-3 sm:grid-cols-2">
                  {cardsByTopic(data.cards).flatMap((g) => g.cards.map((c) => <KpiCard key={c.kpi_definition_id} card={c} year={year} topic={g.label} target={targetFor(c.kpi_definition_id)} />))}
                </section>
              )}
            </div>
            <div className="self-start">
              <GapsList gaps={gaps} framework={framework} siteName={lookup.siteName} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
