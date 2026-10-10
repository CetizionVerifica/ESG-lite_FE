import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Plus } from "lucide-react";
import { Button, Callout, DataTable, EmptyState, type Kpi, KpiStrip, PageHeader } from "../../ui";
import {
  errorMessage,
  useBrands,
  useColumnConfigs,
  useCompanies,
  useFactorBatches,
  useFactorTotal,
  useFactorYears,
  useSites,
  useThresholds,
  useUnits,
  useUsers,
} from "./api";
import { RecentActivity } from "./components/RecentActivity";
import { SetupGaps } from "./components/SetupGaps";
import { clientColumns } from "./components/columns";
import { type ClientRow, buildClientRows, recentActivity, setupGaps } from "./logic";

/** P16 `/console`: which clients are healthy, which are stuck in setup, and what needs PlanetPulse staff today. */
export default function ConsolePage() {
  const navigate = useNavigate();
  const companies = useCompanies();
  const sites = useSites();
  const users = useUsers();
  const configs = useColumnConfigs();
  const units = useUnits();
  const thresholds = useThresholds();
  const batches = useFactorBatches();
  const factorTotal = useFactorTotal();

  const siteIds = useMemo(() => (sites.data ?? []).map((s) => s.site_id), [sites.data]);
  const companyIds = useMemo(() => (companies.data ?? []).map((c) => c.company_id), [companies.data]);
  const factorYears = useFactorYears(siteIds);
  const brands = useBrands(companyIds);

  const core = [companies, sites, users, configs, units, thresholds];
  const coreError = core.find((q) => q.error)?.error;
  const loading = core.some((q) => q.isPending) || factorYears.pending || brands.pending;

  const rows = useMemo<ClientRow[]>(
    () =>
      loading || coreError
        ? []
        : buildClientRows({
            companies: companies.data ?? [],
            sites: sites.data ?? [],
            users: users.data ?? [],
            configs: configs.data ?? [],
            units: units.data ?? [],
            thresholds: thresholds.data ?? [],
            factorYears: factorYears.years,
            brands: brands.brands,
          }),
    [loading, coreError, companies.data, sites.data, users.data, configs.data, units.data, thresholds.data, factorYears.years, brands.brands],
  );
  const gaps = useMemo(() => setupGaps(rows), [rows]);
  const activity = useMemo(() => recentActivity(batches.data ?? [], sites.data ?? []), [batches.data, sites.data]);
  const columns = useMemo(() => clientColumns(), []);

  const activeClients = (companies.data ?? []).filter((c) => c.status !== false).length;
  const kpis: Kpi[] = [
    { label: "Clients (active)", value: companies.data ? activeClients : null, primary: true, hint: companies.data ? `${companies.data.length} in total` : undefined },
    { label: "Sites", value: sites.data?.length },
    { label: "Users", value: users.data ? users.data.filter((u) => u.role !== "Superadmin").length : null },
    { label: "Emission factors", value: factorTotal.data ?? null },
    // No admin endpoint counts entries across clients yet (proposed GET /admin/console).
    { label: "Entries this month", value: null, hint: "Not available yet" },
  ];
  const retryCore = () => core.forEach((q) => q.error && void q.refetch());
  const partial = factorYears.failed + brands.failed;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Console"
        description="Client health, setup gaps and recent uploads across every client."
        primaryAction={{ label: "Onboard client", icon: <Plus aria-hidden className="size-4" />, onClick: () => navigate("/clients/new") }}
      />
      <KpiStrip
        items={kpis}
        loading={companies.isPending || sites.isPending || users.isPending}
        error={companies.error || sites.error || users.error ? "Couldn't load the totals." : null}
        onRetry={retryCore}
      />
      {partial > 0 && (
        <Callout tone="warn" title="Some setup checks couldn't run">
          Factor or brand details didn't load for {partial} {partial === 1 ? "item" : "items"}. Those checks are left out of the completeness figures.
        </Callout>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <DataTable<ClientRow>
            label="Clients"
            rows={rows}
            columns={columns}
            getRowId={(r) => r.id}
            rowLabel={(r) => r.name}
            loading={loading && !coreError}
            error={coreError ? errorMessage(coreError, "Couldn't load clients.") : null}
            onRetry={retryCore}
            empty={
              <EmptyState
                icon={Building2}
                title="No clients yet."
                description="Onboard the first client to see its setup here."
                action={<Button onClick={() => navigate("/clients/new")}>Onboard client</Button>}
              />
            }
            defaultSort={{ id: "setup", dir: "asc" }}
            pagination={{ mode: "client", pageSize: 25 }}
            onRowClick={(r) => navigate(`/clients/${r.id}`)}
            exportName="clients-setup"
            storageKey="p16-clients"
          />
        </div>
        <div className="min-w-0 space-y-4">
          <SetupGaps gaps={gaps} loading={loading && !coreError} />
          <RecentActivity items={activity} loading={batches.isPending} error={!!batches.error} />
        </div>
      </div>
    </div>
  );
}
