import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2, PackageX, Plus, SearchX, Upload } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
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
  Skeleton,
  exportMatrix,
  overlapsById,
  periodLabel,
  periodRange,
  rangesOverlap,
  toMatrix,
  useContextParams,
  useFilterParams,
  useToast,
  writeContext,
  writeFilterParams,
} from "../../ui";
import { errorMessage, useProductionMutations, useSiteProducts, useSiteProduction } from "./api";
import { ProductCards } from "./components/ProductCards";
import { type DrawerState, RecordDrawer } from "./components/RecordDrawer";
import { UploadSheet } from "./components/UploadSheet";
import { productionColumns } from "./components/columns";
import {
  type ProductCard,
  type ProductionRow,
  asStatus,
  currentMonth,
  describeRow,
  emptyTitle,
  matchesSearch,
  newDraft,
  productCards,
  userSites,
} from "./logic";

const FILTER_KEYS = ["status", "product"];
const PAGE_SIZE = 25;
const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

/** P05 `/production`: log how much each product made, fix what was sent back, upload a sheet. */
export default function ProductionPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setParams] = useSearchParams();
  const sites = useMemo(() => userSites(user), [user]);
  const [ctx] = useContextParams();
  const [filters, setFilters] = useFilterParams(FILTER_KEYS);
  const status = asStatus(filters.filters.status?.[0]);
  const productKey = filters.filters.product?.[0] ?? null;

  // No site chip = all of the contributor's sites. Records and products are asked per site.
  const scope = useMemo(() => {
    const chosen = sites.filter((s) => ctx.siteIds.includes(s.site_id));
    return chosen.length ? chosen : sites;
  }, [sites, ctx.siteIds]);
  const scopeIds = useMemo(() => scope.map((s) => s.site_id), [scope]);
  const list = useSiteProduction(scopeIds);
  const productsQ = useSiteProducts(scope);
  const products = useMemo(() => productsQ.products ?? [], [productsQ.products]);
  const { remove } = useProductionMutations();

  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [deleting, setDeleting] = useState<ProductionRow | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const range = useMemo(() => (ctx.period ? periodRange(ctx.period) : null), [ctx.period]);
  // Cards show the chosen month, or this month when the period isn't a single month.
  const month = ctx.period?.kind === "month" ? `${ctx.period.year}-${String(ctx.period.month).padStart(2, "0")}` : currentMonth();

  const all = useMemo(() => list.rows ?? [], [list.rows]);
  const overlaps = useMemo(() => overlapsById(all), [all]);
  const cards = useMemo(() => productCards(products, all, month), [products, all, month]);
  const rows = useMemo(
    () =>
      all.filter(
        (r) =>
          (!range || rangesOverlap(r.start_date, r.end_date, range.from, range.to)) &&
          (!productKey || `${r.site?.site_id}:${r.product?.product_id}` === productKey) &&
          (!status || r.status === status) &&
          matchesSearch(r, filters.q),
      ),
    [all, range, productKey, status, filters.q],
  );

  const showSite = scope.length > 1;
  const singleSite = scope.length === 1 ? scope[0] : null;
  const addFor = (card?: ProductCard) =>
    setDrawer({
      mode: "add",
      draft: newDraft({ siteId: card?.siteId ?? singleSite?.site_id ?? null, product: card?.product, month: card ? month : ctx.period?.kind === "month" ? month : null }),
    });

  const actions = {
    open: (r: ProductionRow) => setDrawer({ mode: "view", row: r }),
    edit: (r: ProductionRow) => setDrawer({ mode: "edit", row: r }),
    remove: (r: ProductionRow) => setDeleting(r),
  };
  const columns = productionColumns({ overlaps, showSite, actions });

  const confirmDelete = () => {
    if (!deleting) return;
    const row = deleting;
    remove.mutate(row.production_id, {
      onSuccess: () => {
        setDeleting(null);
        if (drawer && drawer.mode !== "add" && drawer.row.production_id === row.production_id) setDrawer(null);
        toast({ title: "Record deleted", description: describeRow(row) });
      },
    });
  };

  const exportView = async (format: ExportFormat) => {
    try {
      await exportMatrix(toMatrix(rows, columns.filter((c) => c.id !== "actions")), "production", format);
    } catch {
      toast({ title: "Couldn't export", description: "Try again in a moment.", tone: "bad" });
    }
  };

  const productOptions = useMemo(
    () =>
      products
        .map((p) => ({ value: `${p.site?.site_id}:${p.product_id}`, label: showSite && p.site?.name ? `${p.name} · ${p.site.name}` : p.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [products, showSite],
  );
  const filterDefs: FilterDef[] = [
    { key: "status", label: "Status", multiple: false, options: STATUS_OPTIONS },
    ...(productOptions.length > 1 ? [{ key: "product", label: "Product", multiple: false, options: productOptions }] : []),
  ];

  const filtered = !!filters.q.trim() || !!status || !!productKey || ctx.period !== null;
  // One URL write, so the period and the filter params are cleared together.
  const clearFilters = () => setParams((p) => writeContext(writeFilterParams(p, EMPTY_FILTERS, FILTER_KEYS), { period: null }), { replace: true });
  const siteNames = scope.map((s) => s.name).join(", ");
  const noProducts = productsQ.products !== undefined && products.length === 0;

  if (sites.length === 0)
    return (
      <div className="space-y-6">
        <PageHeader title="Production" />
        <EmptyState icon={Building2} title="You aren't assigned to a site yet." description="Ask your admin to add you to the site you log production for." />
      </div>
    );

  const noProductsState = (
    <EmptyState icon={PackageX} title={`No products are set up for ${siteNames}.`} description="Ask your admin to add them, then you can log production here." />
  );
  const empty = noProducts ? (
    <EmptyState icon={PackageX} title="No production records" description="They appear here once your site has products." />
  ) : (
    <EmptyState
      icon={SearchX}
      title={emptyTitle([
        productOptions.find((p) => p.value === productKey)?.label,
        STATUS_OPTIONS.find((s) => s.value === status)?.label,
        ctx.period ? periodLabel(ctx.period) : null,
        filters.q.trim() ? `"${filters.q.trim()}"` : null,
      ])}
      description={filtered ? undefined : "Add production for each product every month so intensity is right."}
      action={filtered ? <Button onClick={clearFilters}>Clear filters</Button> : <Button variant="primary" onClick={() => addFor()}>Add production</Button>}
    />
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Production"
        context={
          <ContextChips
            chips={sites.length > 1 ? ["site", "period"] : ["period"]}
            sites={sites.map((s) => ({ value: s.site_id, label: s.name }))}
            allowAnyPeriod
          />
        }
        primaryAction={{ label: "Add production", icon: <Plus aria-hidden className="size-4" />, onClick: () => addFor(), disabled: noProducts }}
        secondaryActions={[{ label: "Upload sheet", icon: <Upload aria-hidden className="size-4" />, onClick: () => setUploadOpen(true), disabled: noProducts || products.length === 0 }]}
      />

      {productsQ.error ? (
        <p role="alert" className="rounded-control bg-bad-soft px-3 py-2 text-sm text-bad">
          {errorMessage(productsQ.error, "Couldn't load your site's products.")}{" "}
          <button type="button" className="underline" onClick={productsQ.refetch}>
            Try again
          </button>
        </p>
      ) : productsQ.isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : noProducts ? (
        noProductsState
      ) : (
        <ProductCards cards={cards} month={month} showSite={showSite} onAdd={addFor} onOpen={(c) => c.record && actions.open(c.record)} />
      )}

      <DataTable<ProductionRow>
        label="Production records"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.production_id}
        rowLabel={describeRow}
        loading={list.isPending}
        error={list.error ? errorMessage(list.error, "Couldn't load your production records.") : null}
        onRetry={list.refetch}
        empty={empty}
        defaultSort={{ id: "period", dir: "desc" }}
        pagination={{ mode: "client", pageSize: PAGE_SIZE }}
        onRowClick={actions.open}
        onExport={(f) => void exportView(f)}
        storageKey="p05-production"
        toolbar={
          <FilterBar
            filters={filterDefs}
            value={filters}
            onChange={setFilters}
            searchPlaceholder="Search product, notes or reason"
            storageKey="p05-production-views"
            loading={list.isFetching && !list.isPending}
          />
        }
      />

      <RecordDrawer
        state={drawer}
        rows={all}
        products={products}
        sites={scope}
        overlaps={overlaps}
        onChange={setDrawer}
        onClose={() => setDrawer(null)}
        onDelete={(r) => setDeleting(r)}
        onSaved={(kind) =>
          toast({
            title: kind === "added" ? "Production added" : kind === "resubmitted" ? "Resubmitted for approval" : "Changes saved",
            description: kind === "saved" ? "The change is in the record's history." : "Your manager will review it.",
            tone: "good",
          })
        }
      />
      <UploadSheet
        key={singleSite?.site_id ?? "many"}
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        sites={scope}
        defaultSiteId={singleSite?.site_id ?? null}
        products={products}
        rows={all}
      />
      <Modal
        open={deleting !== null}
        onClose={() => {
          setDeleting(null);
          remove.reset();
        }}
        tone="destructive"
        title="Delete this production record?"
        description={deleting ? `${describeRow(deleting)}: ${deleting.quantity} ${deleting.unit}. This can't be undone.` : undefined}
        primaryAction={{ label: "Delete record", onClick: confirmDelete, loading: remove.isPending }}
        error={remove.isError ? errorMessage(remove.error, "Couldn't delete the record. Nothing was changed.") : undefined}
      />
    </div>
  );
}
