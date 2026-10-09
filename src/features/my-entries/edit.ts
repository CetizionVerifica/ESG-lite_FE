// Editing a submitted entry in the drawer: turning the stored entry back into
// a form row, checking it, and building the PUT /user/emissions/:id body.
import {
  type ColumnEntity,
  type EmissionCalculator,
  type FormModel,
  type ModalRow,
  columnOptionsFor,
  factorYearForDate,
  isDependentColumn,
  parentColumnOf,
  rowValue,
} from "../../lib/emissions";
import { canConvert, unitsMatchExact } from "../../ui";
import type { EmissionData } from "../../services/emissionService";
import { META_KEYS } from "./logic";

export const canEdit = (entry: Pick<EmissionData, "status">) => entry.status === "pending" || entry.status === "rejected";

const lower = (s: string) => s.toLowerCase();

/** Select columns in mapping-key order: the dependency chain from its roots, else every select column. */
function selectChain(m: FormModel): ColumnEntity[] {
  const children = new Set(Object.keys(m.dependencies));
  const roots = [...new Set(Object.values(m.dependencies))].filter((c) => !children.has(c));
  const byName = (name: string) => m.columns.find((c) => lower(c.column_name) === lower(name));
  if (roots.length === 0) return m.columns.filter((c) => c.column_type === "select");
  const names: string[] = [];
  const walk = (name: string) => {
    names.push(name);
    for (const [child, parent] of Object.entries(m.dependencies)) if (parent === name) walk(child);
  };
  roots.forEach(walk);
  return names.map(byName).filter((c): c is ColumnEntity => c !== undefined);
}

/**
 * Fill empty select columns from the stored emission category: find the
 * mapping key ("Paper|Recycled") whose category it is and pick each label's
 * option down the chain. Older entries stored only the category, so without
 * this the selects would open blank. Same walk as the old My emissions page.
 */
export function prefillSelects(m: FormModel, row: ModalRow): ModalRow {
  const stored = row.emission_category;
  if (!stored) return row;
  const hit = Object.entries(m.mapping).find(([, category]) => lower(category) === lower(stored));
  if (!hit) return row;
  const next: ModalRow = { ...row, _ecmKey: row._ecmKey || hit[0] };
  const labels = hit[0].split("|");
  selectChain(m).forEach((col, i) => {
    const label = labels[i];
    if (label === undefined || rowValue(next, col.column_name)) return;
    const parent = isDependentColumn(m, col.column_name) ? parentColumnOf(m, col.column_name) : null;
    const parentValue = parent ? rowValue(next, parent) : undefined;
    const option = columnOptionsFor(m, col, parentValue || undefined).find((o) => lower(o.label) === lower(label));
    if (option) next[col.column_name] = String(option.id);
  });
  return next;
}

/** The entry as a form row: what the user entered, its unit and extra fields, bookkeeping left out. */
export function rowFromEntry(m: FormModel, entry: EmissionData): ModalRow {
  const row: ModalRow = { id: entry.pk_id };
  for (const [key, value] of Object.entries(entry.activity_data ?? {})) {
    if (META_KEYS.has(key)) continue;
    row[key] = value === null || value === undefined ? "" : typeof value === "object" ? value : String(value);
  }
  m.columns.forEach((c) => {
    if (rowValue(row, c.column_name) === undefined) row[c.column_name] = "";
  });
  row.activity_data_unit = entry.activity_data_unit ?? "";
  row._extra_data = { ...(entry.extra_data ?? {}) };
  return prefillSelects(m, row);
}

/* ----------------------------------------------------------------- period */

/** "YYYY-MM" of a monthly entry. */
export const entryMonth = (entry: Pick<EmissionData, "date_of_reporting">) => entry.date_of_reporting.slice(0, 7);

/** Month-end date of "YYYY-MM", where Add data files monthly entries. */
export function monthEndDate(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}

/**
 * The date to save. A yearly entry keeps its period-end date; a monthly entry
 * keeps its own date while its month is unchanged, else moves to the new
 * month's end.
 */
export function editedDate(entry: Pick<EmissionData, "date_of_reporting" | "reporting_period">, month: string): string {
  const original = entry.date_of_reporting.slice(0, 10);
  if (entry.reporting_period === "yearly" || month === entryMonth(entry)) return original;
  return monthEndDate(month);
}

export const factorYearFor = (date: string) => factorYearForDate(date) as number;

/* ------------------------------------------------------------- validation */

export type EditIssue = {
  field: "emission_category" | "activity_data_unit" | "values" | "reason";
  message: string;
};

/** The first thing stopping a save, or null. A rejected entry needs a note on what changed. */
export function editIssue(row: ModalRow, calc: EmissionCalculator, status: EmissionData["status"], reason: string): EditIssue | null {
  if (!row.emission_category)
    return {
      field: "emission_category",
      message: "Choose what this entry is.",
    };
  if (!row.activity_data_unit) return { field: "activity_data_unit", message: "Choose a unit." };
  const expected = calc.getExpectedUnit(row.emission_category);
  if (expected && !unitsMatchExact(expected, row.activity_data_unit) && !canConvert(row.activity_data_unit, expected)) {
    return {
      field: "activity_data_unit",
      message: `The factor is per ${expected} and ${row.activity_data_unit} can't be converted to it.`,
    };
  }
  const result = calc.calculateEmission(row);
  if (result.value === null) return { field: "values", message: result.status };
  if (status === "rejected" && !reason.trim())
    return {
      field: "reason",
      message: "Say what you changed so the reviewer can check it.",
    };
  return null;
}

/* ---------------------------------------------------------------- payload */

export type EntryUpdate = {
  activity_data: Record<string, unknown>;
  extra_data: Record<string, unknown>;
  activity_data_unit?: string;
  date_of_reporting: string;
  reason?: string;
};

/** The PUT body. The backend recalculates the total and puts the entry back to Pending. */
export function buildUpdate(row: ModalRow, date: string, reason: string): EntryUpdate {
  const { activity_data_unit, _extra_data, ...rest } = row;
  const activity: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (key === "id" || META_KEYS.has(key)) continue;
    if (key.endsWith("__multiplier") || key.endsWith("__distance")) continue;
    activity[key] = value;
  }
  return {
    activity_data: activity,
    extra_data: _extra_data ?? {},
    activity_data_unit: activity_data_unit || undefined,
    date_of_reporting: date,
    reason: reason.trim() || undefined,
  };
}

/** The server's message for a failed save, or a plain fallback. */
export function saveErrorMessage(err: unknown): string {
  const e = err as { response?: { data?: { message?: string } } };
  return e?.response?.data?.message || "Couldn't save your changes. Try again.";
}
