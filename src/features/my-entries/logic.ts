import { type Period, fyLabel, formatMonth, periodRange } from "../../ui";
import type { EmissionData, EmissionStatus } from "../../services/emissionService";

/* ------------------------------------------------------------------ sites */

export type SiteCategory = { category_id: number; category_name: string; scope?: string | null };
export type UserSite = { site_id: number; name: string; categories: SiteCategory[] };

/** The signed-in user's sites (User has `site`, multi-site users have `sites`). */
export function userSites(user: unknown): UserSite[] {
  const u = (user ?? {}) as { sites?: unknown; site?: unknown };
  const list = Array.isArray(u.sites) && u.sites.length > 0 ? u.sites : u.site ? [u.site] : [];
  return list
    .filter((s): s is { site_id: number; name?: string; categories?: SiteCategory[] } => typeof (s as { site_id?: unknown })?.site_id === "number")
    .map((s) => ({ site_id: s.site_id, name: s.name ?? `Site ${s.site_id}`, categories: Array.isArray(s.categories) ? s.categories : [] }));
}

/** Categories across the chosen sites (all sites when none chosen), unique by id, by name. */
export function categoriesFor(sites: UserSite[], siteIds: number[]): SiteCategory[] {
  const chosen = siteIds.length ? sites.filter((s) => siteIds.includes(s.site_id)) : sites;
  const byId = new Map<number, SiteCategory>();
  for (const c of chosen.flatMap((s) => s.categories)) if (!byId.has(c.category_id)) byId.set(c.category_id, c);
  return [...byId.values()].sort((a, b) => a.category_name.localeCompare(b.category_name));
}

/* ----------------------------------------------------------------- period */

export const PERIOD_KINDS = ["month", "cy"] as const;

/**
 * /user/emissions filters by calendar year and month only. A month or CY maps
 * directly; any other period (an FY from a My month link, a quarter) widens to
 * the calendar year its range ends in, which still contains its yearly filing.
 */
export function toSupportedPeriod(p: Period | null): Period | null {
  if (!p || p.kind === "month" || p.kind === "cy") return p;
  const end = periodRange(p).to;
  return { kind: "cy", year: Number(end.slice(0, 4)) };
}

export function serverPeriod(p: Period | null): { year?: number; month?: number } {
  if (!p) return {};
  if (p.kind === "month") return { year: p.year, month: p.month };
  if (p.kind === "cy") return { year: p.year };
  return {};
}

/* ------------------------------------------------------------------- rows */

export type EntryRow = EmissionData & { fera?: EmissionData };

const isFera = (e: EmissionData) => e.category?.category_name?.toLowerCase() === "fera";

/**
 * FERA rows are generated from their parent entry: show them on the parent's
 * row (tCO₂e column), not as rows of their own. A FERA row whose parent is not
 * on this page stays a row (labelled with its parent category). When the user
 * filters on the FERA category itself, every FERA row shows as is.
 */
export function attachFera(rows: EmissionData[], feraCategorySelected = false): EntryRow[] {
  if (feraCategorySelected) return rows;
  const fera = rows.filter(isFera);
  const used = new Set<number>();
  const out: EntryRow[] = [];
  for (const row of rows) {
    if (isFera(row)) continue;
    const linked = fera.find((f) => f.pk_id === row.fera_linked_id || f.fera_linked_id === row.pk_id);
    if (linked) used.add(linked.pk_id);
    out.push(linked ? { ...row, fera: linked } : row);
  }
  // Orphans keep their place at the end of the page.
  for (const f of fera) if (!used.has(f.pk_id)) out.push(f);
  return out;
}

/** Keys of activity_data that are bookkeeping, not something the user entered. */
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

function findKey(data: Record<string, unknown>, name: string): string | undefined {
  if (data[name] !== undefined) return name;
  const lower = name.toLowerCase();
  return Object.keys(data).find((k) => k.toLowerCase() === lower);
}

// Same priority as the reporting layer and the old My emissions breakdown:
// one field, not the sum of the numbers.
const QUANTITY_KEYS = ["activity data", "activity_value", "value", "quantity", "amount", "consumption"];

/** The entry's activity quantity, or null when it has no canonical quantity field. */
export function quantityOf(activityData: Record<string, unknown> | null | undefined): number | null {
  const data = activityData ?? {};
  for (const key of QUANTITY_KEYS) {
    const k = findKey(data, key);
    if (k === undefined) continue;
    const raw = data[k];
    const num = typeof raw === "string" ? Number(raw.replace(/,/g, "")) : Number(raw);
    if (raw !== "" && raw !== null && Number.isFinite(num)) return num;
  }
  return null;
}

