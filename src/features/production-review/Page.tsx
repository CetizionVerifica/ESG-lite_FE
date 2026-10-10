import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2, PackageX, SearchX } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import type { ProductionDataStatus } from "../../services/productionDataService";
import {
  Button,
  ContextChips,
  DataTable,
  EMPTY_FILTERS,
  EmptyState,
  type ExportFormat,
  FilterBar,
  type FilterDef,
  PageHeader,
  RejectReasonModal,
  UNDO_MS,
  exportMatrix,
  periodLabel,
  periodRange,
  toMatrix,
  useContextParams,
  useFilterParams,
  useRowKeys,
  useToast,
  useUndoableApprove,
  writeContext,
  writeFilterParams,
} from "../../ui";
import { commitApprove, errorMessage, useProductionList, useReviewMutations, useSiteProducts } from "./api";
import { RecordDrawer } from "./components/RecordDrawer";
import { productionColumns } from "./components/columns";
import { type ProductionRow, asStatus, describeRow, effectiveStatus, emptyTitle, matchesSearch, overlapsById } from "./logic";

type SiteOption = { site_id: number; name: string };

const FILTER_KEYS = ["status", "product"];
const PAGE_SIZE = 50;
const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

function useManagerSites(): SiteOption[] {
  const { user } = useAuth();
  return useMemo(() => {
    const list = (user?.sites as SiteOption[] | undefined) ?? [];
    return list.length > 0 ? list : user?.site ? [user.site as SiteOption] : [];
  }, [user]);
}

