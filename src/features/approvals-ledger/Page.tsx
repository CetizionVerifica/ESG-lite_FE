import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Layers, SearchX } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import type { EmissionStatus } from "../../services/emissionService";
import {
  Button,
  ContextChips,
  DataTable,
  EMPTY_FILTERS,
  EmptyState,
  type ExportFormat,
  FilterBar,
  type FilterDef,
  Modal,
  PageHeader,
  RejectReasonModal,
  Select,
  type SortState,
  Tabs,
  cn,
  exportMatrix,
  focusRing,
  formatNumber,
  UNDO_MS,
  toMatrix,
  useContextParams,
  useDropStaleCategories,
  useFilterParams,
  useRowKeys,
  useToast,
  useUndoableApprove,
  withoutParams,
  writeContext,
  writeFilterParams,
} from "../../ui";
import {
  EXPORT_CAP,
  READY_CAP,
  commitApprove,
  errorMessage,
  fetchAllForExport,
  fetchReadyIds,
  loadConfigs,
  useBatches,
  useColumnConfigs,
  useEmissionList,
  useListAttention,
  useReviewCounts,
  useReviewMutations,
  useStatusCounts,
  useThreshold,
} from "./api";
import { type ReviewGroup, parseGroup } from "../../lib/scope3/checks";
import { DQ_FILTER_OPTIONS, METHOD_FILTER_OPTIONS, parseDqMax, parseMethodFilter } from "../../lib/scope3/dq";
import { useApproveAllReady } from "./hooks/useApproveAllReady";
import { feraCategoryIds } from "../../lib/emissions/pendingCount";
import { BatchesView } from "./components/BatchesView";
import { CloseMonthView } from "./components/CloseMonthView";
import { useReviewWorkflow } from "../../lib/reviewWorkflow";
import { ReportMenu } from "./components/ReportMenu";
import { RecordDrawer } from "./components/RecordDrawer";
import { ledgerColumns } from "./components/columns";
import {
  DEFAULT_SORT,
  type LedgerRow,
  PAGE_SIZES,
  type Tab,
  approveAllCopy,
  asStatus,
  attentionOn,
  effectiveStatus,
  listParams,
  mergeFera,
  periodQuery,
  rowPeriodLabel,
  skippedCopy,
} from "./logic";

type SiteOption = { site_id: number; name: string; company?: { company_id: number }; categories?: { category_id: number; category_name: string }[] };

const TAB_PATH: Record<Tab, string> = { approvals: "/data/approvals", ledger: "/data/ledger" };
const CONTEXT_KEYS = ["site", "category", "period"];