/** The emission category (fuel, grid, …) that picked the factor. */
export function keyActivity(row: EmissionData): string | null {
  const k = findKey(row.activity_data ?? {}, "emission_category");
  const v = k ? row.activity_data[k] : null;
  return v === null || v === undefined || v === "" ? null : String(v).trim();
}

/** "Sep 2025", or "FY 2025-26" / "CY 2025" for a yearly filing (dated at its period end). */
export function periodText(row: Pick<EmissionData, "date_of_reporting" | "reporting_period" | "year_type">): string {
  const date = row.date_of_reporting?.slice(0, 10) ?? "";
  if (row.reporting_period === "yearly" && /^\d{4}-\d{2}/.test(date)) {
    const endYear = Number(date.slice(0, 4));
    const endMonth = Number(date.slice(5, 7));
    if (row.year_type === "CY" || endMonth === 12) return `CY ${endYear}`;
    // FY ends the month before its start month.
    return fyLabel(endYear - 1, (endMonth % 12) + 1);
  }
  return formatMonth(date);
}

/* --------------------------------------------------------------- sorting */

/** DataTable column id → GET /user/emissions sort key (B6). */
export const SORT_KEYS: Record<string, string> = {
  category: "category",
  total: "total_emission",
  period: "date",
  status: "status",
  submitted: "created_at",
};

/* ---------------------------------------------------------------- status */

export const STATUS_VALUES: EmissionStatus[] = ["pending", "approved", "rejected"];

export function parseStatus(value: string | undefined): EmissionStatus | null {
  return (STATUS_VALUES as string[]).includes(value ?? "") ? (value as EmissionStatus) : null;
}

/* ------------------------------------------------- activity field labels */

type Option = { id: string | number; label: string };

/** The parts of a site×category column config needed to show labels instead of option ids. */
export type LabelConfig = {
  columns?: { pk_id: number; column_name: string; column_type?: string }[];
  column_options?: Record<string, Option[]>;
  dependent_options?: Record<string, Record<string, Option[]>>;
  column_dependencies?: Record<string, string>;
};

const sameText = (a: unknown, b: unknown) => String(a).toLowerCase() === String(b).toLowerCase();
const matches = (o: Option, value: unknown) => String(o.id) === String(value) || sameText(o.label, value);

function columnOptions(config: LabelConfig, columnName: string): Option[] | undefined {
  const col = config.columns?.find((c) => sameText(c.column_name, columnName));
  return col ? config.column_options?.[String(col.pk_id)] : undefined;
}

function entryFor<T>(obj: Record<string, T> | undefined, key: string): T | undefined {
  if (!obj) return undefined;
  if (obj[key] !== undefined) return obj[key];
  const snake = key.replace(/([A-Z])/g, "_$1").toLowerCase();
  const camel = key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  const hit = Object.keys(obj).find((k) => sameText(k, key) || k === snake || k === camel);
  return hit === undefined ? undefined : obj[hit];
}

/**
 * The label for a stored select value: dependent options under the parent's
 * label first, then the column's own options, then any dependent option list
 * for the column; the raw value when nothing matches. Same order as the old
 * My emissions page.
 */
export function optionLabel(columnName: string, value: string, config: LabelConfig | undefined, activityData: Record<string, unknown>): string {
  if (!value || !config) return value;
  const parentName = entryFor(config.column_dependencies, columnName);
  const dependent = entryFor(config.dependent_options, columnName);
  if (parentName && dependent) {
    const parentValue = activityData[parentName];
    if (parentValue !== undefined && parentValue !== null && parentValue !== "") {
      const parentLabel = columnOptions(config, parentName)?.find((o) => matches(o, parentValue))?.label ?? String(parentValue);
      const list = entryFor(dependent, parentLabel);
      const hit = list?.find((o) => matches(o, value));
      if (hit) return hit.label;
    }
  }
  const own = columnOptions(config, columnName)?.find((o) => matches(o, value));
  if (own) return own.label;
  const any = dependent ? Object.values(dependent).flat().find((o) => matches(o, value)) : undefined;
  return any ? any.label : value;
}

export type ActivityField = { key: string; value: string };

/** What the user entered, in entry order, with option labels; bookkeeping keys left out. */
export function activityFields(activityData: Record<string, unknown> | null | undefined, config?: LabelConfig): ActivityField[] {
  const data = activityData ?? {};
  return Object.entries(data)
    .filter(([key, value]) => !META_KEYS.has(key) && value !== null && value !== undefined && value !== "")
    .map(([key, value]) => ({
      key,
      value: typeof value === "object" ? JSON.stringify(value) : optionLabel(key, String(value), config, data),
    }));
}
