/** Pure helpers for P07 Approvals and Emissions ledger. No React, no requests. */
import type { EmissionData, EmissionStatus } from "../../services/emissionService";
import { DEFAULT_FY_START_MONTH, type Period, type SortState, formatMonth, formatReportingYear } from "../../ui";

export type FactorSnapshot = {
  emission_factor_id: number;
  emission_category_name: string;
  global_category_name?: string;
  factor_value: number;
  denominator_unit: string;
  source: string;
  year: number;
};

/** A ledger row: the list API also returns these entity fields. */
export type LedgerRow = EmissionData & {
  emission_factor_snapshot?: FactorSnapshot | null;
  upload_batch_id?: string | null;
};

type Option = { id: string | number; label: string };

/** The parts of a site × category ColumnConfig the ledger reads. */
export type ColumnConfig = {
  columns?: { pk_id: number; column_name: string; column_type?: string }[];
  column_options?: Record<string, Option[]>;
  dependent_options?: Record<string, Record<string, Option[]>>;
  column_dependencies?: Record<string, string>;
  emission_category_mapping?: Record<string, string>;
};

export type Tab = "approvals" | "ledger";

/** activity_data keys that are bookkeeping, not entered values. */
export const META_KEYS = new Set([
  "category_name",
  "category_scope",
  "fera_linked_id",
  "date_of_reporting",
  "activity_data_unit",
  "_extra_data",
  "_isFeraRow",
  "_ecmKey",
  "extra_data",
]);

export const PAGE_SIZES = [50, 100, 200] as const;

// ── Query building ──────────────────────────────────────────────────────────

/** Table column id → B6 `sort` key. Columns not listed are not sortable. */
export const SORT_KEYS: Record<string, string> = {
  site: "site",
  category: "category",
  tco2e: "total_emission",
  period: "date",
  status: "status",
  submitted: "created_at",
};

/** The approvals queue works oldest first. */
export const DEFAULT_SORT: Record<Tab, SortState> = {
  approvals: { id: "submitted", dir: "asc" },
  ledger: null,
};

/** `/user/emissions` takes a year and optional month; other period kinds aren't offered. */
export function periodQuery(period: Period | null): { year: number | null; month: number | null } {
  if (period?.kind === "month") return { year: period.year, month: period.month };
  if (period?.kind === "cy") return { year: period.year, month: null };
  return { year: null, month: null };
}

export type ListInput = {
  tab: Tab;
  siteIds: number[];
  categoryId: number | null;
  period: Period | null;
  search: string;
  /** Ledger status chip; the approvals tab is always pending. */
  status: EmissionStatus | null;
  sort: SortState;
  page: number;
  pageSize: number;
};

export function listParams(input: ListInput) {
  const sortKey = input.sort ? SORT_KEYS[input.sort.id] : undefined;
  return {
    siteIds: input.siteIds,
    categoryId: input.categoryId,
    ...periodQuery(input.period),
    status: input.tab === "approvals" ? "pending" : input.status,
    search: input.search.trim() || null,
    sort: sortKey ?? null,
    order: sortKey && input.sort ? input.sort.dir : null,
    // DataTable pages are 0-based, the API's 1-based.
    page: input.page + 1,
    limit: input.pageSize,
  };
}

export function asStatus(value: string | undefined): EmissionStatus | null {
  return value === "pending" || value === "approved" || value === "rejected" ? value : null;
}

// ── FERA rows ───────────────────────────────────────────────────────────────

export const isFera = (row: EmissionData) => row.category?.category_name?.toLowerCase() === "fera";

/**
 * FERA (fuel- and energy-related) rows ride on their parent: they are hidden
 * from the list and shown as "+X tCO₂e" on the parent, unless the user is
 * looking at the FERA category itself.
 */
export function mergeFera<T extends EmissionData>(rows: T[], showFera: boolean): { rows: T[]; feraOf: Map<number, T> } {
  const fera = rows.filter(isFera);
  const feraOf = new Map<number, T>();
  for (const row of rows) {
    if (isFera(row)) continue;
    const linked = fera.find((f) => f.pk_id === row.fera_linked_id || f.fera_linked_id === row.pk_id);
    if (linked) feraOf.set(row.pk_id, linked);
  }
  return { rows: showFera ? rows : rows.filter((r) => !isFera(r)), feraOf };
}

