import { useMemo, useState } from "react";
import { Globe2, SearchX } from "lucide-react";
import { Button, Callout, type Column, Drawer, EMPTY_FILTERS, EmptyState, FilterBar, SetupListPage, TextField, useFilterParams, useToast } from "../../../ui";
import { errorMessage, useCountries, useDeleteCountry, useSaveCountry, useSites } from "../api";
import { useOpenParam } from "../hooks/useOpenParam";
import {
  type CountryDraft,
  type CountryField,
  type CountryRow,
  countryDeleteBlock,
  countryDraftFrom,
  countryRows,
  matchesCountry,
  validateCountry,
} from "../logic";
import { DeleteModal, DiscardModal, DrawerFooter, SaveError, type TabShell } from "./common";
import { dash, openColumn } from "./columns";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function CountriesTab({ nav, panel }: TabShell) {
  const { toast } = useToast();
  const [filters, setFilters] = useFilterParams([]);
  const [openParam, setOpen] = useOpenParam();
  const countries = useCountries();
  const sites = useSites();
  const save = useSaveCountry();
  const remove = useDeleteCountry();
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CountryRow | null>(null);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const all = useMemo(() => countryRows(countries.data ?? [], sites.data), [countries.data, sites.data]);
  const rows = useMemo(() => all.filter((r) => matchesCountry(r, filters.q)), [all, filters.q]);

  const creating = openParam === "new";
  const openRow = openParam && !creating ? (all.find((r) => String(r.country_id) === openParam) ?? null) : null;
  const open = (value: string | null) => {
    setSaveErr(null);
    save.reset();
    setOpen(value);
  };

  const onSave = (draft: CountryDraft) => {
    setSaveErr(null);
    save.mutate(
      { id: openRow?.country_id ?? null, draft },
      {
        onSuccess: () => {
          open(null);
          toast({ title: creating ? `Country "${draft.name.trim()}" added` : `Country "${draft.name.trim()}" saved`, tone: "good" });
        },
        onError: (e) => setSaveErr(errorMessage(e, "Nothing was saved. Try again.")),
      },
    );
  };

  const onDelete = () => {
    if (!deleting) return;
    setDeleteErr(null);
    remove.mutate(deleting.country_id, {
      onSuccess: () => {
        toast({ title: `Country "${deleting.name}" deleted`, tone: "good" });
        setDeleting(null);
        open(null);
      },
      onError: (e) => setDeleteErr(errorMessage(e, "The country wasn't deleted. Try again.")),
    });
  };

  const sitesKnown = !!countries.data?.some((c) => typeof c.site_count === "number") || !!sites.data;
  const columns: Column<CountryRow>[] = [
    { id: "country", header: "Country", hideable: false, sortable: true, value: (r) => r.name, cell: (r) => <span className="font-medium text-ink">{r.name}</span> },
    { id: "code", header: "Code", sortable: true, width: "7rem", value: (r) => r.code, cell: (r) => (r.code ? <span className="font-num">{r.code}</span> : dash) },
    {
      id: "sites",
      header: "Sites using it",
      numeric: true,
      sortable: true,
      width: "9rem",
      value: (r) => r.siteCount,
      cell: sitesKnown ? undefined : () => dash,
    },
    openColumn((r) => r.name, (r) => open(String(r.country_id))),
  ];

  const empty =
    all.length === 0 ? (
      <EmptyState icon={Globe2} title="No countries yet." description="Add the countries your clients' sites are in." action={<Button variant="primary" onClick={() => open("new")}>Add country</Button>} />
    ) : (
      <EmptyState icon={SearchX} title="No countries match your search." action={<Button onClick={() => setFilters(EMPTY_FILTERS)}>Clear search</Button>} />
    );

  return (
    <SetupListPage<CountryRow>
      title="Reference data"
      description="Countries sites can be in, with their ISO codes."
      addLabel="Add country"
      onAdd={() => open("new")}
      nav={nav}
      panel={panel}
      summary={countries.data ? `${rows.length} ${rows.length === 1 ? "country" : "countries"}${filters.q.trim() ? ` of ${all.length}` : ""}` : " "}
      table={{
        label: "Countries",
        rows,
        columns,
        getRowId: (r) => r.country_id,
        rowLabel: (r) => r.name,
        loading: countries.isPending,
        error: countries.error ? errorMessage(countries.error, "Couldn't load countries.") : null,
        onRetry: () => void countries.refetch(),
        empty,
        defaultSort: { id: "country", dir: "asc" },
        pagination: { mode: "client", pageSize: 50 },
        onRowClick: (r) => open(String(r.country_id)),
        exportName: "countries",
        storageKey: "p21-countries",
        toolbar: <FilterBar filters={[]} value={filters} onChange={setFilters} searchPlaceholder="Search country or code" searchDelay={0} />,
      }}
    >
      <CountryDrawer
        key={`${openParam ?? "closed"}-${openRow ? "ready" : "wait"}`}
        row={openRow}
        creating={creating}
        loading={!!openParam && !creating && countries.isPending}
        others={all.filter((c) => c.country_id !== openRow?.country_id)}
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
          noun="country"
          name={deleting.name}
          blocked={countryDeleteBlock(deleting)}
          consequence="No site uses it, so nothing else changes. This can't be undone."
          deleting={remove.isPending}
          error={deleteErr}
          onClose={() => setDeleting(null)}
          onConfirm={onDelete}
        />
      )}
      {!!openParam && !creating && !!countries.data && !openRow && (
        <p role="status" className="text-sm text-muted">
          That country no longer exists. <Button size="sm" variant="ghost" onClick={() => open(null)}>Dismiss</Button>
        </p>
      )}
    </SetupListPage>
  );
}

