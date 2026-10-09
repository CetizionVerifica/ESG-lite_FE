import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Paperclip, Plus } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { getDocumentsByEmission } from "../../services/documentService";
import {
  Button,
  type Column,
  ContextChips,
  DataTable,
  DocumentViewer,
  EMPTY_FILTERS,
  EmptyState,
  FilterBar,
  type FilterDef,
  KpiStrip,
  PageHeader,
  type SortState,
  StatusPill,
  type ViewerFile,
  activeCount,
  cn,
  focusRing,
  formatDate,
  formatEmissions,
  formatNumber,
  fromEmissionDocument,
  serializePeriod,
  useContextParams,
  useFilterParams,
  useToast,
  writeContext,
  writeFilterParams,
} from "../../ui";
import { useEntries } from "./api";
import { EntryDrawer } from "./components/EntryDrawer";
import {
  type EntryRow,
  PERIOD_KINDS,
  SORT_KEYS,
  STATUS_VALUES,
  attachFera,
  categoriesFor,
  keyActivity,
  parseStatus,
  periodText,
  quantityOf,
  serverPeriod,
  toSupportedPeriod,
  userSites,
} from "./logic";

const PAGE_SIZE = 25;
const FILTER_KEYS = ["category", "status"];
const STATUS_LABEL = { pending: "Pending", approved: "Approved", rejected: "Rejected" } as const;

