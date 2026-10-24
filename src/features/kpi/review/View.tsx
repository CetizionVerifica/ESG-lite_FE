import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, ClipboardCheck } from "lucide-react";
import { KpiNotAvailable } from "../../../lib/kpi/KpiNotAvailable";
import { isKpiTrackingOff } from "../../../lib/kpi/switch";
import { KPI_REJECT_REASONS } from "../../../lib/kpi/labels";
import {
  Badge,
  Button,
  EmptyState,
  RejectReasonModal,
  SegmentedControl,
  SkeletonText,
  TabPanel,
  Tabs,
  UNDO_MS,
  cn,
  focusRing,
  panel,
  useContextParams,
  useRowKeys,
  useToast,
} from "../../../ui";
import { KpiValueDrawer } from "../components/KpiValueDrawer";
import { useKpiLookup } from "../components/lookup";
import { codeMessage, kpiErrorMessage, useLastYear, usePendingValues, useReviewActions } from "./api";
import { CloseView } from "./components/CloseView";
import { useUndoableBatch } from "./hooks/useUndoableBatch";
import { type ReviewRow, approveAllLabel, draftOf, editInput, refusalLines, reviewRows, splitRows } from "./logic";

type Group = "ready" | "attention";
type Step = "review" | "close";

const READY_NOTE = "These passed every check: in range, split adds up, units fine. Evidence is optional.";
const ATTENTION_NOTE = "Held values say why: a big jump, missing evidence, a split that doesn't add up.";

/**
 * KPI-8 · Approvals → KPIs (`/data/approvals?view=kpi`, 05-ux S4): the same
 * Ready / Needs attention groups as emissions, "Approve all ready" with an
 * 8 s undo, reject with a reason, edit in the record drawer, and Close
 * period (`&step=close`). Filled into Approvals through the `approvals-kpi` slot.
 */
export default function KpiReviewView() {
  const [params, setParams] = useSearchParams();
  const step: Step = params.get("step") === "close" ? "close" : "review";
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

  return (
    <div className="space-y-4">
      <SegmentedControl<Step>
        label="KPI review"
        value={step}
        onChange={(s) => setParam("step", s === "close" ? "close" : null)}
        options={[
          { value: "review", label: "To review" },
          { value: "close", label: "Close period" },
        ]}
      />
      {step === "close" ? <CloseView onReview={() => setParam("step", null)} /> : <ReviewList />}
    </div>
  );
}

