import { useMemo, useState } from "react";
import { Search, SearchX, Tags } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  type Column,
  Drawer,
  EMPTY_FILTERS,
  EmptyState,
  FilterBar,
  type FilterDef,
  SetupListPage,
  TextField,
  cn,
  focusRing,
  inputBase,
  useFilterParams,
  useToast,
} from "../../../ui";
import { errorMessage, useCategories, useDeleteCategory, useSaveCategory, useSites } from "../api";
import { useOpenParam } from "../hooks/useOpenParam";
import {
  type CategoryDraft,
  type CategoryRow,
  SCOPE_KEYS,
  SCOPE_LABEL,
  SCOPE_SHORT,
  type ScopeKey,
  type Site,
  categoryDeleteBlock,
  categoryDraftFrom,
  categoryRows,
  groupSitesByClient,
  isCategoryDirty,
  matchesCategoryRow,
  removedSites,
  setMany,
  validateCategory,
} from "../logic";
import { DeleteModal, DiscardModal, DrawerFooter, SaveError, type TabShell } from "./common";
import { dash, openColumn } from "./columns";

const FILTER_KEYS = ["scope"];
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function ScopePill({ scope }: { scope: ScopeKey }) {
  return (
    <Badge tone={scope === "saving" ? "good" : "brand"}>
      <span className="sr-only">{SCOPE_LABEL[scope]}</span>
      <span aria-hidden>{SCOPE_SHORT[scope]}</span>
    </Badge>
  );
}

