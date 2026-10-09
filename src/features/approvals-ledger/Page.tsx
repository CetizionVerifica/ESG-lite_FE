import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  FilterBar,
  type FilterDef,
  Modal,
  PageHeader,
  Select,
  type SortState,
  Tabs,
  cn,
  focusRing,
  useContextParams,
  useFilterParams,
  useToast,
} from "../../ui";
import { commitApprove, errorMessage, useColumnConfigs, useEmissionList, useReviewMutations, useStatusCounts } from "./api";
import { RecordDrawer } from "./components/RecordDrawer";
import { RejectModal } from "./components/RejectModal";
import { ledgerColumns } from "./components/columns";
import { UNDO_MS, useUndoableApprove } from "./hooks/useUndoableApprove";
import { useRowKeys } from "./hooks/useRowKeys";
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

const describe = (r: LedgerRow) => `${r.category?.category_name ?? "Entry"} · ${r.site?.name ?? "—"} · ${rowPeriodLabel(r)}`;

/** P07: `/data/approvals` and `/data/ledger`, one page with two tabs. */
export default function EmissionsPage({ tab }: { tab: Tab }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { toast } = useToast();
  const sites = useManagerSites();
  const [ctx, updateCtx] = useContextParams();
  const [filters, setFilters] = useFilterParams(tab === "ledger" ? ["status"] : []);
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

  const categories = useMemo(() => {
    const inScope = ctx.siteIds.length ? sites.filter((s) => ctx.siteIds.includes(s.site_id)) : sites;
    const byId = new Map<number, string>();
    for (const s of inScope) for (const c of s.categories ?? []) byId.set(c.category_id, c.category_name);
    return [...byId].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [sites, ctx.siteIds]);
  const categoryName = categories.find((c) => c.value === ctx.categoryId)?.label ?? "";

  const query = listParams({ tab, siteIds: ctx.siteIds, categoryId: ctx.categoryId, period: ctx.period, search: filters.q, status, sort, page, pageSize });
  const list = useEmissionList(query);
  const counts = useStatusCounts(ctx.siteIds);
  const review = useReviewMutations();

  // New filters start again on page 1 with nothing selected.
  const filterKey = JSON.stringify({ ...query, page: 0 });
  useEffect(() => {
    setPage(0);
    setSelected([]);
  }, [filterKey]);

  const undoable = useUndoableApprove({
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
      action: { label: "Undo", onClick: () => undoable.undo(row.pk_id) },
    });
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

  // ── Header ──
  const goTab = (next: Tab) => {
    const keep = new URLSearchParams();
    for (const k of CONTEXT_KEYS) {
      const v = params.get(k);
      if (v) keep.set(k, v);
    }
    navigate({ pathname: TAB_PATH[next], search: keep.toString() });
  };
  const pendingCount = counts.data?.pending_count;

  const filtered = !!filters.q.trim() || !!status || ctx.categoryId !== null || ctx.period !== null;
  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    updateCtx({ categoryId: null, period: null });
  };
  const empty =
    tab === "approvals" && !filtered ? (
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
      <Tabs<Tab>
        label="Emissions views"
        value={tab}
        onChange={goTab}
        items={[
          { value: "approvals", label: "Approvals", count: pendingCount },
          { value: "ledger", label: "Ledger" },
        ]}
      />
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
      />
      <RejectModal
        open={rejecting !== null}
        count={rejecting?.length ?? 0}
        busy={review.reject.isPending}
        error={rejectError}
        onClose={() => setRejecting(null)}
        onConfirm={confirmReject}
      />
      <DeleteModal rows={deleting} busy={review.remove.isPending} error={review.remove.error} onClose={() => setDeleting(null)} onConfirm={confirmDelete} />
    </div>
  );
}

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded-chip border border-line bg-panel px-1 font-num text-[11px] text-ink">{children}</kbd>;
}

function DeleteModal({
  rows,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  rows: LedgerRow[] | null;
  busy: boolean;
  error: unknown;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const n = rows?.length ?? 0;
  const byStatus = (s: EmissionStatus) => rows?.filter((r) => r.status === s).length ?? 0;
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
