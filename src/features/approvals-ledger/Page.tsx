import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, SearchX } from "lucide-react";
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
  useFilterParams,
  useRowKeys,
  useToast,
  useUndoableApprove,
  writeContext,
  writeFilterParams,
} from "../../ui";
import {
  EXPORT_CAP,
  commitApprove,
  errorMessage,
  fetchAllForExport,
  loadConfigs,
  useBatches,
  useColumnConfigs,
  useEmissionList,
  useReviewMutations,
  useStatusCounts,
} from "./api";
import { feraCategoryIds } from "../../lib/emissions/pendingCount";
import { BatchesView } from "./components/BatchesView";
import { ReportMenu } from "./components/ReportMenu";
import { RecordDrawer } from "./components/RecordDrawer";
import { ledgerColumns } from "./components/columns";
import { DEFAULT_SORT, type LedgerRow, PAGE_SIZES, type Tab, asStatus, effectiveStatus, listParams, mergeFera, rowPeriodLabel } from "./logic";

type SiteOption = { site_id: number; name: string; categories?: { category_id: number; category_name: string }[] };

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

/** FilterBar keys kept in the URL per tab; Approvals is always pending, so it has no status chip. */
const FILTER_KEYS: Record<Tab, string[]> = { approvals: [], ledger: ["status"] };

const describe = (r: LedgerRow) => `${r.category?.category_name ?? "Entry"} · ${r.site?.name ?? "—"} · ${rowPeriodLabel(r)}`;

type View = Tab | "batches";

/** P07: `/data/approvals` (Approvals; `?view=batches` Upload batches) and `/data/ledger`. */
export default function EmissionsPage({ tab }: { tab: Tab }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const sites = useManagerSites();
  const [ctx] = useContextParams();
  const view: View = tab === "approvals" && params.get("view") === "batches" ? "batches" : tab;

  const categories = useMemo(() => {
    const inScope = ctx.siteIds.length ? sites.filter((s) => ctx.siteIds.includes(s.site_id)) : sites;
    const byId = new Map<number, string>();
    for (const s of inScope) for (const c of s.categories ?? []) byId.set(c.category_id, c.category_name);
    return [...byId].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [sites, ctx.siteIds]);
  const feraIds = useMemo(
    () => feraCategoryIds(ctx.siteIds.length ? sites.filter((s) => ctx.siteIds.includes(s.site_id)) : sites),
    [sites, ctx.siteIds],
  );
  const counts = useStatusCounts(ctx.siteIds, feraIds);
  // No site chip = all of the manager's sites; batches must always be scoped (the endpoint isn't).
  const scopeSites = useMemo(() => (ctx.siteIds.length ? ctx.siteIds : sites.map((s) => s.site_id)), [ctx.siteIds, sites]);
  const batches = useBatches(scopeSites, ctx.categoryId);

  // Tabs keep the context (sites, category, period) and drop the list filters.
  const goView = (next: View) => {
    const keep = new URLSearchParams();
    for (const k of CONTEXT_KEYS) {
      const v = params.get(k);
      if (v) keep.set(k, v);
    }
    if (next === "batches") keep.set("view", "batches");
    navigate({ pathname: TAB_PATH[next === "batches" ? "approvals" : next], search: keep.toString() });
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
          ]}
        />
        <ReportMenu siteIds={ctx.siteIds.length ? ctx.siteIds : sites.map((s) => s.site_id)} categoryId={ctx.categoryId} period={ctx.period} />
      </div>
      {view === "batches" ? (
        <BatchesView siteIds={scopeSites} categoryId={ctx.categoryId} />
      ) : (
        <ListView key={view} tab={view} categoryName={categories.find((c) => c.value === ctx.categoryId)?.label ?? ""} />
      )}
    </div>
  );
}

function ListView({ tab, categoryName }: { tab: Tab; categoryName: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, setParams] = useSearchParams();
  const [ctx] = useContextParams();
  const [filters, setFilters] = useFilterParams(FILTER_KEYS[tab]);
  const status = tab === "ledger" ? asStatus(filters.filters.status?.[0]) : null;
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT[tab]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0]);
  const [selected, setSelected] = useState<(string | number)[]>([]);
  const [drawer, setDrawer] = useState<LedgerRow | null>(null);
  const [rejecting, setRejecting] = useState<number[] | null>(null);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<LedgerRow[] | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const query = listParams({ tab, siteIds: ctx.siteIds, categoryId: ctx.categoryId, period: ctx.period, search: filters.q, status, sort, page, pageSize });
  const list = useEmissionList(query);
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
  const statusOf = useCallback((r: LedgerRow) => effectiveStatus(r, undoable.optimistic), [undoable.optimistic]);

  const merged = useMemo(() => mergeFera(list.data?.data ?? [], categoryName.toLowerCase() === "fera"), [list.data, categoryName]);
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

  function reject(target: LedgerRow[]) {
    const ids = target.filter((r) => statusOf(r) === "pending").map((r) => r.pk_id);
    if (ids.length === 0) {
      toast({ title: "Only pending entries can be rejected" });
      return;
    }
    setRejectError(null);
    setRejecting(ids);
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
  const columns = ledgerColumns({ configOf, feraOf: merged.feraOf, statusOf, actions });

  const filtered = !!filters.q.trim() || !!status || ctx.categoryId !== null || ctx.period !== null;
  // One URL write: two functional setSearchParams calls in one tick both start from the
  // same params, so the second would undo the first.
  const clearFilters = () =>
    setParams((p) => writeContext(writeFilterParams(p, EMPTY_FILTERS, FILTER_KEYS[tab]), { categoryId: null, period: null }), { replace: true });
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
      const exported = mergeFera(all.rows, categoryName.toLowerCase() === "fera");
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
                filters={tab === "ledger" ? [STATUS_FILTER] : []}
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

      <RecordDrawer
        row={liveDrawerRow}
        fera={liveDrawerRow ? merged.feraOf.get(liveDrawerRow.pk_id) : undefined}
        status={liveDrawerRow ? statusOf(liveDrawerRow) : undefined}
        onClose={() => setDrawer(null)}
        onApprove={(r) => approve(r)}
        onReject={(r) => reject([r])}
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
