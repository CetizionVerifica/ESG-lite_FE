import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ClipboardCheck, Download, PartyPopper, Send, Upload } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import type { MyKpiItem } from "../../../lib/kpi/contracts";
import { KpiNotAvailable } from "../../../lib/kpi/KpiNotAvailable";
import { isKpiTrackingOff } from "../../../lib/kpi/switch";
import { ERROR_MESSAGE } from "../../../lib/kpi/labels";
import { isKpiErrorCode } from "../../../lib/kpi/contracts";
import {
  Button,
  Callout,
  ContextChips,
  EmptyState,
  Modal,
  PageHeader,
  SegmentedControl,
  SkeletonText,
  TabPanel,
  Tabs,
  cn,
  focusRing,
  panel,
  periodLabel,
  serializePeriod,
  useContextParams,
  useToast,
} from "../../../ui";
import { keys, kpiErrorMessage, useDownloadTemplate, useMyKpis, useSubmitValues, useTargetsFor } from "./api";
import { TableView } from "./components/TableView";
import { TemplateUpload } from "./components/TemplateUpload";
import { EntryDrawer } from "./components/EntryDrawer";
import { KpiRow } from "./components/KpiRow";
import { defaultPeriod, groupItems, itemKey, nextDueDate, progressOf, readyToSubmit, submitQuestion, topicChips, topicFilter, topicGroups, workOrder } from "./logic";
import { useKpiCompanyId } from "../../../lib/kpi/switch";

type Tab = "due" | "sent_back" | "done";
type View = "list" | "table";
type SiteLike = { site_id: number; name?: string | null };

const isoToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const shortDate = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]}`;
};

/** The signed-in person's sites, for the site chip. */
function userSites(user: unknown): SiteLike[] {
  const u = (user ?? {}) as { sites?: SiteLike[] | null; site?: SiteLike | null };
  const list = [...(u.sites ?? []), ...(u.site ? [u.site] : [])];
  return list.filter((s, i) => s?.site_id && list.findIndex((x) => x.site_id === s.site_id) === i);
}

/**
 * KPI-7 `/kpi` My KPIs (05-ux S3): what the contributor owes for a month,
 * as plain questions, one at a time. Progress always shows; drafts save as
 * you type; "Submit all" sends the finished drafts for review in one go.
 */
export default function MyKpisPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const companyId = useKpiCompanyId();
  const [params, setParams] = useSearchParams();
  const today = isoToday();
  const fallback = useMemo(() => {
    const p = defaultPeriod(new Date());
    return { kind: "month" as const, year: p.year, month: p.month };
  }, []);
  const [ctx] = useContextParams({ period: fallback });
  const period = ctx.period?.kind === "month" ? ctx.period : fallback;
  const periodKey = serializePeriod(period);
  const siteId = ctx.siteIds.length === 1 ? ctx.siteIds[0] : null;
  const sites = userSites(user);

  const my = useMyKpis(periodKey, siteId);
  const listKey = keys.list(companyId, periodKey, siteId);
  const submit = useSubmitValues();
  const targetFor = useTargetsFor();
  const [confirming, setConfirming] = useState(false);
  const [refused, setRefused] = useState<{ item: MyKpiItem | null; message: string }[]>([]);
  // The order "Save and next" walks, fixed when an entry opens (a fixed sent-back value becomes a draft and would move).
  const [sequence, setSequence] = useState<string[] | null>(null);

  const items = useMemo(() => (my.data?.items ?? []).filter((i) => siteId === null || i.site_id === siteId || i.site_id === null), [my.data, siteId]);
  // D17: a topic chip narrows the list (`?topic=`); progress and Submit stay for the whole period.
  const topic = topicFilter(params.get("topic"), items);
  const shown = useMemo(() => (topic ? items.filter((i) => i.topic === topic) : items), [items, topic]);
  const chips = useMemo(() => topicChips(items), [items]);
  const groups = useMemo(() => groupItems(shown), [shown]);
  const progress = progressOf(items);
  const ready = readyToSubmit(items);
  const due = nextDueDate(items);
  const multiSite = new Set(items.map((i) => i.site_id)).size > 1;
  const order = sequence ?? workOrder(shown).map(itemKey);

  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  const tab: Tab = params.get("tab") === "sent_back" || params.get("tab") === "done" ? (params.get("tab") as Tab) : "due";
  // KPI-7 part 3: the fast lane, a keyboard table of what's still to enter (`?view=table`).
  const view: View = params.get("view") === "table" ? "table" : "list";
  const todo = workOrder(shown);
  const download = useDownloadTemplate();
  const [uploading, setUploading] = useState(false);
  const openKey = params.get("entry");
  const open = openKey ? (items.find((i) => itemKey(i) === openKey) ?? null) : null;
  const at = openKey ? order.indexOf(openKey) : -1;
  const position = at >= 0 ? `${at + 1} of ${order.length} to enter` : null;
  const nextKey = at >= 0 ? order.slice(at + 1).find((k) => items.some((i) => itemKey(i) === k)) : undefined;
  const next = nextKey ? (items.find((i) => itemKey(i) === nextKey) ?? null) : null;
  const openEntry = (key: string) => {
    setSequence(workOrder(shown).map(itemKey));
    setParam("entry", key);
  };

  const siteName = siteId ? (sites.find((s) => s.site_id === siteId)?.name ?? items.find((i) => i.site_id === siteId)?.site_name) : sites.length === 1 ? sites[0].name : null;
  const description = [siteName ?? (sites.length > 1 ? "All your sites" : null), periodLabel(period)].filter(Boolean).join(" · ");

  const sendAll = async () => {
    try {
      const res = await submit.mutateAsync(ready.map((i) => i.value!.id));
      setConfirming(false);
      const back = res.refused.map((r) => ({ item: ready.find((i) => i.value?.id === r.id) ?? null, message: isKpiErrorCode(r.code) ? ERROR_MESSAGE[r.code] : "It couldn't be sent." }));
      setRefused(back);
      if (res.submitted.length)
        toast({ title: `${res.submitted.length} ${res.submitted.length === 1 ? "value" : "values"} sent for review.`, description: back.length ? `${back.length} couldn't be sent; see the list.` : undefined, tone: "good" });
      else if (back.length) toast({ title: "Nothing was sent.", description: "See why in the list.", tone: "bad" });
    } catch (e) {
      toast({ title: "Couldn't send the values.", description: kpiErrorMessage(e, "Try again in a moment."), tone: "bad" });
    }
  };

  if (my.error && isKpiTrackingOff(my.error)) return <KpiNotAvailable home="/my-month" />;

  // Rows under topic headings, each with how much of the topic is done.
  const list = (rows: MyKpiItem[], extra?: MyKpiItem[]) => (
    <div className="divide-y divide-line">
      {topicGroups([...rows, ...(extra ?? [])], items).map((g) => {
        const pct = g.total ? Math.round((g.done / g.total) * 100) : 0;
        return (
          <section key={g.topic} aria-labelledby={`kpi-topic-${g.topic}`} data-testid="kpi-topic-group">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-tint/40 px-4 py-2">
              <h3 id={`kpi-topic-${g.topic}`} className="text-sm font-semibold text-ink">
                {g.label} <span className="font-normal text-muted">· {g.items.length}</span>
              </h3>
              <span className="flex items-center gap-2 text-xs text-muted">
                <span aria-hidden className="block h-1.5 w-16 overflow-hidden rounded-full bg-tint">
                  <span className="block h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                </span>
                {g.done} of {g.total} done
              </span>
            </div>
            <ul className="divide-y divide-line">
              {g.items.map((i) => (
                <KpiRow key={itemKey(i)} item={i} today={today} showSite={multiSite} onOpen={() => openEntry(itemKey(i))} target={i.source === "manual" ? null : targetFor(i)} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );

  const tabBody = (t: Tab) => {
    if (t === "due") {
      const todo = [...groups.sentBack, ...groups.due];
      return (
        <>
          {todo.length ? (
            list(todo)
          ) : (
            <EmptyState icon={PartyPopper} title="Nothing due. You're all caught up." description={ready.length ? "Send your drafts for review when you're ready." : "New KPIs show here when the next period ends."} compact />
          )}
          {groups.filled.length > 0 && (
            <div className="border-t border-line">
              <h3 className="px-4 pt-3 text-xs font-medium uppercase tracking-wide text-muted">Filled in for you</h3>
              {list(groups.filled)}
            </div>
          )}
        </>
      );
    }
    if (t === "sent_back")
      return groups.sentBack.length ? list(groups.sentBack) : <EmptyState title="Nothing sent back." description="When a reviewer sends a value back, it shows here with their note." compact />;
    return groups.done.length || groups.filled.length ? list(groups.done, groups.filled) : <EmptyState title="Nothing done yet for this period." compact />;
  };

  return (
    <div className="space-y-6 py-6">
      <PageHeader
        title="My KPIs"
        description={description}
        context={
          <ContextChips
            chips={sites.length > 1 ? ["period", "site"] : ["period"]}
            periodKinds={["month"]}
            sites={sites.map((s) => ({ value: s.site_id, label: s.name ?? `Site ${s.site_id}` }))}
            defaults={{ period: fallback }}
          />
        }
      />

      {my.isLoading ? (
        <section className={cn(panel, "p-5")}>
          <SkeletonText lines={6} />
        </section>
      ) : my.error ? (
        <section className={panel}>
          <EmptyState variant="error" title={kpiErrorMessage(my.error, "Couldn't load your KPIs.")} action={<Button variant="primary" onClick={() => void my.refetch()}>Try again</Button>} />
        </section>
      ) : items.length === 0 ? (
        <section className={panel}>
          <EmptyState icon={ClipboardCheck} title="No KPIs are assigned to you yet." description="Your admin chooses them in KPI setup. They'll show here when they're due." />
        </section>
      ) : (
        <>
          <section aria-label="Progress" className={cn(panel, "flex flex-wrap items-center gap-x-4 gap-y-3 p-4")}>
            <div
              role="progressbar"
              aria-label={`${progress.done} of ${progress.total} done`}
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.done}
              className="h-2 min-w-32 flex-1 overflow-hidden rounded-full bg-tint sm:max-w-64"
            >
              <span className="block h-full rounded-full bg-brand transition-[width]" style={{ width: `${progress.pct}%` }} />
            </div>
            <p className="text-sm text-ink" data-testid="kpi-progress">
              <b className="font-num">{progress.done}</b> of <b className="font-num">{progress.total}</b> done{due ? ` · due ${shortDate(due)}` : progress.done === progress.total ? " · all done" : ""}
            </p>
            <span className="flex-1" />
            <Button variant="primary" onClick={() => setConfirming(true)} disabled={!ready.length}>
              <Send aria-hidden className="size-4" />
              {ready.length ? `Submit ${ready.length} ready ${ready.length === 1 ? "value" : "values"}` : "Submit all"}
            </Button>
          </section>

          {refused.length > 0 && (
            <Callout tone="warn" title="Some values weren't sent" onDismiss={() => setRefused([])}>
              <ul className="space-y-1">
                {refused.map((r, n) => (
                  <li key={n} className="flex flex-wrap items-center gap-2">
                    <span>
                      <b>{r.item?.name ?? "A value"}</b>: {r.message}
                    </span>
                    {r.item && (
                      <Button size="sm" variant="ghost" onClick={() => openEntry(itemKey(r.item as MyKpiItem))}>
                        Open
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </Callout>
          )}

          {chips.length > 1 && (
            <div role="group" aria-label="Show topic" className="flex flex-wrap gap-1.5" data-testid="kpi-topic-chips">
              {[{ topic: null, label: "All topics", count: items.length }, ...chips].map((c) => {
                const on = (c.topic ?? null) === topic;
                return (
                  <button
                    key={c.topic ?? "all"}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setParam("topic", c.topic)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-chip border px-2.5 py-1 text-xs font-medium",
                      on ? "border-brand bg-tint text-brand-text" : "border-line text-muted hover:text-ink",
                      focusRing,
                    )}
                  >
                    {c.label}
                    <span className="font-num text-muted">{c.count}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <SegmentedControl<View> label="Show as" size="sm" value={view} onChange={(v) => setParam("view", v === "table" ? "table" : null)} options={[{ value: "list", label: "List" }, { value: "table", label: "Table" }]} />
            {view === "table" && (
              <span className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  loading={download.isPending}
                  onClick={() =>
                    download.mutate(
                      { period: periodKey, siteId },
                      { onSuccess: (name) => toast({ title: `Downloaded ${name}`, description: "Fill in the Value column, then upload it here." }), onError: (e) => toast({ title: "Couldn't download the template", description: kpiErrorMessage(e, "Try again in a moment."), tone: "bad" }) },
                    )
                  }
                >
                  <Download aria-hidden className="size-4" />
                  Download template
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setUploading(true)}>
                  <Upload aria-hidden className="size-4" />
                  Upload filled template
                </Button>
              </span>
            )}
          </div>

          {view === "table" ? (
            todo.length ? (
              <TableView items={todo} listKey={listKey} showSite={multiSite} onOpen={openEntry} />
            ) : (
              <section className={panel}>
                <EmptyState icon={PartyPopper} title="Nothing due. You're all caught up." compact />
              </section>
            )
          ) : (
          <div className="space-y-0">
              <Tabs<Tab>
                label="My KPIs"
                idBase="my-kpis"
                value={tab}
                onChange={(t) => setParam("tab", t === "due" ? null : t)}
                items={[
                  { value: "due", label: "Due", count: groups.due.length + groups.sentBack.length },
                  { value: "sent_back", label: "Sent back", count: groups.sentBack.length },
                  { value: "done", label: "Done", count: groups.done.length + groups.filled.length },
                ]}
              />
              {(["due", "sent_back", "done"] as Tab[]).map((t) => (
                <TabPanel key={t} idBase="my-kpis" value={t} current={tab}>
                  <section className={cn(panel, "mt-3 overflow-hidden")}>{tabBody(t)}</section>
                </TabPanel>
              ))}
            </div>
          )}
        </>
      )}

      {open && (
        <EntryDrawer
          key={itemKey(open)}
          item={open}
          listKey={listKey}
          position={position}
          hasNext={!!next}
          onClose={() => setParam("entry", null)}
          onSaved={(title) => toast({ title })}
          onNext={() => {
            if (next) setParam("entry", itemKey(next));
            else {
              setParam("entry", null);
              toast({ title: "That's everything to enter.", description: readyToSubmit(items).length ? "Send your drafts for review with Submit." : undefined, tone: "good" });
            }
          }}
        />
      )}

      <TemplateUpload
        open={uploading}
        period={periodKey}
        siteId={siteId}
        onClose={() => setUploading(false)}
        onSaved={(n) => {
          setUploading(false);
          toast({ title: n ? `${n} ${n === 1 ? "draft" : "drafts"} saved from the template.` : "Nothing was saved.", description: n ? "Check them, then send them with Submit." : undefined, tone: n ? "good" : undefined });
        }}
      />

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={submitQuestion(ready)}
        description="They can't be changed while they wait. Your reviewer approves them or sends them back with a note."
        primaryAction={{ label: `Send ${ready.length}`, onClick: () => void sendAll(), loading: submit.isPending, disabled: !ready.length }}
      >
        <ul className="max-h-60 space-y-1 overflow-y-auto text-sm">
          {ready.map((i) => (
            <li key={itemKey(i)} className="flex justify-between gap-3">
              <span className="text-ink">{i.name}</span>
              <span className="text-muted">{multiSite ? i.site_name : null}</span>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
