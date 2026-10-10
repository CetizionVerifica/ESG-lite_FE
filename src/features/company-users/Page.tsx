import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SearchX, UserPlus, Users } from "lucide-react";
import {
  Button,
  ContextChips,
  DataTable,
  EMPTY_FILTERS,
  EmptyState,
  FilterBar,
  type FilterDef,
  KpiStrip,
  PageHeader,
  useContextParams,
  useFilterParams,
  useToast,
  writeContext,
  writeFilterParams,
} from "../../ui";
import { errorMessage, useCompanySites, useCompanyUsers, usePeopleMutations } from "./api";
import { PersonDrawer } from "./components/PersonDrawer";
import { RemoveModal } from "./components/RemoveModal";
import { peopleColumns } from "./components/columns";
import { type CompanyUser, type PersonDraft, createPayload, displayName, kpis, matchesFilters, updatePayload } from "./logic";

const FILTER_KEYS = ["role"];

/** The server answers 500 when the database refuses because the person has entries or approvals. */
function removeError(e: unknown, name: string): string {
  const status = (e as { response?: { status?: number } } | null)?.response?.status;
  if (status !== undefined && status >= 500) return `Couldn't remove ${name}: they have entries or approvals on record. Nothing was changed.`;
  return errorMessage(e, `Couldn't remove ${name}. Nothing was changed.`);
}
const ROLE_OPTIONS = [
  { value: "Manager", label: "Manager" },
  { value: "User", label: "User" },
];
/** Remove is a delete call: kept behind a confirm dialog (see RemoveModal). */
const ALLOW_REMOVE = true;

type DrawerState = { mode: "invite" } | { mode: "edit"; id: number } | null;