// ── Activity data ───────────────────────────────────────────────────────────

const sameText = (a: unknown, b: unknown) => String(a).toLowerCase() === String(b).toLowerCase();
const matches = (opt: Option, value: unknown) => String(opt.id) === String(value) || sameText(opt.label, value);

/** Finds `key` in `obj` ignoring case and snake/camel spelling. */
function findKey(obj: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!obj) return undefined;
  if (key in obj) return key;
  const snake = key.replace(/([A-Z])/g, "_$1").toLowerCase();
  const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  return Object.keys(obj).find((k) => sameText(k, key) || k === snake || k === camel);
}

function columnId(config: ColumnConfig, name: string): string | null {
  const col = config.columns?.find((c) => sameText(c.column_name, name));
  return col ? String(col.pk_id) : null;
}

/**
 * The label of a stored select value (stored as an option id or label).
 * Same resolution order as the old Manager page: dependent options under the
 * parent's label, then the column's own options, then any dependent option
 * list for the column; otherwise the raw value.
 */
export function optionLabel(
  config: ColumnConfig | undefined,
  column: string,
  value: string,
  activity: Record<string, unknown>,
): string {
  if (!value || !config) return value;
  const colOpts = config.column_options ?? {};
  const depOpts = config.dependent_options ?? {};
  const deps = config.column_dependencies ?? {};

  const depKey = findKey(deps, column);
  const parent = depKey ? deps[depKey] : undefined;
  if (parent && depOpts[column]) {
    const parentValue = activity[parent];
    if (parentValue) {
      let parentLabel = String(parentValue);
      const pid = columnId(config, parent);
      const parentOpt = pid ? colOpts[pid]?.find((o) => matches(o, parentValue)) : undefined;
      if (parentOpt) parentLabel = parentOpt.label;
      const key = Object.keys(depOpts[column]).find((k) => sameText(k, parentLabel));
      const opt = key ? depOpts[column][key]?.find((o) => matches(o, value)) : undefined;
      if (opt) return opt.label;
    }
  }

  const cid = columnId(config, column);
  const own = cid ? colOpts[cid]?.find((o) => matches(o, value)) : undefined;
  if (own) return own.label;

  const depList = Object.entries(depOpts).find(([k]) => sameText(k, column))?.[1];
  const anyDep = depList ? Object.values(depList).flat().find((o) => matches(o, value)) : undefined;
  return anyDep?.label ?? value;
}

