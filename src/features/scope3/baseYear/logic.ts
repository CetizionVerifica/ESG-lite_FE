import type { AuditLogEntry } from "../../../services/auditLogService";
import {
  type CompanyBaseYear,
  type RecalcEvent,
  DEFAULT_SIGNIFICANCE,
  RECALC_REASON_LABEL,
  RECALC_STATUS_LABEL,
  noteError,
  significanceError,
} from "../../../lib/scope3/baseYear";

/** The base-year form: what an Admin types before freezing. */
export interface BaseYearDraft {
  base_year: number;
  year_type: "CY" | "FY";
  significance_pct: number | null;
  rationale: string;
  policy_note: string;
  /** Required when an already frozen base year moves to another year. */
  note: string;
}

export function draftFrom(row: CompanyBaseYear | null, now: Date): BaseYearDraft {
  return {
    base_year: row?.base_year ?? now.getFullYear() - 1,
    year_type: row?.year_type ?? "CY",
    significance_pct: row ? row.significance_pct : DEFAULT_SIGNIFICANCE,
    rationale: row?.rationale ?? "",
    policy_note: row?.policy_note ?? "",
    note: "",
  };
}

/** Moving a frozen base year to another year (needs a note and records a recalculation). */
export const changesYear = (d: BaseYearDraft, row: CompanyBaseYear | null) =>
  !!row && (row.base_year !== d.base_year || row.year_type !== d.year_type);

/** Only the policy fields differ from what is saved: save without a new freeze. */
export const policyOnly = (d: BaseYearDraft, row: CompanyBaseYear | null) => !!row && !changesYear(d, row);

export function isDirty(d: BaseYearDraft, row: CompanyBaseYear | null): boolean {
  if (!row) return true;
  return (
    changesYear(d, row) ||
    d.significance_pct !== row.significance_pct ||
    d.rationale.trim() !== (row.rationale ?? "") ||
    d.policy_note.trim() !== (row.policy_note ?? "")
  );
}

export interface DraftErrors {
  significance_pct?: string;
  rationale?: string;
  note?: string;
}

export function draftErrors(d: BaseYearDraft, row: CompanyBaseYear | null): DraftErrors {
  const out: DraftErrors = {};
  const sig = significanceError(d.significance_pct);
  if (sig) out.significance_pct = sig;
  if (!d.rationale.trim()) out.rationale = "Say why this year is the base year.";
  if (changesYear(d, row)) {
    const n = noteError(d.note);
    if (n) out.note = n;
  }
  return out;
}

export function toBody(d: BaseYearDraft, row: CompanyBaseYear | null) {
  return {
    base_year: d.base_year,
    year_type: d.year_type,
    significance_pct: d.significance_pct ?? DEFAULT_SIGNIFICANCE,
    rationale: d.rationale.trim() || null,
    policy_note: d.policy_note.trim() || null,
    ...(changesYear(d, row) ? { note: d.note.trim() } : {}),
  };
}

/** Decided recalculations as history entries for AuditTimeline (newest first). */
export function historyEntries(events: RecalcEvent[]): AuditLogEntry[] {
  return events
    .filter((e) => e.status !== "proposed")
    .map((e) => ({
      id: e.id,
      entity_type: "scope3_recalculation",
      entity_id: e.id,
      action: e.status === "approved" ? "approve" : "dismiss",
      changed_fields: {
        status: { old: RECALC_STATUS_LABEL.proposed, new: RECALC_STATUS_LABEL[e.status] },
        reason: { old: null, new: RECALC_REASON_LABEL[e.reason] ?? e.reason },
        ...(e.before && e.after ? { total_tco2e: { old: e.before.total_tco2e, new: e.after.total_tco2e } } : {}),
      },
      reason: e.note,
      changed_by: e.approved_by_name ? { user_id: 0, name: e.approved_by_name, email: "", role: "" } : null,
      changed_at: e.decided_at ?? e.created_at,
    }));
}
