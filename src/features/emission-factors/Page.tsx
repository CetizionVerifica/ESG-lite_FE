import { useCallback, useId, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FlaskConical, Plus, SearchX, Upload } from "lucide-react";
import {
  Button,
  DataTable,
  EMPTY_FILTERS,
  EmptyState,
  FilterBar,
  type FilterDef,
  type FilterValues,
  Modal,
  PageHeader,
  TabPanel,
  Tabs,
  useFilterParams,
  useToast,
  withoutParams,
  writeFilterParams,
} from "../../ui";
import {
  errorMessage,
  useBatches,
  useCategories,
  useCompanies,
  useFactors,
  useRemoveBatch,
  useRemoveFactor,
  useRemoveFactors,
  useSaveFactor,
  useSites,
  useUploads,
  useUserNames,
} from "./api";
import { FactorDrawer } from "./components/FactorDrawer";
import { ImportDrawer } from "./components/ImportDrawer";
import { ImportsTab } from "./components/ImportsTab";
import { factorColumns } from "./components/columns";
import {
  type Batch,
  type Factor,
  type FactorDraft,
  PAGE_SIZE,
  categoriesFor,
  factorSummary,
  filterUploads,
  firstId,
  listParams,
  sitesOfClient,
  toPayload,
  yearOptions,
} from "./logic";

const FILTER_KEYS = ["client", "site", "category", "year"];
type Tab = "factors" | "imports";

/** Drops filters that no longer fit the ones above them (a site of another client, a category the site doesn't report). */
function cascade(next: FilterValues, prev: FilterValues): FilterValues {
  const f = { ...next.filters };
  if ((prev.filters.client ?? []).join() !== (f.client ?? []).join()) f.site = [];
  if ((prev.filters.site ?? []).join() !== (f.site ?? []).join()) f.category = [];
  return { ...next, filters: f };
}

