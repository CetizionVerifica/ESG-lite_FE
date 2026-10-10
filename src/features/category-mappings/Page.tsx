import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowRightLeft, FileSpreadsheet, SearchX } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useClientContext } from "../../lib/clientContext";
import {
  Button,
  Callout,
  EMPTY_FILTERS,
  EmptyState,
  FilterBar,
  type FilterDef,
  Modal,
  SetupListPage,
  useFilterParams,
  useToast,
  withoutParams,
  writeFilterParams,
} from "../../ui";
import { errorMessage, useCategories, useCompanies, useFactorIndex, useMappings, useRemoveMappings, useSaveMapping, useSites } from "./api";
import { ImportDrawer } from "./components/ImportDrawer";
import { MappingDrawer } from "./components/MappingDrawer";
import { mappingColumns } from "./components/columns";
import { COMPANY_WIDE, type MappingDraft, type MappingRow, buildRows, categoriesInUse, createPayload, matchesFilters, toIds, updatePayload } from "./logic";

const FILTER_KEYS = ["client", "category", "site", "match"];
const OPEN = "open";

/** P23 `/factors/mappings`: each client's own names for things, and the factor names they mean. */
export default function CategoryMappingsPage() {
  const { toast } = useToast();
  const { clientId } = useClientContext();
  const { user } = useAuth();
  const userId = typeof user?.user_id === "number" ? (user.user_id as number) : null;
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useFilterParams(FILTER_KEYS);

  const mappings = useMappings();
  const companies = useCompanies();
  const categories = useCategories();
  const sites = useSites();
  const factors = useFactorIndex(categoriesInUse(mappings.data ?? []));
  const save = useSaveMapping();
  const remove = useRemoveMappings();

  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [removing, setRemoving] = useState<MappingRow[] | null>(null);
  const [removeErr, setRemoveErr] = useState<string | null>(null);
  const [importing, setImporting] = useState(0);

  const all = useMemo(
    () => buildRows(mappings.data ?? [], { companies: companies.data ?? [], categories: categories.data ?? [], sites: sites.data ?? [], factors: factors.index }),
    [mappings.data, companies.data, categories.data, sites.data, factors.index],
  );
  const clientIds = toIds(filters.filters.client);
  const categoryIds = toIds(filters.filters.category);
  const siteValues = filters.filters.site ?? [];
  const matchValues = filters.filters.match ?? [];
  const rows = useMemo(
    () =>
      all.filter((r) =>
        matchesFilters(r, { q: filters.q, clientIds: toIds(filters.filters.client), categoryIds: toIds(filters.filters.category), sites: filters.filters.site ?? [], match: filters.filters.match ?? [] }),
      ),
    [all, filters],
  );

  // Selection belongs to one set of filters: changing them clears it, so a bulk delete never reaches hidden rows.
  const filterKey = JSON.stringify(filters);
  const [selection, setSelection] = useState<{ key: string; ids: (string | number)[] }>({ key: filterKey, ids: [] });
  const selected = selection.key === filterKey ? selection.ids : [];
  const setSelected = (ids: (string | number)[]) => setSelection({ key: filterKey, ids });

  // The drawer lives in the URL (?open=new | ?open=<mapping id>) so a mapping can be linked to.
  const openParam = params.get(OPEN);
  const creating = openParam === "new";
  const openRow = openParam && !creating ? (all.find((r) => String(r.id) === openParam) ?? null) : null;
  const setOpen = useCallback(
    (value: string | null) => {
      setSaveErr(null);
      save.reset();
      setParams((p) => {
        const next = withoutParams(p, [OPEN]);
        if (value) next.set(OPEN, value);
        return next;
      }, { replace: true });
    },
    [setParams, save],
  );

  // New mappings start from the filters: one client, one category, one site.
  const filterSite = siteValues.length === 1 && siteValues[0] !== COMPANY_WIDE ? Number(siteValues[0]) : null;
  const defaultClient = clientIds.length === 1 ? clientIds[0] : clientId;
  const defaultCategory = categoryIds.length === 1 ? categoryIds[0] : null;
  const defaults = useMemo(
    () => ({ company_id: defaultClient, category_id: defaultCategory, site_id: filterSite }),
    [defaultClient, defaultCategory, filterSite],
  );

  const onSave = (draft: MappingDraft) => {
    setSaveErr(null);
    const name = draft.company_category_name.trim();
    const done = {
      onSuccess: () => {
        setOpen(null);
        toast({ title: creating ? `“${name}” mapped` : `“${name}” saved`, tone: "good" as const });
      },
      onError: (e: unknown) => setSaveErr(errorMessage(e, "Nothing was saved. Try again.")),
    };
    if (openRow) save.mutate({ id: openRow.id, payload: updatePayload(draft, openRow) }, done);
    else {
      const company = (companies.data ?? []).find((c) => c.company_id === draft.company_id);
      save.mutate({ id: null, payload: createPayload(draft, company?.name ?? "", userId) }, done);
    }
  };

  const startRemove = (list: MappingRow[]) => {
    remove.reset();
    setRemoveErr(null);
    setRemoving(list);
  };
  const onRemove = () => {
    if (!removing) return;
    setRemoveErr(null);
    const ids = removing.map((r) => r.id);
    remove.mutate(ids, {
      onSuccess: () => {
        toast({ title: ids.length === 1 ? `“${removing[0].company_category_name}” deleted` : `${ids.length} mappings deleted`, tone: "good" });
        setSelected(selected.filter((id) => !ids.includes(Number(id))));
        setRemoving(null);
        if (openRow && ids.includes(openRow.id)) setOpen(null);
      },
      onError: (e) => setRemoveErr(errorMessage(e, "Nothing was deleted. Try again.")),
    });
  };

  const companyOptions = useMemo(
    () => (companies.data ?? []).map((c) => ({ value: String(c.company_id), label: c.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [companies.data],
  );
  const categoryOptions = useMemo(
    () => (categories.data ?? []).map((c) => ({ value: String(c.category_id), label: c.category_name })).sort((a, b) => a.label.localeCompare(b.label)),
    [categories.data],
  );
  // Sites narrow to the chosen client so the list stays short.
  const siteOptions = useMemo(
    () => [
      { value: COMPANY_WIDE, label: "All sites (company-wide)" },
      ...(sites.data ?? [])
        .filter((s) => !clientIds.length || (s.company && clientIds.includes(s.company.company_id)))
        .map((s) => ({ value: String(s.site_id), label: clientIds.length === 1 || !s.company ? s.name : `${s.name} · ${s.company.name}` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ],
    [sites.data, clientIds],
  );
  const filterDefs: FilterDef[] = [
    { key: "client", label: "Client", multiple: false, options: companyOptions },
    { key: "category", label: "Category", options: categoryOptions },
    { key: "site", label: "Site", options: siteOptions },
    {
      key: "match",
      label: "Factor",
      options: [
        { value: "matched", label: "Matched" },
        { value: "missing", label: "No factor" },
      ],
    },
  ];

  const columns = mappingColumns({ edit: (r) => setOpen(String(r.id)), remove: (r) => startRemove([r]) });
  const filtered = !!filters.q.trim() || clientIds.length > 0 || categoryIds.length > 0 || siteValues.length > 0 || matchValues.length > 0;
  const clearFilters = () => setParams((p) => writeFilterParams(p, EMPTY_FILTERS, FILTER_KEYS), { replace: true });
  const missingCount = all.filter((r) => r.match.state === "missing").length;
  const empty =
    all.length === 0 ? (
      <EmptyState
        icon={ArrowRightLeft}
        title="No category mappings yet."
        description="Map a client's own names, like “HSD fuel”, to the factor names entries use, like “Diesel”."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" onClick={() => setOpen("new")}>
              Add mapping
            </Button>
            <Button onClick={() => setImporting((n) => n + 1)}>Import sheet</Button>
          </div>
        }
      />
    ) : (
      <EmptyState icon={SearchX} title="No mappings match these filters." action={filtered ? <Button onClick={clearFilters}>Clear filters</Button> : undefined} />
    );

  const missingMapping = !!openParam && !creating && !!mappings.data && !openRow;

  return (
    <SetupListPage<MappingRow>
      title="Category mappings"
      description="Each client's own names for fuels, materials and services, and the factor names they mean, so entries pick the right factor."
      addLabel="Add mapping"
      onAdd={() => setOpen("new")}
      summary={
        mappings.data ? (
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              {rows.length} {rows.length === 1 ? "mapping" : "mappings"}
              {filtered ? ` of ${all.length}` : ""}
            </span>
            <Button size="sm" variant="ghost" onClick={() => setImporting((n) => n + 1)}>
              <FileSpreadsheet aria-hidden className="size-4" /> Import sheet
            </Button>
            {missingCount > 0 && !matchValues.length && (
              <span className="inline-flex flex-wrap items-center gap-1.5 text-warn" data-testid="missing-note">
                <AlertTriangle aria-hidden className="size-4" />
                {missingCount === 1 ? "1 mapping has" : `${missingCount} mappings have`} no factor for their client, so entries using them can't be calculated.
                <Button size="sm" variant="ghost" onClick={() => setFilters({ ...filters, filters: { ...filters.filters, match: ["missing"] } })}>
                  Show them
                </Button>
              </span>
            )}
            {factors.failed && <span className="text-warn">Some categories' factors didn't load, so their mappings show “Checking…”.</span>}
          </span>
        ) : (
          " "
        )
      }
      table={{
        label: "Category mappings",
        rows,
        columns,
        getRowId: (r) => r.id,
        rowLabel: (r) => `${r.company_category_name} → ${r.global_category_name}`,
        loading: mappings.isPending,
        error: mappings.error ? errorMessage(mappings.error, "Couldn't load category mappings.") : null,
        onRetry: () => void mappings.refetch(),
        empty,
        defaultSort: { id: "client", dir: "asc" },
        pagination: { mode: "client", pageSize: 50 },
        onRowClick: (r) => setOpen(String(r.id)),
        selectable: true,
        selectedIds: selected,
        onSelectionChange: setSelected,
        bulkActions: (sel) => (
          <Button size="sm" variant="danger" onClick={() => startRemove(sel)}>
            Delete {sel.length === 1 ? "1 mapping" : `${sel.length} mappings`}…
          </Button>
        ),
        exportName: "category-mappings",
        storageKey: "p23-category-mappings",
        toolbar: (
          <FilterBar
            filters={filterDefs}
            value={filters}
            onChange={setFilters}
            loading={companies.isPending || categories.isPending || sites.isPending}
            searchPlaceholder="Search names, client, category, site"
            searchDelay={0}
          />
        ),
      }}
    >
      <MappingDrawer
        // Remount once a linked mapping's data arrives, so the form starts from it.
        key={`${openParam ?? "closed"}-${openRow ? "ready" : "wait"}`}
        row={openRow}
        creating={creating}
        loading={!!openParam && !creating && mappings.isPending}
        defaults={defaults}
        all={mappings.data ?? []}
        companies={companies.data ?? []}
        categories={categories.data ?? []}
        sites={sites.data ?? []}
        saving={save.isPending}
        error={saveErr}
        onClose={() => setOpen(null)}
        onSave={onSave}
        onRemove={() => openRow && startRemove([openRow])}
      />
      {importing > 0 && (
        <ImportDrawer
          key={importing}
          open
          defaults={defaults}
          existing={mappings.data ?? []}
          companies={companies.data ?? []}
          categories={categories.data ?? []}
          sites={sites.data ?? []}
          userId={userId}
          onClose={() => setImporting(0)}
        />
      )}
      <Modal
        open={!!removing}
        tone="destructive"
        onClose={() => setRemoving(null)}
        title={removing && removing.length === 1 ? `Delete “${removing[0].company_category_name}”?` : `Delete ${removing?.length ?? 0} mappings?`}
        description="Entries already saved keep their factor. New entries with these names won't be translated until they are mapped again."
        primaryAction={{ label: "Delete", onClick: onRemove, loading: remove.isPending }}
      >
        {removeErr && <Callout tone="warn">{removeErr}</Callout>}
      </Modal>
      {missingMapping && (
        <p role="status" className="text-sm text-muted">
          That mapping no longer exists. <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>Dismiss</Button>
        </p>
      )}
    </SetupListPage>
  );
}
