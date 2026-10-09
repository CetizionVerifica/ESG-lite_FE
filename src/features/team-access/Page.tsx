import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Building2, SearchX, Users } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import type { ManagerUser } from "../../services/managerService";
import {
  Button,
  ContextChips,
  DataTable,
  EMPTY_FILTERS,
  EmptyState,
  FilterBar,
  type FilterDef,
  PageHeader,
  useContextParams,
  useFilterParams,
  useToast,
  writeContext,
  writeFilterParams,
} from "../../ui";
import { errorMessage, useMonthStatus, useSaveAccess, useTeam } from "./api";
import { AccessDrawer } from "./components/AccessDrawer";
import { teamColumns } from "./components/columns";
import { currentMonth, displayName, matchesSearch, monthStatusById, onSites } from "./logic";

type SiteOption = { site_id: number; name: string };

const FILTER_KEYS = ["month"];
const MONTH_OPTIONS = [
  { value: "submitted", label: "Submitted" },
  { value: "missing", label: "Missing" },
];

function useManagerSites(): SiteOption[] {
  const { user } = useAuth();
  return useMemo(() => {
    const list = (user?.sites as SiteOption[] | undefined) ?? [];
    return list.length > 0 ? list : user?.site ? [user.site as SiteOption] : [];
  }, [user]);
}

/** P09 `/team`: who reports on my sites, and which categories each person can enter. */
export default function TeamAccessPage() {
  const { toast } = useToast();
  const [, setParams] = useSearchParams();
  const sites = useManagerSites();
  const [ctx] = useContextParams();
  const [filters, setFilters] = useFilterParams(FILTER_KEYS);
  const monthFilter = filters.filters.month?.[0] as "submitted" | "missing" | undefined;

  const team = useTeam();
  const month = currentMonth();
  const monthStatus = useMonthStatus(month);
  const save = useSaveAccess();
  const statusById = useMemo(() => (monthStatus.data ? monthStatusById(monthStatus.data) : undefined), [monthStatus.data]);

  const [openId, setOpenId] = useState<number | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const siteIds = useMemo(() => ctx.siteIds.filter((id) => sites.some((s) => s.site_id === id)), [ctx.siteIds, sites]);
  const all = useMemo(() => team.data ?? [], [team.data]);
  const rows = useMemo(
    () =>
      all.filter(
        (u) => onSites(u, siteIds) && matchesSearch(u, filters.q) && (!monthFilter || statusById?.get(u.user_id)?.status === monthFilter),
      ),
    [all, siteIds, filters.q, monthFilter, statusById],
  );
  const open = all.find((u) => u.user_id === openId) ?? null;

  const manage = (u: ManagerUser) => {
    save.reset();
    setSaveErr(null);
    setOpenId(u.user_id);
  };
  const columns = teamColumns({ siteIds, month: statusById, onManage: manage });

  const onSave = (user: ManagerUser, categoryIds: number[]) => {
    setSaveErr(null);
    save.mutate(
      { userId: user.user_id, categoryIds },
      {
        onSuccess: () => {
          setOpenId(null);
          toast({ title: `Access updated for ${displayName(user)}`, tone: "good" });
        },
        onError: (e) => setSaveErr(errorMessage(e, "Nothing was changed. Try again.")),
      },
    );
  };

  const filterDefs: FilterDef[] = monthStatus.data ? [{ key: "month", label: "This month", multiple: false, options: MONTH_OPTIONS }] : [];
  const filtered = !!filters.q.trim() || !!monthFilter || siteIds.length > 0;
  const clearFilters = () => setParams((p) => writeContext(writeFilterParams(p, EMPTY_FILTERS, FILTER_KEYS), { siteIds: [] }), { replace: true });
  const empty =
    all.length === 0 ? (
      <EmptyState icon={Users} title="No one else is on your sites yet." description="People appear here once your admin adds them to one of your sites." />
    ) : (
      <EmptyState icon={SearchX} title="No one matches these filters." action={filtered ? <Button onClick={clearFilters}>Clear filters</Button> : undefined} />
    );

  if (sites.length === 0)
    return (
      <div className="space-y-6">
        <PageHeader title="Team" />
        <EmptyState icon={Building2} title="You don't manage any sites yet." description="Ask your admin to assign one." />
      </div>
    );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Team"
        description="Who reports data on your sites, and which categories each person can enter."
        context={sites.length > 1 ? <ContextChips chips={["site"]} sites={sites.map((s) => ({ value: s.site_id, label: s.name }))} /> : undefined}
      />
      <p className="text-sm text-muted" data-testid="people-count">
        {team.data ? (
          <>
            {rows.length} {rows.length === 1 ? "person" : "people"}
            {statusById && ` · ${rows.filter((u) => statusById.get(u.user_id)?.status === "missing").length} missing this month`}
          </>
        ) : (
          " "
        )}
      </p>
      <DataTable<ManagerUser>
        label="Team"
        rows={rows}
        columns={columns}
        getRowId={(u) => u.user_id}
        rowLabel={displayName}
        loading={team.isPending}
        error={team.error ? errorMessage(team.error, "Couldn't load your team.") : null}
        onRetry={() => void team.refetch()}
        empty={empty}
        defaultSort={{ id: "person", dir: "asc" }}
        pagination={{ mode: "client", pageSize: 50 }}
        onRowClick={manage}
        exportName="team-access"
        storageKey="p09-team"
        toolbar={
          <FilterBar
            filters={filterDefs}
            value={filters}
            onChange={setFilters}
            searchPlaceholder="Search name, email or site"
            searchDelay={0}
          />
        }
      />
      <AccessDrawer key={open?.user_id ?? "closed"} user={open} saving={save.isPending} error={saveErr} onClose={() => setOpenId(null)} onSave={onSave} />
    </div>
  );
}