export function CategoriesTab({ nav, panel }: TabShell) {
  const { toast } = useToast();
  const [filters, setFilters] = useFilterParams(FILTER_KEYS);
  const [openParam, setOpen] = useOpenParam();
  const categories = useCategories();
  const sites = useSites();
  const save = useSaveCategory();
  const remove = useDeleteCategory();
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CategoryRow | null>(null);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  // Bumped after "add another" so the drawer starts a fresh form.
  const [round, setRound] = useState(0);
  const [addAnother, setAddAnother] = useState(false);

  const all = useMemo(() => categoryRows(categories.data ?? [], sites.data), [categories.data, sites.data]);
  const scopes = useMemo(() => filters.filters.scope ?? [], [filters.filters.scope]);
  const rows = useMemo(() => all.filter((r) => matchesCategoryRow(r, { q: filters.q, scopes })), [all, filters.q, scopes]);

  const creating = openParam === "new";
  const openRow = openParam && !creating ? (all.find((r) => String(r.category_id) === openParam) ?? null) : null;
  const open = (value: string | null) => {
    setSaveErr(null);
    save.reset();
    setOpen(value);
  };

  const allSiteIds = useMemo(() => (sites.data ?? []).map((s) => s.site_id), [sites.data]);
  const onSave = (draft: CategoryDraft, addAnother: boolean) => {
    setSaveErr(null);
    save.mutate(
      { id: openRow?.category_id ?? null, draft, allSiteIds },
      {
        onSuccess: () => {
          toast({ title: creating ? `Category "${draft.category_name.trim()}" added` : `Category "${draft.category_name.trim()}" saved`, tone: "good" });
          if (creating && addAnother) setRound((n) => n + 1);
          else open(null);
        },
        onError: (e) => setSaveErr(errorMessage(e, "Nothing was saved. Try again.")),
      },
    );
  };

  const onDelete = () => {
    if (!deleting) return;
    setDeleteErr(null);
    remove.mutate(deleting.category_id, {
      onSuccess: () => {
        toast({ title: `Category "${deleting.category_name}" deleted`, tone: "good" });
        setDeleting(null);
        open(null);
      },
      onError: (e) => setDeleteErr(errorMessage(e, "The category wasn't deleted. Try again.")),
    });
  };

  const countsKnown = all.some((r) => r.factors !== null);
  const countCol = (id: string, header: string, pick: (r: CategoryRow) => number | null): Column<CategoryRow> => ({
    id,
    header,
    numeric: true,
    sortable: true,
    width: "7rem",
    value: pick,
    cell: countsKnown ? undefined : () => dash,
  });
  const columns: Column<CategoryRow>[] = [
    { id: "category", header: "Category", hideable: false, sortable: true, value: (r) => r.category_name, cell: (r) => <span className="font-medium text-ink">{r.category_name}</span> },
    {
      id: "scope",
      header: "Scope",
      sortable: true,
      width: "7rem",
      value: (r) => SCOPE_LABEL[r.scopeKey],
      sortValue: (r) => SCOPE_KEYS.indexOf(r.scopeKey),
      cell: (r) => <ScopePill scope={r.scopeKey} />,
    },
    { id: "sites", header: "Sites assigned", numeric: true, sortable: true, width: "8rem", value: (r) => r.siteIds.length },
    countCol("factors", "Factors", (r) => r.factors),
    countCol("configs", "Configs", (r) => r.configs),
    openColumn((r) => r.category_name, (r) => open(String(r.category_id))),
  ];

  const filterDefs: FilterDef[] = [{ key: "scope", label: "Scope", options: SCOPE_KEYS.map((k) => ({ value: k, label: SCOPE_LABEL[k] })) }];
  const filtered = !!filters.q.trim() || scopes.length > 0;
  const empty =
    all.length === 0 ? (
      <EmptyState icon={Tags} title="No categories yet." description="Add the activities your clients report, like fuel or electricity." action={<Button variant="primary" onClick={() => open("new")}>Add category</Button>} />
    ) : (
      <EmptyState icon={SearchX} title="No categories match these filters." action={filtered ? <Button onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</Button> : undefined} />
    );

  return (
    <SetupListPage<CategoryRow>
      title="Reference data"
      description="Emission categories, their scope and the sites that report them."
      addLabel="Add category"
      onAdd={() => open("new")}
      nav={nav}
      panel={panel}
      summary={categories.data ? `${rows.length} ${rows.length === 1 ? "category" : "categories"}${filtered ? ` of ${all.length}` : ""}` : " "}
      table={{
        label: "Categories",
        rows,
        columns,
        getRowId: (r) => r.category_id,
        rowLabel: (r) => r.category_name,
        loading: categories.isPending,
        error: categories.error ? errorMessage(categories.error, "Couldn't load categories.") : null,
        onRetry: () => void categories.refetch(),
        empty,
        defaultSort: { id: "category", dir: "asc" },
        pagination: { mode: "client", pageSize: 50 },
        onRowClick: (r) => open(String(r.category_id)),
        exportName: "categories",
        storageKey: "p21-categories",
        toolbar: <FilterBar filters={filterDefs} value={filters} onChange={setFilters} searchPlaceholder="Search categories" searchDelay={0} />,
      }}
    >
      <CategoryDrawer
        key={`${openParam ?? "closed"}-${openRow ? "ready" : "wait"}-${round}`}
        row={openRow}
        creating={creating}
        loading={!!openParam && !creating && categories.isPending}
        others={all.filter((c) => c.category_id !== openRow?.category_id)}
        sites={{ data: sites.data ?? [], loading: sites.isPending, error: !!sites.error }}
        saving={save.isPending}
        error={saveErr}
        addAnother={addAnother}
        onAddAnother={setAddAnother}
        onClose={() => {
          setAddAnother(false);
          open(null);
        }}
        onSave={onSave}
        onDelete={() => {
          remove.reset();
          setDeleteErr(null);
          setDeleting(openRow);
        }}
      />
      {deleting && (
        <DeleteModal
          noun="category"
          name={deleting.category_name}
          blocked={categoryDeleteBlock(deleting)}
          consequence="No site, entry, factor, config or unit uses it. This can't be undone. If anything else still uses it, the delete is refused and nothing changes."
          deleting={remove.isPending}
          error={deleteErr}
          onClose={() => setDeleting(null)}
          onConfirm={onDelete}
        />
      )}
      {!!openParam && !creating && !!categories.data && !openRow && (
        <p role="status" className="text-sm text-muted">
          That category no longer exists. <Button size="sm" variant="ghost" onClick={() => open(null)}>Dismiss</Button>
        </p>
      )}
    </SetupListPage>
  );
}

