import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Package, SearchX } from "lucide-react";
import { useClientContext } from "../../lib/clientContext";
import {
  Button,
  EMPTY_FILTERS,
  EmptyState,
  FilterBar,
  type FilterDef,
  SetupListPage,
  TypedDeleteModal,
  formatMonth,
  useFilterParams,
  useToast,
  withoutParams,
  writeFilterParams,
} from "../../ui";
import { errorMessage, useCompanies, useDeleteProduct, useProducts, useSaveProduct, useSites, useUnits } from "./api";
import { ProductDrawer } from "./components/ProductDrawer";
import { productColumns } from "./components/columns";
import { type Product, type ProductDraft, cascadeItems, matchesFilters, movesSite, recordCount, siteOptions, toIds } from "./logic";

const FILTER_KEYS = ["client", "site"];
const OPEN = "open";

/** P25 `/setup/products`: every client's products, the site that makes each and its production records. */
export default function ProductsPage() {
  const { toast } = useToast();
  const { clientId } = useClientContext();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useFilterParams(FILTER_KEYS);

  const products = useProducts();
  const sites = useSites();
  const companies = useCompanies();
  const units = useUnits();
  const save = useSaveProduct();
  const remove = useDeleteProduct();

  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const all = useMemo(() => products.data ?? [], [products.data]);
  // Memoised on the URL values so the row filter below only re-runs when they change.
  const clientIds = useMemo(() => toIds(filters.filters.client), [filters.filters.client]);
  const siteIds = useMemo(() => toIds(filters.filters.site), [filters.filters.site]);
  const rows = useMemo(() => all.filter((p) => matchesFilters(p, { q: filters.q, clientIds, siteIds })), [all, filters.q, clientIds, siteIds]);

  // The drawer lives in the URL (?open=new | ?open=<product id>) so a product can be linked to.
  const openParam = params.get(OPEN);
  const creating = openParam === "new";
  const openRow = openParam && !creating ? (all.find((p) => String(p.product_id) === openParam) ?? null) : null;
  const setOpen = useCallback(
    (value: string | null) => {
      setSaveErr(null);
      save.reset();
      setParams(
        (p) => {
          const next = withoutParams(p, [OPEN]);
          if (value) next.set(OPEN, value);
          return next;
        },
        { replace: true },
      );
    },
    [setParams, save],
  );

  const onSave = (draft: ProductDraft) => {
    setSaveErr(null);
    const moving = movesSite(draft, openRow);
    save.mutate(
      { product: openRow, draft },
      {
        onSuccess: (res) => {
          setOpen(null);
          const name = draft.name.trim();
          const moved = res?.moved_production_count ?? 0;
          toast({
            title: creating ? `Product "${name}" added` : `Product "${name}" saved`,
            description: moving && moved ? `${recordCount(moved)} moved with it.` : undefined,
            tone: "good",
          });
        },
        onError: (e) => setSaveErr(errorMessage(e, "Nothing was saved. Try again.")),
      },
    );
  };

  const onDelete = () => {
    if (!deleting) return;
    setDeleteErr(null);
    remove.mutate(deleting.product_id, {
      onSuccess: () => {
        toast({ title: `Product "${deleting.name}" deleted`, tone: "good" });
        setDeleting(null);
        setOpen(null);
      },
      onError: (e) => setDeleteErr(errorMessage(e, "The product wasn't deleted. Try again.")),
    });
  };

  const companyOptions = useMemo(
    () => (companies.data ?? []).map((c) => ({ value: String(c.company_id), label: c.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [companies.data],
  );
  const siteFilterOptions = useMemo(() => siteOptions(sites.data ?? [], clientIds), [sites.data, clientIds]);
  const filterDefs: FilterDef[] = [
    { key: "client", label: "Client", multiple: false, options: companyOptions },
    { key: "site", label: "Site", options: siteFilterOptions },
  ];

  const columns = productColumns({ onOpen: (r) => setOpen(String(r.product_id)) });
  const filtered = !!filters.q.trim() || clientIds.length > 0 || siteIds.length > 0;
  const clearFilters = () => setParams((p) => writeFilterParams(p, EMPTY_FILTERS, FILTER_KEYS), { replace: true });
  const empty =
    all.length === 0 ? (
      <EmptyState
        icon={Package}
        title="No products yet."
        description="Add the products each site makes so their production can be recorded and emission intensity worked out."
        action={
          <Button variant="primary" onClick={() => setOpen("new")}>
            Add product
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={SearchX}
        title="No products match these filters."
        action={filtered ? <Button onClick={clearFilters}>Clear filters</Button> : undefined}
      />
    );

  const missing = !!openParam && !creating && !!products.data && !openRow;
  // A new product starts on the one site the filter shows; with a client chosen, on that client's only site.
  const clientSites = (sites.data ?? []).filter((s) => s.company?.company_id === (clientIds[0] ?? clientId));
  const defaultSiteId = siteIds.length === 1 ? siteIds[0] : clientSites.length === 1 ? clientSites[0].site_id : null;

  return (
    <SetupListPage<Product>
      title="Products"
      description="What each site makes. Production recorded against these products is the denominator for emission intensity."
      addLabel="Add product"
      onAdd={() => setOpen("new")}
      summary={products.data ? `${rows.length} ${rows.length === 1 ? "product" : "products"}${filtered ? ` of ${all.length}` : ""}` : " "}
      table={{
        label: "Products",
        rows,
        columns,
        getRowId: (r) => r.product_id,
        rowLabel: (r) => r.name,
        loading: products.isPending,
        error: products.error ? errorMessage(products.error, "Couldn't load products.") : null,
        onRetry: () => void products.refetch(),
        empty,
        defaultSort: { id: "product", dir: "asc" },
        pagination: { mode: "client", pageSize: 50 },
        onRowClick: (r) => setOpen(String(r.product_id)),
        exportName: "products",
        storageKey: "p25-products",
        toolbar: (
          <FilterBar
            filters={filterDefs}
            value={filters}
            onChange={setFilters}
            loading={companies.isPending || sites.isPending}
            searchPlaceholder="Search product, site, client, unit"
            searchDelay={0}
          />
        ),
      }}
    >
      <ProductDrawer
        // Remount once a linked product's data arrives, so the form starts from it.
        key={`${openParam ?? "closed"}-${openRow ? "ready" : "wait"}`}
        row={openRow}
        creating={creating}
        loading={!!openParam && !creating && products.isPending}
        defaultSiteId={defaultSiteId}
        sites={{ data: sites.data ?? [], loading: sites.isPending }}
        products={all}
        units={units.data ?? []}
        saving={save.isPending}
        error={saveErr}
        onClose={() => setOpen(null)}
        onSave={onSave}
        onDelete={() => {
          remove.reset();
          setDeleteErr(null);
          setDeleting(openRow);
        }}
      />
      {deleting && (
        <TypedDeleteModal
          key={deleting.product_id}
          open
          noun="product"
          name={deleting.name}
          cascades={cascadeItems(deleting, deleting.last_period_end ? formatMonth(deleting.last_period_end) : null)}
          deleting={remove.isPending}
          error={deleteErr}
          onClose={() => setDeleting(null)}
          onConfirm={onDelete}
        />
      )}
      {missing && (
        <p role="status" className="text-sm text-muted">
          That product no longer exists.{" "}
          <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>
            Dismiss
          </Button>
        </p>
      )}
    </SetupListPage>
  );
}