const STATUS_FILTER: FilterDef = {
  key: "status",
  label: "Status",
  multiple: false,
  options: [
    { value: "pending", label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" },
  ],
};

function useManagerSites(): SiteOption[] {
  const { user } = useAuth();
  return useMemo(() => {
    const list = (user?.sites as SiteOption[] | undefined) ?? [];
    return list.length > 0 ? list : user?.site ? [user.site as SiteOption] : [];
  }, [user]);
}

/** S3-3: how rows were calculated (`method=`) and how good their data is (`dq_max=`). */
const METHOD_FILTER: FilterDef = { key: "method", label: "Method", multiple: false, options: METHOD_FILTER_OPTIONS };
const DQ_FILTER: FilterDef = { key: "dq", label: "Data quality", multiple: false, options: DQ_FILTER_OPTIONS };

/** FilterBar keys kept in the URL per tab; Approvals is always pending, so it has no status chip. */
const FILTER_KEYS: Record<Tab, string[]> = { approvals: ["method", "dq"], ledger: ["status", "method", "dq"] };
const TAB_FILTERS: Record<Tab, FilterDef[]> = { approvals: [METHOD_FILTER, DQ_FILTER], ledger: [STATUS_FILTER, METHOD_FILTER, DQ_FILTER] };

const describe = (r: LedgerRow) => `${r.category?.category_name ?? "Entry"} · ${r.site?.name ?? "—"} · ${rowPeriodLabel(r)}`;

/** `close`: S3-15 Close month, only with the company's review workflow on. */
type View = Tab | "batches" | "close";

/** P07: `/data/approvals` (Approvals; `?view=batches` Upload batches, `?view=close` Close month) and `/data/ledger`. */
export default function EmissionsPage({ tab }: { tab: Tab }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const sites = useManagerSites();
  const [ctx] = useContextParams();
  const workflow = useReviewWorkflow();
  const viewParam = tab === "approvals" ? params.get("view") : null;
  const view: View = viewParam === "batches" ? "batches" : viewParam === "close" && workflow ? "close" : tab;

  const categories = useMemo(() => {
    const inScope = ctx.siteIds.length ? sites.filter((s) => ctx.siteIds.includes(s.site_id)) : sites;
    const byId = new Map<number, string>();
    for (const s of inScope) for (const c of s.categories ?? []) byId.set(c.category_id, c.category_name);
    return [...byId].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [sites, ctx.siteIds]);
  useDropStaleCategories(categories, categories.length > 0);
  const feraIds = useMemo(
    () => feraCategoryIds(ctx.siteIds.length ? sites.filter((s) => ctx.siteIds.includes(s.site_id)) : sites),
    [sites, ctx.siteIds],
  );
  const search = params.get("q")?.trim() || null;
  // On the list tabs `?batch=` narrows the list to one upload batch; on the batches tab it marks that batch's row.
  const batchId = view === "batches" ? null : params.get("batch")?.trim() || null;
  const method = parseMethodFilter(params.get("method"));
  const dqMax = parseDqMax(params.get("dq"));
  const counts = useStatusCounts(ctx.siteIds, feraIds, { categoryId: ctx.categoryIds, ...periodQuery(ctx.period), search, batchId, method, dqMax });
  // No site chip = all of the manager's sites; batches must always be scoped (the endpoint isn't).
  const scopeSites = useMemo(() => (ctx.siteIds.length ? ctx.siteIds : sites.map((s) => s.site_id)), [ctx.siteIds, sites]);
  const batches = useBatches(scopeSites, ctx.categoryIds);

  // Tabs keep the context (sites, category, period) and drop the list filters.
  const goView = (next: View) => {
    const keep = new URLSearchParams();
    for (const k of CONTEXT_KEYS) {
      const v = params.get(k);
      if (v) keep.set(k, v);
    }
    if (next === "batches" || next === "close") keep.set("view", next);
    navigate({ pathname: TAB_PATH[next === "batches" || next === "close" ? "approvals" : next], search: keep.toString() });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Emissions"
        context={
          <ContextChips
            chips={["site", "category", "period"]}
            sites={sites.map((s) => ({ value: s.site_id, label: s.name }))}
            categories={categories}
            periodKinds={["month", "cy"]}
            allowAnyPeriod
            multiCategory
          />
        }
      />
      <div className="flex flex-wrap items-end justify-between gap-2">
        <Tabs<View>
          label="Emissions views"
          value={view}
          onChange={goView}
          items={[
            { value: "approvals", label: "Approvals", count: counts.data?.pending_count },
            { value: "ledger", label: "Ledger" },
            { value: "batches", label: "Upload batches", count: batches.data?.filter((b) => b.pending_count > 0).length },
            ...(workflow ? [{ value: "close" as const, label: "Close month" }] : []),
          ]}
        />
        <ReportMenu siteIds={ctx.siteIds.length ? ctx.siteIds : sites.map((s) => s.site_id)} categoryIds={ctx.categoryIds} period={ctx.period} />
      </div>
      {view === "batches" ? (
        <BatchesView siteIds={scopeSites} categoryIds={ctx.categoryIds} />
      ) : view === "close" ? (
        <CloseMonthView siteIds={ctx.siteIds} />
      ) : (
        <ListView key={view} tab={view} showFera={ctx.categoryIds.some((id) => feraIds.includes(id))} />
      )}
    </div>
  );
}

function ListView({ tab, showFera }: { tab: Tab; showFera: boolean }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [ctx] = useContextParams();
  const [filters, setFilters] = useFilterParams(FILTER_KEYS[tab]);
  const status = tab === "ledger" ? asStatus(filters.filters.status?.[0]) : null;
  const batchId = params.get("batch")?.trim() || null;
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT[tab]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const [selected, setSelected] = useState<(string | number)[]>([]);
  const [drawer, setDrawer] = useState<LedgerRow | null>(null);
  const [rejecting, setRejecting] = useState<number[] | null>(null);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [collectingReady, setCollectingReady] = useState(false);
  const [deleting, setDeleting] = useState<LedgerRow[] | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // XI5: a batch's pending rows the smart import was least sure about come first, as a filter chip
  // that is on while there are any. The count uses the list's own filters (pending only), so the
  // chip never opens on approved rows.
  const base = {
    tab,
    siteIds: ctx.siteIds,
    categoryIds: ctx.categoryIds,
    period: ctx.period,
    search: filters.q,
    status,
    batchId,
    method: parseMethodFilter(filters.filters.method?.[0]),
    dqMax: parseDqMax(filters.filters.dq?.[0]),
    sort,
    page,
    pageSize,
  };
  const attentionParam = params.get("attention");
  const attentionCountQ = useListAttention(tab === "approvals" && batchId ? listParams({ ...base, attention: false }) : null);
  const attentionCount = attentionCountQ.data;
  // Offered only when the API counts attention rows; an older API ignores the filter, so `?attention=1` alone isn't enough.
  const attentionOffered = tab === "approvals" && !!batchId && typeof attentionCount === "number" && (attentionCount > 0 || attentionParam === "1");
  const attention = attentionOffered && attentionOn(attentionParam, attentionCount ?? undefined);
  const setAttention = (on: boolean) => setParams((p) => { const next = new URLSearchParams(p); next.set("attention", on ? "1" : "0"); return next; }, { replace: true });
  // With the chip on by default, wait for the count before the first list fetch, so the list
  // doesn't load once without the filter and then again with it (resetting page and selection).
  const waitForAttention = tab === "approvals" && !!batchId && attentionParam === null && attentionCount === undefined && !attentionCountQ.isError;

  // S3-15: pending rows split into Ready and Needs attention by the review checks (`?group=`).
  // Not with a batch: there the XI5 chip narrows the list. Hidden on an API without checks.
  const groupsOn = tab === "approvals" && !batchId;
  const reviewCountsQ = useReviewCounts(groupsOn ? listParams({ ...base, attention: false }) : null);
  const groupCounts = groupsOn ? (reviewCountsQ.data ?? null) : null;
  // An API without checks ignores `ready`, so the filter is sent until the counts say there are none.
  const group = groupsOn && reviewCountsQ.data !== null ? parseGroup(params.get("group")) : null;
  const setGroup = (next: ReviewGroup | null) =>
    setParams((p) => {
      const out = new URLSearchParams(p);
      if (next) out.set("group", next);
      else out.delete("group"); // data-loss-reviewed: URL param, not a record
      return out;
    }, { replace: true });
  const sites = useManagerSites();
  const threshold = useThreshold(sites[0]?.company?.company_id ?? null);
  const checkCtx = useMemo(() => ({ pct: threshold.data ?? null }), [threshold.data]);

  const query = listParams({ ...base, attention, group });
  const list = useEmissionList(query, !waitForAttention);
  const review = useReviewMutations();

  // New filters start again on page 1 with nothing selected.
  const filterKey = JSON.stringify({ ...query, page: 0 });
  useEffect(() => {
    setPage(0);
    setSelected([]);
  }, [filterKey]);

  const undoable = useUndoableApprove<EmissionStatus>({
    commit: commitApprove,
    onCommitted: () => void review.refresh(),
    onFailed: (_id, e) => toast({ title: "Couldn't approve an entry", description: errorMessage(e, "It is back in the queue."), tone: "bad" }),
  });
  const approveAll = useApproveAllReady({
    onDone: async (result) => {
      await review.refresh();
      const skipped = skippedCopy(result.skipped.length);
      if (skipped) toast({ title: "Some entries weren't approved", description: skipped });
    },
    onFailed: (e) => toast({ title: "Couldn't approve the ready entries", description: errorMessage(e, "They are back in the queue."), tone: "bad" }),
  });
  const { isWaiting: bulkWaiting } = approveAll;
  const statusOf = useCallback(
    (r: LedgerRow) => (r.status === "pending" && bulkWaiting(r.pk_id) ? "approved" : effectiveStatus(r, undoable.optimistic)),
    [bulkWaiting, undoable.optimistic],
  );

  const merged = useMemo(() => mergeFera(list.data?.data ?? [], showFera), [list.data, showFera]);
  const rows = useMemo(
    () => (tab === "approvals" ? merged.rows.filter((r) => statusOf(r) === "pending") : merged.rows),
    [merged.rows, statusOf, tab],
  );

  const { settle } = undoable;
  useEffect(() => {
    if (!list.data || list.isFetching) return;
    const server = new Map(list.data.data.map((r) => [r.pk_id, r.status] as const));
    settle((id) => server.get(id));
  }, [list.data, list.isFetching, settle]);

  const pairs = useMemo(
    () => (list.data?.data ?? []).filter((r) => r.site && r.category).map((r) => [r.site.site_id, r.category.category_id] as [number, number]),
    [list.data],
  );
  const configOf = useColumnConfigs(pairs);

  // ── Actions ──
  const { focusRow } = useRowKeys(
    tableRef,
    {
      onApprove: (id, index) => {
        const row = rows.find((r) => r.pk_id === id);
        if (row) approve(row, index);
      },
      onReject: (id) => {
        const row = rows.find((r) => r.pk_id === id);
        if (row) reject([row]);
      },
      onToggle: (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])),
    },
    drawer === null && rejecting === null && deleting === null,
  );

  function approve(row: LedgerRow, index?: number) {
    if (statusOf(row) !== "pending") {
      toast({ title: "Only pending entries can be approved" });
      return;
    }
    undoable.approve(row.pk_id);
    toast({
      title: "Entry approved",
      description: describe(row),
      tone: "good",
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          // The toast pauses on hover and outlives a tab switch; the approval doesn't wait for it.
          if (!undoable.undo(row.pk_id)) toast({ title: "Too late to undo", description: "This entry was already approved. Reject it if it's wrong." });
        },
      },
    });
    // An approved row leaves the selection, so bulk actions don't count it as pending again.
    setSelected((s) => s.filter((id) => Number(id) !== row.pk_id));
    if (tab === "approvals") {
      if (drawer?.pk_id === row.pk_id) setDrawer(null);
      if (index !== undefined) focusRow(index);
    }
  }

  function reject(target: LedgerRow[], reason = "") {
    const ids = target.filter((r) => statusOf(r) === "pending").map((r) => r.pk_id);
    if (ids.length === 0) {
      toast({ title: "Only pending entries can be rejected" });
      return;
    }
    setRejectError(null);
    setRejectReason(reason);
    setRejecting(ids);
  }

  /** The drawer's "Approve and next": approve this entry and open the next one still waiting. */
  function approveAndNext(row: LedgerRow) {
    const index = rows.findIndex((r) => r.pk_id === row.pk_id);
    const rest = rows.filter((r) => r.pk_id !== row.pk_id);
    const next = rest[Math.max(index, 0)] ?? rest[0] ?? null;
    approve(row);
    setDrawer(next);
  }

  /** "Approve all N ready": every pending row passing its checks under the current filters, with undo. */
  async function approveAllReady() {
    setCollectingReady(true);
    try {
      const ids = await fetchReadyIds(listParams({ ...base, attention: false, group: null }));
      if (ids.length === 0) {
        toast({ title: "Nothing is ready to approve", description: "Every pending entry needs attention." });
        return;
      }
      const token = approveAll.start(ids);
      setSelected([]);
      const copy = approveAllCopy(ids.length);
      const more = (groupCounts?.ready ?? 0) - ids.length;
      toast({
        title: copy.toast,
        description:
          ids.length >= READY_CAP && more > 0
            ? `They pass every check. One action approves up to ${formatNumber(READY_CAP)}; approve again for the other ${formatNumber(more)}.`
            : "They pass every check.",
        tone: "good",
        duration: UNDO_MS,
        action: {
          label: "Undo",
          onClick: () => {
            if (!approveAll.undo(token)) toast({ title: "Too late to undo", description: "These entries were already approved. Reject any that are wrong." });
          },
        },
      });
    } catch (e) {
      toast({ title: "Couldn't load the ready entries", description: errorMessage(e, "Nothing was approved."), tone: "bad" });
    } finally {
      setCollectingReady(false);
    }
  }

  const confirmReject = (reason: string) => {
    if (!rejecting) return;
    const ids = rejecting;
    review.reject.mutate(
      { ids, reason },
      {
        onSuccess: () => {
          setRejecting(null);
          setSelected((s) => s.filter((id) => !ids.includes(Number(id))));
          if (drawer && ids.includes(drawer.pk_id)) setDrawer(null);
          toast({ title: ids.length === 1 ? "Entry rejected" : `${ids.length} entries rejected`, description: "The submitter has been told why." });
        },
        onError: (e) => setRejectError(errorMessage(e, "Couldn't reject. Nothing was changed.")),
      },
    );
  };

  const approveMany = (target: LedgerRow[]) => {
    const ids = target.filter((r) => statusOf(r) === "pending").map((r) => r.pk_id);
    review.approveMany.mutate(ids, {
      onSuccess: () => {
        setSelected([]);
        toast({ title: `${ids.length} ${ids.length === 1 ? "entry" : "entries"} approved`, tone: "good" });
      },
      onError: (e) => toast({ title: "Couldn't approve the selection", description: errorMessage(e, "Nothing was changed."), tone: "bad" }),
    });
  };

  const confirmDelete = () => {
    if (!deleting) return;
    const ids = deleting.map((r) => r.pk_id);
    // A deleted row has nothing left to approve.
    for (const id of ids) undoable.undo(id);
    review.remove.mutate(ids, {
      onSuccess: () => {
        setDeleting(null);
        setSelected((s) => s.filter((id) => !ids.includes(Number(id))));
        if (drawer && ids.includes(drawer.pk_id)) setDrawer(null);
        toast({ title: ids.length === 1 ? "Entry deleted" : `${ids.length} entries deleted` });
      },
    });
  };

  const askDelete = (target: LedgerRow[]) => {
    review.remove.reset();
    setDeleting(target);
  };
  const actions = { open: setDrawer, approve: (r: LedgerRow) => approve(r), reject: (r: LedgerRow) => reject([r]), remove: (r: LedgerRow) => askDelete([r]) };
  // "Why it's held" only on Approvals, and only when the API sends checks.
  const showChecks = tab === "approvals" && rows.some((r) => r.checks !== undefined);
  const columns = ledgerColumns({ configOf, feraOf: merged.feraOf, statusOf, actions, checks: showChecks ? checkCtx : undefined });

  const filtered = !!filters.q.trim() || !!status || !!base.method || !!base.dqMax || !!batchId || !!group || ctx.categoryIds.length > 0 || ctx.period !== null;
  // One URL write: two functional setSearchParams calls in one tick both start from the
  // same params, so the second would undo the first.
  const clearFilters = () =>
    setParams((p) => writeContext(withoutParams(writeFilterParams(p, EMPTY_FILTERS, FILTER_KEYS[tab]), ["batch", "attention", "group"]), { categoryIds: [], period: null }), { replace: true });
  const showAllRows = () => setParams((p) => withoutParams(p, ["batch", "attention"]), { replace: true });
  // Every row shown was just approved, but the server still lists them (undo window): more may follow.
  const savingApprovals = tab === "approvals" && rows.length === 0 && (list.data?.total ?? 0) > 0;
  const empty = savingApprovals ? (
    <EmptyState icon={CheckCircle2} title="Saving your approvals" description="The rest of the queue appears once they're saved." />
  ) : tab === "approvals" && !filtered ? (
      <EmptyState
        icon={CheckCircle2}
        title="You're all caught up"
        description="Nothing is waiting for approval."
        action={
          <Link to={TAB_PATH.ledger} className={cn("text-sm font-medium text-accent underline", focusRing)}>
            Open the ledger
          </Link>
        }
      />
    ) : (
      <EmptyState icon={SearchX} title="No records match" action={<Button onClick={clearFilters}>Clear filters</Button>} />
    );

  const liveDrawerRow = drawer ? (list.data?.data.find((r) => r.pk_id === drawer.pk_id) ?? drawer) : null;

  const exportView = async (format: ExportFormat) => {
    try {
      const all = await fetchAllForExport(query, list.data?.total ?? 0);
      const exported = mergeFera(all.rows, showFera);
      // Rows beyond this page need their own configs (option labels) and FERA links.
      const exportColumns = ledgerColumns({ configOf: await loadConfigs(qc, all.rows), feraOf: exported.feraOf, statusOf, actions });
      await exportMatrix(toMatrix(exported.rows, exportColumns.filter((c) => c.id !== "actions")), `emissions-${tab}`, format);
      if (all.capped) toast({ title: `Exported the first ${formatNumber(EXPORT_CAP)} rows`, description: "Narrow the filters to export the rest." });
    } catch (e) {
      toast({ title: "Couldn't export", description: errorMessage(e, "Try again in a moment."), tone: "bad" });
    }
  };

  return (
    <>
      {batchId && (
        <p role="status" className="flex flex-wrap items-center gap-2 rounded-control border border-line bg-panel px-3 py-2 text-sm text-ink">
          <Layers aria-hidden className="size-4 text-muted" />
          <span>
            Showing the {tab === "approvals" ? "pending " : ""}rows of one upload batch{attention ? " that need attention" : ""}.
            {tab === "approvals" && <span className="text-muted"> Approve or reject each one here; rows you have handled leave the list.</span>}
          </span>
          {attentionOffered && (
            <Button
              size="sm"
              variant={attention ? "primary" : "secondary"}
              aria-pressed={attention}
              title="Rows the smart import matched below 80 % or that were changed before the import"
              onClick={() => setAttention(!attention)}
            >
              Needs attention{attentionCount != null ? ` (${attentionCount})` : ""}
            </Button>
          )}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={showAllRows}>
            Show all rows
          </Button>
        </p>
      )}
      {groupCounts && (
        <div role="group" aria-label="Review groups" className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={group === "attention" ? "primary" : "secondary"}
            aria-pressed={group === "attention"}
            title="Pending entries held back by at least one check"
            onClick={() => setGroup(group === "attention" ? null : "attention")}
          >
            <AlertTriangle aria-hidden className="size-4" />
            Needs attention ({formatNumber(groupCounts.attention)})
          </Button>
          <Button
            size="sm"
            variant={group === "ready" ? "primary" : "secondary"}
            aria-pressed={group === "ready"}
            title="Pending entries that pass every check"
            onClick={() => setGroup(group === "ready" ? null : "ready")}
          >
            <CheckCircle2 aria-hidden className="size-4" />
            Ready ({formatNumber(groupCounts.ready)})
          </Button>
        </div>
      )}
      {tab === "approvals" && (
        <p className="hidden text-xs text-muted sm:block" data-testid="shortcuts">
          Keys: <Kbd>J</Kbd>/<Kbd>K</Kbd> move · <Kbd>A</Kbd> approve · <Kbd>R</Kbd> reject · <Kbd>Space</Kbd> select · <Kbd>Enter</Kbd> open
        </p>
      )}

      <div ref={tableRef}>
        <DataTable<LedgerRow>
          label={tab === "approvals" ? "Entries waiting for approval" : "Emission entries"}
          rows={rows}
          columns={columns}
          getRowId={(r) => r.pk_id}
          rowLabel={describe}
          loading={list.isPending}
          error={list.isError ? errorMessage(list.error, "Couldn't load entries.") : null}
          onRetry={() => void list.refetch()}
          empty={empty}
          sort={sort}
          onSortChange={setSort}
          selectable
          selectedIds={selected}
          onSelectionChange={setSelected}
          bulkActions={(sel) => {
            const pending = sel.filter((r) => statusOf(r) === "pending");
            return (
              <>
                <Button size="sm" variant="primary" disabled={pending.length === 0} loading={review.approveMany.isPending} onClick={() => approveMany(pending)}>
                  Approve{pending.length !== sel.length ? ` ${pending.length} pending` : ""}
                </Button>
                <Button size="sm" disabled={pending.length === 0} onClick={() => reject(pending)}>
                  Reject{pending.length !== sel.length ? ` ${pending.length} pending` : ""}
                </Button>
                <Button size="sm" variant="danger" disabled={sel.length === 0} onClick={() => askDelete(sel)}>
                  Delete
                </Button>
              </>
            );
          }}
          pagination={{ mode: "server", page, pageSize, total: list.data?.total ?? 0, onPageChange: setPage }}
          onRowClick={setDrawer}
          onExport={(f) => void exportView(f)}
          storageKey={`p07-${tab}`}
          toolbar={
            <>
              <FilterBar
                filters={TAB_FILTERS[tab]}
                value={filters}
                onChange={setFilters}
                searchPlaceholder="Search category, value or submitter"
                storageKey={`p07-${tab}-views`}
                loading={list.isFetching && !list.isPending}
              />
              {tab === "ledger" && (
                <Select<number>
                  label="Rows per page"
                  hideLabel
                  value={pageSize}
                  onChange={(v) => v && setPageSize(v)}
                  options={PAGE_SIZES.map((n) => ({ value: n, label: `${n} rows` }))}
                />
              )}
            </>
          }
        />
      </div>
      {groupCounts && groupCounts.ready > 0 && group !== "attention" && selected.length === 0 && !approveAll.busy && (
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-line bg-page py-3" data-testid="approve-ready-bar">
          <p className="text-sm text-muted">
            {groupCounts.ready === 1 ? "1 entry passes" : `${formatNumber(groupCounts.ready)} entries pass`} every check.
          </p>
          <Button variant="primary" loading={collectingReady} onClick={() => void approveAllReady()}>
            {approveAllCopy(groupCounts.ready, READY_CAP).button}
          </Button>
        </div>
      )}

      <RecordDrawer
        row={liveDrawerRow}
        fera={liveDrawerRow ? merged.feraOf.get(liveDrawerRow.pk_id) : undefined}
        status={liveDrawerRow ? statusOf(liveDrawerRow) : undefined}
        onClose={() => setDrawer(null)}
        onApprove={(r) => approve(r)}
        onApproveNext={tab === "approvals" ? approveAndNext : undefined}
        onReject={(r, reason) => reject([r], reason)}
        checkContext={checkCtx}
        onEdited={(saved) => {
          // Keep showing the entry even if the edit moved it out of the current filter.
          if (saved && drawer) setDrawer({ ...drawer, ...saved });
          toast({ title: "Changes saved", description: "The change and your reason are in the entry's history.", tone: "good" });
        }}
      />
      <RejectReasonModal
        open={rejecting !== null}
        count={rejecting?.length ?? 0}
        busy={review.reject.isPending}
        error={rejectError}
        initialReason={rejectReason}
        onClose={() => setRejecting(null)}
        onConfirm={confirmReject}
      />
      <DeleteModal rows={deleting} statusOf={statusOf} busy={review.remove.isPending} error={review.remove.error} onClose={() => setDeleting(null)} onConfirm={confirmDelete} />
    </>
  );
}

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded-chip border border-line bg-panel px-1 font-num text-[11px] text-ink">{children}</kbd>;
}

function DeleteModal({
  rows,
  statusOf,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  rows: LedgerRow[] | null;
  statusOf: (r: LedgerRow) => EmissionStatus;
  busy: boolean;
  error: unknown;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const n = rows?.length ?? 0;
  const byStatus = (s: EmissionStatus) => rows?.filter((r) => statusOf(r) === s).length ?? 0;
  const approved = byStatus("approved");
  return (
    <Modal
      open={rows !== null}
      onClose={onClose}
      tone="destructive"
      title={n === 1 ? "Delete this entry?" : `Delete ${n} entries?`}
      description={
        <>
          {approved > 0 && `${approved} approved ${approved === 1 ? "entry leaves" : "entries leave"} your reported totals. `}
          Linked FERA rows and attached documents are deleted with {n === 1 ? "it" : "them"}. This can't be undone.
        </>
      }
      error={error ? errorMessage(error, "Couldn't delete. Nothing was changed.") : null}
      primaryAction={{ label: n === 1 ? "Delete entry" : `Delete ${n} entries`, loading: busy, onClick: onConfirm }}
    />
  );
}