function CountryDrawer(props: {
  row: CountryRow | null;
  creating: boolean;
  loading: boolean;
  others: CountryRow[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (d: CountryDraft) => void;
  onDelete: () => void;
}) {
  const { row, creating } = props;
  const [draft, setDraft] = useState<CountryDraft>(() => countryDraftFrom(row));
  const [touched, setTouched] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  if (props.loading) return <Drawer open loading onClose={props.onClose} title="Loading country…" />;
  if (!creating && !row) return <Drawer open={false} onClose={props.onClose} title="" />;

  const errors = validateCountry(draft, props.others);
  const base = countryDraftFrom(row);
  const dirty = draft.name.trim() !== base.name || draft.code.trim().toUpperCase() !== base.code;
  const fieldError = (k: CountryField) => (touched ? errors[k] : undefined);
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
        title={creating ? "Add country" : row!.name}
        subtitle={creating ? "Sites pick their country from this list." : row!.siteCount !== null ? `Used by ${plural(row!.siteCount, "site", "sites")}` : undefined}
        footer={
          <DrawerFooter
            deleteLabel="Delete country"
            onDelete={creating ? undefined : props.onDelete}
            onCancel={close}
            onSave={save}
            saveLabel={creating ? "Add country" : "Save"}
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
          <SaveError error={props.error} title="Couldn't save the country" />
          <TextField label="Country name" required value={draft.name} onChange={(v) => setDraft((d) => ({ ...d, name: v }))} error={fieldError("name")} maxLength={100} />
          <TextField
            label="ISO code"
            required
            help="Two letters, as in ISO 3166-1 (BH, IN, AE)."
            value={draft.code}
            onChange={(v) => setDraft((d) => ({ ...d, code: v.toUpperCase() }))}
            error={fieldError("code")}
            maxLength={2}
            autoCapitalize="characters"
            className="max-w-40"
          />
          {!creating && !!row!.siteCount && (
            <Callout tone="info">Renaming changes the country on all {plural(row!.siteCount, "site", "sites")} that use it.</Callout>
          )}
          <button type="submit" hidden />
        </form>
      </Drawer>
      <DiscardModal open={confirmClose} noun="country" onKeep={() => setConfirmClose(false)} onDiscard={() => { setConfirmClose(false); props.onClose(); }} />
    </>
  );
}
