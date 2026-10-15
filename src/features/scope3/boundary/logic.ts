// S3-1 Scope 3 boundary page: pure logic. No React here.
import { BOUNDARY_STATUS_LABEL, type BoundaryStatus, needsReason } from "../../../lib/scope3/boundary";
import type { BoundaryCategory, MapProposal } from "../../../services/scope3Service";

export type RowDraft = { status: BoundaryStatus; reason: string; method_note: string };

export const draftFrom = (c: BoundaryCategory): RowDraft => ({
  status: c.status,
  reason: c.reason ?? "",
  method_note: c.method_note ?? "",
});

const clean = (s: string) => s.trim();

export const isRowDirty = (d: RowDraft, c: BoundaryCategory): boolean =>
  d.status !== c.status || clean(d.reason) !== (c.reason ?? "") || clean(d.method_note) !== (c.method_note ?? "");

/** The message shown under the reason, or null when the row can be saved. */
export function rowError(d: RowDraft): string | null {
  if (needsReason(d.status) && !clean(d.reason)) {
    return `Add a reason: ${BOUNDARY_STATUS_LABEL[d.status].toLowerCase()} categories must say why.`;
  }
  return null;
}

/** The body PUT /scope3/categories/:n takes. */
export const toBody = (d: RowDraft) => ({
  status: d.status,
  reason: clean(d.reason) || null,
  method_note: clean(d.method_note) || null,
});

/** Counts for the summary line, from the drafts so it follows unsaved edits. */
export function countStatuses(statuses: BoundaryStatus[]): Record<BoundaryStatus, number> {
  const out: Record<BoundaryStatus, number> = { included: 0, excluded: 0, not_relevant: 0, screening: 0 };
  for (const s of statuses) out[s]++;
  return out;
}

/** "11 included · 2 excluded · 2 not relevant", plus screening when any. */
export function summaryLine(c: Record<BoundaryStatus, number>): string {
  const parts = [`${c.included} included`, `${c.excluded} excluded`, `${c.not_relevant} not relevant`];
  if (c.screening) parts.push(`${c.screening} screening`);
  return parts.join(" · ");
}

export const CONFIRM_ALL_MIN = 90;

/** Unmapped proposals "Confirm all ≥ 90 %" takes. */
export const bulkConfirmable = (unmapped: MapProposal[]): MapProposal[] =>
  unmapped.filter((p) => p.proposed !== null && p.confidence >= CONFIRM_ALL_MIN);

export const confidenceText = (p: Pick<MapProposal, "confidence" | "proposed">): string =>
  p.proposed === null ? "No match" : `${Math.round(p.confidence)} %`;

/** "12 Oct 2026, by Priya" or "Not changed yet". */
export function lastChanged(c: Pick<BoundaryCategory, "updated_at" | "updated_by">): string {
  if (!c.updated_at || !c.updated_by) return "Not changed yet";
  const when = new Date(c.updated_at);
  const date = Number.isNaN(when.getTime())
    ? ""
    : when.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const who = c.updated_by.name ?? "a removed user";
  return date ? `${date}, by ${who}` : `By ${who}`;
}

// S3-11 (D10): Categories 13-15 default to Not relevant, set by ESGLite with
// no person on the row; an Admin confirms it as is with one click.
export const D10_CATEGORIES: readonly number[] = [13, 14, 15];
export const isUnconfirmedDefault = (c: Pick<BoundaryCategory, "n" | "status" | "updated_by">): boolean =>
  D10_CATEGORIES.includes(c.n) && c.status === "not_relevant" && c.updated_by === null;
