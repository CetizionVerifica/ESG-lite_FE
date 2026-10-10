import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FileSpreadsheet, Layers, Plus, SearchX } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useClientContext } from "../../lib/clientContext";
import {
  Button,
  DataTable,
  EMPTY_FILTERS,
  EmptyState,
  FilterBar,
  type FilterDef,
  Modal,
  PageHeader,
  useFilterParams,
  useToast,
  withoutParams,
  writeFilterParams,
} from "../../ui";
import { duplicateOf, errorMessage, useCompanies, useDeleteFactor, useFactor, useFactors, useSaveFactor } from "./api";
import { FactorDrawer, type SaveError } from "./components/FactorDrawer";
import { ImportDrawer } from "./components/ImportDrawer";
import { factorColumns } from "./components/columns";
import {
  type Draft,
  type MaterialFactor,
  type Role,
  LICENCE_LABEL,
  LICENCES,
  createPayload,
  distinct,
  geographyLabel,
  groupLabel,
  matchesFilters,
  ownerKey,
  ownerLabel,
  updatePayload,
} from "./logic";

const FILTER_KEYS = ["group", "geo", "source", "licence", "year", "owner"];
const OPEN = "open";
const IMPORT = "import";

/** C04 `/factors/materials`: the cradle-to-gate factor library every footprint draws on. */
export default function MaterialFactorsPage() {
  const { toast } = useToast();
  const { role: rawRole } = useAuth();
  const role: Role = rawRole === "Superadmin" ? "Superadmin" : "Manager";
  const { clientId } = useClientContext();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useFilterParams(FILTER_KEYS);

  const factors = useFactors();
  const companies = useCompanies(role === "Superadmin");
  const save = useSaveFactor();
  const remove = useDeleteFactor();
  const [saveErr, setSaveErr] = useState<SaveError>(null);
  const [deleting, setDeleting] = useState<MaterialFactor | null>(null);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const all = useMemo(() => factors.data ?? [], [factors.data]);
  const f = filters.filters;
  const rows = useMemo(
    () =>
      all.filter((r) =>
        matchesFilters(r, {
          q: filters.q,
          groups: f.group ?? [],
          geographies: f.geo ?? [],
          sources: f.source ?? [],
          licences: f.licence ?? [],
          years: f.year ?? [],
          owners: f.owner ?? [],
        }),
      ),
    [all, filters.q, f],
  );

  // Drawers live in the URL (?open=new | ?open=<id>, ?import=1) so a factor can be linked to.
  const openParam = params.get(OPEN);
  const creating = openParam === "new";
  const openId = openParam && !creating && /^\d+$/.test(openParam) ? Number(openParam) : null;
  const openRow = openId !== null ? (all.find((r) => r.material_factor_id === openId) ?? null) : null;
  const detail = useFactor(openRow ? openId : null);
  const importing = params.get(IMPORT) === "1";

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setSaveErr(null);
      save.reset();
      setParams((p) => {
        const next = withoutParams(p, [OPEN, IMPORT]);
        if (value) next.set(key, value);
        return next;
      }, { replace: true });
    },
    [setParams, save],
  );
  const setOpen = (value: string | null) => setParam(OPEN, value);

  const onSave = (draft: Draft) => {
    setSaveErr(null);
    const body = openRow ? updatePayload(draft, openRow) : createPayload(draft, role);
    save.mutate(
      { id: openRow?.material_factor_id ?? null, body },
      {
        onSuccess: () => {
          setOpen(null);
          toast({ title: creating ? `Factor "${draft.name.trim()}" added` : `Factor "${draft.name.trim()}" saved`, tone: "good" });
        },
        onError: (e) => setSaveErr({ message: errorMessage(e, "Nothing was saved. Try again."), existingId: duplicateOf(e) }),
      },
    );
  };

  const onDelete = () => {
    if (!deleting) return;
    setDeleteErr(null);
    remove.mutate(deleting.material_factor_id, {
      onSuccess: () => {
        toast({ title: `Factor "${deleting.name}" deleted`, tone: "good" });
        setDeleting(null);
        setOpen(null);
      },
      onError: (e) => setDeleteErr(errorMessage(e, "The factor wasn't deleted. Try again.")),
    });
  };

  const companyList = companies.data ?? [];
  const opts = (values: string[], label: (v: string) => string = (v) => v) => values.map((v) => ({ value: v, label: label(v) }));
  const filterDefs: FilterDef[] = [
    { key: "group", label: "Group", options: opts(distinct(all, (r) => r.material_group), groupLabel) },
    { key: "geo", label: "Geography", options: opts(distinct(all, (r) => geographyLabel(r.geography))) },
    { key: "source", label: "Source", options: opts(distinct(all, (r) => r.source?.trim() || "—")) },
    { key: "licence", label: "Licence", options: LICENCES.map((l) => ({ value: l, label: LICENCE_LABEL[l] })) },
    { key: "year", label: "Year", options: opts(distinct(all, (r) => (r.source_year === null ? "—" : String(r.source_year)))) },
    {
      key: "owner",
      label: role === "Superadmin" ? "Company" : "Library",
      options: opts(distinct(all, ownerKey), (k) => (k === "global" ? "Global library" : role === "Superadmin" ? ownerLabel({ company_id: Number(k) }, companyList) : "Our factors")),
    },
  ];

  const usageReady = all.length === 0 || all.some((r) => r.used_by !== undefined);
  const columns = factorColumns({
    usageReady,
    owner: (r) => (r.company_id === null ? "Global" : role === "Superadmin" ? ownerLabel(r, companyList) : "Our factor"),
  });
  const filtered = !!filters.q.trim() || Object.values(f).some((v) => v && v.length > 0);
  const clearFilters = () => setParams((p) => writeFilterParams(p, EMPTY_FILTERS, FILTER_KEYS), { replace: true });
  const empty =
    all.length === 0 ? (
      <EmptyState
        icon={Layers}
        title="No material factors yet."
        description="Add a factor, or import a sheet of them with their sources."
        action={<Button variant="primary" onClick={() => setOpen("new")}>Add factor</Button>}
      />
    ) : (
      <EmptyState icon={SearchX} title="No factors match these filters." action={filtered ? <Button onClick={clearFilters}>Clear filters</Button> : undefined} />
    );

  const missing = !!openId && !!factors.data && !openRow;
  const defaultCompanyId = role === "Superadmin" ? clientId : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Material factors"
        description="Cradle-to-gate factors for materials, packaging and freight, with their source, so every footprint uses the same numbers."
        primaryAction={{ label: "Add factor", onClick: () => setOpen("new"), icon: <Plus aria-hidden className="size-4" /> }}
        secondaryActions={[{ label: "Import sheet", onClick: () => setParam(IMPORT, "1"), icon: <FileSpreadsheet aria-hidden className="size-4" /> }]}
      />
      <p className="text-sm text-muted" data-testid="factor-summary">
        {factors.data ? `${rows.length} ${rows.length === 1 ? "factor" : "factors"}${filtered ? ` of ${all.length}` : ""}` : " "}
      </p>
      <DataTable<MaterialFactor>
        label="Material factors"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.material_factor_id}
        rowLabel={(r) => r.name}
        loading={factors.isPending}
        error={factors.error ? errorMessage(factors.error, "Couldn't load material factors.") : null}
        onRetry={() => void factors.refetch()}
        empty={empty}
        defaultSort={{ id: "name", dir: "asc" }}
        pagination={{ mode: "client", pageSize: 50 }}
        onRowClick={(r) => setOpen(String(r.material_factor_id))}
        exportName="material-factors"
        storageKey="c04-material-factors"
        toolbar={
          <FilterBar
            filters={filterDefs}
            value={filters}
            onChange={setFilters}
            loading={factors.isPending}
            searchPlaceholder="Search name, group, source, dataset"
            searchDelay={0}
          />
        }
      />
      <FactorDrawer
        key={`${openParam ?? "closed"}-${openRow ? "ready" : "wait"}`}
        role={role}
        row={openRow}
        creating={creating}
        loading={!!openId && factors.isPending}
        detail={{ data: detail.data, loading: detail.isPending && detail.fetchStatus !== "idle", error: !!detail.error }}
        companies={companyList}
        defaultCompanyId={defaultCompanyId}
        saving={save.isPending}
        error={saveErr}
        onOpenExisting={(id) => setOpen(String(id))}
        onClose={() => setOpen(null)}
        onSave={onSave}
        onDelete={() => {
          remove.reset();
          setDeleteErr(null);
          setDeleting(openRow);
        }}
      />
      <ImportDrawer
        key={importing ? "import-open" : "import-closed"}
        open={importing}
        role={role}
        companies={companyList}
        defaultCompanyId={defaultCompanyId}
        onOpenExisting={(id) => setOpen(String(id))}
        onClose={() => setParam(IMPORT, null)}
      />
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        tone="destructive"
        title={`Delete "${deleting?.name ?? ""}"?`}
        description="Footprints never used it, so nothing else changes."
        error={deleteErr}
        primaryAction={{ label: "Delete factor", onClick: onDelete, loading: remove.isPending }}
      />
      {missing && (
        <p role="status" className="text-sm text-muted">
          That factor no longer exists or isn't visible to you. <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>Dismiss</Button>
        </p>
      )}
    </div>
  );
}