function ReviewList() {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [ctx] = useContextParams();
  const { lookup, isLoading: lookupLoading } = useKpiLookup();
  const pending = usePendingValues();
  const lastYear = useLastYear(pending.data);
  const actions = useReviewActions();
  const [open, setOpen] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<{ ids: number[]; reason: string } | null>(null);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const all = useMemo(() => reviewRows(pending.data ?? [], lookup, lastYear.data ?? []), [pending.data, lookup, lastYear.data]);
  const period = ctx.period?.kind === "month" ? `${ctx.period.year}-${String(ctx.period.month).padStart(2, "0")}` : null;
  const inScope = all.filter((r) => (!ctx.siteIds.length || (r.value.site_id !== null && ctx.siteIds.includes(r.value.site_id))) && (!period || r.value.period_end.slice(0, 7) === period));

  const batch = useUndoableBatch({
    commit: (ids, opts) => actions.approve(ids, opts),
    onDone: async (result) => {
      await actions.refresh();
      if (result.refused.length) toast({ title: `${result.refused.length} ${result.refused.length === 1 ? "value wasn't" : "values weren't"} approved`, description: refusalLines(result.refused, all).join(" "), tone: "bad" });
    },
    onFailed: (e) => toast({ title: "Couldn't approve", description: kpiErrorMessage(e, "The values are back in the list."), tone: "bad" }),
  });
  const rows = inScope.filter((r) => !batch.isWaiting(r.id));
  const groups = splitRows(rows);
  const group: Group = params.get("group") === "attention" ? "attention" : "ready";
  const shown = group === "ready" ? groups.ready : groups.attention;
  const openRow = open !== null ? (all.find((r) => r.id === open) ?? null) : null;

  const approve = (ids: number[], describe: string, onlyReady = false) => {
    const token = batch.start(ids, { onlyReady });
    if (open !== null && ids.includes(open)) setOpen(null);
    toast({
      title: describe,
      tone: "good",
      duration: UNDO_MS,
      action: { label: "Undo", onClick: () => !batch.undo(token) && toast({ title: "Too late to undo", description: "It was already approved. Reject it if it's wrong." }) },
    });
  };
  const approveOne = (r: ReviewRow) => approve([r.id], `Approved ${r.kpiName} at ${r.siteName}.`);
  const approveNext = (r: ReviewRow) => {
    const list = shown.filter((x) => x.id !== r.id);
    const at = shown.findIndex((x) => x.id === r.id);
    const next = list[Math.max(at, 0)] ?? list[0] ?? null;
    approveOne(r);
    setOpen(next?.id ?? null);
  };
  const approveAllReady = () => {
    const ids = groups.ready.map((r) => r.id);
    if (!ids.length) return;
    approve(ids, `Approved ${ids.length} ${ids.length === 1 ? "value" : "values"}.`, true);
  };
  const askReject = (r: ReviewRow, reason = "") => {
    setRejectError(null);
    setRejecting({ ids: [r.id], reason });
  };
  const confirmReject = (reason: string) => {
    if (!rejecting) return;
    const ids = rejecting.ids;
    actions.reject.mutate(
      { ids, reason },
      {
        onSuccess: (res) => {
          if (!res.updated.length && res.refused.length) {
            setRejectError(refusalLines(res.refused, all).join(" "));
            return;
          }
          setRejecting(null);
          if (open !== null && ids.includes(open)) setOpen(null);
          const row = all.find((r) => r.id === ids[0]);
          toast({ title: "Value sent back", description: `${row?.enteredBy ?? "The contributor"} sees your reason under Sent back.` });
        },
        onError: (e) => setRejectError(kpiErrorMessage(e, "Couldn't send it back. Nothing was changed.")),
      },
    );
  };

  const { focusRow } = useRowKeys(
    tableRef,
    {
      onApprove: (id, index) => {
        const r = rows.find((x) => x.id === id);
        if (r && r.value.source === "manual") {
          approveOne(r);
          focusRow(index);
        }
      },
      onReject: (id) => {
        const r = rows.find((x) => x.id === id);
        if (r) askReject(r);
      },
      onToggle: () => undefined,
    },
    open === null && rejecting === null,
  );

  if (pending.error && isKpiTrackingOff(pending.error)) return <KpiNotAvailable />;
  if (pending.isPending || lookupLoading)
    return (
      <section className={cn(panel, "p-5")} aria-busy>
        <SkeletonText lines={6} />
      </section>
    );
  if (pending.error)
    return (
      <section className={panel}>
        <EmptyState variant="error" title={kpiErrorMessage(pending.error, "Couldn't load the KPI values waiting for review.")} action={<Button onClick={() => void pending.refetch()}>Try again</Button>} />
      </section>
    );
  if (!rows.length && !batch.busy)
    return (
      <section className={panel}>
        <EmptyState icon={CheckCircle2} title="You're all caught up" description={inScope.length || all.length ? "Nothing else is waiting here." : "No KPI values are waiting for review."} />
      </section>
    );

  return (
    <>
      <div>
        <Tabs<Group>
          label="Review groups"
          idBase="kpi-review"
          value={group}
          onChange={(g) => setParams((p) => { const next = new URLSearchParams(p); if (g === "attention") next.set("group", g); else next.delete("group"); return next; }, { replace: true })}
          items={[
            { value: "ready", label: "Ready", count: groups.ready.length },
            { value: "attention", label: "Needs attention", count: groups.attention.length },
          ]}
        />
        {(["ready", "attention"] as Group[]).map((g) => (
          <TabPanel key={g} idBase="kpi-review" value={g} current={group}>
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted">{g === "ready" ? (groups.ready.length ? READY_NOTE : "Nothing is ready to approve. Values that need a look are under Needs attention.") : ATTENTION_NOTE}</p>
                {g === "ready" && groups.ready.length > 0 && (
                  <Button variant="primary" onClick={approveAllReady}>
                    {approveAllLabel(groups.ready.length)}
                  </Button>
                )}
              </div>
              <p className="hidden text-xs text-muted sm:block">
                Keys: <Kbd>J</Kbd>/<Kbd>K</Kbd> move · <Kbd>A</Kbd> approve · <Kbd>R</Kbd> reject · <Kbd>Enter</Kbd> open
              </p>
              <div ref={g === group ? tableRef : undefined}>
                <ReviewTable rows={g === "ready" ? groups.ready : groups.attention} attention={g === "attention"} onOpen={(r) => setOpen(r.id)} />
              </div>
            </div>
          </TabPanel>
        ))}
      </div>

      <KpiValueDrawer
        item={openRow}
        onClose={() => setOpen(null)}
        canRefresh
        review={{
          onApprove: approveOne,
          onApproveNext: approveNext,
          onReject: (r, reason) => askReject(r, reason),
          draftOf: (r) => draftOf(r.value, r.def),
          onEdit: async ({ item, draft, reason }) => {
            try {
              const r = await actions.edit.mutateAsync(editInput(item.value, item.def, draft, reason));
              if (!r.ok) return codeMessage(r.code, r.message || "The change couldn't be saved.");
              toast({ title: "Change saved", description: "The value stays pending; your reason is in its history.", tone: "good" });
              return null;
            } catch (e) {
              return kpiErrorMessage(e, "Couldn't save the change. Nothing was changed.");
            }
          },
        }}
      />
      <RejectReasonModal
        open={rejecting !== null}
        count={rejecting?.ids.length ?? 0}
        busy={actions.reject.isPending}
        error={rejectError}
        noun={["value", "values"]}
        reasons={KPI_REJECT_REASONS}
        initialReason={rejecting?.reason ?? ""}
        onClose={() => setRejecting(null)}
        onConfirm={confirmReject}
      />
    </>
  );
}

