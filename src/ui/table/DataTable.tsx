import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3, Download, Rows3, Rows4 } from "lucide-react";
import { Button } from "../Button";
import { EmptyState } from "../EmptyState";
import { Popover } from "../Popover";
import { SkeletonTableRows } from "../Skeleton";
import { cn } from "../cn";
import { formatNumber } from "../format";
import { focusRing } from "../styles";
import { exportMatrix, type ExportFormat } from "./exportTable";
import { nextSort, pageCount, paginate, retainSelectedRows, sortRows, toMatrix } from "./tableLogic";
import type { Column, SortState } from "./types";

type RowId = string | number;

export type Pagination =
  | { mode: "client"; pageSize?: number }
  | { mode: "server"; page: number; pageSize: number; total: number; onPageChange: (page: number) => void };

export type DataTableProps<T> = {
  /** Accessible name, e.g. "Entries for Sep 2025". */
  label: string;
  rows: T[];
  columns: Column<T>[];
  getRowId: (row: T) => RowId;
  /** Names a row for screen readers (checkbox labels). Defaults to the first visible column. */
  rowLabel?: (row: T) => string;

  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  /** Shown when there are no rows. Defaults to a plain EmptyState. */
  empty?: ReactNode;

  /** Controlled sort (server sorting). Leave out for client-side sorting. */
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  defaultSort?: SortState;

  selectable?: boolean;
  selectedIds?: RowId[];
  onSelectionChange?: (ids: RowId[]) => void;
  /**
   * Buttons in the bulk bar while rows are selected. `selected` holds every
   * selected row seen so far, across pages; `ids` is the full selection, which
   * can include rows never loaded here (e.g. a controlled selection).
   */
  bulkActions?: (selected: T[], clear: () => void, ids: RowId[]) => ReactNode;

  pagination?: Pagination;
  /** Opens the row, usually in a Drawer. Rows become focusable; Enter opens. */
  onRowClick?: (row: T) => void;

  /** File name without extension; enables CSV/XLSX export of all rows and visible columns. */
  exportName?: string;
  /** Server mode: export everything, not just this page. */
  onExport?: (format: ExportFormat) => void;
  /** Extra toolbar content on the left (e.g. FilterBar). */
  toolbar?: ReactNode;
  /** Persists column visibility and density in localStorage under this key. */
  storageKey?: string;
  /** Max height of the scroll area; the header stays visible. */
  maxHeight?: string;
};

type Prefs = { hidden: string[]; compact: boolean };

function loadPrefs(key: string | undefined, fallback: Prefs): Prefs {
  if (!key) return fallback;
  try {
    const raw = localStorage.getItem(`dt:${key}`);
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<Prefs>) } : fallback;
  } catch {
    return fallback;
  }
}

function savePrefs(key: string | undefined, prefs: Prefs) {
  if (!key) return;
  try {
    localStorage.setItem(`dt:${key}`, JSON.stringify(prefs));
  } catch {
    // Storage blocked: preferences just don't persist.
  }
}

