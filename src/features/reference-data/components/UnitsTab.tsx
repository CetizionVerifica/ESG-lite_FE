import { useMemo, useState } from "react";
import { Ruler, SearchX } from "lucide-react";
import {
  Button,
  Callout,
  type Column,
  Combobox,
  ContextChips,
  Drawer,
  EMPTY_FILTERS,
  EmptyState,
  FilterBar,
  Select,
  SetupListPage,
  TextField,
  Textarea,
  useContextParams,
  useFilterParams,
  useToast,
} from "../../../ui";
import { errorMessage, useCategories, useDeleteUnit, useSaveUnit, useSites, useUnits } from "../api";
import { useOpenParam } from "../hooks/useOpenParam";
import {
  type Site,
  type UnitDraft,
  type UnitField,
  type UnitRow,
  isUnitDirty,
  matchesUnit,
  siteCategories,
  unitDraftFrom,
  unitRows,
  validateUnit,
} from "../logic";
import { DeleteModal, DiscardModal, DrawerFooter, SaveError, type TabShell } from "./common";
import { dash, openColumn } from "./columns";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function UnitsTab({ nav, panel }: TabShell) {
  const { toast } = useToast();
  const [filters, setFilters] = useFilterParams([]);
  const [ctx, setCtx] = useContextParams();
  const [openParam, setOpen] = useOpenParam();
  const sites = useSites();
  const categories = useCategories();
  const units = useUnits(ctx.siteIds, ctx.categoryId);
  const save = useSaveUnit();
  const remove = useDeleteUnit();
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<UnitRow | null>(null);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const all = useMemo(() => unitRows(units.data ?? [], sites.data, categories.data), [units.data, sites.data, categories.data]);
  // The same filter runs on the server's pair answer too, so both paths agree.
  const rows = useMemo(
    () => all.filter((r) => matchesUnit(r, { q: filters.q, siteIds: ctx.siteIds, categoryId: ctx.categoryId })),
    [all, filters.q, ctx.siteIds, ctx.categoryId],
  );

  const creating = openParam === "new";
  const openRow = openParam && !creating ? (all.find((r) => String(r.unit_id) === openParam) ?? null) : null;
  const open = (value: string | null) => {
    setSaveErr(null);
    save.reset();
    setOpen(value);
  };

  const onSave = (draft: UnitDraft) => {
    setSaveErr(null);
    save.mutate(
      { id: openRow?.unit_id ?? null, draft },
      {
        onSuccess: () => {
          open(null);
          toast({ title: creating ? `Unit "${draft.unit_name.trim()}" added` : `Unit "${draft.unit_name.trim()}" saved`, tone: "good" });
        },
        onError: (e) => setSaveErr(errorMessage(e, "Nothing was saved. Try again.")),
      },
    );
  };

  const onDelete = () => {
    if (!deleting) return;
    setDeleteErr(null);
    remove.mutate(deleting.unit_id, {
      onSuccess: () => {
        toast({ title: `Unit "${deleting.unit_name}" deleted`, tone: "good" });
        setDeleting(null);
        open(null);
      },
      onError: (e) => setDeleteErr(errorMessage(e, "The unit wasn't deleted. Try again.")),
    });
  };

  const siteOptions = useMemo(
    () => (sites.data ?? []).map((s) => ({ value: s.site_id, label: s.name })).sort((a, b) => a.label.localeCompare(b.label)),
    [sites.data],
  );
  // With one site picked, the category chip offers only that site's categories.
  const pickedSite = ctx.siteIds.length === 1 ? sites.data?.find((s) => s.site_id === ctx.siteIds[0]) : undefined;
  const categoryOptions = useMemo(
    () =>
      (pickedSite ? siteCategories(pickedSite) : (categories.data ?? []))
        .map((c) => ({ value: c.category_id, label: c.category_name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [pickedSite, categories.data],
  );

  const countsKnown = all.some((r) => r.entries !== null);
  const columns: Column<UnitRow>[] = [
    { id: "unit", header: "Unit", hideable: false, sortable: true, value: (r) => r.unit_name, cell: (r) => <span className="font-medium text-ink">{r.unit_name}</span> },
    { id: "description", header: "Description", value: (r) => r.description ?? "", cell: (r) => (r.description ? <span className="text-muted">{r.description}</span> : dash) },
    { id: "site", header: "Site", sortable: true, value: (r) => r.siteName },
    { id: "category", header: "Category", sortable: true, value: (r) => r.categoryName },
    { id: "entries", header: "Used by entries", numeric: true, sortable: true, width: "9rem", value: (r) => r.entries, cell: countsKnown ? undefined : () => dash },
    openColumn((r) => r.unit_name, (r) => open(String(r.unit_id))),
  ];

  const filtered = !!filters.q.trim() || ctx.siteIds.length > 0 || !!ctx.categoryId;
  const clear = () => {
    setFilters(EMPTY_FILTERS);
    setCtx({ siteIds: [], categoryId: null });
  };
  const empty =
    all.length === 0 && !filtered ? (
      <EmptyState icon={Ruler} title="No units yet." description="Add the units people pick when they enter data, per site and category." action={<Button variant="primary" onClick={() => open("new")}>Add unit</Button>} />
    ) : (
      <EmptyState icon={SearchX} title="No units match these filters." action={filtered ? <Button onClick={clear}>Clear filters</Button> : undefined} />
    );

  return (
    <SetupListPage<UnitRow>
      title="Reference data"
      description="Units people can pick when they enter data, set per site and category."
      addLabel="Add unit"
      onAdd={() => open("new")}
      nav={
        <>
          {nav}
          <ContextChips chips={["site", "category"]} sites={siteOptions} categories={categoryOptions} loading={sites.isPending} />
        </>
      }
      panel={panel}
      summary={units.data ? `${plural(rows.length, "unit", "units")}${filtered && rows.length !== all.length ? ` of ${all.length}` : ""}` : " "}
      table={{
        label: "Units",
        rows,
        columns,
        getRowId: (r) => r.unit_id,
        rowLabel: (r) => r.unit_name,
        loading: units.isPending,
        error: units.error ? errorMessage(units.error, "Couldn't load units.") : null,
        onRetry: () => void units.refetch(),
        empty,
        defaultSort: { id: "unit", dir: "asc" },
        pagination: { mode: "client", pageSize: 50 },
        onRowClick: (r) => open(String(r.unit_id)),
        exportName: "units",
        storageKey: "p21-units",
        toolbar: <FilterBar filters={[]} value={filters} onChange={setFilters} searchPlaceholder="Search unit, description, site, category" searchDelay={0} />,
      }}
    >
      <UnitDrawer
        key={`${openParam ?? "closed"}-${openRow ? "ready" : "wait"}`}
        row={openRow}
        creating={creating}
        loading={!!openParam && !creating && units.isPending}
        defaults={{ siteId: ctx.siteIds.length === 1 ? ctx.siteIds[0] : null, categoryId: ctx.categoryId }}
        others={all.filter((u) => u.unit_id !== openRow?.unit_id)}
        sites={{ data: sites.data ?? [], loading: sites.isPending }}
        saving={save.isPending}
        error={saveErr}
        onClose={() => open(null)}
        onSave={onSave}
        onDelete={() => {
          remove.reset();
          setDeleteErr(null);
          setDeleting(openRow);
        }}
      />
      {deleting && (
        <DeleteModal
          noun="unit"
          name={deleting.unit_name}
          blocked={null}
          consequence={
            deleting.entries
              ? `People at ${deleting.siteName || "this site"} can no longer pick it. The ${plural(deleting.entries, "entry", "entries")} already using it keep their unit.`
              : `People at ${deleting.siteName || "this site"} can no longer pick it. This can't be undone.`
          }
          deleting={remove.isPending}
          error={deleteErr}
          onClose={() => setDeleting(null)}
          onConfirm={onDelete}
        />
      )}
      {!!openParam && !creating && !!units.data && !openRow && (
        <p role="status" className="text-sm text-muted">
          That unit isn't in this list. <Button size="sm" variant="ghost" onClick={() => open(null)}>Dismiss</Button>
        </p>
      )}
    </SetupListPage>
  );
}

function UnitDrawer(props: {
  row: UnitRow | null;
  creating: boolean;
  loading: boolean;
  defaults: { siteId: number | null; categoryId: number | null };
  others: UnitRow[];
  sites: { data: Site[]; loading: boolean };
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (d: UnitDraft) => void;
  onDelete: () => void;
}) {
  const { row, creating } = props;
  const [draft, setDraft] = useState<UnitDraft>(() => unitDraftFrom(row, props.defaults));
  const [touched, setTouched] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  if (props.loading) return <Drawer open loading onClose={props.onClose} title="Loading unit…" />;
  if (!creating && !row) return <Drawer open={false} onClose={props.onClose} title="" />;

  const site = props.sites.data.find((s) => s.site_id === draft.site_id);
  const cats = siteCategories(site);
  const errors = validateUnit(draft, props.others, site);
  const dirty = isUnitDirty(draft, row);
  const moved = !!row && (draft.site_id !== row.site?.site_id || draft.category_id !== row.category?.category_id);
  const fieldError = (k: UnitField) => (touched ? errors[k] : undefined);
  const close = () => (dirty && !props.saving ? setConfirmClose(true) : props.onClose());
  const save = () => {
    setTouched(true);
    if (Object.keys(errors).length === 0) props.onSave(draft);
  };

  return (
    <>
      <Drawer
        open
        size="sm"
        onClose={close}
        title={creating ? "Add unit" : row!.unit_name}
        subtitle={creating ? "People at the site pick it when they enter data for the category." : [row!.siteName, row!.categoryName].filter(Boolean).join(" · ")}
        footer={
          <DrawerFooter
            deleteLabel="Delete unit"
            onDelete={creating ? undefined : props.onDelete}
            onCancel={close}
            onSave={save}
            saveLabel={creating ? "Add unit" : "Save"}
            saving={props.saving}
            canSave={creating || dirty}
          />
        }
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <SaveError error={props.error} title="Couldn't save the unit" />
          <Combobox<number>
            label="Site"
            required
            placeholder="Search sites…"
            value={draft.site_id}
            onChange={(v) =>
              setDraft((d) => {
                const next = props.sites.data.find((s) => s.site_id === v);
                const keep = !!next?.categories?.some((c) => c.category_id === d.category_id);
                return { ...d, site_id: v, category_id: keep ? d.category_id : null };
              })
            }
            options={props.sites.data.map((s) => ({ value: s.site_id, label: s.name }))}
            loading={props.sites.loading}
            error={fieldError("site_id")}
          />
          <Select<number>
            label="Category"
            required
            placeholder="Choose a category"
            emptyText={draft.site_id ? "This site has no categories" : "Choose a site first"}
            value={draft.category_id}
            onChange={(v) => setDraft((d) => ({ ...d, category_id: v }))}
            options={cats.map((c) => ({ value: c.category_id, label: c.category_name }))}
            error={fieldError("category_id")}
          />
          <TextField label="Unit name" required value={draft.unit_name} onChange={(v) => setDraft((d) => ({ ...d, unit_name: v }))} error={fieldError("unit_name")} maxLength={50} help="As people will see it, for example kWh or litres." />
          <Textarea label="Description" value={draft.description} onChange={(v) => setDraft((d) => ({ ...d, description: v }))} rows={3} maxLength={255} />
          {moved && <Callout tone="info">Moving the unit changes where people can pick it. Entries already saved keep their unit.</Callout>}
          <button type="submit" hidden />
        </form>
      </Drawer>
      <DiscardModal open={confirmClose} noun="unit" onKeep={() => setConfirmClose(false)} onDiscard={() => { setConfirmClose(false); props.onClose(); }} />
    </>
  );
}
