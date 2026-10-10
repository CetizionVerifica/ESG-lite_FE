import { useCallback, useId, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Building2 } from "lucide-react";
import { Badge, Button, EmptyState, Modal, PageHeader, Skeleton, TabPanel, Tabs, TypedDeleteModal, useToast, withoutParams } from "../../ui";
import { errorMessage, hasBrand, useAdminUsers, useBrand, useCompanies, useDeleteCompany, useSites, useThreshold, useUpdateCompany } from "./api";
import { CompanyDrawer } from "./components/CompanyDrawer";
import { ClientLogo, StatusBadge } from "./components/bits";
import { BrandTab, DangerTab, MappingsTab, OverviewTab, PeopleTab, SitesTab, ThresholdTab } from "./components/DetailTabs";
import { type CompanyDraft, buildRows, cascadeItems, toPayload } from "./logic";

const TABS = ["overview", "sites", "people", "brand", "thresholds", "mappings", "danger"] as const;
type Tab = (typeof TABS)[number];
const isTab = (v: string | null): v is Tab => !!v && (TABS as readonly string[]).includes(v);

/** P17 `/clients/:clientId`: one client's details, sites, people, brand, threshold, mappings and danger zone. */
export default function ClientDetailPage() {
  const { clientId } = useParams();
  const id = Number(clientId);
  const navigate = useNavigate();
  const { toast } = useToast();
  const idBase = useId();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get("tab");
  const tab: Tab = isTab(tabParam) ? tabParam : "overview";
  const editing = params.get("open") === "edit";

  const companies = useCompanies();
  const sites = useSites();
  const users = useAdminUsers();
  const brand = useBrand(Number.isInteger(id) && id > 0 ? id : null);
  const threshold = useThreshold(id);
  const update = useUpdateCompany();
  const remove = useDeleteCompany();

  const company = companies.data?.find((c) => c.company_id === id) ?? null;
  const row = useMemo(() => (company ? buildRows([company], sites.data, users.data)[0] : null), [company, sites.data, users.data]);

  const sitesLoad = { loading: sites.isPending, failed: !!sites.error && !sites.data, retry: () => void sites.refetch() };
  const peopleLoad = {
    loading: sites.isPending || users.isPending,
    failed: (!!sites.error && !sites.data) || (!!users.error && !users.data),
    retry: () => {
      if (sites.error) void sites.refetch();
      if (users.error) void users.refetch();
    },
  };

  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [confirmStatus, setConfirmStatus] = useState(false);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const setParam = useCallback(
    (key: string, value: string | null) =>
      setParams(
        (p) => {
          const next = withoutParams(p, [key]);
          if (value) next.set(key, value);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  if (companies.isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (companies.error) {
    return (
      <EmptyState
        variant="error"
        title="Couldn't load this client."
        description={errorMessage(companies.error, "Try again.")}
        action={<Button onClick={() => void companies.refetch()}>Try again</Button>}
      />
    );
  }
  if (!row) {
    return <EmptyState icon={Building2} title="This client doesn't exist." description="It may have been deleted." action={<Button onClick={() => navigate("/clients")}>Back to clients</Button>} />;
  }

  const onSave = (draft: CompanyDraft) => {
    setSaveErr(null);
    update.mutate(
      { id, data: toPayload(draft) },
      {
        onSuccess: () => {
          setParam("open", null);
          toast({ title: `"${draft.name.trim()}" saved`, tone: "good" });
        },
        onError: (e) => setSaveErr(errorMessage(e, "Nothing was saved. Try again.")),
      },
    );
  };

  const onToggleActive = () => {
    setStatusErr(null);
    update.mutate(
      { id, data: { status: !row.active } },
      {
        onSuccess: () => {
          setConfirmStatus(false);
          toast({ title: row.active ? `${row.name} deactivated` : `${row.name} reactivated`, tone: "good" });
        },
        onError: (e) => setStatusErr(errorMessage(e, "The status wasn't changed. Try again.")),
      },
    );
  };

  const onDelete = () => {
    setDeleteErr(null);
    remove.mutate(id, {
      onSuccess: () => {
        toast({ title: `${row.name} deleted`, tone: "good" });
        navigate("/clients", { replace: true });
      },
      onError: (e) => setDeleteErr(errorMessage(e, "The client wasn't deleted. Try again.")),
    });
  };

  const brandData = hasBrand(brand.data) ? brand.data : undefined;
  const tabs = [
    { value: "overview" as const, label: "Overview" },
    { value: "sites" as const, label: "Sites", count: sites.data ? row.sites.length : undefined },
    { value: "people" as const, label: "People", count: sites.data && users.data ? row.users.length : undefined },
    { value: "brand" as const, label: "Brand theme" },
    { value: "thresholds" as const, label: "Threshold" },
    { value: "mappings" as const, label: "Mappings" },
    { value: "danger" as const, label: "Danger zone" },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          <span className="flex min-w-0 items-center gap-3">
            <ClientLogo name={row.name} url={brandData?.logoUrl} size="lg" />
            <span className="min-w-0 truncate">{row.name}</span>
          </span>
        }
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <StatusBadge active={row.active} />
            {[row.industry, row.region].filter(Boolean).join(" · ")}
            {row.esgMitraAccess && <Badge tone="brand">ESG-Mitra</Badge>}
          </span>
        }
        primaryAction={{ label: "Edit details", onClick: () => setParam("open", "edit") }}
      />
      <Tabs label="Client sections" idBase={idBase} items={tabs} value={tab} onChange={(v) => setParam("tab", v === "overview" ? null : v)} />
      <TabPanel idBase={idBase} value="overview" current={tab}>
        <OverviewTab row={row} />
      </TabPanel>
      <TabPanel idBase={idBase} value="sites" current={tab}>
        <SitesTab row={row} load={sitesLoad} />
      </TabPanel>
      <TabPanel idBase={idBase} value="people" current={tab}>
        <PeopleTab row={row} load={peopleLoad} />
      </TabPanel>
      <TabPanel idBase={idBase} value="brand" current={tab}>
        <BrandTab row={row} brand={brandData} raw={brand.data} loading={brand.isPending} />
      </TabPanel>
      <TabPanel idBase={idBase} value="thresholds" current={tab}>
        {tab === "thresholds" && <ThresholdTab companyId={id} />}
      </TabPanel>
      <TabPanel idBase={idBase} value="mappings" current={tab}>
        {tab === "mappings" && <MappingsTab companyId={id} />}
      </TabPanel>
      <TabPanel idBase={idBase} value="danger" current={tab}>
        <DangerTab
          row={row}
          sites={sitesLoad}
          onToggleActive={() => {
            update.reset();
            setStatusErr(null);
            setConfirmStatus(true);
          }}
          onDelete={() => {
            remove.reset();
            setDeleteErr(null);
            setDeleting(true);
          }}
        />
      </TabPanel>

      {editing && (
        <CompanyDrawer
          key={row.company_id}
          company={row}
          saving={update.isPending}
          error={saveErr}
          onClose={() => {
            setSaveErr(null);
            setParam("open", null);
          }}
          onSave={onSave}
        />
      )}
      <Modal
        open={confirmStatus}
        onClose={() => setConfirmStatus(false)}
        tone={row.active ? "destructive" : "default"}
        title={row.active ? `Deactivate ${row.name}?` : `Reactivate ${row.name}?`}
        description={row.active ? "The client is marked inactive. Its sites, people and data stay as they are." : "The client is marked active again."}
        error={statusErr}
        primaryAction={{ label: row.active ? "Deactivate" : "Reactivate", onClick: onToggleActive, loading: update.isPending }}
      />
      {deleting && (
        <TypedDeleteModal
          open
          noun="client"
          name={row.name}
          cascades={cascadeItems(!!threshold.data)}
          deleting={remove.isPending}
          error={deleteErr}
          onClose={() => setDeleting(false)}
          onConfirm={onDelete}
        />
      )}
    </div>
  );
}