/** P15 `/users`: the company Admin's people, their roles and sites. */
export default function CompanyUsersPage() {
  const { toast } = useToast();
  const [, setParams] = useSearchParams();
  const [ctx] = useContextParams();
  const [filters, setFilters] = useFilterParams(FILTER_KEYS);
  const role = filters.filters.role?.[0];

  const users = useCompanyUsers();
  const sites = useCompanySites();
  const m = usePeopleMutations();

  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [drawerKey, setDrawerKey] = useState(0);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [removing, setRemoving] = useState<CompanyUser | null>(null);
  const [removeErr, setRemoveErr] = useState<string | null>(null);

  const all = useMemo(() => users.data ?? [], [users.data]);
  const siteList = useMemo(() => (sites.data ?? []).map((s) => ({ site_id: s.site_id, name: s.name })), [sites.data]);
  const siteIds = useMemo(() => ctx.siteIds.filter((id) => siteList.some((s) => s.site_id === id)), [ctx.siteIds, siteList]);
  const rows = useMemo(() => all.filter((u) => matchesFilters(u, { role, siteIds, q: filters.q })), [all, role, siteIds, filters.q]);
  const summary = useMemo(() => kpis(all, siteList), [all, siteList]);
  const editing = drawer?.mode === "edit" ? (all.find((u) => u.user_id === drawer.id) ?? null) : null;

  const openDrawer = (next: DrawerState) => {
    setSaveErr(null);
    setDrawerKey((k) => k + 1);
    setDrawer(next);
  };

  const sendReset = (email: string, name: string) =>
    m.resetLink.mutate(email, {
      onSuccess: () => toast({ title: `Reset link sent to ${name}`, description: email, tone: "good" }),
      onError: (e) => toast({ title: "Couldn't send the reset link", description: errorMessage(e, "Try again in a moment."), tone: "bad" }),
    });

  const submit = (draft: PersonDraft) => {
    setSaveErr(null);
    if (drawer?.mode === "edit") {
      if (!editing) return;
      const body = updatePayload(editing, draft);
      if (Object.keys(body).length === 0) {
        setDrawer(null);
        return;
      }
      m.update.mutate(
        { id: editing.user_id, body },
        {
          onSuccess: () => {
            setDrawer(null);
            toast({ title: `Saved ${draft.name.trim() || draft.email.trim()}`, tone: "good" });
          },
          onError: (e) => setSaveErr(errorMessage(e, "Nothing was changed. Try again.")),
        },
      );
      return;
    }
    m.create.mutate(createPayload(draft), {
      onSuccess: () => {
        const name = draft.name.trim() || draft.email.trim();
        setDrawer(null);
        toast({ title: `${name} can now sign in`, tone: "good" });
        if (draft.sendLink) sendReset(draft.email.trim().toLowerCase(), name);
      },
      onError: (e) => setSaveErr(errorMessage(e, "Nobody was invited. Try again.")),
    });
  };

  const confirmRemove = (u: CompanyUser) => {
    setRemoveErr(null);
    m.remove.mutate(u.user_id, {
      onSuccess: () => {
        setRemoving(null);
        toast({ title: `${displayName(u)} removed`, description: "Their entries are kept." });
      },
      onError: (e) => setRemoveErr(removeError(e, displayName(u))),
    });
  };

  const columns = peopleColumns(
    {
      edit: (u) => openDrawer({ mode: "edit", id: u.user_id }),
      resetLink: (u) => sendReset(u.email, displayName(u)),
      remove: (u) => {
        setRemoveErr(null);
        setRemoving(u);
      },
    },
    ALLOW_REMOVE,
  );

  const filterDefs: FilterDef[] = [{ key: "role", label: "Role", multiple: false, options: ROLE_OPTIONS }];
  const filtered = !!filters.q.trim() || !!role || siteIds.length > 0;
  const clearFilters = () => setParams((p) => writeContext(writeFilterParams(p, EMPTY_FILTERS, FILTER_KEYS), { siteIds: [] }), { replace: true });
  const empty =
    all.length === 0 ? (
      <EmptyState
        icon={Users}
        title="No one in your company yet."
        description="Invite your first manager or contributor."
        action={
          <Button variant="primary" onClick={() => openDrawer({ mode: "invite" })}>
            Invite person
          </Button>
        }
      />
    ) : (
      <EmptyState icon={SearchX} title="No one matches these filters." action={filtered ? <Button onClick={clearFilters}>Clear filters</Button> : undefined} />
    );

  const unmanaged = summary.unmanaged;
  return (
    <div className="space-y-4">
      <PageHeader
        title="People"
        description="Managers and contributors in your company, and the sites they work on."
        context={siteList.length > 1 ? <ContextChips chips={["site"]} sites={siteList.map((s) => ({ value: s.site_id, label: s.name }))} /> : undefined}
        primaryAction={{ label: "Invite person", icon: <UserPlus aria-hidden className="size-4" />, onClick: () => openDrawer({ mode: "invite" }) }}
      />
      <KpiStrip
        loading={users.isPending || sites.isPending}
        error={users.error || sites.error ? "Couldn't load the totals." : undefined}
        onRetry={() => {
          if (users.error) void users.refetch();
          if (sites.error) void sites.refetch();
        }}
        items={[
          { label: "People", value: summary.people, primary: true },
          { label: "Managers", value: summary.managers },
          { label: "Contributors", value: summary.contributors },
          {
            label: "Sites without a manager",
            value: sites.data ? unmanaged.length : null,
            hint: unmanaged.length ? <span className="text-warn">{unmanaged.map((s) => s.name).join(", ")}</span> : sites.data ? "Every site has one" : undefined,
          },
        ]}
      />
      <DataTable<CompanyUser>
        label="People"
        rows={rows}
        columns={columns}
        getRowId={(u) => u.user_id}
        rowLabel={displayName}
        loading={users.isPending}
        error={users.error ? errorMessage(users.error, "Couldn't load your people.") : null}
        onRetry={() => void users.refetch()}
        empty={empty}
        defaultSort={{ id: "person", dir: "asc" }}
        pagination={{ mode: "client", pageSize: 50 }}
        onRowClick={(u) => openDrawer({ mode: "edit", id: u.user_id })}
        exportName="people"
        storageKey="p15-people"
        toolbar={<FilterBar filters={filterDefs} value={filters} onChange={setFilters} searchPlaceholder="Search name, email or site" searchDelay={0} />}
      />
      <PersonDrawer
        key={drawerKey}
        open={drawer !== null && (drawer.mode === "invite" || editing !== null)}
        user={editing}
        sites={siteList}
        saving={m.create.isPending || m.update.isPending}
        error={saveErr}
        onEdit={() => setSaveErr(null)}
        onClose={() => setDrawer(null)}
        onSubmit={submit}
      />
      <RemoveModal user={removing} busy={m.remove.isPending} error={removeErr} onClose={() => setRemoving(null)} onConfirm={confirmRemove} />
    </div>
  );
}