function ReviewTable({ rows, attention, onOpen }: { rows: ReviewRow[]; attention: boolean; onOpen: (r: ReviewRow) => void }) {
  if (!rows.length)
    return (
      <section className={panel}>
        <EmptyState icon={ClipboardCheck} compact title={attention ? "Nothing needs attention." : "Nothing is ready yet."} />
      </section>
    );
  return (
    <section className={cn(panel, "relative overflow-x-auto")}>
      <table className="w-full min-w-[640px] text-sm" aria-label={attention ? "KPI values that need attention" : "KPI values ready to approve"}>
        <thead className="border-b border-line bg-tint text-left text-xs text-muted">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">Site</th>
            <th scope="col" className="px-3 py-2 font-medium">KPI</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Value</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">vs last year</th>
            <th scope="col" className="px-3 py-2 font-medium">{attention ? "Why it's held" : "Checks"}</th>
            <th scope="col" className="px-4 py-2"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              data-row-id={r.id}
              tabIndex={0}
              aria-label={`${r.kpiName} · ${r.siteName} · ${r.periodLabel}`}
              data-testid="kpi-review-row"
              onClick={() => onOpen(r)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.target === e.currentTarget) onOpen(r);
              }}
              className={cn("cursor-pointer border-b border-line last:border-0 hover:bg-tint", focusRing)}
            >
              <td className="px-4 py-2 text-ink">{r.siteName}</td>
              <td className="px-3 py-2">
                <span className="block font-medium text-ink">{r.kpiName}</span>
                <span className="block text-xs text-muted">{r.periodLabel}</span>
              </td>
              <td className="px-3 py-2 text-right font-num tabular-nums text-ink">{r.valueText}</td>
              <td className="px-3 py-2 text-right font-num tabular-nums text-muted">{r.change ?? "—"}</td>
              <td className="px-3 py-2">
                {r.ready ? (
                  <Badge tone="good">Ready</Badge>
                ) : (
                  <span className="flex flex-wrap items-center gap-1">
                    {r.checks
                      .filter((c) => !c.info)
                      .map((c) => (
                        <Badge key={c.id} tone="warn">
                          {c.label}
                        </Badge>
                      ))}
                    {r.value.comment && <span className="text-xs text-muted">“{r.value.comment}”</span>}
                  </span>
                )}
              </td>
              <td className="px-4 py-2 text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Open ${r.kpiName} at ${r.siteName}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(r);
                  }}
                >
                  Open
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded-chip border border-line bg-panel px-1 font-num text-[11px] text-ink">{children}</kbd>;
}
