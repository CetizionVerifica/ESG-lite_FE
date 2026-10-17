import { useId, useState } from "react";
import { CheckCircle2, CircleDashed, Lock, LockOpen, RefreshCw } from "lucide-react";
import { periodText } from "../../../../lib/kpi/entry";
import { LOCK_LEFT_REASON_LABEL } from "../../../../lib/kpi/labels";
import { isKpiTrackingOff } from "../../../../lib/kpi/switch";
import { KpiNotAvailable } from "../../../../lib/kpi/KpiNotAvailable";
import { Button, EmptyState, Modal, Skeleton, StatusPill, Textarea, cn, panel, useContextParams, useToast } from "../../../../ui";
import { incompleteLeft, kpiErrorMessage, useKpiLock, useLockActions } from "../api";
import { type LockSite, defaultMonth, leftInView, lockLabel, siteSummary, sitesInView } from "../logic";

/**
 * KPI-8 · Close a KPI period (the `CloseMonthView` pattern with KPI words):
 * what's left per site, then Lock; a locked site reopens with a reason.
 */
export function CloseView({ onReview }: { onReview: () => void }) {
  const [ctx] = useContextParams();
  const { toast } = useToast();
  const target = ctx.period?.kind === "month" ? { year: ctx.period.year, month: ctx.period.month } : defaultMonth(new Date());
  const title = periodText(`${target.year}-${String(target.month).padStart(2, "0")}-01`, "monthly");
  const q = useKpiLock(target.year, target.month);
  const { lock, unlock } = useLockActions();
  const [reopen, setReopen] = useState<LockSite | null>(null);
  const gateId = useId();

  if (q.error && isKpiTrackingOff(q.error)) return <KpiNotAvailable />;
  if (q.isPending)
    return (
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-16 w-full rounded-card" />
        <Skeleton className="h-48 w-full rounded-card" />
      </div>
    );
  if (q.isError || !q.data)
    return (
      <section className={panel}>
        <EmptyState variant="error" title={kpiErrorMessage(q.error, "Couldn't load what's left for this period.")} action={<Button onClick={() => void q.refetch()}>Try again</Button>} />
      </section>
    );

  const status = q.data;
  const sites = sitesInView(status, ctx.siteIds);
  const left = leftInView(status, sites);
  const allLocked = sites.length > 0 && sites.every((s) => s.locked);
  const open = sites.filter((s) => !s.locked);
  const pendingLeft = left.filter((l) => l.reason === "pending").length;

  const doLock = () =>
    lock.mutate(
      open.map((s) => ({ year: target.year, period: target.month, site_id: s.site_id })),
      {
        onSuccess: () => toast({ title: `${title} is locked`, description: "Its KPI values can't change until someone reopens it with a reason.", tone: "good" }),
        onError: (e) => {
          const still = incompleteLeft(e);
          toast({
            title: still.length ? "Not everything is in yet" : "Couldn't lock the period",
            description: still.length ? `${still.length} ${still.length === 1 ? "value is" : "values are"} still missing or waiting. They're listed below.` : kpiErrorMessage(e, "Try again in a moment."),
            tone: "bad",
          });
          void q.refetch();
        },
      },
    );

  if (!sites.length) return <EmptyState title="No sites to close" description="You don't manage a site with KPIs for this period." />;

  return (
    <div className={cn("space-y-4", q.isPlaceholderData && "opacity-60 transition-opacity")} aria-busy={q.isFetching || undefined}>
      <section aria-labelledby="kpi-close-heading" className={cn(panel, "flex flex-wrap items-center justify-between gap-3 p-4")}>
        <div className="min-w-0">
          <h2 id="kpi-close-heading" className="flex items-center gap-2 text-base font-semibold text-ink">
            Close {title}
            {allLocked && <StatusPill status="locked" />}
          </h2>
          <p id={gateId} className="mt-0.5 text-sm text-muted" aria-live="polite">
            {allLocked
              ? "Locked. KPI reports read this period as final."
              : left.length
                ? `${left.length} ${left.length === 1 ? "value is" : "values are"} still missing or waiting. Approve or chase them, then lock.`
                : `Everything is in. Locking makes ${title} final for KPI reports.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" icon={<RefreshCw aria-hidden className="size-4" />} onClick={() => void q.refetch()} loading={q.isFetching && !lock.isPending}>
            Check again
          </Button>
          {!allLocked && (
            <Button variant="primary" icon={<Lock aria-hidden className="size-4" />} disabled={left.length > 0} aria-describedby={gateId} loading={lock.isPending} onClick={doLock}>
              {lockLabel(title, sites)}
            </Button>
          )}
        </div>
      </section>

      <section aria-labelledby="kpi-close-sites" className={cn(panel, "overflow-hidden")}>
        <h2 id="kpi-close-sites" className="px-4 pt-4 text-sm font-semibold text-ink">
          Sites
        </h2>
        <div className="relative mt-2 overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <caption className="sr-only">What's done per site</caption>
            <thead className="border-y border-line bg-tint text-left text-xs text-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-medium">Site</th>
                <th scope="col" className="px-3 py-2 font-medium">Approved</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Draft</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Pending</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Sent back</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Missing</th>
                <th scope="col" className="px-3 py-2 font-medium">Status</th>
                <th scope="col" className="px-4 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {sites.map((s) => {
                const c = siteSummary(s);
                const pct = c.owed ? Math.round((c.approved / c.owed) * 100) : 100;
                return (
                  <tr key={s.site_id ?? "company"} className="border-b border-line last:border-0" data-testid="kpi-close-site">
                    <th scope="row" className="px-4 py-2 text-left font-medium text-ink">{s.name}</th>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-tint" aria-hidden>
                          <span className="block h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="font-num tabular-nums text-ink">
                          {c.approved} of {c.owed}
                        </span>
                      </div>
                    </td>
                    {[c.draft, c.pending, c.rejected, c.missing].map((n, i) => (
                      <td key={i} className={cn("px-3 py-2 text-right font-num tabular-nums", n ? "text-ink" : "text-muted")}>
                        {n}
                      </td>
                    ))}
                    <td className="px-3 py-2">{s.locked ? <StatusPill status="locked" /> : <span className="text-xs text-muted">Open</span>}</td>
                    <td className="px-4 py-2 text-right">
                      {s.locked && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<LockOpen aria-hidden className="size-4" />}
                          onClick={() => {
                            unlock.reset();
                            setReopen(s);
                          }}
                        >
                          Reopen
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="kpi-close-left" className={cn(panel, "p-4")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="kpi-close-left" className="text-sm font-semibold text-ink">
            Left before you can lock {left.length > 0 && `(${left.length})`}
          </h2>
          {pendingLeft > 0 && (
            <Button size="sm" variant="secondary" onClick={onReview}>
              Review {pendingLeft} waiting
            </Button>
          )}
        </div>
        {left.length === 0 ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted">
            <CheckCircle2 aria-hidden className="size-4 text-good" />
            {allLocked ? "Nothing: this period is locked." : "Nothing. Every KPI of every site is approved."}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line" aria-label="Left before you can lock">
            {left.map((l, i) => (
              <li key={`${l.site_id}-${l.kpi_definition_id}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                <CircleDashed aria-hidden className="size-4 shrink-0 text-warn" />
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-ink">{l.kpi_name}</span>
                  {sites.length > 1 && <span className="text-muted"> · {l.site_name ?? "Company"}</span>}
                  <span className="block text-xs text-muted">{LOCK_LEFT_REASON_LABEL[l.reason] ?? "Not done yet"}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ReopenDialog
        site={reopen}
        title={title}
        busy={unlock.isPending}
        error={unlock.isError ? kpiErrorMessage(unlock.error, "Couldn't reopen the period. Try again.") : null}
        onClose={() => setReopen(null)}
        onReopen={(site, reason) =>
          unlock.mutate(
            { year: target.year, period: target.month, site_id: site.site_id, reason: reason.trim() },
            {
              onSuccess: () => {
                setReopen(null);
                toast({ title: `${title} is open again for ${site.name}`, description: "Contributors can change and submit values until it's locked again." });
              },
            },
          )
        }
      />
    </div>
  );
}

function ReopenDialog({ site, title, busy, error, onClose, onReopen }: { site: LockSite | null; title: string; busy: boolean; error: string | null; onClose: () => void; onReopen: (site: LockSite, reason: string) => void }) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const short = reason.trim().length < 5;
  return (
    <Modal
      open={!!site}
      onClose={() => {
        setReason("");
        setTouched(false);
        onClose();
      }}
      title={site ? `Reopen ${title} for ${site.name}?` : "Reopen"}
      description="Contributors can change values again. Your reason goes in the period's history."
      error={error}
      primaryAction={{
        label: "Reopen",
        loading: busy,
        onClick: () => {
          setTouched(true);
          if (site && !short) onReopen(site, reason);
        },
      }}
    >
      <Textarea label="Reason" required value={reason} onChange={setReason} rows={2} error={touched && short ? "Give a reason of at least 5 characters" : undefined} placeholder="What needs changing?" />
    </Modal>
  );
}
