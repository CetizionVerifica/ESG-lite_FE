import type { ReactNode } from "react";
import type { TermKey } from "../glossary";

export type SortDir = "asc" | "desc";
export type SortState = { id: string; dir: SortDir } | null;

export type Column<T> = {
  id: string;
  header: string;
  /** Raw value: used for sort and export unless sortValue/exportValue are given. */
  value: (row: T) => string | number | null | undefined;
  /** Custom cell. Defaults to the raw value (numbers formatted with separators). */
  cell?: (row: T) => ReactNode;
  /** Right-aligned, mono, tabular figures. */
  numeric?: boolean;
  /** Decimals for the default numeric cell. */
  decimals?: number;
  sortable?: boolean;
  sortValue?: (row: T) => string | number | null | undefined;
  exportValue?: (row: T) => string | number | null | undefined;
  /** False keeps the column out of the column picker (always shown). */
  hideable?: boolean;
  defaultHidden?: boolean;
  /**
   * A default-hidden column added after the table first saved column prefs.
   * Prefs saved before the table recorded its known columns hide it; other
   * default-hidden columns keep the user's earlier choice.
   */
  addedLater?: boolean;
  /** Lets the cell wrap onto more lines. Cells stay on one line by default so rows keep one height. */
  wrap?: boolean;
  /** CSS width, e.g. "8rem". */
  width?: string;
  /** Glossary id explained by an info icon in the header. Defaults to a term matching `header`; false hides it. */
  info?: TermKey | false;
};