/** P08 `/data/production`: review the production quantities that feed intensity. */
export default function ProductionReviewPage() {
  const { toast } = useToast();
  const [, setParams] = useSearchParams();
  const sites = useManagerSites();
  const [ctx] = useContextParams();
  const [filters, setFilters] = useFilterParams(FILTER_KEYS);
  const status = asStatus(filters.filters.status?.[0]);
  const productId = Number(filters.filters.product?.[0]) || null;

  // No site chip = all of the manager's sites. The list is always asked per site.
  const scopeSites = useMemo(() => (ctx.siteIds.length ? ctx.siteIds.filter((id) => sites.some((s) => s.site_id === id)) : sites.map((s) => s.site_id)), [ctx.siteIds, sites]);
  const range = useMemo(() => (ctx.period ? periodRange(ctx.period) : null), [ctx.period]);
  const list = useProductionList(scopeSites, productId, range);
  const products = useSiteProducts(scopeSites);
  const review = useReviewMutations();

  const [selected, setSelected] = useState<(string | number)[]>([]);
  const [drawer, setDrawer] = useState<{ row: ProductionRow; edit: boolean } | null>(null);
  const [rejecting, setRejecting] = useState<number[] | null>(null);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // New filters start with nothing selected.
  const filterKey = JSON.stringify({ scopeSites, productId, range, status, q: filters.q });
  useEffect(() => setSelected([]), [filterKey]);

  const undoable = useUndoableApprove<ProductionDataStatus>({
    commit: commitApprove,
    onCommitted: review.refresh,
    onFailed: (_id, e) => toast({ title: "Couldn't approve a record", description: errorMessage(e, "It is back in the queue."), tone: "bad" }),
  });
  const statusOf = useCallback((r: ProductionRow) => effectiveStatus(r, undoable.optimistic), [undoable.optimistic]);

  const { settle } = undoable;
  useEffect(() => {
    if (!list.rows || list.isFetching) return;
    const server = new Map(list.rows.map((r) => [r.production_id, r.status] as const));
    settle((id) => server.get(id));
  }, [list.rows, list.isFetching, settle]);

  const all = useMemo(() => list.rows ?? [], [list.rows]);
  const overlaps = useMemo(() => overlapsById(all), [all]);
  const rows = useMemo(() => all.filter((r) => (!status || statusOf(r) === status) && matchesSearch(r, filters.q)), [all, status, statusOf, filters.q]);
  const pendingCount = all.filter((r) => statusOf(r) === "pending").length;

  // ── Actions ──
  const { focusRow } = useRowKeys(
    tableRef,
    {
      onApprove: (id, index) => {
        const row = rows.find((r) => r.production_id === id);
        if (row) approve(row, index);
      },
      onReject: (id) => {
        const row = rows.find((r) => r.production_id === id);
        if (row) reject([row]);
      },
      onToggle: (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])),
    },
    drawer === null && rejecting === null,
  );

  function approve(row: ProductionRow, index?: number) {
    if (statusOf(row) !== "pending") {
      toast({ title: "Only pending records can be approved" });
      return;
    }
    undoable.approve(row.production_id);
    toast({
      title: "Record approved",
      description: describeRow(row),
      tone: "good",
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          if (!undoable.undo(row.production_id)) toast({ title: "Too late to undo", description: "This record was already approved. Edit it if it's wrong." });
        },
      },
    });
    // An approved row leaves the selection, so bulk actions don't count it as pending again.
    setSelected((s) => s.filter((id) => Number(id) !== row.production_id));
    if (status === "pending") {
      if (drawer?.row.production_id === row.production_id) setDrawer(null);
      if (index !== undefined) focusRow(index);
    }
  }

  function reject(target: ProductionRow[]) {
    const ids = target.filter((r) => statusOf(r) === "pending").map((r) => r.production_id);
    if (ids.length === 0) {
      toast({ title: "Only pending records can be rejected" });
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
          if (drawer && ids.includes(drawer.row.production_id)) setDrawer(null);
          toast({ title: ids.length === 1 ? "Record rejected" : `${ids.length} records rejected`, description: "The submitter has been told why." });
        },
        onError: (e) => setRejectError(errorMessage(e, "Couldn't reject. Nothing was changed.")),
      },
    );
  };

  const approveMany = (target: ProductionRow[]) => {
    const ids = target.filter((r) => statusOf(r) === "pending").map((r) => r.production_id);
    review.approveMany.mutate(ids, {
      onSuccess: () => {
        setSelected([]);
        toast({ title: `${ids.length} ${ids.length === 1 ? "record" : "records"} approved`, tone: "good" });
      },
      onError: (e) => toast({ title: "Couldn't approve the selection", description: errorMessage(e, "Nothing was changed."), tone: "bad" }),
    });
  };

  const actions = {
    open: (r: ProductionRow) => setDrawer({ row: r, edit: false }),
    edit: (r: ProductionRow) => setDrawer({ row: r, edit: true }),
    approve: (r: ProductionRow) => approve(r),
    reject: (r: ProductionRow) => reject([r]),
  };
  const columns = productionColumns({ statusOf, overlaps, actions });

  const exportView = async (format: ExportFormat) => {
    try {
      await exportMatrix(toMatrix(rows, columns.filter((c) => c.id !== "actions")), "production-data", format);
    } catch {
      toast({ title: "Couldn't export", description: "Try again in a moment.", tone: "bad" });
    }
  };

  const siteName = (id: number) => sites.find((s) => s.site_id === id)?.name;
  const productOptions = useMemo(() => {
    const several = scopeSites.length > 1;
    return (products.products ?? [])
      .map((p) => ({ value: String(p.product_id), label: several && p.site?.name ? `${p.name} · ${p.site.name}` : p.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [products.products, scopeSites.length]);
  const filterDefs: FilterDef[] = [
    { key: "status", label: "Status", multiple: false, options: STATUS_OPTIONS },
    ...(productOptions.length ? [{ key: "product", label: "Product", multiple: false, options: productOptions }] : []),
  ];

  const filtered = !!filters.q.trim() || !!status || !!productId || ctx.period !== null || ctx.siteIds.length > 0;
  // One URL write, so the context and the filter params are cleared together.
  const clearFilters = () => setParams((p) => writeContext(writeFilterParams(p, EMPTY_FILTERS, FILTER_KEYS), { siteIds: [], period: null }), { replace: true });
  const noProducts = products.products !== undefined && products.products.length === 0 && all.length === 0;
  const savingApprovals = status === "pending" && rows.length === 0 && all.some((r) => r.status === "pending");
  const empty = noProducts ? (
    <EmptyState
      icon={PackageX}
      title={`No products are set up for ${scopeSites.length === 1 ? (siteName(scopeSites[0]) ?? "this site") : "these sites"}`}
      description="Products are added by your Superadmin. Ask them to add the products your site makes, then production data can be entered."
    />
  ) : savingApprovals ? (
    <EmptyState title="Saving your approvals" description="The rest of the queue appears once they're saved." />
  ) : (
    <EmptyState
      icon={SearchX}
      title={emptyTitle([
        ctx.siteIds.length ? ctx.siteIds.map(siteName).filter(Boolean).join(", ") : null,
        productOptions.find((p) => p.value === String(productId))?.label,
        STATUS_OPTIONS.find((s) => s.value === status)?.label,
        ctx.period ? periodLabel(ctx.period) : null,
        filters.q.trim() ? `"${filters.q.trim()}"` : null,
      ])}
      action={filtered ? <Button onClick={clearFilters}>Clear filters</Button> : undefined}
    />
  );

  if (sites.length === 0)
    return (
      <div className="space-y-6">
        <PageHeader title="Production data" />
        <EmptyState icon={Building2} title="You don't manage any sites yet." description="Ask your admin to assign one." />
      </div>
    );

  const liveRow = drawer ? (all.find((r) => r.production_id === drawer.row.production_id) ?? drawer.row) : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Production data"
        context={
          <ContextChips
            chips={["site", "period"]}
            sites={sites.map((s) => ({ value: s.site_id, label: s.name }))}
            periodKinds={["month", "quarter", "cy", "fy"]}
            allowAnyPeriod
          />
        }
      />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted" data-testid="record-count">
          {list.rows ? (
            <>
              {rows.length} {rows.length === 1 ? "record" : "records"}
              {pendingCount > 0 && ` · ${pendingCount} pending`}
            </>
          ) : (
            " "
          )}
        </p>
        <p className="hidden text-xs text-muted sm:block" data-testid="shortcuts">
          Keys: <Kbd>J</Kbd>/<Kbd>K</Kbd> move · <Kbd>A</Kbd> approve · <Kbd>R</Kbd> reject · <Kbd>Space</Kbd> select · <Kbd>Enter</Kbd> open
        </p>
      </div>

      <div ref={tableRef}>
        <DataTable<ProductionRow>
          label="Production records"
          rows={rows}
          columns={columns}
          getRowId={(r) => r.production_id}
          rowLabel={describeRow}
          loading={list.isPending}
          error={list.error ? errorMessage(list.error, "Couldn't load production data.") : null}
          onRetry={list.refetch}
          empty={empty}
          defaultSort={{ id: "submitted", dir: "desc" }}
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
              </>
            );
          }}
          pagination={{ mode: "client", pageSize: PAGE_SIZE }}
          onRowClick={actions.open}
          onExport={(f) => void exportView(f)}
          storageKey="p08-production"
          toolbar={
            <FilterBar
              filters={filterDefs}
              value={filters}
              onChange={setFilters}
              searchPlaceholder="Search product, site, submitter or notes"
              storageKey="p08-production-views"
              loading={list.isFetching && !list.isPending}
            />
          }
        />
      </div>

      <RecordDrawer
        row={liveRow}
        status={liveRow ? statusOf(liveRow) : undefined}
        overlaps={liveRow ? overlaps.get(liveRow.production_id) : undefined}
        startEditing={drawer?.edit}
        onClose={() => setDrawer(null)}
        onApprove={(r) => approve(r)}
        onReject={(r) => reject([r])}
        onEdited={(saved) => {
          // Keep showing the record even if the edit moved it out of the current filter.
          if (saved && drawer) setDrawer({ row: { ...drawer.row, ...saved }, edit: false });
          toast({ title: "Changes saved", description: "The change and your reason are in the record's history.", tone: "good" });
        }}
      />
      <RejectReasonModal
        open={rejecting !== null}
        count={rejecting?.length ?? 0}
        noun={["record", "records"]}
        busy={review.reject.isPending}
        error={rejectError}
        onClose={() => setRejecting(null)}
        onConfirm={confirmReject}
      />
    </div>
  );
}

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded-chip border border-line bg-panel px-1 font-num text-[11px] text-ink">{children}</kbd>;
}
