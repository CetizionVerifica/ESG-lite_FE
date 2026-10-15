/** Pure helpers for P07 Approvals and Emissions ledger. No React, no requests. */
import type { BatchChannel, EmissionData, EmissionStatus, EmissionUploadBatch } from "../../services/emissionService";
import { fyEndYear, fyStartYearOf } from "../../lib/fiscalYear";
import type { ReviewGroup } from "../../lib/scope3/checks";
import { DEFAULT_FY_START_MONTH, type Period, type SortState, formatMonth, formatNumber, formatReportingYear, writeContext } from "../../ui";

export type FactorSnapshot = {
  emission_factor_id: number;
  emission_category_name: string;
  global_category_name?: string;
  /** Postgres numeric: the API sends it as text ("2.5600"). */
  factor_value: number | string;
  denominator_unit: string;
  source: string;
  year: number;
};

/** A factor's value as a number, whether the API sent it as text or a number; null when it isn't one. */
export function factorValue(factor: { factor_value: number | string | null | undefined }): number | null {
  const raw = factor.factor_value;
  if (raw === null || raw === undefined || String(raw).trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

const factorFormat = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 6 });

/** The factor as shown in a calculation: up to 6 significant digits, so tiny factors don't round to 0. */
export function formatFactorValue(factor: { factor_value: number | string | null | undefined }): string {
  const value = factorValue(factor);
  return value === null ? "—" : factorFormat.format(value);
}

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
  categoryIds: number[];
  period: Period | null;
  search: string;
  /** Ledger status chip; the approvals tab is always pending. */
  status: EmissionStatus | null;
  /** `?batch=`: only one upload batch's rows ("Review rows" on the Upload batches tab). */
  batchId?: string | null;
  /** With a batch: only its rows that need attention (XI5). */
  attention?: boolean;
  /** S3-15 `?group=` on Approvals (not with a batch): ready or needs-attention rows only. */
  group?: ReviewGroup | null;
  sort: SortState;
  page: number;
  pageSize: number;
};

