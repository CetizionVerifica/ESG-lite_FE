import type { ProductionData, ProductionDataStatus } from "../../services/productionDataService";
import { MONTH_SHORT as MONTHS, formatNumber, isStatus, productionPeriodText as periodText } from "../../ui";

export type ProductionRow = ProductionData;

/** "2025-01-31T00:00:00Z" → [2025, 0, 31], read as a calendar date (no time zone shift). */
function ymd(value: string): [number, number, number] {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return [y, m - 1, d];
}

// Shared with P05 (src/ui/productionRecords.ts).
export { periodText };
export { shortRange, overlapsById } from "../../ui";

/** Month name for intensity text: "Sep 2025", or "Jan – Mar 2025" for longer periods. */
export function monthsText(start: string, end: string): string {
  const [sy, sm] = ymd(start);
  const [ey, em] = ymd(end);
  if (sy === ey && sm === em) return `${MONTHS[sm]} ${sy}`;
  return sy === ey ? `${MONTHS[sm]} – ${MONTHS[em]} ${ey}` : `${MONTHS[sm]} ${sy} – ${MONTHS[em]} ${ey}`;
}

export function asStatus(value: string | undefined): ProductionDataStatus | null {
  return value && isStatus(value) && value !== "missing" && value !== "draft" ? (value as ProductionDataStatus) : null;
}

export function effectiveStatus(row: ProductionRow, optimistic: ReadonlyMap<number, ProductionDataStatus>): ProductionDataStatus {
  return optimistic.get(row.production_id) ?? row.status;
}

/** Search over product, site, submitter, unit and notes. */
export function matchesSearch(row: ProductionRow, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return [row.product?.name, row.site?.name, row.created_by?.name, row.unit, row.notes, String(row.quantity)]
    .filter(Boolean)
    .some((v) => String(v).toLowerCase().includes(needle));
}

/** Newest first, like the old page. */
export function byNewest(a: ProductionRow, b: ProductionRow): number {
  return b.created_at.localeCompare(a.created_at) || b.production_id - a.production_id;
}

export function describeRow(r: ProductionRow): string {
  return `${r.product?.name ?? "Product"} · ${r.site?.name ?? "—"} · ${periodText(r.start_date, r.end_date)}`;
}

/** "No production data for Hidd, Pending, Sep 2025" (empty state). */
export function emptyTitle(parts: (string | null | undefined)[]): string {
  const shown = parts.filter((p): p is string => !!p);
  return shown.length ? `No production data for ${shown.join(", ")}` : "No production data yet";
}

// ── Intensity impact (drawer) ──────────────────────────────────────────────

/** Sentence for the drawer; `before`/`after` are the intensities when they can be worked out. */
export type Impact = { text: string; before?: number | null; after?: number | null };

const fmtIntensity = (v: number | null) => (v === null ? "—" : formatNumber(v, v >= 1 ? 2 : 4));

/**
 * What this record does to the site's intensity for its period. `emissions`
 * and `production` are the approved totals for the site and period from the
 * intensity endpoint (production in this record's unit).
 */
export function intensityImpact(input: {
  status: ProductionDataStatus;
  quantity: number;
  unit: string;
  start: string;
  end: string;
  emissions: number;
  production: number;
}): Impact {
  const { status, quantity, unit, emissions, production } = input;
  const when = monthsText(input.start, input.end);
  const amount = `${formatNumber(quantity)} ${unit}`;
  if (status === "rejected") return { text: `Rejected, so ${amount} isn't counted in ${when}.` };
  const ratio = (p: number) => (p > 0 ? emissions / p : null);
  if (!(emissions > 0)) {
    return {
      text:
        status === "pending"
          ? `Approving adds ${amount} to ${when}. There are no approved emissions in ${when} yet, so intensity can't be worked out.`
          : `Counts ${amount} in ${when}. There are no approved emissions in ${when} yet, so intensity can't be worked out.`,
    };
  }
  const per = `tCO₂e/${unit}`;
  if (status === "pending") {
    const before = ratio(production);
    const after = ratio(production + quantity);
    return { text: `Approving adds ${amount} to ${when}; intensity ${fmtIntensity(before)} → ${fmtIntensity(after)} ${per}.`, before, after };
  }
  const before = ratio(production - quantity);
  const after = ratio(production);
  return { text: `Counts ${amount} in ${when}; intensity is ${fmtIntensity(after)} ${per} (${fmtIntensity(before)} without it).`, before, after };
}

// ── Edit ───────────────────────────────────────────────────────────────────

export const EDIT_REASON_MIN = 5;

export type EditDraft = { quantity: number | null; unit: string; start: string; end: string; notes: string; reason: string };

export function editErrors(d: EditDraft): Partial<Record<keyof EditDraft, string>> {
  const e: Partial<Record<keyof EditDraft, string>> = {};
  if (d.quantity === null || !(d.quantity > 0)) e.quantity = "Enter a quantity above 0";
  if (!d.unit) e.unit = "Choose a unit";
  if (!d.start) e.start = "Choose a start date";
  if (!d.end) e.end = "Choose an end date";
  else if (d.start && d.end < d.start) e.end = "End date can't be before the start date";
  if (d.reason.trim().length < EDIT_REASON_MIN) e.reason = `Say why this changes (at least ${EDIT_REASON_MIN} characters)`;
  return e;
}

export function editPayload(d: EditDraft) {
  return { quantity: d.quantity as number, unit: d.unit, start_date: d.start, end_date: d.end, notes: d.notes.trim(), reason: d.reason.trim() };
}

/** Units offered when editing: the product's unit, plus the record's own if it differs (old free-text units). */
export function unitChoices(row: ProductionRow): string[] {
  return [...new Set([row.product?.unit, row.unit].filter((u): u is string => !!u))];
}
