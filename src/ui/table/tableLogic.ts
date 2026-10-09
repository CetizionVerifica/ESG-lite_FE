import type { Column, SortState } from "./types";

type Value = string | number | null | undefined;

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

function compare(a: Value, b: Value): number {
  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

/** Stable sort by one column. Empty values always sort last. */
export function sortRows<T>(rows: T[], columns: Column<T>[], sort: SortState): T[] {
  if (!sort) return rows;
  const col = columns.find((c) => c.id === sort.id);
  if (!col) return rows;
  const get = col.sortValue ?? col.value;
  const sign = sort.dir === "asc" ? 1 : -1;
  return rows
    .map((row, i) => ({ row, i, v: get(row) }))
    .sort((x, y) => {
      const xe = x.v === null || x.v === undefined || x.v === "";
      const ye = y.v === null || y.v === undefined || y.v === "";
      if (xe || ye) return xe === ye ? x.i - y.i : xe ? 1 : -1;
      return sign * compare(x.v, y.v) || x.i - y.i;
    })
    .map((x) => x.row);
}

/** Next sort state when a header is clicked: asc → desc → off. */
export function nextSort(current: SortState, id: string): SortState {
  if (!current || current.id !== id) return { id, dir: "asc" };
  return current.dir === "asc" ? { id, dir: "desc" } : null;
}

export function paginate<T>(rows: T[], page: number, pageSize: number): T[] {
  return rows.slice(page * pageSize, page * pageSize + pageSize);
}

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Rows as arrays of export values for the given columns (header row first). */
export function toMatrix<T>(rows: T[], columns: Column<T>[]): Array<Array<string | number>> {
  return [
    columns.map((c) => c.header),
    ...rows.map((r) => columns.map((c) => (c.exportValue ?? c.value)(r) ?? "")),
  ];
}

function csvCell(v: string | number): string {
  const s = String(v);
  // Neutralise spreadsheet formulas in text cells (CSV injection).
  const safe = typeof v === "string" && /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(matrix: Array<Array<string | number>>): string {
  return matrix.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/**
 * The row objects behind a selection, keyed by id in selection order. Rows in
 * the current data win (they are the freshest); rows selected on another page
 * or since filtered out come from `kept`. Ids never seen are left out. Returns
 * `kept` itself when nothing changed, so it can feed a state setter.
 */
export function retainSelectedRows<T, Id>(
  ids: Id[],
  rows: T[],
  getId: (row: T) => Id,
  kept: Map<Id, T>,
): Map<Id, T> {
  const loaded = new Map(rows.map((r) => [getId(r), r] as const));
  const next = new Map<Id, T>();
  for (const id of ids) {
    const row = loaded.has(id) ? loaded.get(id) : kept.get(id);
    if (row !== undefined) next.set(id, row as T);
  }
  if (next.size === kept.size && [...next].every(([id, row]) => kept.get(id) === row)) {
    const order = [...kept.keys()];
    if ([...next.keys()].every((id, i) => order[i] === id)) return kept;
  }
  return next;
}