function serverMessage(e: unknown): string {
  const msg = (e as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof msg === "string" && msg ? msg : "Your entries couldn't be loaded.";
}

/** P04 · My entries: everything the contributor's sites submitted, its state, and what was sent back. */
export default function MyEntriesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const sites = useMemo(() => userSites(user), [user]);
  const [ctx, updateCtx] = useContextParams();
  const [filters, setFilters] = useFilterParams(FILTER_KEYS);
  const [, setSearchParams] = useSearchParams();

  // /user/emissions filters by calendar month or year only (see toSupportedPeriod).
  const period = toSupportedPeriod(ctx.period);
  const periodKey = ctx.period ? serializePeriod(ctx.period) : "";
  const supportedKey = period ? serializePeriod(period) : "";
  useEffect(() => {
    if (periodKey !== supportedKey) updateCtx({ period });
  }, [periodKey, supportedKey, period, updateCtx]);

  const siteIds = ctx.siteIds.filter((id) => sites.some((s) => s.site_id === id));
  const categories = categoriesFor(sites, siteIds);
  const categoryId = Number(filters.filters.category?.[0]) || null;
  const status = parseStatus(filters.filters.status?.[0]);
  const feraSelected = categories.find((c) => c.category_id === categoryId)?.category_name.toLowerCase() === "fera";

  const [sort, setSort] = useState<SortState>(null);
  const queryShape = { siteIds, categoryId, status, ...serverPeriod(period), search: filters.q, sort: sort ? { key: SORT_KEYS[sort.id], order: sort.dir } : null };
  const shapeKey = JSON.stringify(queryShape);
  const [paging, setPaging] = useState({ key: shapeKey, page: 1 });
  const page = paging.key === shapeKey ? paging.page : 1;

  const query = useEntries({ ...queryShape, page, pageSize: PAGE_SIZE });
  const rows = useMemo(() => attachFera(query.data?.data ?? [], feraSelected), [query.data, feraSelected]);
  // The summary is filtered by status like the rows, so with a status chosen
  // the KPIs come from the same query without it (one row).
  const overall = useEntries({ ...queryShape, status: null, sort: null, page: 1, pageSize: 1 }, status !== null);
  const kpiSource = status === null ? query : overall;
  const summary = kpiSource.data?.summary;

  const [open, setOpen] = useState<EntryRow | null>(null);
  const [viewer, setViewer] = useState<{ file: ViewerFile; files: ViewerFile[] } | null>(null);

  const setStatus = (next: (typeof STATUS_VALUES)[number] | null) =>
    setFilters({ ...filters, filters: { ...filters.filters, status: next ? [next] : [] } });
  const toggleStatus = (s: (typeof STATUS_VALUES)[number]) => setStatus(status === s ? null : s);

  const openDocuments = async (row: EntryRow) => {
    try {
      const docs = await queryClient.fetchQuery({ queryKey: ["emission-documents", row.pk_id], queryFn: () => getDocumentsByEmission(row.pk_id) });
      const files = docs.map(fromEmissionDocument);
      if (files.length === 0) toast({ title: "No documents on this entry" });
      else setViewer({ file: files[0], files });
    } catch {
      toast({ title: "Couldn't load the documents", tone: "bad" });
    }
  };

  const filterDefs: FilterDef[] = [
    { key: "category", label: "Category", multiple: false, options: categories.map((c) => ({ value: String(c.category_id), label: c.category_name })) },
    { key: "status", label: "Status", multiple: false, options: STATUS_VALUES.map((s) => ({ value: s, label: STATUS_LABEL[s] })) },
  ];

  const columns: Column<EntryRow>[] = [
    {
      id: "category",
      header: "Category",
      sortable: true,
      hideable: false,
      value: (r) => r.category?.category_name,
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-medium text-ink">{r.category?.category_name ?? "—"}</p>
          {r.parent_category_name && <p className="text-xs text-muted">of {r.parent_category_name}</p>}
          {siteIds.length !== 1 && sites.length > 1 && <p className="text-xs text-muted">{r.site?.name}</p>}
        </div>
      ),
    },
    { id: "activity", header: "Key activity", value: (r) => keyActivity(r) ?? "" },
    {
      id: "quantity",
      header: "Quantity",
      numeric: true,
      value: (r) => quantityOf(r.activity_data),
      cell: (r) => {
        const q = quantityOf(r.activity_data);
        return q === null ? "—" : (
          <span className="whitespace-nowrap">
            {formatNumber(q, Number.isInteger(q) ? 0 : 2)} <span className="text-xs text-muted">{r.activity_data_unit ?? ""}</span>
          </span>
        );
      },
    },
    {
      id: "total",
      header: "tCO₂e",
      numeric: true,
      sortable: true,
      value: (r) => Number(r.total_emission),
      cell: (r) => (
        <div className="whitespace-nowrap">
          <span>{formatEmissions(Number(r.total_emission))}</span>
          {r.fera && <p className="text-xs text-muted">+ FERA {formatEmissions(Number(r.fera.total_emission))}</p>}
        </div>
      ),
    },
    { id: "period", header: "Period", sortable: true, value: (r) => periodText(r), sortValue: (r) => r.date_of_reporting },
    {
      id: "status",
      header: "Status",
      sortable: true,
      value: (r) => STATUS_LABEL[r.status],
      cell: (r) => (
        <div className="min-w-0 max-w-56">
          <StatusPill status={r.status} size="sm" />
          {r.status === "rejected" && r.review_comment && <p className="mt-1 line-clamp-2 text-xs text-muted">{r.review_comment}</p>}
        </div>
      ),
    },
    { id: "submitted", header: "Submitted", sortable: true, value: (r) => r.created_at, cell: (r) => <span className="whitespace-nowrap">{formatDate(r.created_at)}</span> },
    {
      id: "documents",
      header: "Documents",
      value: () => null,
      exportValue: () => null,
      cell: (r) => (
        <button
          type="button"
          aria-label={`Documents for entry ${r.pk_id}`}
          onClick={(e) => {
            e.stopPropagation();
            void openDocuments(r);
          }}
          onKeyDown={(e) => e.stopPropagation()}
          className={cn("rounded-control p-1.5 text-muted hover:bg-tint hover:text-ink", focusRing)}
        >
          <Paperclip aria-hidden className="size-4" />
        </button>
      ),
    },
  ];

  const filtersActive = activeCount(filters) > 0 || ctx.period !== null || siteIds.length > 0;
  // One URL write: two in the same tick and the second undoes the first.
  const clearAll = () =>
    setSearchParams((p) => writeContext(writeFilterParams(p, EMPTY_FILTERS, FILTER_KEYS), { period: null, siteIds: [] }), { replace: true });

  const addData = () => {
    const p = new URLSearchParams();
    if (siteIds.length === 1) p.set("site", String(siteIds[0]));
    if (categoryId) p.set("category", String(categoryId));
    navigate(`/data/new${p.size ? `?${p}` : ""}`);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="My entries"
        description="Everything submitted for your sites, and what was sent back."
        context={
          <ContextChips
            chips={sites.length > 1 ? ["period", "site"] : ["period"]}
            sites={sites.map((s) => ({ value: s.site_id, label: s.name }))}
            periodKinds={[...PERIOD_KINDS]}
            allowAnyPeriod
          />
        }
        primaryAction={{ label: "Add data", onClick: addData, icon: <Plus aria-hidden className="size-4" /> }}
      />

      <KpiStrip
        loading={kpiSource.isPending}
        error={kpiSource.isError && !kpiSource.data ? serverMessage(kpiSource.error) : null}
        onRetry={() => void kpiSource.refetch()}
        items={[
          // Counts stored entries, FERA rows included, though the table shows FERA on its parent row.
          { label: "Entries", value: kpiSource.data?.total ?? null },
          { label: "tCO₂e entered", value: summary?.total_emission ?? null, format: "emissions", primary: true },
          { label: "Pending", value: summary?.pending_count ?? null, onSelect: () => toggleStatus("pending"), selected: status === "pending" },
          { label: "Approved", value: summary?.approved_count ?? null, onSelect: () => toggleStatus("approved"), selected: status === "approved" },
          { label: "Rejected", value: summary?.rejected_count ?? null, onSelect: () => toggleStatus("rejected"), selected: status === "rejected" },
        ]}
      />

      <DataTable<EntryRow>
        label="My entries"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.pk_id}
        rowLabel={(r) => `${r.category?.category_name ?? "Entry"} ${periodText(r)}`}
        loading={query.isPending}
        error={query.isError ? serverMessage(query.error) : null}
        onRetry={() => void query.refetch()}
        sort={sort}
        onSortChange={setSort}
        pagination={{ mode: "server", page, pageSize: PAGE_SIZE, total: query.data?.total ?? 0, onPageChange: (p) => setPaging({ key: shapeKey, page: p }) }}
        onRowClick={setOpen}
        storageKey="my-entries"
        toolbar={<FilterBar filters={filterDefs} value={filters} onChange={setFilters} searchPlaceholder="Search entries" />}
        empty={
          filtersActive ? (
            <EmptyState title="No entries match these filters." action={<Button onClick={clearAll}>Clear filters</Button>} />
          ) : (
            <EmptyState title="Nothing submitted yet." description="Entries you add show up here with their status." action={<Button variant="primary" onClick={addData}>Add data</Button>} />
          )
        }
      />

      <EntryDrawer entry={open} onClose={() => setOpen(null)} />
      <DocumentViewer
        open={viewer !== null}
        onClose={() => setViewer(null)}
        file={viewer?.file ?? null}
        files={viewer?.files}
        onNavigate={(file) => setViewer((v) => (v ? { ...v, file } : v))}
      />
    </div>
  );
}