const SCOPE_HELP: Record<ScopeKey, string> = {
  s1: "Direct emissions from sources the client owns or runs, like fuel and refrigerants.",
  s2: "Indirect emissions from bought electricity, heat or steam.",
  s3: "Other indirect emissions in the value chain, like travel or purchased goods.",
  saving: "Not counted as emissions. Entries count as savings, like solar generation or recycling.",
};

function CategoryDrawer(props: {
  row: CategoryRow | null;
  creating: boolean;
  loading: boolean;
  others: CategoryRow[];
  sites: { data: Site[]; loading: boolean; error: boolean };
  saving: boolean;
  error: string | null;
  onClose: () => void;
  addAnother: boolean;
  onAddAnother: (on: boolean) => void;
  onSave: (d: CategoryDraft, addAnother: boolean) => void;
  onDelete: () => void;
}) {
  const { row, creating } = props;
  const [draft, setDraft] = useState<CategoryDraft>(() => categoryDraftFrom(row));
  const [touched, setTouched] = useState(false);
  const { addAnother, onAddAnother: setAddAnother } = props;
  const [confirmClose, setConfirmClose] = useState(false);

  if (props.loading) return <Drawer open loading onClose={props.onClose} title="Loading category…" />;
  if (!creating && !row) return <Drawer open={false} onClose={props.onClose} title="" />;

  const errors = validateCategory(draft, props.others);
  const dirty = isCategoryDirty(draft, row);
  const removed = removedSites(draft, row);
  const close = () => (dirty && !props.saving ? setConfirmClose(true) : props.onClose());
  const save = () => {
    setTouched(true);
    if (!errors.category_name) props.onSave(draft, addAnother);
  };

  return (
    <>
      <Drawer
        open
        size="md"
        onClose={close}
        title={creating ? "Add category" : row!.category_name}
        subtitle={creating ? "Name it, pick its scope and the sites that report it." : `${SCOPE_LABEL[row!.scopeKey]} · ${plural(row!.siteIds.length, "site", "sites")}`}
        footer={
          <DrawerFooter
            deleteLabel="Delete category"
            onDelete={creating ? undefined : props.onDelete}
            onCancel={close}
            onSave={save}
            saveLabel={creating ? "Add category" : "Save"}
            saving={props.saving}
            canSave={creating || dirty}
            extra={
              creating ? (
                <label className="inline-flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" className={cn("size-4 accent-accent", focusRing)} checked={addAnother} onChange={(e) => setAddAnother(e.target.checked)} />
                  Add another after this
                </label>
              ) : undefined
            }
          />
        }
      >
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <SaveError error={props.error} title="Couldn't save the category" />
          <TextField
            label="Category name"
            required
            value={draft.category_name}
            onChange={(v) => setDraft((d) => ({ ...d, category_name: v }))}
            error={touched ? errors.category_name : undefined}
            maxLength={120}
          />
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium text-ink">Scope</legend>
            {SCOPE_KEYS.map((k) => (
              <label key={k} className="flex cursor-pointer items-start gap-3 rounded-control border border-line px-3 py-2 hover:bg-tint has-[:checked]:border-brand">
                <input
                  type="radio"
                  name="category-scope"
                  className={cn("mt-0.5 size-4 accent-accent", focusRing)}
                  checked={draft.scope === k}
                  onChange={() => setDraft((d) => ({ ...d, scope: k }))}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{k === "saving" ? "None – counts as saving" : SCOPE_LABEL[k]}</span>
                  <span className="block text-xs text-muted">{SCOPE_HELP[k]}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <SitePicker
            sites={props.sites}
            selected={draft.site_ids}
            all={draft.assign_all_sites}
            onAll={(on) => setDraft((d) => ({ ...d, assign_all_sites: on }))}
            onChange={(ids) => setDraft((d) => ({ ...d, site_ids: ids }))}
          />
          {removed.length > 0 && (
            <Callout tone="warn">
              Saving takes this category off {plural(removed.length, "site", "sites")}. People there stop seeing it; their entries, factors and configs are kept.
            </Callout>
          )}
          <button type="submit" hidden />
        </form>
      </Drawer>
      <DiscardModal open={confirmClose} noun="category" onKeep={() => setConfirmClose(false)} onDiscard={() => { setConfirmClose(false); props.onClose(); }} />
    </>
  );
}

function SitePicker({ sites, selected, all, onAll, onChange }: {
  sites: { data: Site[]; loading: boolean; error: boolean };
  selected: number[];
  all: boolean;
  onAll: (on: boolean) => void;
  onChange: (ids: number[]) => void;
}) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => groupSitesByClient(sites.data, q), [sites.data, q]);
  const chosen = new Set(selected);

  return (
    <section aria-labelledby="category-sites" className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="category-sites" className="text-sm font-medium text-ink">
          Sites
        </h3>
        {!all && sites.data.length > 0 && (
          <span className="text-xs text-muted">
            <span className="font-num">{selected.length}</span> of <span className="font-num">{sites.data.length}</span> selected
          </span>
        )}
      </div>
      <p className="text-sm text-muted">People on these sites can enter data for the category. Sites added here switch it on for their current users.</p>
      {sites.loading ? (
        <p className="text-sm text-muted">Loading sites…</p>
      ) : sites.error ? (
        <EmptyState compact variant="error" title="Couldn't load sites." />
      ) : sites.data.length === 0 ? (
        <EmptyState compact title="No sites exist yet." description="Add sites under Sites first." />
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" className={cn("size-4 accent-accent", focusRing)} checked={all} onChange={(e) => onAll(e.target.checked)} />
            Assign to all sites <span className="font-num text-muted">({sites.data.length})</span>
          </label>
          {!all && (
            <>
              <div className="relative">
                <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <input type="search" aria-label="Search sites" placeholder="Search site or client" value={q} onChange={(e) => setQ(e.target.value)} className={cn(inputBase, "h-8 pl-8")} />
              </div>
              {groups.length === 0 && <p className="text-sm text-muted">No sites match “{q}”.</p>}
              {groups.map((g) => {
                const ids = g.sites.map((s) => s.site_id);
                const on = ids.filter((id) => chosen.has(id)).length;
                const headingId = `category-sites-${g.key}`;
                return (
                  <section key={g.key} aria-labelledby={headingId}>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <h4 id={headingId} className="text-sm font-semibold text-ink">
                        {g.label} <span className="font-num font-normal text-muted">· {on}/{ids.length}</span>
                      </h4>
                      <Button size="sm" variant="ghost" aria-label={`${on === ids.length ? "Clear" : "Select"} all sites of ${g.label}`} onClick={() => onChange(setMany(selected, ids, on !== ids.length))}>
                        {on === ids.length ? "Clear" : "Select all"}
                      </Button>
                    </div>
                    <ul className="divide-y divide-line rounded-control border border-line">
                      {g.sites.map((s) => (
                        <li key={s.site_id}>
                          <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm text-ink hover:bg-tint">
                            <input
                              type="checkbox"
                              className={cn("size-4 accent-accent", focusRing)}
                              checked={chosen.has(s.site_id)}
                              onChange={(e) => onChange(setMany(selected, [s.site_id], e.target.checked))}
                            />
                            <span className="min-w-0 flex-1 truncate">{s.name}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </>
          )}
        </>
      )}
    </section>
  );
}
