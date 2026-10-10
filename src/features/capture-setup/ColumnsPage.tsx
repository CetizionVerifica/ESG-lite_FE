import { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Columns3, Plus, SearchX } from "lucide-react";
import { Button, type Column, DataTable, EMPTY_FILTERS, EmptyState, FilterBar, type FilterDef, Modal, PageHeader, useFilterParams, useToast } from "../../ui";
import { useDeleteColumn, useForms, useLibrary, useSaveColumn } from "./api";
import { ColumnDrawer } from "./components/ColumnDrawer";
import { COLUMN_TYPES, type ColumnDraft, type ColumnRow, type ColumnUse, blockingForms, buildColumnRows, columnUsage, errorMessage, formPath, matchesColumn } from "./logic";

const FILTER_KEYS = ["type"];
const OPEN = "open";

/** P24 `/capture/columns`: the shared field library forms pick from. */
export default function ColumnsPage() {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useFilterParams(FILTER_KEYS);
  const library = useLibrary();
  const forms = useForms();
  const save = useSaveColumn();
  const remove = useDeleteColumn();

  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ColumnRow | null>(null);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  // Forms that block a delete: known up front from the forms list, or named by the server.
  const [blocked, setBlocked] = useState<{ row: ColumnRow; forms: ColumnUse[] } | null>(null);

  const usage = useMemo(() => columnUsage(forms.data ?? []), [forms.data]);
  const all = useMemo(() => buildColumnRows(library.data ?? [], usage), [library.data, usage]);
  const types = useMemo(() => filters.filters.type ?? [], [filters.filters.type]);
  const rows = useMemo(() => all.filter((r) => matchesColumn(r, filters.q, types)), [all, filters.q, types]);

  // The drawer lives in the URL (?open=new | ?open=<column id>) so a column can be linked to.
  const openParam = params.get(OPEN);
  const creating = openParam === "new";
  const openRow = openParam && !creating ? (all.find((r) => String(r.pk_id) === openParam) ?? null) : null;
  const setOpen = useCallback(
    (value: string | null) => {
      setSaveErr(null);
      save.reset();
      setParams(
        (p) => {
          const next = new URLSearchParams([...p].filter(([k]) => k !== OPEN));
          if (value) next.set(OPEN, value);
          return next;
        },
        { replace: true },
      );
    },
    [setParams, save],
  );

  const onSave = (draft: ColumnDraft) => {
    setSaveErr(null);
    save.mutate(
      { id: openRow?.pk_id ?? null, draft },
      {
        onSuccess: () => {
          setOpen(null);
          toast({ title: creating ? `Column "${draft.name.trim()}" added` : `Column "${draft.name.trim()}" saved`, tone: "good" });
        },
        onError: (e) => setSaveErr(errorMessage(e, "Nothing was saved. Try again.")),
      },
    );
  };

  const askDelete = (row: ColumnRow) => {
    remove.reset();
    setDeleteErr(null);
    if (row.usedBy.length) setBlocked({ row, forms: row.usedBy });
    else setDeleting(row);
  };

  const onDelete = () => {
    if (!deleting) return;
    const row = deleting;
    setDeleteErr(null);
    remove.mutate(row.pk_id, {
      onSuccess: () => {
        toast({ title: `Column "${row.column_name}" deleted`, tone: "good" });
        setDeleting(null);
        setOpen(null);
      },
      onError: (e) => {
        const forms = blockingForms(e);
        if (forms.length) {
          // The forms list was out of date: show who still uses it.
          setDeleting(null);
          setBlocked({ row, forms });
        } else setDeleteErr(errorMessage(e, "The column wasn't deleted. Try again."));
      },
    });
  };

  const usageReady = !!forms.data;
  const columns: Column<ColumnRow>[] = [
    { id: "name", header: "Column", value: (r) => r.column_name, hideable: false, cell: (r) => <span className="font-medium text-ink">{r.column_name}</span> },
    { id: "type", header: "Type", value: (r) => r.typeLabel },
    {
      id: "options",
      header: "Choices",
      value: (r) => r.optionCount,
      numeric: true,
      cell: (r) => (r.optionCount === null ? <span className="text-muted">—</span> : r.optionCount),
    },
    {
      id: "used",
      header: "Used by",
      value: (r) => (usageReady ? r.usedBy.length : null),
      numeric: true,
      cell: (r) =>
        !usageReady ? (
          <span className="text-muted">{forms.isError ? "—" : "…"}</span>
        ) : (
          `${r.usedBy.length} ${r.usedBy.length === 1 ? "form" : "forms"}`
        ),
    },
  ];

  const filtered = !!filters.q.trim() || types.length > 0;
  const empty =
    all.length === 0 ? (
      <EmptyState icon={Columns3} title="No columns yet." description="Add the fields forms can use." action={<Button variant="primary" onClick={() => setOpen("new")}>Add column</Button>} />
    ) : (
      <EmptyState icon={SearchX} title="No columns match these filters." action={filtered ? <Button onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</Button> : undefined} />
    );
  const filterDefs: FilterDef[] = [{ key: "type", label: "Type", options: COLUMN_TYPES }];
  const missing = !!openParam && !creating && !!library.data && !openRow;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Columns"
        description="The fields data-entry forms are built from."
        primaryAction={{ label: "Add column", onClick: () => setOpen("new"), icon: <Plus aria-hidden className="size-4" /> }}
      />
      {library.data && (
        <p className="text-sm text-muted" data-testid="setup-summary">
          {rows.length} {rows.length === 1 ? "column" : "columns"}
          {filtered ? ` of ${all.length}` : ""}
        </p>
      )}
      <DataTable<ColumnRow>
        label="Columns"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.pk_id}
        rowLabel={(r) => r.column_name}
        loading={library.isPending}
        error={library.error ? errorMessage(library.error, "Couldn't load the columns.") : null}
        onRetry={() => void library.refetch()}
        empty={empty}
        defaultSort={{ id: "name", dir: "asc" }}
        pagination={{ mode: "client", pageSize: 50 }}
        onRowClick={(r) => setOpen(String(r.pk_id))}
        exportName="columns"
        storageKey="p24-columns"
        toolbar={<FilterBar filters={filterDefs} value={filters} onChange={setFilters} searchPlaceholder="Search columns" searchDelay={0} />}
      />
      {missing && (
        <p role="status" className="text-sm text-muted">
          That column no longer exists.{" "}
          <Button size="sm" variant="ghost" onClick={() => setOpen(null)}>
            Dismiss
          </Button>
        </p>
      )}
      <ColumnDrawer
        // Remount per column (and once a linked column's data arrives) so the form starts from it.
        key={`${openParam ?? "closed"}-${openRow ? "ready" : "wait"}`}
        row={openRow}
        open={creating || !!openRow || (!!openParam && library.isPending)}
        loading={!!openParam && !creating && library.isPending}
        library={library.data ?? []}
        saving={save.isPending}
        error={saveErr}
        onClose={() => setOpen(null)}
        onSave={onSave}
        onDelete={() => openRow && askDelete(openRow)}
      />
      {deleting && (
        <Modal
          open
          tone="destructive"
          title={`Delete "${deleting.column_name}"?`}
          description="No form uses this column. It is removed from the library."
          primaryAction={{ label: "Delete column", onClick: onDelete, loading: remove.isPending }}
          error={deleteErr}
          onClose={() => setDeleting(null)}
        />
      )}
      {blocked && (
        <Modal
          open
          title={`"${blocked.row.column_name}" is still in use`}
          description={`Remove it from ${blocked.forms.length === 1 ? "this form" : `these ${blocked.forms.length} forms`} first, then delete it.`}
          cancelLabel="Close"
          onClose={() => setBlocked(null)}
        >
          <ul className="max-h-60 space-y-1 overflow-auto" data-testid="blocking-forms">
            {blocked.forms.map((f) => (
              <li key={f.id}>
                <Link to={formPath(f.id)} className="text-sm text-brand-text underline-offset-2 hover:underline">
                  {f.name}
                </Link>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}
