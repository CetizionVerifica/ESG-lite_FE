import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, UserRoundX } from "lucide-react";
import {
  Button,
  EmptyState,
  Loading,
  PageHeader,
  Select,
  Skeleton,
  formatMonth,
  parsePeriod,
  serializePeriod,
  useContextParams,
} from "../../ui";
import { useMyMonth } from "./api";
import { AtAGlance } from "./components/AtAGlance";
import { Checklist } from "./components/Checklist";
import { DueBanner } from "./components/DueBanner";
import { SentBackPanel } from "./components/SentBackPanel";
import { dueState, glance, hasNoAssignments, isoDay, monthTitle, progress, sentBack, shiftMonth } from "./logic";

function serverMessage(e: unknown): string {
  const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof msg === "string" && msg ? msg : "Your month couldn't be loaded.";
}

function PageSkeleton() {
  return (
    <Loading label="Loading your month" className="space-y-4">
      <Skeleton className="h-20 w-full" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </Loading>
  );
}

/** P02 · My month: what the contributor owes this month, what was sent back, and how long they have. */
export default function MyMonthPage() {
  const navigate = useNavigate();
  const [ctx, update] = useContextParams();
  const requested = ctx.period?.kind === "month" ? serializePeriod(ctx.period) : null;
  const query = useMyMonth(requested);
  const data = query.data;
  const month = data?.month ?? requested;
  const thisMonth = isoDay(new Date()).slice(0, 7);

  const sites = data?.sites ?? [];
  const multiSite = sites.length > 1;
  const siteFilter = multiSite && ctx.siteIds.length === 1 ? ctx.siteIds[0] : null;
  const shownSites = siteFilter ? sites.filter((s) => s.site_id === siteFilter) : sites;
  const shown = data ? { ...data, sites: shownSites } : null;

  const goTo = (m: string) => update({ period: parsePeriod(m) });
  const addData = () => {
    const p = new URLSearchParams();
    if (month) p.set("period", month);
    if (shownSites.length === 1) p.set("site", String(shownSites[0].site_id));
    navigate(`/data/new${p.size ? `?${p}` : ""}`);
  };

  const monthSwitcher = month && (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex items-center gap-1" role="group" aria-label="Month">
        <Button size="sm" variant="ghost" aria-label="Previous month" icon={<ChevronLeft aria-hidden className="size-4" />} onClick={() => goTo(shiftMonth(month, -1))} />
        <span className="min-w-20 text-center text-sm font-medium text-ink" aria-live="polite">
          {formatMonth(month)}
        </span>
        <Button
          size="sm"
          variant="ghost"
          aria-label="Next month"
          icon={<ChevronRight aria-hidden className="size-4" />}
          disabled={month >= thisMonth}
          onClick={() => goTo(shiftMonth(month, 1))}
        />
      </div>
      {multiSite && (
        <div className="w-56">
          <Select<number>
            label="Site"
            value={siteFilter}
            placeholder="All sites"
            options={sites.map((s) => ({ value: s.site_id, label: s.name }))}
            onChange={(v) => update({ siteIds: v === null ? [] : [v] })}
          />
        </div>
      )}
    </div>
  );

  const siteLine = shownSites.length === 1 ? shownSites[0].name : multiSite ? `${shownSites.length} sites` : undefined;

  return (
    <div className="space-y-5">
      <PageHeader
        title={month ? monthTitle(month) : "My month"}
        description={siteLine}
        loading={query.isPending}
        context={monthSwitcher}
        primaryAction={{ label: "Add data", onClick: addData, icon: <Plus aria-hidden className="size-4" /> }}
      />

      {query.isPending ? (
        <PageSkeleton />
      ) : query.isError || !data || !shown || !month ? (
        <EmptyState
          variant="error"
          title={serverMessage(query.error)}
          action={<Button onClick={() => void query.refetch()}>Try again</Button>}
        />
      ) : hasNoAssignments(data) ? (
        <EmptyState
          icon={UserRoundX}
          title="Ask your manager for access"
          description="You don't have any sites or categories to report on yet."
        />
      ) : (
        <div className={query.isPlaceholderData ? "opacity-60 transition-opacity" : undefined} aria-busy={query.isFetching || undefined}>
          <div className="space-y-4">
            <DueBanner due={dueState(shown, isoDay(new Date()))} progress={progress(shown)} />
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="min-w-0 space-y-4">
                <SentBackPanel items={sentBack(shown)} month={month} showSite={multiSite} />
                {shown.sites.map((site) => (
                  <Checklist key={site.site_id} site={site} month={month} showSiteName={multiSite} />
                ))}
              </div>
              <AtAGlance glance={glance(shown)} month={month} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