/** "fuel_type" → "Fuel type". */
export function humanize(key: string): string {
  const spaced = key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim().toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export type ActivityField = { key: string; label: string; value: string; numeric: boolean };

/** Entered values with option ids resolved to labels, in the form's column order. */
export function activityFields(row: EmissionData, config: ColumnConfig | undefined): ActivityField[] {
  const data = row.activity_data ?? {};
  const order = (config?.columns ?? []).map((c) => c.column_name);
  const keys = Object.keys(data).filter((k) => !META_KEYS.has(k));
  const ordered = [
    ...order.flatMap((name) => keys.filter((k) => sameText(k, name))),
    ...keys.filter((k) => !order.some((name) => sameText(name, k))),
  ];
  return ordered.flatMap((key) => {
    const raw = data[key];
    if (raw === null || raw === undefined || raw === "") return [];
    const col = config?.columns?.find((c) => sameText(c.column_name, key));
    const value = typeof raw === "object" ? JSON.stringify(raw) : optionLabel(config, key, String(raw), data);
    const numeric = col ? col.column_type === "number" : typeof raw === "number" || (typeof raw === "string" && raw.trim() !== "" && !Number.isNaN(Number(raw)));
    return [{ key, label: humanize(key), value, numeric }];
  });
}

/** One line for the table: the first non-numeric values, then "+N fields". */
export function activitySummary(fields: ActivityField[], shown = 2): { text: string; more: number } {
  const lead = fields.filter((f) => !f.numeric);
  const picked = (lead.length ? lead : fields).slice(0, shown);
  return { text: picked.map((f) => f.value).join(" · "), more: fields.length - picked.length };
}

/** The entered quantity: the first numeric field. */
export function quantityOf(fields: ActivityField[]): number | null {
  const f = fields.find((x) => x.numeric);
  if (!f) return null;
  const n = Number(f.value);
  return Number.isFinite(n) ? n : null;
}

// ── Display ─────────────────────────────────────────────────────────────────

/** "Sep 2025" for monthly rows; "CY 2025" / "FY 2024-25" for yearly rows (dated at the period end). */
export function rowPeriodLabel(row: Pick<EmissionData, "date_of_reporting" | "reporting_period" | "year_type">, fyStartMonth = DEFAULT_FY_START_MONTH): string {
  if (row.reporting_period !== "yearly") return formatMonth(row.date_of_reporting);
  const d = new Date(row.date_of_reporting);
  if (Number.isNaN(d.getTime())) return formatMonth(row.date_of_reporting);
  if (row.year_type === "FY") {
    // An FY row is dated on the FY's last day; its start year is the year before unless the FY starts in January.
    const startYear = fyStartMonth === 1 ? d.getFullYear() : d.getFullYear() - 1;
    return formatReportingYear(startYear, "FY", fyStartMonth);
  }
  return formatReportingYear(d.getFullYear(), "CY");
}

export function scopeNumber(scope: string | null | undefined): 1 | 2 | 3 | null {
  const m = /([123])/.exec(scope ?? "");
  return m ? (Number(m[1]) as 1 | 2 | 3) : null;
}

// ── Review ──────────────────────────────────────────────────────────────────

export const REJECT_MIN = 5;
export const SUGGESTED_REASONS = ["Wrong unit", "Missing invoice", "Duplicate", "Wrong period"];

export function rejectReasonError(reason: string): string | null {
  return reason.trim().length >= REJECT_MIN ? null : `Give a reason of at least ${REJECT_MIN} characters`;
}

/** Status shown for a row, after approvals still waiting out their undo window. */
export function effectiveStatus(row: EmissionData, optimistic: ReadonlyMap<number, EmissionStatus>): EmissionStatus {
  return optimistic.get(row.pk_id) ?? row.status;
}

/** Index of the row to focus after J/K, clamped to the list. */
export function stepIndex(current: number, delta: number, count: number): number {
  if (count === 0) return -1;
  if (current < 0) return delta > 0 ? 0 : count - 1;
  return Math.min(count - 1, Math.max(0, current + delta));
}

// ── Excel reports (server files) ────────────────────────────────────────────

export type ReportOption =
  | { kind: "month"; label: string; year: number; month: number }
  | { kind: "year"; label: string; year: number; yearType: "CY" | "FY" };

/**
 * Server Excel files for the chosen period: the month (existing export), its
 * calendar year and the financial year it falls in (B7). FY is sent as the
 * year it ends in, as the backend expects (Apr 2024 – Mar 2025 → 2025).
 */
export function reportOptions(period: Period | null, fyStartMonth = DEFAULT_FY_START_MONTH): ReportOption[] {
  if (!period) return [];
  if (period.kind === "cy") return [{ kind: "year", label: `Calendar year ${period.year}`, year: period.year, yearType: "CY" }];
  if (period.kind !== "month") return [];
  const { year, month } = period;
  const options: ReportOption[] = [
    { kind: "month", label: `${formatMonth(`${year}-${String(month).padStart(2, "0")}`)} (month)`, year, month },
    { kind: "year", label: `Calendar year ${year}`, year, yearType: "CY" },
  ];
  // The backend's FY export runs April to March.
  if (fyStartMonth === 4) {
    const startYear = month >= 4 ? year : year - 1;
    options.push({ kind: "year", label: formatReportingYear(startYear, "FY", 4), year: startYear + 1, yearType: "FY" });
  }
  return options;
}
