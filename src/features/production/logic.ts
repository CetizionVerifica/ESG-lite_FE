import type { ProductionData, ProductionDataStatus } from "../../services/productionDataService";
import type { Product } from "../../services/productService";
import { MONTH_SHORT, productionPeriodText, rangesOverlap } from "../../ui";

export type ProductionRow = ProductionData;
export type SiteOption = { site_id: number; name: string };

/** The contributor's sites, from `user.sites` or the single `user.site`. */
export function userSites(user: unknown): SiteOption[] {
  const u = (user ?? {}) as { sites?: unknown; site?: unknown };
  const list = Array.isArray(u.sites) && u.sites.length > 0 ? u.sites : u.site ? [u.site] : [];
  return list
    .filter((s): s is { site_id: number; name?: string } => typeof (s as { site_id?: unknown })?.site_id === "number")
    .map((s) => ({ site_id: s.site_id, name: s.name ?? `Site ${s.site_id}` }));
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2025-09" → first and last day of that month. */
export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(last)}` };
}

/** "2025-09" for a record that covers exactly one calendar month, else null. */
export function wholeMonth(start: string, end: string): string | null {
  const month = start.slice(0, 7);
  const r = monthRange(month);
  return start.slice(0, 10) === r.start && end.slice(0, 10) === r.end ? month : null;
}

/** "Sep 2025" for a whole month, else "Sep 1 – Sep 15, 2025". */
export function periodText(start: string, end: string): string {
  const month = wholeMonth(start, end);
  if (!month) return productionPeriodText(start, end);
  return monthLabel(month);
}

/** "2025-09" → "Sep 2025". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_SHORT[m - 1]} ${y}`;
}

export function currentMonth(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

// ── Product cards ──────────────────────────────────────────────────────────

export type CardState = "todo" | ProductionDataStatus;

export type ProductCard = {
  product: Product;
  siteId: number;
  /** The newest record of this product on this site (any status). */
  last: ProductionRow | null;
  state: CardState;
  /** The record behind `state` for the month (none when to do). */
  record: ProductionRow | null;
};

const STATE_ORDER: ProductionDataStatus[] = ["approved", "pending", "rejected"];

/**
 * One card per product: its latest quantity and where `month` stands. A month
 * counts as approved or pending when any such record overlaps it; a month with
 * only a rejected record shows Rejected so it can be fixed.
 */
export function productCards(products: Product[], rows: ProductionRow[], month: string): ProductCard[] {
  const { start, end } = monthRange(month);
  return products.map((product) => {
    const siteId = product.site?.site_id;
    const mine = rows.filter((r) => r.product?.product_id === product.product_id && r.site?.site_id === siteId);
    const last = [...mine].sort((a, b) => b.end_date.localeCompare(a.end_date) || b.production_id - a.production_id)[0] ?? null;
    const inMonth = mine.filter((r) => rangesOverlap(r.start_date, r.end_date, start, end));
    const state = STATE_ORDER.find((s) => inMonth.some((r) => r.status === s)) ?? "todo";
    return { product, siteId, last, state, record: state === "todo" ? null : (inMonth.find((r) => r.status === state) ?? null) };
  });
}

// ── Table ──────────────────────────────────────────────────────────────────

export function asStatus(value: string | undefined): ProductionDataStatus | null {
  return value === "pending" || value === "approved" || value === "rejected" ? value : null;
}

/** Search over product, unit, notes, quantity and the rejection reason. */
export function matchesSearch(row: ProductionRow, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [row.product?.name, row.site?.name, row.unit, row.notes, row.review_comment, String(row.quantity)]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(needle));
}

/** Latest period first, then newest record. */
export function byPeriod(a: ProductionRow, b: ProductionRow): number {
  return b.start_date.localeCompare(a.start_date) || b.production_id - a.production_id;
}

export function describeRow(r: ProductionRow): string {
  return `${r.product?.name ?? "Product"} · ${periodText(r.start_date, r.end_date)}`;
}

/** Records can be changed or deleted until they are approved. */
export function canChange(r: ProductionRow): boolean {
  return r.status !== "approved";
}

/** "No production for Wire rod, Pending, Sep 2025". */
export function emptyTitle(parts: (string | null | undefined)[]): string {
  const shown = parts.filter((p): p is string => !!p);
  return shown.length ? `No production for ${shown.join(", ")}` : "No production logged yet";
}

// ── Add / edit form ────────────────────────────────────────────────────────

export type Draft = {
  siteId: number | null;
  productId: number | null;
  quantity: number | null;
  unit: string;
  /** "month" uses `month`; "range" uses `start`/`end` (custom range). */
  mode: "month" | "range";
  month: string | null;
  start: string;
  end: string;
  notes: string;
};

export function newDraft(opts: { siteId: number | null; product?: Product | null; month?: string | null }): Draft {
  return {
    siteId: opts.siteId,
    productId: opts.product?.product_id ?? null,
    quantity: null,
    unit: opts.product?.unit ?? "",
    mode: "month",
    month: opts.month ?? null,
    start: "",
    end: "",
    notes: "",
  };
}

export function draftFromRow(row: ProductionRow): Draft {
  const month = wholeMonth(row.start_date, row.end_date);
  return {
    siteId: row.site?.site_id ?? null,
    productId: row.product?.product_id ?? null,
    quantity: Number(row.quantity),
    unit: row.unit || row.product?.unit || "",
    mode: month ? "month" : "range",
    month,
    start: row.start_date.slice(0, 10),
    end: row.end_date.slice(0, 10),
    notes: row.notes ?? "",
  };
}

/** The dates the draft covers, or null while they are incomplete. */
export function draftRange(d: Draft): { start: string; end: string } | null {
  if (d.mode === "month") return d.month ? monthRange(d.month) : null;
  return d.start && d.end ? { start: d.start, end: d.end } : null;
}

export type DraftErrors = Partial<Record<"site" | "product" | "quantity" | "unit" | "month" | "start" | "end", string>>;

export function draftErrors(d: Draft): DraftErrors {
  const e: DraftErrors = {};
  if (!d.siteId) e.site = "Choose a site";
  if (!d.productId) e.product = "Choose a product";
  if (d.quantity === null || !(d.quantity > 0)) e.quantity = "Enter a quantity above 0";
  if (!d.unit.trim()) e.unit = "Choose a unit";
  if (d.mode === "month") {
    if (!d.month) e.month = "Choose a month";
  } else {
    if (!d.start) e.start = "Choose a start date";
    if (!d.end) e.end = "Choose an end date";
    else if (d.start && d.end < d.start) e.end = "End date can't be before the start date";
  }
  return e;
}

/** Body for POST /user/production-data. Call only when draftErrors is empty. */
export function createPayload(d: Draft) {
  const r = draftRange(d)!;
  return {
    product_id: d.productId!,
    site_id: d.siteId!,
    quantity: d.quantity!,
    unit: d.unit.trim(),
    start_date: r.start,
    end_date: r.end,
    ...(d.notes.trim() ? { notes: d.notes.trim() } : {}),
  };
}

/** Body for PUT /user/production-data/:id (notes "" clears them). */
export function updatePayload(d: Draft) {
  const r = draftRange(d)!;
  return { quantity: d.quantity!, unit: d.unit.trim(), start_date: r.start, end_date: r.end, notes: d.notes.trim() };
}

/** Units offered: the product's unit, plus a record's own if it differs (old free-text units). */
export function unitChoices(productUnit: string | undefined, current: string): string[] {
  return [...new Set([productUnit, current].filter((u): u is string => !!u && !!u.trim()))];
}