export function listParams(input: ListInput) {
  const sortKey = input.sort ? SORT_KEYS[input.sort.id] : undefined;
  return {
    siteIds: input.siteIds,
    categoryId: input.categoryIds,
    ...periodQuery(input.period),
    status: input.tab === "approvals" ? "pending" : input.status,
    search: input.search.trim() || null,
    batchId: input.batchId || null,
    attention: input.batchId && input.attention ? true : null,
    ready: input.tab === "approvals" && !input.batchId && input.group ? input.group === "ready" : null,
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
 * A pending FERA twin whose partner entry is pending too: the server folds it
 * into that entry (one decision, counted once). `undefined` partner status
 * (an API without the field) counts as folded, as `mergeFera` hides it.
 */
export const isFoldedFeraTwin = (row: EmissionData) =>
  isFera(row) && row.status === "pending" && (row.fera_partner_status === undefined || row.fera_partner_status === "pending");

/**
 * FERA (fuel- and energy-related) rows ride on their parent: they are hidden
 * from the list and shown as "+X tCO₂e" on the parent, unless the FERA
 * category is among the chosen ones: then every FERA row is a row of its own
 * and nothing hangs on its parent, so no entry shows twice. A FERA row that waits for review while
 * its parent doesn't (an edit can send a twin back for review) needs its own
 * decision and stays a row of its own.
 *
 * A pending FERA row whose parent isn't on this page is shown on its own only
 * when the API says the parent isn't pending (`fera_partner_status`). A
 * pending parent on another page, or outside the filters, carries the
 * decision: approving it approves the twin too, and approving the twin alone
 * would approve a parent the reviewer never saw.
 */
export function mergeFera<T extends EmissionData>(rows: T[], showFera: boolean): { rows: T[]; feraOf: Map<number, T> } {
  const feraOf = new Map<number, T>();
  if (showFera) return { rows, feraOf };
  const folded = new Set<number>();
  for (const row of rows) {
    if (isFera(row)) continue;
    const linked = rows.find((f) => isFera(f) && (f.pk_id === row.fera_linked_id || f.fera_linked_id === row.pk_id));
    if (!linked || (linked.status === "pending" && row.status !== "pending")) continue;
    feraOf.set(row.pk_id, linked);
    folded.add(linked.pk_id);
  }
  const partnerElsewhere = (r: T) =>
    r.status === "pending" &&
    !rows.some((p) => !isFera(p) && (p.pk_id === r.fera_linked_id || p.fera_linked_id === r.pk_id)) &&
    // undefined: an API without the field; hide as before rather than risk it.
    (r.fera_partner_status === undefined || r.fera_partner_status === "pending");
  return {
    rows: rows.filter((r) => !isFera(r) || (!folded.has(r.pk_id) && !partnerElsewhere(r))),
    feraOf,
  };
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

/** Status shown for a row, after approvals still waiting out their undo window. */
export function effectiveStatus(row: EmissionData, optimistic: ReadonlyMap<number, EmissionStatus>): EmissionStatus {
  return optimistic.get(row.pk_id) ?? row.status;
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
  // The backend's FY export runs April to March and names the FY by its end year.
  if (fyStartMonth === 4) {
    const startYear = fyStartYearOf(new Date(year, month - 1, 1), fyStartMonth);
    options.push({ kind: "year", label: formatReportingYear(startYear, "FY", fyStartMonth), year: fyEndYear(startYear, fyStartMonth), yearType: "FY" });
  }
  return options;
}

// ─── Smart import provenance (XI5) ──────────────────────────────────────────

export type ImportProvenance = {
  /** "Sheet!Cell" of the sheet line the row came from. */
  row_ref: string | null;
  /** How the smart import matched the row, when it went through the mapper. */
  meta: { source: "profile" | "rules" | "llm"; confidence: number } | null;
};

/** What the import stored on the row (`extra_data.import`, IM1), or null for a typed entry. */
export function importProvenance(row: Pick<EmissionData, "extra_data">): ImportProvenance | null {
  const imp = row.extra_data?.import as { row_ref?: unknown; meta?: { source?: unknown; confidence?: unknown } } | undefined;
  if (!imp || typeof imp !== "object") return null;
  const row_ref = typeof imp.row_ref === "string" && imp.row_ref ? imp.row_ref : null;
  const m = imp.meta;
  const source: ImportProvenance["meta"] extends infer M ? (M extends { source: infer S } ? S | null : never) : never =
    m?.source === "profile" || m?.source === "rules" || m?.source === "llm" ? (m.source as "profile" | "rules" | "llm") : null;
  const meta: ImportProvenance["meta"] = source && typeof m?.confidence === "number" ? { source, confidence: m.confidence } : null;
  return row_ref || meta ? { row_ref, meta } : null;
}

/** "Matched by: remembered", "suggested (64 %)" or "matched by name". */
export function matchedByText(meta: NonNullable<ImportProvenance["meta"]>): string {
  const pct = `${Math.round(meta.confidence * 100)} %`;
  if (meta.source === "profile") return "remembered from an earlier upload";
  if (meta.source === "llm") return `suggested (${pct})`;
  return meta.confidence < 1 ? `matched by name (${pct})` : "matched by name";
}

/** `?attention=`: on by default while the batch has rows that need attention; "0" turns it off. */
export function attentionOn(param: string | null, count: number | undefined): boolean {
  if (param === "0") return false;
  if (param === "1") return true;
  return (count ?? 0) > 0;
}

/**
 * A refused batch approve (403). ESG-lite refuses the whole batch when the caller may not approve some
 * of its rows: their own rows edited after the upload, their own Claude or API batch, or rows outside
 * their sites. The cause isn't in the response, so the text doesn't guess it.
 */
export function batchApproveError(e: unknown): string | null {
  const status = (e as { response?: { status?: unknown } })?.response?.status;
  return status === 403 ? "You can't approve this batch yourself. Ask another manager to approve it." : null;
}

/** The summary's "Needs attention" count, under either name the API may use; `null` when it sends none (older API). */
export function attentionOf(summary: { attention?: unknown; attention_count?: unknown } | null | undefined): number | null {
  const n = summary?.attention ?? summary?.attention_count;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** The batch "Approve pending" dialog, which names the rows the smart import was least sure about. */
export function approveBatchCopy(pending: number, attention: number | undefined): { title: string; description: string; reviewFirst: boolean } {
  const n = attention ?? 0;
  const rows = (k: number) => `${formatNumber(k)} pending ${k === 1 ? "row" : "rows"}`;
  if (n > 0) {
    return {
      title: pending === 1 ? "Approve the 1 pending row?" : `Approve all ${rows(pending)}?`,
      description: `${formatNumber(n)} of ${rows(pending)} ${n === 1 ? "was" : "were"} matched by the smart import below 80 % or changed before the import. Review them first, or approve everything now.`,
      reviewFirst: true,
    };
  }
  return { title: `Approve ${rows(pending)}?`, description: "", reviewFirst: false };
}

// ─── Upload batch source (IM10) ─────────────────────────────────────────────

export type BatchSource = "claude" | "bulk" | "api";

/**
 * Where a batch came from (contract channel → chip). A batch without a
 * channel, which includes every batch older than the import plans and the
 * historical imports, is a Bulk upload.
 */
export function batchSource(channel: BatchChannel | null | undefined): BatchSource {
  switch (channel) {
    case "mcp":
      return "claude";
    case "api":
      return "api";
    default:
      return "bulk";
  }
}

export const BATCH_SOURCE_LABEL: Record<BatchSource, string> = { claude: "Claude", bulk: "Bulk upload", api: "API" };

export const BATCH_SOURCE_OPTIONS: { value: BatchSource; label: string }[] = (["claude", "bulk", "api"] as BatchSource[]).map((value) => ({ value, label: BATCH_SOURCE_LABEL[value] }));

/** Reads `?source=` for the batches tab; anything unknown means all sources. */
export function parseBatchSource(value: string | null): BatchSource | null {
  return value && value in BATCH_SOURCE_LABEL ? (value as BatchSource) : null;
}

/**
 * Where "Review rows" goes: the Approvals tab while the batch has pending rows
 * (each one is approved or rejected on its own there), else the Ledger. The
 * batch's own site and category, over any period, become the context so every row is in view.
 */
export function reviewRowsPath(batch: Pick<EmissionUploadBatch, "upload_batch_id" | "site_id" | "category_id" | "pending_count">, attention = false): string {
  const params = writeContext(new URLSearchParams(), { siteIds: [batch.site_id], categoryIds: [batch.category_id], period: null });
  params.set("batch", batch.upload_batch_id);
  if (attention) params.set("attention", "1");
  return `${batch.pending_count > 0 ? "/data/approvals" : "/data/ledger"}?${params.toString()}`;
}

// ─── Review queue (S3-15) ───────────────────────────────────────────────────

/** "Ready (n)" / "Needs attention (n)" from the summary; null on an API without checks. */
export function reviewCounts(summary: { ready?: unknown; held?: unknown } | null | undefined): { ready: number; attention: number } | null {
  const ready = summary?.ready;
  const held = summary?.held;
  if (typeof ready !== "number" || !Number.isFinite(ready)) return null;
  return { ready, attention: typeof held === "number" && Number.isFinite(held) ? held : 0 };
}

/** "Approve all 12 ready" and the toast that follows. */
/**
 * "Approve all ready" copy. One action sends at most `cap` entries; above it
 * the button says how many of the ready ones go now.
 */
export function approveAllCopy(n: number, cap = Infinity): { button: string; toast: string } {
  if (n > cap) {
    return {
      button: `Approve ${formatNumber(cap)} of ${formatNumber(n)} ready`,
      toast: `${formatNumber(cap)} ready entries approved`,
    };
  }
  return {
    button: `Approve all ${formatNumber(n)} ready`,
    toast: n === 1 ? "1 ready entry approved" : `${formatNumber(n)} ready entries approved`,
  };
}

/** What a skipped row count after "Approve all ready" says. */
export function skippedCopy(skipped: number): string | null {
  if (skipped <= 0) return null;
  return skipped === 1
    ? "1 entry wasn't approved: its checks changed. It's under Needs attention."
    : `${formatNumber(skipped)} entries weren't approved: their checks changed. They're under Needs attention.`;
}

export type HistoryMonth = { year: number; month: number; label: string; total: number; entries: number; current: boolean };

/** The six months up to and including `anchor` (oldest first). */
export function historyMonths(anchor: { year: number; month: number }, count = 6): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(anchor.year, anchor.month - 1 - i, 1);
    out.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return out;
}

/** The year and month a monthly row is dated in; null for yearly rows or a bad date. */
export function rowMonth(row: Pick<EmissionData, "date_of_reporting" | "reporting_period">): { year: number; month: number } | null {
  if (row.reporting_period === "yearly") return null;
  const m = /^(\d{4})-(\d{2})/.exec(row.date_of_reporting ?? "");
  return m ? { year: Number(m[1]), month: Number(m[2]) } : null;
}

const activityKey = (row: Pick<EmissionData, "activity_data">) => String(row.activity_data?.emission_category ?? "").trim().toLowerCase();

/**
 * tCO₂e per month for the same site, category and activity (`activity_data.emission_category`)
 * as `row`, over the six months up to its month. Rejected rows and yearly rows don't count.
 */
export function monthlyHistory(row: EmissionData, candidates: EmissionData[]): HistoryMonth[] {
  const anchor = rowMonth(row);
  if (!anchor) return [];
  const key = activityKey(row);
  const months = historyMonths(anchor);
  const totals = new Map(months.map((m) => [`${m.year}-${m.month}`, { total: 0, entries: 0 }]));
  for (const r of candidates) {
    if (r.status === "rejected" || r.site?.site_id !== row.site?.site_id || r.category?.category_id !== row.category?.category_id) continue;
    if (activityKey(r) !== key) continue;
    const at = rowMonth(r);
    const slot = at && totals.get(`${at.year}-${at.month}`);
    if (!slot) continue;
    const v = Number(r.total_emission);
    if (Number.isFinite(v)) slot.total += v;
    slot.entries += 1;
  }
  return months.map((m) => {
    const t = totals.get(`${m.year}-${m.month}`)!;
    return { ...m, label: formatMonth(`${m.year}-${String(m.month).padStart(2, "0")}`), total: t.total, entries: t.entries, current: m.year === anchor.year && m.month === anchor.month };
  });
}
