import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, CircleDashed, Lock, LockOpen, MinusCircle, RefreshCw } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { Button, EmptyState, Loading, Modal, Skeleton, StatusPill, Textarea, cn, focusRing, formatMonth, panel, useContextParams, useToast } from "../../../ui";
import { categoryLabel, categoryShortName } from "../../../lib/scope3/labels";
import { gridCellOpen, gridCellText, leftReasonLabel, lockGate, siteCompleteness, unlockReasonError } from "../../../lib/scope3/lock";
import type { PeriodLockSite, PeriodLockStatus } from "../../../lib/scope3/contracts";
import { errorCode, errorText } from "../../../services/reviewService";
import { useLockMutations, usePeriodLock } from "../api";
import { closeMonth, leftItemName, leftLink, lockBodies, sitesInView, unlockTarget } from "../closeMonth";

/** S3-15 · Close month (`/data/approvals?view=close&period=`): completeness per site, the Scope 3 grid, what's left, Lock and Reopen. */
export function CloseMonthView({ siteIds }: { siteIds: number[] }) {
  const [ctx] = useContextParams();
  const { role } = useAuth();
  const { toast } = useToast();
  const target = closeMonth(ctx.period, new Date());
  const lockQ = usePeriodLock(target.year, target.month, siteIds);
  const { lock, unlock } = useLockMutations();
  const [reopen, setReopen] = useState<PeriodLockSite | null>(null);
  const gateId = useId();
  const title = formatMonth(target.key);

  if (lockQ.isPending) {
    return (
      <Loading label="Loading the month" className="space-y-4">
        <Skeleton className="h-16 w-full rounded-card" />
        <Skeleton className="h-48 w-full rounded-card" />
        <Skeleton className="h-40 w-full rounded-card" />
      </Loading>
    );
  }
  if (lockQ.isError || !lockQ.data) {
    return (
      <EmptyState
        variant="error"
        title="Couldn't load this month's completeness"
        description={errorText(lockQ.error, "Check your connection and try again.")}
        action={<Button onClick={() => void lockQ.refetch()}>Try again</Button>}
      />
    );
  }

  const status = lockQ.data;
  const sites = sitesInView(status, siteIds);
  const gate = lockGate(status, sites.map((s) => s.site_id));
  const left = status.left.filter((l) => sites.some((s) => s.site_id === l.site_id && !s.locked));
  const allLocked = sites.length > 0 && sites.every((s) => s.locked);

  const doLock = () => {
    const bodies = lockBodies(role, status, siteIds);
    lock.mutate(bodies, {
      onSuccess: () => toast({ title: `${title} is locked`, description: "Its data can't change until someone reopens it with a reason.", tone: "good" }),
      onError: (e) =>
        toast({
          title: errorCode(e) === "PERIOD_INCOMPLETE" ? "Not everything is in yet" : "Couldn't lock the month",
          description: errorText(e, "Try again in a moment."),
          tone: "bad",
        }),
    });
  };

  if (sites.length === 0) {
    return <EmptyState title="No sites to close" description="You don't manage any site for this month yet." />;
  }

  return (
    <div className={cn("space-y-4", lockQ.isPlaceholderData && "opacity-60 transition-opacity")} aria-busy={lockQ.isFetching || undefined}>
      <section aria-labelledby="close-heading" className={cn(panel, "flex flex-wrap items-center justify-between gap-3 p-4")}>
        <div className="min-w-0">
          <h2 id="close-heading" className="flex items-center gap-2 text-base font-semibold text-ink">
            Close {title}
            {allLocked && <StatusPill status="locked" />}
          </h2>
          <p id={gateId} className="mt-0.5 text-sm text-muted" aria-live="polite">
            {allLocked ? "Locked. Reports read this month as final." : gate.reason ?? "Everything is in. Locking makes this month final for reports."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" icon={<RefreshCw aria-hidden className="size-4" />} onClick={() => void lockQ.refetch()} loading={lockQ.isFetching && !lock.isPending}>
            Check again
          </Button>
          {!allLocked && (
            <Button variant="primary" icon={<Lock aria-hidden className="size-4" />} disabled={!gate.canLock} aria-describedby={gateId} loading={lock.isPending} onClick={doLock}>
              {sites.length === 1 ? `Lock ${title}` : `Lock ${title} for ${sites.filter((s) => !s.locked).length} sites`}
            </Button>
          )}
        </div>
      </section>

      <SitesTable sites={sites} onReopen={(s) => { unlock.reset(); setReopen(s); }} />
      <Scope3Grid status={status} />

      <section aria-labelledby="left-heading" className={cn(panel, "p-4")}>
        <h2 id="left-heading" className="text-sm font-semibold text-ink">
          Left before you can lock {left.length > 0 && `(${left.length})`}
        </h2>
        {left.length === 0 ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted">
            <CheckCircle2 aria-hidden className="size-4 text-good" />
            {allLocked ? "Nothing: this month is locked." : "Nothing. Every site and Scope 3 category is complete."}
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line" aria-label="Left before you can lock">
            {left.map((item, i) => {
              const link = leftLink(item, target.key);
              const name = leftItemName(item, categoryLabel);
              return (
                <li key={`${item.site_id}-${item.category_id ?? item.ghg_category ?? "x"}-${item.reason}-${i}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                  <CircleDashed aria-hidden className="size-4 shrink-0 text-warn" />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-ink">{name}</span>
                    {sites.length > 1 && <span className="text-muted"> · {item.site_name}</span>}
                    <span className="block text-xs text-muted">{leftReasonLabel(item.reason)}</span>
                  </span>
                  {link ? (
                    <Link to={link.to} className={cn("rounded-control px-2 py-1 text-xs font-medium text-brand-text underline hover:bg-tint", focusRing)} aria-label={`${link.label}: ${name}${sites.length > 1 ? ` at ${item.site_name}` : ""}`}>
                      {link.label}
                    </Link>
                  ) : (
                    <span className="text-xs text-muted">{item.reason === "draft" ? "The contributor submits drafts" : ""}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ReopenDialog
        site={reopen}
        status={status}
        monthTitle={title}
        busy={unlock.isPending}
        error={unlock.isError ? errorText(unlock.error, "Couldn't reopen the month. Try again.") : null}
        onClose={() => setReopen(null)}
        onReopen={(site, reason) =>
          unlock.mutate(
            { ...unlockTarget(site, status), reason: reason.trim() },
            {
              onSuccess: () => {
                setReopen(null);
                toast({ title: `${title} is open again`, description: "Contributors can change and submit data until it's locked again." });
              },
            },
          )
        }
      />
    </div>
  );
}

function Count({ n, label }: { n: number; label: string }) {
  return (
    <span className={cn("font-num tabular-nums", n > 0 ? "text-ink" : "text-muted")}>
      {n}
      <span className="sr-only"> {label}</span>
    </span>
  );
}

/** Site completeness: categories done of owed, rows still open by status, and the lock. */
function SitesTable({ sites, onReopen }: { sites: PeriodLockSite[]; onReopen: (s: PeriodLockSite) => void }) {
  return (
    <section aria-labelledby="sites-heading" className={cn(panel, "overflow-hidden")}>
      <h2 id="sites-heading" className="px-4 pt-4 text-sm font-semibold text-ink">
        Sites
      </h2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">Completeness per site</caption>
          <thead className="border-y border-line bg-tint text-left text-xs text-muted">
            <tr>
              <th scope="col" className="px-4 py-2 font-medium">Site</th>
              <th scope="col" className="px-3 py-2 font-medium">Done</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Draft</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Pending</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Rejected</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Missing</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
              <th scope="col" className="px-4 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => {
              const c = siteCompleteness(s);
              const pct = c.owed ? Math.round((c.done / c.owed) * 100) : 100;
              return (
                <tr key={s.site_id} className="border-b border-line last:border-0">
                  <th scope="row" className="px-4 py-2 text-left font-medium text-ink">{s.name}</th>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="whitespace-nowrap font-num tabular-nums text-ink">
                        {c.done} of {c.owed}
                      </span>
                      <div role="progressbar" aria-label={`${s.name} categories done`} aria-valuemin={0} aria-valuemax={c.owed} aria-valuenow={c.done} className="h-1.5 w-16 overflow-hidden rounded-full bg-tint">
                        <div className={cn("h-full rounded-full", c.done === c.owed ? "bg-good" : "bg-brand")} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    {c.nothing > 0 && <span className="block text-xs text-muted">{c.nothing} with nothing this month</span>}
                  </td>
                  <td className="px-3 py-2 text-right"><Count n={c.draft} label="draft" /></td>
                  <td className="px-3 py-2 text-right"><Count n={c.pending} label="pending" /></td>
                  <td className="px-3 py-2 text-right"><Count n={c.rejected} label="rejected" /></td>
                  <td className="px-3 py-2 text-right"><Count n={c.missing} label="missing" /></td>
                  <td className="px-3 py-2">
                    {s.locked ? (
                      <StatusPill status="locked" size="sm" />
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted">
                        <LockOpen aria-hidden className="size-3.5" />
                        Open
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {s.locked && (
                      <Button size="sm" variant="ghost" onClick={() => onReopen(s)} aria-label={`Reopen ${s.name}`}>
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
  );
}

/** The 15 Scope 3 categories: boundary status (S3-1) and whether this month has data. */
function Scope3Grid({ status }: { status: PeriodLockStatus }) {
  return (
    <section aria-labelledby="scope3-grid-heading" className={cn(panel, "p-4")}>
      <h2 id="scope3-grid-heading" className="text-sm font-semibold text-ink">
        Scope 3 categories
      </h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" aria-label="Scope 3 categories">
        {status.scope3.map((cell) => {
          const text = gridCellText(cell);
          const open = gridCellOpen(cell);
          const Icon = open ? CircleDashed : cell.has_data ? CheckCircle2 : MinusCircle;
          return (
            <li
              key={cell.n}
              title={categoryLabel(cell.n)}
              className={cn("rounded-control border p-2.5", open ? "border-warn/40 bg-warn-soft" : "border-line bg-panel")}
              data-open={open}
            >
              <p className="text-xs font-semibold text-ink">
                <span className="font-num">{cell.n}</span> · {categoryShortName(cell.n)}
              </p>
              <p className="mt-1 text-xs text-muted">{text.status}</p>
              <p className={cn("mt-0.5 flex items-center gap-1 text-xs font-medium", open ? "text-warn" : cell.has_data ? "text-good" : "text-muted")}>
                <Icon aria-hidden className="size-3.5" />
                {text.data}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type ReopenProps = {
  site: PeriodLockSite | null;
  status: PeriodLockStatus;
  monthTitle: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onReopen: (site: PeriodLockSite, reason: string) => void;
};

/** Reopen needs a reason (≥ 5 characters): changes to a closed month are a recalculation trigger and are audited. */
function ReopenDialog({ site, status, monthTitle, busy, error, onClose, onReopen }: ReopenProps) {
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const companyWide = !!site?.lock && site.lock.site_id === null;
  const problem = unlockReasonError(reason);
  const close = () => {
    setReason("");
    setTried(false);
    onClose();
  };
  const submit = () => {
    setTried(true);
    if (site && !problem) onReopen(site, reason);
  };
  return (
    <Modal
      open={!!site}
      onClose={close}
      title={site ? (companyWide ? `Reopen ${monthTitle} for every site?` : `Reopen ${monthTitle} for ${site.name}?`) : "Reopen month"}
      description={`Contributors can change and submit data again until it's locked. Your reason is kept in the audit trail${status.sites.length > 1 && companyWide ? "; the whole company was locked together, so every site reopens" : ""}.`}
      primaryAction={{ label: "Reopen month", onClick: submit, loading: busy }}
      error={error ?? undefined}
    >
      <Textarea
        label="Reason"
        required
        value={reason}
        onChange={setReason}
        placeholder="For example: late supplier invoice for diesel"
        error={tried && problem ? problem : undefined}
        help={!tried || !problem ? "At least 5 characters." : undefined}
        autoFocus
      />
    </Modal>
  );
}