export function DataTable<T>({
  label,
  rows,
  columns,
  getRowId,
  rowLabel,
  loading,
  error,
  onRetry,
  empty,
  sort: controlledSort,
  onSortChange,
  defaultSort = null,
  selectable,
  selectedIds: controlledSelected,
  onSelectionChange,
  bulkActions,
  pagination = { mode: "client", pageSize: 25 },
  onRowClick,
  exportName,
  onExport,
  toolbar,
  storageKey,
  maxHeight = "70vh",
}: DataTableProps<T>) {
  const [prefs, setPrefs] = useState<Prefs>(() =>
    loadPrefs(storageKey, { hidden: columns.filter((c) => c.defaultHidden).map((c) => c.id), compact: false }),
  );
  useEffect(() => savePrefs(storageKey, prefs), [storageKey, prefs]);

  const [localSort, setLocalSort] = useState<SortState>(defaultSort);
  const sort = controlledSort !== undefined ? controlledSort : localSort;
  const setSort = (s: SortState) => (onSortChange ? onSortChange(s) : setLocalSort(s));

  const [localSelected, setLocalSelected] = useState<RowId[]>([]);
  const selected = controlledSelected ?? localSelected;
  const setSelected = (ids: RowId[]) => (onSelectionChange ? onSelectionChange(ids) : setLocalSelected(ids));
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const [clientPage, setClientPage] = useState(0);
  const visibleColumns = columns.filter((c) => !prefs.hidden.includes(c.id));
  const serverSort = !!onSortChange;
  const sortedRows = useMemo(
    () => (serverSort ? rows : sortRows(rows, columns, sort)),
    [rows, columns, sort, serverSort],
  );

  const isServer = pagination.mode === "server";
  const pageSize = pagination.pageSize ?? 25;
  const total = isServer ? pagination.total : sortedRows.length;
  const pages = pageCount(total, pageSize);
  const page = isServer ? pagination.page : Math.min(clientPage, pages - 1);
  const pageRows = isServer ? sortedRows : paginate(sortedRows, page, pageSize);
  const setPage = (p: number) => (isServer ? pagination.onPageChange(p) : setClientPage(p));

  // Back to page 1 when the data set changes under client pagination.
  useEffect(() => setClientPage(0), [rows.length, sort?.id, sort?.dir]);

  const pageIds = pageRows.map(getRowId);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selectedSet.has(id));
  const someOnPage = pageIds.some((id) => selectedSet.has(id));
  const headerCheckbox = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerCheckbox.current) headerCheckbox.current.indeterminate = someOnPage && !allOnPage;
  }, [someOnPage, allOnPage]);

  const toggleRow = (id: RowId) =>
    setSelected(selectedSet.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  const togglePage = () =>
    setSelected(allOnPage ? selected.filter((id) => !pageIds.includes(id)) : [...new Set([...selected, ...pageIds])]);
  const clear = () => setSelected([]);

  // Keep the row objects of selected rows so bulk actions still get them after
  // a page change (server pagination) or a filter hides them.
  const [keptRows, setKeptRows] = useState<Map<RowId, T>>(() => new Map());
  useEffect(() => {
    setKeptRows((kept) => retainSelectedRows(selected, rows, getRowId, kept));
  }, [selected, rows, getRowId]);
  const selectedRows = useMemo(() => {
    const byId = retainSelectedRows(selected, rows, getRowId, keptRows);
    // Loaded rows in table order, then rows from elsewhere in selection order.
    const loaded = rows.filter((r) => byId.has(getRowId(r)));
    const loadedIds = new Set(loaded.map(getRowId));
    return [...loaded, ...[...byId].filter(([id]) => !loadedIds.has(id)).map(([, row]) => row)];
  }, [selected, rows, getRowId, keptRows]);
  const notLoaded = selected.length - selectedRows.length;

  const doExport = (format: ExportFormat) => {
    if (onExport) return onExport(format);
    void exportMatrix(toMatrix(sortedRows, visibleColumns), exportName ?? "export", format);
  };

  const colSpan = visibleColumns.length + (selectable ? 1 : 0);
  const showBody = !loading && !error && rows.length > 0;
  const first = total === 0 ? 0 : page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);

  return (
    <div data-density={prefs.compact ? "compact" : undefined} className="rounded-card border border-line bg-panel">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        {/* Grows to the full row on phones, so the view buttons wrap below instead of overlapping it. */}
        <div className="flex min-w-0 flex-[1_1_18rem] flex-wrap items-center gap-2">{toolbar}</div>
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={prefs.compact}
          onClick={() => setPrefs((p) => ({ ...p, compact: !p.compact }))}
          icon={prefs.compact ? <Rows4 aria-hidden className="size-4" /> : <Rows3 aria-hidden className="size-4" />}
        >
          {prefs.compact ? "Compact" : "Comfortable"}
        </Button>
        <Popover
          label="Columns"
          align="end"
          trigger={(t) => (
            <Button size="sm" variant="ghost" {...t} icon={<Columns3 aria-hidden className="size-4" />}>
              Columns
            </Button>
          )}
        >
          {() => (
            <fieldset className="space-y-0.5">
              <legend className="mb-1 text-xs font-medium text-muted">Show columns</legend>
              {columns
                .filter((c) => c.hideable !== false)
                .map((c) => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-chip px-1 py-1 text-sm hover:bg-tint">
                    <input
                      type="checkbox"
                      className="accent-brand"
                      checked={!prefs.hidden.includes(c.id)}
                      onChange={() =>
                        setPrefs((p) => ({
                          ...p,
                          hidden: p.hidden.includes(c.id) ? p.hidden.filter((h) => h !== c.id) : [...p.hidden, c.id],
                        }))
                      }
                    />
                    {c.header}
                  </label>
                ))}
            </fieldset>
          )}
        </Popover>
        {(exportName || onExport) && (
          <Popover
            label="Export"
            align="end"
            trigger={(t) => (
              <Button size="sm" variant="ghost" {...t} disabled={loading || rows.length === 0} icon={<Download aria-hidden className="size-4" />}>
                Export
              </Button>
            )}
          >
            {(close) => (
              <div className="flex flex-col gap-0.5">
                {(["csv", "xlsx"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => (doExport(f), close())}
                    className={cn("rounded-chip px-2 py-1 text-left text-sm hover:bg-tint", focusRing)}
                  >
                    {f === "csv" ? "CSV (.csv)" : "Excel (.xlsx)"}
                  </button>
                ))}
              </div>
            )}
          </Popover>
        )}
      </div>

      {selectable && selected.length > 0 && (
        <div role="region" aria-label="Bulk actions" className="flex flex-wrap items-center gap-2 border-b border-line bg-tint px-3 py-2 text-sm text-ink">
          <span className="font-medium">{selected.length} selected</span>
          {notLoaded > 0 && (
            <span className="text-muted">Selection spans pages: {formatNumber(notLoaded)} not loaded here</span>
          )}
          <Button size="sm" variant="ghost" onClick={clear}>
            Clear
          </Button>
          <div className="ml-auto flex flex-wrap gap-2">{bulkActions?.(selectedRows, clear, selected)}</div>
        </div>
      )}

      <div className="overflow-auto" style={{ maxHeight }}>
        <table aria-label={label} aria-busy={loading || undefined} className="w-full border-collapse text-sm text-ink">
          <thead className="sticky top-0 z-10 bg-panel shadow-[inset_0_-1px_0_var(--t-line)]">
            <tr>
              {selectable && (
                <th scope="col" className="w-10 px-3 text-left">
                  <input
                    ref={headerCheckbox}
                    type="checkbox"
                    aria-label="Select all rows on this page"
                    className={cn("accent-brand", focusRing)}
                    checked={allOnPage}
                    disabled={!showBody}
                    onChange={togglePage}
                  />
                </th>
              )}
              {visibleColumns.map((c) => {
                const active = sort?.id === c.id ? sort.dir : null;
                const SortIcon = active === "asc" ? ArrowUp : active === "desc" ? ArrowDown : ArrowUpDown;
                return (
                  <th
                    key={c.id}
                    scope="col"
                    aria-sort={active === "asc" ? "ascending" : active === "desc" ? "descending" : undefined}
                    style={{ width: c.width }}
                    className={cn("h-row whitespace-nowrap px-3 text-xs font-medium text-muted", c.numeric ? "text-right" : "text-left")}
                  >
                    {c.sortable ? (
                      <button
                        type="button"
                        onClick={() => setSort(nextSort(sort, c.id))}
                        className={cn("inline-flex items-center gap-1 rounded-chip hover:text-ink", c.numeric && "flex-row-reverse", focusRing)}
                      >
                        {c.header}
                        <SortIcon aria-hidden className={cn("size-3.5", !active && "opacity-40")} />
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={colSpan} className="p-0">
                  <SkeletonTableRows rows={Math.min(pageSize, 8)} columns={Math.min(visibleColumns.length, 6)} />
                </td>
              </tr>
            )}
            {!loading && error && (
              <tr>
                <td colSpan={colSpan}>
                  <EmptyState variant="error" title={error} action={onRetry && <Button onClick={onRetry}>Try again</Button>} />
                </td>
              </tr>
            )}
            {!loading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={colSpan}>{empty ?? <EmptyState title="Nothing to show yet." />}</td>
              </tr>
            )}
            {showBody &&
              pageRows.map((row) => {
                const id = getRowId(row);
                const isSelected = selectedSet.has(id);
                return (
                  <tr
                    key={id}
                    data-row-id={String(id)}
                    aria-selected={selectable ? isSelected : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={
                      onRowClick
                        ? (e) => {
                            if (e.key === "Enter" && e.target === e.currentTarget) {
                              e.preventDefault();
                              onRowClick(row);
                            }
                          }
                        : undefined
                    }
                    className={cn(
                      "h-row border-t border-line",
                      isSelected && "bg-tint",
                      onRowClick && "cursor-pointer hover:bg-tint focus-visible:bg-tint focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
                    )}
                  >
                    {selectable && (
                      <td className="w-10 px-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${rowLabel ? rowLabel(row) : String(visibleColumns[0]?.value(row) ?? id)}`}
                          className={cn("accent-brand", focusRing)}
                          checked={isSelected}
                          onChange={() => toggleRow(id)}
                        />
                      </td>
                    )}
                    {visibleColumns.map((c) => {
                      const raw = c.value(row);
                      const content = c.cell
                        ? c.cell(row)
                        : c.numeric && typeof raw === "number"
                          ? formatNumber(raw, c.decimals ?? 0)
                          : raw ?? "—";
                      return (
                        <td
                          key={c.id}
                          className={cn("px-3 py-1", c.numeric ? "text-right font-num tabular-nums" : "text-left")}
                        >
                          {content}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {total > pageSize && !error && (
        <nav aria-label="Pagination" className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-3 py-2 text-sm text-muted">
          <span className="font-num tabular-nums">
            {formatNumber(first)}–{formatNumber(last)} of {formatNumber(total)}
          </span>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" aria-label="Previous page" disabled={page === 0 || loading} onClick={() => setPage(page - 1)}>
              <ChevronLeft aria-hidden className="size-4" />
            </Button>
            <Button size="sm" variant="ghost" aria-label="Next page" disabled={page >= pages - 1 || loading} onClick={() => setPage(page + 1)}>
              <ChevronRight aria-hidden className="size-4" />
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}
