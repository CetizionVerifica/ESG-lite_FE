import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Copy, SearchX, Users } from "lucide-react";
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
  TypedDeleteModal,
  useFilterParams,
  useToast,
  withoutParams,
  writeFilterParams,
} from "../../ui";
import { errorMessage, useCompanies, useRemoveUser, useSaveUser, useSendResetLink, useSites, useUsers } from "./api";
import { UserDrawer } from "./components/UserDrawer";
import { userColumns } from "./components/columns";
import { ROLES, type UserDraft, type UserRow, buildRows, matchesFilters, personName, toIds, toPayload } from "./logic";

const FILTER_KEYS = ["client", "role", "site"];
const OPEN = "open";

/** P20 `/setup/users`: everyone with an ESGLite account, across every client. */
export default function UsersGlobalPage() {
  const { toast } = useToast();
  const { clientId } = useClientContext();
  const { user: me } = useAuth();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useFilterParams(FILTER_KEYS);

  const users = useUsers();
  const sites = useSites();
  const companies = useCompanies();
  const save = useSaveUser();
  const remove = useRemoveUser();
  const reset = useSendResetLink();

  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [removing, setRemoving] = useState<UserRow | null>(null);
  const [removeErr, setRemoveErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null);

  const all = useMemo(() => buildRows(users.data ?? [], sites.data), [users.data, sites.data]);
  const clientIds = toIds(filters.filters.client);
  const siteIds = toIds(filters.filters.site);
  const roles = filters.filters.role ?? [];
  const rows = useMemo(
    () => all.filter((r) => matchesFilters(r, { q: filters.q, clientIds: toIds(filters.filters.client), roles: filters.filters.role ?? [], siteIds: toIds(filters.filters.site) })),
    [all, filters],
  );

  // The drawer lives in the URL (?open=new | ?open=<user id>) so a person can be linked to.
  const openParam = params.get(OPEN);
  const creating = openParam === "new";
  const openRow = openParam && !creating ? (all.find((r) => String(r.user_id) === openParam) ?? null) : null;
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

  const onSave = (draft: UserDraft) => {
    setSaveErr(null);
    const payload = toPayload(draft, openRow);
    const name = personName({ name: draft.name.trim(), last_name: draft.last_name.trim(), email: draft.email.trim() });
    save.mutate(
      { id: openRow?.user_id ?? null, payload },
      {
        onSuccess: (res) => {
          setOpen(null);
          if (creating && res?.temporary_password) setCreated({ name, email: draft.email.trim(), password: res.temporary_password });
          else toast({ title: creating ? `${name} added` : `${name} saved`, tone: "good" });
        },
        onError: (e) => setSaveErr(errorMessage(e, "Nothing was saved. Try again.")),
      },
    );
  };

  const onRemove = () => {
    if (!removing) return;
    setRemoveErr(null);
    remove.mutate(removing.user_id, {
      onSuccess: () => {
        toast({ title: `${removing.displayName} removed`, tone: "good" });
        setRemoving(null);
        setOpen(null);
      },
      onError: (e) => setRemoveErr(errorMessage(e, "They weren't removed. Try again.")),
    });
  };

  const sendReset = (row: UserRow) =>
    reset.mutate(row.email, {
      onSuccess: () => toast({ title: `Reset link sent to ${row.email}`, tone: "good" }),
      onError: (e) => toast({ title: "Couldn't send the reset link", description: errorMessage(e, "Try again in a minute."), tone: "bad" }),
    });

  const startRemove = (row: UserRow) => {
    remove.reset();
    setRemoveErr(null);
    setRemoving(row);
  };

  const companyOptions = useMemo(
    () => (companies.data ?? []).map((c) => ({ value: String(c.company_id), label: c.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [companies.data],
  );
  // Sites narrow to the chosen client so the list stays short.
  const siteOptions = useMemo(
    () =>
      (sites.data ?? [])
        .filter((s) => !clientIds.length || (s.company && clientIds.includes(s.company.company_id)))
        .map((s) => ({ value: String(s.site_id), label: clientIds.length === 1 || !s.company ? s.name : `${s.name} · ${s.company.name}` }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [sites.data, clientIds],
  );
  const filterDefs: FilterDef[] = [
    { key: "client", label: "Client", multiple: false, options: companyOptions },
    { key: "role", label: "Role", options: ROLES.map((r) => ({ value: r, label: r })) },
    { key: "site", label: "Site", options: siteOptions },
  ];

  // The signed-in person can't remove themselves or change their own role.
  const isSelf = (r: UserRow | null) => !!r && !!me && (me.user_id === r.user_id || (!me.user_id && me.email === r.email));
  const columns = userColumns({ edit: (r) => setOpen(String(r.user_id)), reset: sendReset, remove: startRemove, isSelf });
  const filtered = !!filters.q.trim() || clientIds.length > 0 || roles.length > 0 || siteIds.length > 0;
  const clearFilters = () => setParams((p) => writeFilterParams(p, EMPTY_FILTERS, FILTER_KEYS), { replace: true });
  const empty =
    all.length === 0 ? (
      <EmptyState icon={Users} title="No users yet." description="Add the first person for a client." action={<Button variant="primary" onClick={() => setOpen("new")}>Add user</Button>} />
    ) : (
      <EmptyState icon={SearchX} title="No users match these filters." action={filtered ? <Button onClick={clearFilters}>Clear filters</Button> : undefined} />
    );

  const missingUser = !!openParam && !creating && !!users.data && !openRow;
  const defaultCompanyId = clientIds.length === 1 ? clientIds[0] : clientId;

  const copyPassword = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.password);
      toast({ title: "Password copied", tone: "good" });
    } catch {
      toast({ title: "Couldn't copy. Select the password and copy it.", tone: "bad" });
    }
  };

  return (
    <SetupListPage<UserRow>
      title="Users"
      description="Everyone with an ESGLite account, across every client: their role, sites and what they can enter."
      addLabel="Add user"
      onAdd={() => setOpen("new")}
      summary={users.data ? `${rows.length} ${rows.length === 1 ? "person" : "people"}${filtered ? ` of ${all.length}` : ""}` : " "}
      table={{
        label: "Users",
        rows,
        columns,
        getRowId: (r) => r.user_id,
        rowLabel: (r) => r.displayName,
        loading: users.isPending,
        error: users.error ? errorMessage(users.error, "Couldn't load users.") : null,
        onRetry: () => void users.refetch(),
        empty,
        defaultSort: { id: "person", dir: "asc" },
        pagination: { mode: "client", pageSize: 50 },
        onRowClick: (r) => setOpen(String(r.user_id)),
        exportName: "users",
        storageKey: "p20-users",
        toolbar: (
          <FilterBar
            filters={filterDefs}
            value={filters}
            onChange={setFilters}
            loading={companies.isPending || sites.isPending}
            searchPlaceholder="Search name, email, client, site"
            searchDelay={0}
          />
        ),
      }}
    >
      <UserDrawer
        // Remount once a linked person's data arrives, so the form starts from it.
        key={`${openParam ?? "closed"}-${openRow ? "ready" : "wait"}-${sites.data ? "sites" : "nosites"}`}
        row={openRow}
        creating={creating}
        loading={!!openParam && !creating && users.isPending}
        defaultCompanyId={defaultCompanyId}
        companies={{ data: companies.data ?? [], loading: companies.isPending }}
        sites={{ data: sites.data ?? [], loading: sites.isPending }}
        saving={save.isPending}
        error={saveErr}
        onClose={() => setOpen(null)}
        onSave={onSave}
        isSelf={isSelf(openRow)}
        onRemove={() => openRow && startRemove(openRow)}
        onReset={() => openRow && sendReset(openRow)}
      />
      {removing && (
        <TypedDeleteModal
          key={removing.user_id}
          open
          noun="user"
          name={removing.email}
          cascades={[`${removing.displayName}'s account and sign-in`, "Their notifications"]}
          deleting={remove.isPending}
          error={removeErr}
          onClose={() => setRemoving(null)}
          onConfirm={onRemove}
        />
      )}
      <Modal
        open={!!created}
        onClose={() => setCreated(null)}
        title={created ? `${created.name} added` : "User added"}
        description={created ? <>Give them this temporary password to sign in as <span className="font-medium text-ink">{created.email}</span>. It isn't shown again.</> : undefined}
        cancelLabel={null}
        primaryAction={{ label: "Done", onClick: () => setCreated(null) }}
      >
        {created && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-control border border-line bg-tint px-3 py-2">
              <code data-testid="temporary-password" className="min-w-0 flex-1 select-all break-all font-num text-ink">
                {created.password}
              </code>
              <Button size="sm" variant="ghost" onClick={() => void copyPassword()}>
                <Copy aria-hidden className="size-4" /> Copy
              </Button>
            </div>
            <Callout tone="info">They can also use “Forgot password” on the sign-in page, or you can send a reset link from their row.</Callout>
          </div>
        )}
      </Modal>
      {missingUser && (
        <p role="status" className="text-sm text-muted">
          That person no longer has an account. <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>Dismiss</Button>
        </p>
      )}
    </SetupListPage>
  );
}
