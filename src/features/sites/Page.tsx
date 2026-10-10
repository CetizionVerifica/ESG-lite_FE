import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2, SearchX } from "lucide-react";
import { useClientContext } from "../../lib/clientContext";
import {
  Button,
  EMPTY_FILTERS,
  EmptyState,
  FilterBar,
  type FilterDef,
  SetupListPage,
  TypedDeleteModal,
  useFilterParams,
  useToast,
  withoutParams,
  writeFilterParams,
} from "../../ui";
import { errorMessage, useAdminUsers, useCategories, useColumnConfigs, useCompanies, useCountries, useDeleteSite, useSaveSite, useSites } from "./api";
import { SiteDrawer } from "./components/SiteDrawer";
import { siteColumns } from "./components/columns";
import { type SiteDraft, type SiteRow, buildRows, cascadeItems, matchesFilters, toIds } from "./logic";

const FILTER_KEYS = ["client", "country"];
const OPEN = "open";

/** P19 `/setup/sites`: every site, its client, categories, people and capture setup. */
export default function SitesPage() {
  const { toast } = useToast();
  const { clientId } = useClientContext();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useFilterParams(FILTER_KEYS);

  const sites = useSites();
  const companies = useCompanies();
  const countries = useCountries();
  const categories = useCategories();
  const users = useAdminUsers();
  const configs = useColumnConfigs();
  const save = useSaveSite();
  const remove = useDeleteSite();

  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SiteRow | null>(null);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const all = useMemo(() => buildRows(sites.data ?? [], users.data, configs.data), [sites.data, users.data, configs.data]);
  const clientIds = toIds(filters.filters.client);
  const countryIds = toIds(filters.filters.country);
  const rows = useMemo(
    () => all.filter((r) => matchesFilters(r, { q: filters.q, clientIds: toIds(filters.filters.client), countryIds: toIds(filters.filters.country) })),
    [all, filters],
  );

  // The drawer lives in the URL (?open=new | ?open=<site id>) so a site can be linked to.
  const openParam = params.get(OPEN);
  const creating = openParam === "new";
  const openRow = openParam && !creating ? (all.find((r) => String(r.site_id) === openParam) ?? null) : null;
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

  const onSave = (draft: SiteDraft) => {
    setSaveErr(null);
    save.mutate(
      { id: openRow?.site_id ?? null, draft },
      {
        onSuccess: () => {
          setOpen(null);
          toast({ title: creating ? `Site "${draft.name.trim()}" added` : `Site "${draft.name.trim()}" saved`, tone: "good" });
        },
        onError: (e) => setSaveErr(errorMessage(e, "Nothing was saved. Try again.")),
      },
    );
  };

  const onDelete = () => {
    if (!deleting) return;
    setDeleteErr(null);
    remove.mutate(deleting.site_id, {
      onSuccess: () => {
        toast({ title: `Site "${deleting.name}" deleted`, tone: "good" });
        setDeleting(null);
        setOpen(null);
      },
      onError: (e) => setDeleteErr(errorMessage(e, "The site wasn't deleted. Try again.")),
    });
  };

  const companyOptions = useMemo(
    () => (companies.data ?? []).map((c) => ({ value: String(c.company_id), label: c.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [companies.data],
  );
  const countryOptions = useMemo(
    () => (countries.data ?? []).map((c) => ({ value: String(c.country_id), label: c.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [countries.data],
  );
  const filterDefs: FilterDef[] = [
    { key: "client", label: "Client", multiple: false, options: companyOptions },
    { key: "country", label: "Country", options: countryOptions },
  ];

  const peopleReady = !!users.data;
  const configsReady = !!configs.data;
  const columns = siteColumns({ peopleReady, configsReady, onOpen: (r) => setOpen(String(r.site_id)) });
  const filtered = !!filters.q.trim() || clientIds.length > 0 || countryIds.length > 0;
  const clearFilters = () => setParams((p) => writeFilterParams(p, EMPTY_FILTERS, FILTER_KEYS), { replace: true });
  const empty =
    all.length === 0 ? (
      <EmptyState icon={Building2} title="No sites yet." description="Add the first site for a client." action={<Button variant="primary" onClick={() => setOpen("new")}>Add site</Button>} />
    ) : (
      <EmptyState icon={SearchX} title="No sites match these filters." action={filtered ? <Button onClick={clearFilters}>Clear filters</Button> : undefined} />
    );

  const missingSite = !!openParam && !creating && !!sites.data && !openRow;
  const defaultCompanyId = clientIds.length === 1 ? clientIds[0] : clientId;

  return (
    <SetupListPage<SiteRow>
      title="Sites"
      description="Each client's sites, the categories they report and who works on them."
      addLabel="Add site"
      onAdd={() => setOpen("new")}
      summary={sites.data ? `${rows.length} ${rows.length === 1 ? "site" : "sites"}${filtered ? ` of ${all.length}` : ""}` : " "}
      table={{
        label: "Sites",
        rows,
        columns,
        getRowId: (r) => r.site_id,
        rowLabel: (r) => r.name,
        loading: sites.isPending,
        error: sites.error ? errorMessage(sites.error, "Couldn't load sites.") : null,
        onRetry: () => void sites.refetch(),
        empty,
        defaultSort: { id: "site", dir: "asc" },
        pagination: { mode: "client", pageSize: 50 },
        onRowClick: (r) => setOpen(String(r.site_id)),
        exportName: "sites",
        storageKey: "p19-sites",
        toolbar: (
          <FilterBar
            filters={filterDefs}
            value={filters}
            onChange={setFilters}
            loading={companies.isPending || countries.isPending}
            searchPlaceholder="Search site, address, contact, client"
            searchDelay={0}
          />
        ),
      }}
    >
      <SiteDrawer
        // Remount once a linked site's data arrives, so the form starts from it.
        key={`${openParam ?? "closed"}-${openRow ? "ready" : "wait"}`}
        row={openRow}
        creating={creating}
        loading={!!openParam && !creating && sites.isPending}
        defaultCompanyId={defaultCompanyId}
        companies={{ data: companies.data ?? [], loading: companies.isPending }}
        countries={{ data: countries.data ?? [], loading: countries.isPending }}
        categories={{ data: categories.data ?? [], loading: categories.isPending, error: !!categories.error }}
        peopleReady={peopleReady}
        configsReady={configsReady}
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
          key={deleting.site_id}
          open
          noun="site"
          name={deleting.name}
          cascades={cascadeItems(deleting)}
          deleting={remove.isPending}
          error={deleteErr}
          onClose={() => setDeleting(null)}
          onConfirm={onDelete}
        />
      )}
      {missingSite && (
        <p role="status" className="text-sm text-muted">
          That site no longer exists. <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>Dismiss</Button>
        </p>
      )}
    </SetupListPage>
  );
}
