import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Lock, Plus, UserRoundX } from "lucide-react";
import {
  Button,
  Callout,
  EmptyState,
  Loading,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  formatMonth,
  parsePeriod,
  serializePeriod,
  useContextParams,
  useToast,
} from "../../ui";
import { useReviewWorkflow } from "../../lib/reviewWorkflow";
import { errorText } from "../../services/reviewService";
import type { MyMonthCategory } from "../../services/myMonthService";
import { useMyDrafts, useMyMonth, useNothingThisMonth } from "./api";
import { AtAGlance } from "./components/AtAGlance";
import { KpisDueCard } from "./components/KpisDueCard";
import { Checklist, type ChecklistWorkflow } from "./components/Checklist";
import { DraftsPanel } from "./components/DraftsPanel";
import { DueBanner } from "./components/DueBanner";
import { SentBackPanel } from "./components/SentBackPanel";
import {
  allLocked,
  draftRows,
  dueState,
  firstDay,
  glance,
  hasNoAssignments,
  isoDay,
  lockedSiteIds,
  monthTitle,
  progress,
  sentBack,
  shiftMonth,
} from "./logic";

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

  // S3-15 part 2: drafts, submit, "Nothing this month" and locked months, only with the company switch on.
  const workflow = useReviewWorkflow(data?.review_workflow_v2);
  const today = isoDay(new Date());
  const drafts = useMyDrafts(month, shownSites.map((s) => s.site_id), workflow && !!data);
  const locked = workflow && shown ? lockedSiteIds(shown) : [];
  const draftList = draftRows(drafts.data?.data ?? [], locked);
  const readOnly = workflow && !!shown && allLocked(shown);
  const nothing = useNothingThisMonth();
  const { toast } = useToast();
  const [confirmNothing, setConfirmNothing] = useState<{ siteId: number; category: MyMonthCategory } | null>(null);

  const markNothing = () => {
    if (!confirmNothing || !month) return;
    const body = { site_id: confirmNothing.siteId, category_id: confirmNothing.category.category_id, month: firstDay(month) };
    const name = confirmNothing.category.category_name;
    nothing.mark.mutate(body, {
      onSuccess: () => {
        setConfirmNothing(null);
        toast({
          title: `${name}: nothing this month`,
          action: {
            label: "Undo",
            onClick: () =>
              nothing.unmark.mutate(body, { onError: (e) => toast({ title: "Couldn't undo", description: errorText(e, "Try again."), tone: "bad" }) }),
          },
        });
      },
    });
  };
  const undoNothing = (siteId: number, category: MyMonthCategory) => {
    if (!month) return;
    nothing.unmark.mutate(
      { site_id: siteId, category_id: category.category_id, month: firstDay(month) },
      {
        onSuccess: () => toast({ title: `${category.category_name} is back on your list` }),
        onError: (e) => toast({ title: "Couldn't undo", description: errorText(e, "Try again."), tone: "bad" }),
      },
    );
  };
  const checklistWorkflow = (siteId: number): ChecklistWorkflow | undefined =>
    workflow && data
      ? {
          today,
          dueDate: data.due_date,
          busy: nothing.mark.isPending || nothing.unmark.isPending,
          onNothing: (category) => {
            nothing.mark.reset();
            setConfirmNothing({ siteId, category });
          },
          onUndoNothing: (category) => undoNothing(siteId, category),
        }
      : undefined;

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
        title={month ? monthTitle(month) : "Current Month"}
        description={siteLine}
        loading={query.isPending}
        context={monthSwitcher}
        primaryAction={readOnly ? undefined : { label: "Add data", onClick: addData, icon: <Plus aria-hidden className="size-4" /> }}
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
            {workflow && locked.length > 0 && (
              <Callout tone="info" icon={Lock} title={readOnly ? `${monthTitle(month)} is locked` : `${monthTitle(month)} is locked for ${shown.sites.filter((s) => s.locked).map((s) => s.name).join(", ")}`}>
                Your manager closed this month, so its data can't change. Ask them to reopen it if something needs fixing.
              </Callout>
            )}
            {!readOnly && <DueBanner due={dueState(shown, today)} progress={progress(shown)} />}
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              <div className="min-w-0 space-y-4">
                <SentBackPanel items={sentBack(shown)} month={month} showSite={multiSite} workflow={workflow ? { lockedSiteIds: locked } : undefined} />
                {workflow && (
                  <DraftsPanel
                    drafts={draftList}
                    month={month}
                    showSite={multiSite}
                    loading={drafts.isPending && drafts.fetchStatus !== "idle"}
                    error={drafts.isError}
                    onRetry={() => void drafts.refetch()}
                  />
                )}
                {shown.sites.map((site) => (
                  <Checklist key={site.site_id} site={site} month={month} showSiteName={multiSite} workflow={checklistWorkflow(site.site_id)} />
                ))}
              </div>
              <div className="space-y-4">
                {!readOnly && <KpisDueCard month={month} />}
                <AtAGlance glance={glance(shown)} month={month} />
              </div>
            </div>
          </div>
        </div>
      )}
      <Modal
        open={!!confirmNothing}
        onClose={() => setConfirmNothing(null)}
        title={confirmNothing && month ? `Nothing to report for ${confirmNothing.category.category_name} in ${monthTitle(month)}?` : "Nothing this month?"}
        description="The category counts as done for this month and your manager sees it marked. You can undo this until the month is locked."
        primaryAction={{ label: "Mark as nothing this month", onClick: markNothing, loading: nothing.mark.isPending }}
        error={nothing.mark.isError ? errorText(nothing.mark.error, "Couldn't save. Try again.") : undefined}
      />
    </div>
  );
}
