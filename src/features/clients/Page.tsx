import { useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Building2, SearchX } from "lucide-react";
import { Button, EMPTY_FILTERS, EmptyState, FilterBar, type FilterDef, SetupListPage, useFilterParams, writeFilterParams } from "../../ui";
import { errorMessage, hasBrand, useAdminUsers, useBrands, useCompanies, useSites } from "./api";
import { clientColumns } from "./components/columns";
import { type ClientRow, type StatusFilter, buildRows, distinctValues, matchesFilters } from "./logic";

const FILTER_KEYS = ["status", "industry", "region"];

/** P17 `/clients`: every client company with its sites, people, status and theme. */
export default function ClientsPage() {
  const navigate = useNavigate();
  const [, setParams] = useSearchParams();
  const [filters, setFilters] = useFilterParams(FILTER_KEYS);

  const companies = useCompanies();
  const sites = useSites();
  const users = useAdminUsers();
  const ids = useMemo(() => (companies.data ?? []).map((c) => c.company_id), [companies.data]);
  const fetched = useBrands(ids);
  const brands = useMemo(() => new Map([...fetched].filter(([, b]) => hasBrand(b))), [fetched]);

  const all = useMemo(() => buildRows(companies.data ?? [], sites.data, users.data), [companies.data, sites.data, users.data]);
  const { status, industries, regions } = useMemo(
    () => ({
      status: (filters.filters.status ?? []) as StatusFilter[],
      industries: filters.filters.industry ?? [],
      regions: filters.filters.region ?? [],
    }),
    [filters.filters],
  );
  const rows = useMemo(() => all.filter((r) => matchesFilters(r, { q: filters.q, status, industries, regions })), [all, filters.q, status, industries, regions]);

  const filterDefs: FilterDef[] = [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive" },
      ],
    },
    { key: "industry", label: "Industry", options: distinctValues(all.map((r) => r.industry)).map((v) => ({ value: v, label: v })) },
    { key: "region", label: "Region", options: distinctValues(all.map((r) => r.region)).map((v) => ({ value: v, label: v })) },
  ];

  const filtered = !!filters.q.trim() || status.length > 0 || industries.length > 0 || regions.length > 0;
  const clearFilters = () => setParams((p) => writeFilterParams(p, EMPTY_FILTERS, FILTER_KEYS), { replace: true });
  const onboard = () => navigate("/clients/new");
  const empty =
    all.length === 0 ? (
      <EmptyState icon={Building2} title="No clients yet." description="Onboard the first client company." action={<Button variant="primary" onClick={onboard}>Onboard client</Button>} />
    ) : (
      <EmptyState icon={SearchX} title="No clients match these filters." action={filtered ? <Button onClick={clearFilters}>Clear filters</Button> : undefined} />
    );

  return (
    <SetupListPage<ClientRow>
      title="Clients"
      description="Client companies, their sites and people, and the theme they see."
      addLabel="Onboard client"
      onAdd={onboard}
      summary={companies.data ? `${rows.length} ${rows.length === 1 ? "client" : "clients"}${filtered ? ` of ${all.length}` : ""}` : " "}
      table={{
        label: "Clients",
        rows,
        columns: clientColumns({ sitesReady: !!sites.data, usersReady: !!users.data, brands }),
        getRowId: (r) => r.company_id,
        rowLabel: (r) => r.name,
        loading: companies.isPending,
        error: companies.error ? errorMessage(companies.error, "Couldn't load clients.") : null,
        onRetry: () => void companies.refetch(),
        empty,
        defaultSort: { id: "client", dir: "asc" },
        pagination: { mode: "client", pageSize: 50 },
        onRowClick: (r) => navigate(`/clients/${r.company_id}`),
        exportName: "clients",
        storageKey: "p17-clients",
        toolbar: <FilterBar filters={filterDefs} value={filters} onChange={setFilters} loading={companies.isPending} searchPlaceholder="Search client, contact, industry" searchDelay={0} />,
      }}
    />
  );
}
