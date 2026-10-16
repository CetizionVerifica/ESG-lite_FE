// S3-15 part 2 · Add data with the company's review workflow on: which saved
// rows "Save and submit" sends, and what the finish screen says.
import type { SubmitEmissionsResult } from "../../../lib/scope3/contracts";
import type { SaveOutcome } from "../api";
import type { CheckDryRunBody } from "../../../services/reviewService";
import type { EmissionPayload } from "./entry";

/** Submits across one Review (a duplicate "Replace" sends a second time). `failed`: a submit call itself failed. */
export type SubmitTally = { submitted: number[]; refused: SubmitEmissionsResult["refused"]; failed: boolean };

/**
 * Ids to submit after a save: rows the server saved as drafts. A Manager's
 * rows are saved pending already and need no submit; a server without the
 * workflow sends no status, so nothing is submitted.
 */
export function draftIdsToSubmit(outcomes: SaveOutcome[]): number[] {
  return outcomes.flatMap((o) => (o.kind === "saved" && o.status === "draft" && o.emissionId != null ? [o.emissionId] : []));
}

export function mergeSubmit(t: SubmitTally, r: SubmitEmissionsResult): SubmitTally {
  return { submitted: [...t.submitted, ...r.submitted], refused: [...t.refused, ...r.refused], failed: t.failed };
}

const rows = (n: number) => `${n} row${n === 1 ? "" : "s"}`;

/**
 * The finish screen with the workflow on. `statuses`: what each saved row was
 * saved as. Rows saved pending, or submitted after, are with the manager;
 * drafts not submitted wait in My month.
 */
export function finishCopy(statuses: (string | null)[], tally: SubmitTally, periodLabel: string): { title: string; description: string } {
  const drafts = statuses.filter((s) => s === "draft").length;
  const keptDrafts = Math.max(0, drafts - tally.submitted.length);
  const sent = statuses.length - keptDrafts;
  if (statuses.length === 0) return { title: "Nothing was sent", description: "Every row was skipped." };
  if (sent === 0) {
    const why = tally.failed ? " They couldn't be submitted just now." : tally.refused.length ? " The month is locked or they were already sent." : "";
    return { title: `${rows(keptDrafts)} saved as drafts`, description: `Submit ${keptDrafts === 1 ? "it" : "them"} from My month when ${keptDrafts === 1 ? "it's" : "they're"} ready.${why}` };
  }
  const left = keptDrafts > 0 ? ` ${rows(keptDrafts)} stayed as drafts; submit them from My month.` : "";
  return { title: `${rows(sent)} sent for approval`, description: `Your manager reviews ${periodLabel} next.${left}` };
}

/**
 * The live checks' dry-run body for a row that changes saved entry `pkId`:
 * the row as it would be saved, without the preview total (the server works
 * it out), plus the files picked but not uploaded yet.
 */
export function dryRunBody(p: EmissionPayload, pkId: number, evidenceCount: number): CheckDryRunBody {
  return {
    pk_id: pkId,
    site_id: p.site_id,
    category_id: p.category_id,
    activity_data: p.activity_data,
    activity_data_unit: p.activity_data_unit,
    date_of_reporting: p.date_of_reporting,
    reporting_period: p.reporting_period,
    year_type: p.year_type ?? null,
    ...(p.method ? { method: p.method } : {}),
    evidence_count: evidenceCount,
  };
}
