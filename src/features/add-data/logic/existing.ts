// Entries already saved for the open site × category × period, and how one
// is loaded back into a row to fix (rejected) or change (pending).
import { formColumns, type FormModel } from "../../../lib/emissions/form";
import type { ModalRow } from "../../../lib/emissions/types";
import { entryDate, type EntryPeriod } from "./entry";
import { distanceFieldFor, distanceKey, multiplierKey } from "./distance";

export interface SavedEntry {
  pk_id: number;
  activity_data: Record<string, unknown>;
  extra_data?: Record<string, unknown>;
  total_emission: number;
  date_of_reporting: string;
  reporting_period?: "monthly" | "yearly";
  year_type?: "CY" | "FY" | null;
  activity_data_unit?: string;
  status: "pending" | "approved" | "rejected";
  review_comment?: string;
}

/** The list query for a period: its month, or the year its period end falls in. */
export function entriesQuery(p: EntryPeriod): { year: number; month: number | null } {
  const end = entryDate(p);
  return { year: Number(end.slice(0, 4)), month: p.mode === "monthly" ? p.month : null };
}

/** Whether a saved entry belongs to the period: monthly rows in its month, yearly rows on its period end. */
export function entryInPeriod(e: SavedEntry, p: EntryPeriod): boolean {
  const date = String(e.date_of_reporting ?? "").slice(0, 10);
  const yearly = e.reporting_period === "yearly";
  if (p.mode === "monthly") return !yearly && date.slice(0, 7) === `${p.year}-${String(p.month).padStart(2, "0")}`;
  return yearly && date === entryDate(p) && (!e.year_type || e.year_type === p.yearType);
}

export const canChange = (e: SavedEntry) => e.status === "pending" || e.status === "rejected";

/**
 * A saved entry as a form row, the way the legacy page's Edit filled its
 * modal: activity values as text, matched to the form's column names
 * regardless of case. `_editOf` makes Review update that entry instead of
 * creating a new one.
 */
export function rowFromEntry(e: SavedEntry, model: FormModel, id: number, period: EntryPeriod): ModalRow {
  const row: ModalRow = { id };
  for (const c of formColumns(model)) row[c.column_name] = "";
  for (const [key, value] of Object.entries(e.activity_data ?? {})) {
    if (value === undefined || value === null) continue;
    const col = formColumns(model).find((c) => c.column_name.toLowerCase() === key.toLowerCase());
    row[col?.column_name ?? key] = String(value);
  }
  row.activity_data_unit = e.activity_data_unit ?? "";
  if (period.mode === "monthly" && e.date_of_reporting) row.date_of_reporting = String(e.date_of_reporting).slice(0, 10);
  row._extra_data = Object.fromEntries(Object.entries(e.extra_data ?? {}).map(([k, v]) => [k, v == null ? "" : String(v)]));
  // Only the product of a composite unit (passenger × km) is saved: load it as 1 × the product.
  for (const c of formColumns(model)) {
    const value = row[c.column_name];
    if (distanceFieldFor(model, row, c)?.kind === "composite" && value) {
      row[multiplierKey(c.column_name)] = "1";
      row[distanceKey(c.column_name)] = value;
    }
  }
  row._editOf = e.pk_id;
  // A pending entry counts in the period's saved ("entered") total; remember it so the comparison doesn't count it twice.
  if (e.status === "pending") {
    row._editSaved = { category: String(row.emission_category ?? ""), tco2e: Number(e.total_emission) || 0 };
  }
  return row;
}

/**
 * The saved total for a category without the saved values of entries being
 * edited in the form, which the form total already counts (legacy
 * effectiveSavedTotals). Rejected entries aren't in the saved total.
 */
export function savedExcludingEdits(rows: ModalRow[], category: string, saved: number): number {
  const editing = rows.reduce((sum, r) => {
    const e = r._editSaved as { category: string; tco2e: number } | undefined;
    return e && e.category === category ? sum + e.tco2e : sum;
  }, 0);
  return saved - editing;
}

export const editOf = (row: ModalRow): number | null => (typeof row._editOf === "number" ? row._editOf : null);