/** P22 `/factors`: every emission factor, filterable by client, site, category and year, plus the imports that created them. */
export default function EmissionFactorsPage() {
  const { toast } = useToast();
  const idBase = useId();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useFilterParams(FILTER_KEYS);
  const tab: Tab = params.get("tab") === "imports" ? "imports" : "factors";
  const setTab = (t: Tab) =>
    setParams((p) => {
      const next = withoutParams(p, ["tab"]);
      if (t === "imports") next.set("tab", t);
      return next;
    }, { replace: true });

  const clientId = firstId(filters.filters.client);
  const siteId = firstId(filters.filters.site);
  const categoryId = firstId(filters.filters.category);
  const year = firstId(filters.filters.year);
  const q = filters.q;

  // Page index resets whenever the filters change.
  const filterKey = JSON.stringify([clientId, siteId, categoryId, year, q.trim()]);
  const [paging, setPaging] = useState({ key: filterKey, page: 0 });
  const page = paging.key === filterKey ? paging.page : 0;
  const query = listParams({ clientId, siteId, categoryId, year, q }, page);

  const factors = useFactors(query);
  const sites = useSites();
  const companies = useCompanies();
  const categories = useCategories();
  const batches = useBatches(clientId);
  const uploads = useUploads(tab === "imports");
  const users = useUserNames(tab === "imports");
  const save = useSaveFactor();
  const removeOne = useRemoveFactor();
  const removeMany = useRemoveFactors();
  const removeBatch = useRemoveBatch();

  // Drawer: null = closed, "new" = add, a factor = edit.
  const [editing, setEditing] = useState<Factor | "new" | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<(string | number)[]>([]);
  const [confirm, setConfirm] = useState<
    { kind: "one"; row: Factor } | { kind: "many"; ids: number[] } | { kind: "batch"; batch: Batch } | null
  >(null);
  const [confirmErr, setConfirmErr] = useState<string | null>(null);
  // Counts imports opened, so each one mounts a fresh drawer.
  const [importing, setImporting] = useState(0);
  const [importOpen, setImportOpen] = useState(false);

  const openDrawer = useCallback(
    (value: Factor | "new" | null) => {
      setSaveErr(null);
      save.reset();
      setEditing(value);
    },
    [save],
  );

  const allSites = useMemo(() => sites.data ?? [], [sites.data]);
  const clientSites = useMemo(() => sitesOfClient(allSites, clientId), [allSites, clientId]);
  const filterDefs: FilterDef[] = [
    {
      key: "client",
      label: "Client",
      multiple: false,
      options: (companies.data ?? []).map((c) => ({ value: String(c.company_id), label: c.name })).sort((a, b) => a.label.localeCompare(b.label)),
    },
    {
      key: "site",
      label: "Site",
      multiple: false,
      options: [...clientSites].sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ value: String(s.site_id), label: s.name })),
    },
    {
      key: "category",
      label: "Category",
      multiple: false,
      options: categoriesFor(siteId, allSites, categories.data ?? []).map((c) => ({ value: String(c.category_id), label: c.category_name })),
    },
    { key: "year", label: "Year", multiple: false, options: yearOptions().map((y) => ({ value: String(y), label: String(y) })) },
  ];
  const onFilters = (next: FilterValues) => setFilters(cascade(next, filters));
  const filtered = !!q.trim() || !!clientId || !!siteId || !!categoryId || !!year;
  const clearFilters = () => setParams((p) => writeFilterParams(p, EMPTY_FILTERS, FILTER_KEYS), { replace: true });

  const onSave = (draft: FactorDraft) => {
    setSaveErr(null);
    const id = editing && editing !== "new" ? editing.emission_factor_id : null;
    save.mutate(
      { id, body: toPayload(draft) },
      {
        onSuccess: () => {
          openDrawer(null);
          toast({ title: id === null ? "Factor added" : "Factor saved", tone: "good" });
        },
        onError: (e) => setSaveErr(errorMessage(e, "Nothing was saved. Try again.")),
      },
    );
  };

  const askDelete = (c: NonNullable<typeof confirm>) => {
    setConfirmErr(null);
    removeOne.reset();
    removeMany.reset();
    removeBatch.reset();
    setConfirm(c);
  };
  const deleting = removeOne.isPending || removeMany.isPending || removeBatch.isPending;
  const onConfirmDelete = () => {
    if (!confirm) return;
    const done = (title: string) => () => {
      toast({ title, tone: "good" });
      setConfirm(null);
    };
    const failed = (e: unknown) => setConfirmErr(errorMessage(e, "Nothing was deleted. Try again."));
    if (confirm.kind === "one") {
      removeOne.mutate(confirm.row.emission_factor_id, {
        onSuccess: () => {
          done("Factor deleted")();
          openDrawer(null);
        },
        onError: failed,
      });
    } else if (confirm.kind === "many") {
      const n = confirm.ids.length;
      removeMany.mutate(confirm.ids, {
        onSuccess: () => {
          done(`${n} ${n === 1 ? "factor" : "factors"} deleted`)();
          setSelected([]);
        },
        onError: failed,
      });
    } else {
      const n = confirm.batch.count;
      removeBatch.mutate(confirm.batch.upload_batch_id, { onSuccess: done(`${n} imported ${n === 1 ? "factor" : "factors"} deleted`), onError: failed });
    }
  };

  const rows = factors.data?.data ?? [];
  const total = factors.data?.total ?? 0;
  const columns = factorColumns({ batches: batches.data, onEdit: (r) => openDrawer(r) });
  const empty =
    filtered ? (
      <EmptyState icon={SearchX} title="No factors match these filters." action={<Button onClick={clearFilters}>Clear filters</Button>} />
    ) : (
      <EmptyState icon={FlaskConical} title="No emission factors yet." description="Add the first factor for a site and category." action={<Button variant="primary" onClick={() => openDrawer("new")}>Add factor</Button>} />
    );

  // Batches and uploads follow the same filters (client on the server, site and category here).
  const batchRows = useMemo(
    () => (batches.data ?? []).filter((b) => (!siteId || b.site_id === siteId) && (!categoryId || b.category_id === categoryId)),
    [batches.data, siteId, categoryId],
  );
  const uploadSiteIds = siteId ? [siteId] : clientId ? clientSites.map((s) => s.site_id) : null;
  const uploadRows = filterUploads(uploads.data ?? [], uploadSiteIds);

  const confirmCopy =
    confirm?.kind === "one"
      ? { title: "Delete this factor?", body: factorSummary(confirm.row), action: "Delete factor" }
      : confirm?.kind === "many"
        ? { title: `Delete ${confirm.ids.length} ${confirm.ids.length === 1 ? "factor" : "factors"}?`, body: "The selected factors are removed for good.", action: "Delete" }
        : confirm?.kind === "batch"
          ? {
              title: `Delete ${confirm.batch.count} imported ${confirm.batch.count === 1 ? "factor" : "factors"}?`,
              body: `Every factor this import created for ${confirm.batch.site_name} · ${confirm.batch.category_name} is removed for good.`,
              action: "Delete batch",
            }
          : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Emission factors"
        description="Factors used to turn activity data into emissions, per site, category and year."
        primaryAction={{ label: "Import factors", onClick: () => {
          setImporting((n) => n + 1);
          setImportOpen(true);
        }, icon: <Upload aria-hidden className="size-4" /> }}
        secondaryActions={[{ label: "Add factor", onClick: () => openDrawer("new"), icon: <Plus aria-hidden className="size-4" /> }]}
      />
      <FilterBar
        filters={filterDefs}
        value={filters}
        onChange={onFilters}
        loading={companies.isPending || sites.isPending}
        searchPlaceholder="Search name, source, site, category"
      />
      <Tabs<Tab>
        label="Emission factors"
        idBase={idBase}
        value={tab}
        onChange={setTab}
        items={[
          { value: "factors", label: "Factors", count: factors.data ? total : undefined },
          { value: "imports", label: "Imports", count: batches.data ? batchRows.length : undefined },
        ]}
      />
      <TabPanel idBase={idBase} value="factors" current={tab}>
        <p className="mb-3 text-sm text-muted" data-testid="setup-summary">
          {factors.data ? `${total.toLocaleString("en-US")} ${total === 1 ? "factor" : "factors"}` : " "}
        </p>
        <DataTable<Factor>
          label="Emission factors"
          rows={rows}
          columns={columns}
          getRowId={(r) => r.emission_factor_id}
          rowLabel={factorSummary}
          loading={factors.isPending}
          error={factors.error ? errorMessage(factors.error, "Couldn't load emission factors.") : null}
          onRetry={() => void factors.refetch()}
          empty={empty}
          selectable
          selectedIds={selected}
          onSelectionChange={setSelected}
          bulkActions={(_rows, _clear, ids) => (
            <Button variant="danger" size="sm" onClick={() => askDelete({ kind: "many", ids: ids.map(Number) })}>
              Delete {ids.length}
            </Button>
          )}
          pagination={{ mode: "server", page, pageSize: PAGE_SIZE, total, onPageChange: (p) => setPaging({ key: filterKey, page: p }) }}
          onRowClick={(r) => openDrawer(r)}
          storageKey="p22-factors"
        />
      </TabPanel>
      <TabPanel idBase={idBase} value="imports" current={tab}>
        <ImportsTab
          batches={{
            data: batchRows,
            loading: batches.isPending,
            error: batches.error ? errorMessage(batches.error, "Couldn't load imports.") : null,
            onRetry: () => void batches.refetch(),
          }}
          uploads={{ data: uploadRows, loading: uploads.isPending, error: !!uploads.error, onRetry: () => void uploads.refetch() }}
          users={users.data}
          sites={allSites}
          onDeleteBatch={(b: Batch) => askDelete({ kind: "batch", batch: b })}
        />
      </TabPanel>
      <FactorDrawer
        key={editing === null ? "closed" : editing === "new" ? "new" : editing.emission_factor_id}
        row={editing && editing !== "new" ? editing : null}
        creating={editing === "new"}
        defaults={{ siteId, categoryId, year }}
        sites={{ data: allSites, loading: sites.isPending }}
        categories={{ data: categories.data ?? [], loading: categories.isPending }}
        saving={save.isPending}
        error={saveErr}
        onClose={() => openDrawer(null)}
        onSave={onSave}
        onEdit={() => setSaveErr(null)}
        onDelete={() => editing && editing !== "new" && askDelete({ kind: "one", row: editing })}
      />
      {importOpen && (
        <ImportDrawer
          key={importing}
          onClose={() => setImportOpen(false)}
          sites={allSites}
          companies={companies.data ?? []}
          categories={categories.data ?? []}
          defaults={{ clientId, siteId, categoryId }}
        />
      )}
      <Modal
        open={!!confirm}
        onClose={() => !deleting && setConfirm(null)}
        title={confirmCopy?.title ?? ""}
        description={confirmCopy?.body}
        tone="destructive"
        error={confirmErr}
        primaryAction={{ label: confirmCopy?.action ?? "Delete", onClick: onConfirmDelete, loading: deleting, disabled: deleting }}
      >
        <p className="text-sm text-muted">Entries already calculated with these factors keep their totals; product footprint inputs that used them lose their factor link. This can&apos;t be undone.</p>
      </Modal>
    </div>
  );
}
