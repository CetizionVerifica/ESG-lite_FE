// S3-15 · Live checks ("Checks before you send"): which rows are checked, the
// body each sends (built from the same payload the save sends, so the check
// matches the save), and a server problem as the row's field error.
import { CHECK_ROWS_MAX, type CheckRowBody, type CheckRowResult } from "../../../lib/scope3/contracts";
import { plainIssue } from "../../../lib/entryDetail";
import type { EmissionPayload, RowIssue } from "./entry";

/** A row ready to check: `payload` is what Save would send; `editOf` the saved row it changes. */
export type LiveCheckCandidate = { rowId: number; payload: EmissionPayload; editOf: number | null; hasEvidence: boolean };

/** The check body for one row: the save's payload without the preview total (the server works it out). */
export function checkRowBody(c: LiveCheckCandidate): CheckRowBody {
  const p = c.payload;
  return {
    ref: String(c.rowId),
    ...(c.editOf !== null ? { id: c.editOf } : {}),
    site_id: p.site_id,
    category_id: p.category_id,
    activity_data: p.activity_data,
    activity_data_unit: p.activity_data_unit ?? null,
    date_of_reporting: p.date_of_reporting,
    reporting_period: p.reporting_period,
    year_type: p.year_type ?? null,
    method: p.method ?? null,
    // An edit leaves it out unless files were picked: ESG-lite then counts the saved row's own evidence.
    ...(c.hasEvidence || c.editOf === null ? { has_evidence: c.hasEvidence } : {}),
  };
}

/** Rows to check: the ones the form already finds complete (no field left to fill), at most 50. */
export function checkRowBodies(candidates: LiveCheckCandidate[]): CheckRowBody[] {
  return candidates.slice(0, CHECK_ROWS_MAX).map(checkRowBody);
}

const FIELD: Record<string, RowIssue["field"]> = {
  emission_category: "emission_category",
  activity_data_unit: "activity_data_unit",
  unit: "activity_data_unit",
  currency: "currency",
};

/**
 * The server's problem with a row as the row's ordinary field error. A User
 * reads it in plain words (no factor or unit-conversion detail, SE-1).
 */
export function serverIssueOf(result: CheckRowResult | undefined, showCalcDetail: boolean): RowIssue | null {
  const issue = result?.issue;
  if (!issue) return null;
  const key = (issue.field ?? "").replace(/^activity_data\./, "");
  const field = FIELD[issue.field ?? ""] ?? FIELD[key] ?? "values";
  return { field, message: showCalcDetail ? issue.message : plainIssue(issue.code, issue.message) };
}
