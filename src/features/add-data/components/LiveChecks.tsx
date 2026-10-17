import { Loader2, ShieldCheck } from "lucide-react";
import { CheckList, Skeleton, cn, panel } from "../../../ui";
import { visibleCheckLines } from "../../../lib/scope3/checks";
import type { CheckRowResult } from "../../../lib/scope3/contracts";

export type LiveCheckRow = { ref: string; label: string };

type Props = {
  rows: LiveCheckRow[];
  /** The last answer, kept while a newer check loads. */
  results: Map<string, CheckRowResult> | undefined;
  checking: boolean;
  error: boolean;
  /** Reviewers see every check; a User only the ones they can act on (SE-1). */
  showCalcDetail: boolean;
  factorYear: number | null;
  thresholdPct: number | null;
};

/**
 * S3-15 · "Checks before you send": the review checks on the rows as they'd
 * be saved now (`POST /user/emissions/check {rows}`, nothing saved), updated a
 * moment after typing stops. Information only: it never blocks sending. A
 * problem the save would refuse shows on the row's field, not here.
 */
export function LiveChecks({ rows, results, checking, error, showCalcDetail, factorYear, thresholdPct }: Props) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="live-checks-heading" className={cn(panel, "space-y-3 p-4")} aria-busy={checking || undefined}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="live-checks-heading" className="flex items-center gap-2 text-sm font-semibold text-ink">
            <ShieldCheck aria-hidden className="size-4 text-brand-text" />
            Checks before you send
          </h2>
          <p className="mt-0.5 text-xs text-muted">Your manager sees the same checks. Fixing what's held gets your entry approved faster.</p>
        </div>
        <p className={cn("flex items-center gap-1 text-xs text-muted", !checking && "invisible")} role="status">
          <Loader2 aria-hidden className="size-3.5 animate-spin motion-reduce:animate-none" />
          {checking ? "Checking…" : ""}
        </p>
      </div>
      {error && !results ? (
        <p className="text-sm text-muted">The checks couldn't run just now. You can still send; your manager sees them once you do.</p>
      ) : (
        rows.map((r) => {
          const result = results?.get(r.ref);
          const lines = result ? visibleCheckLines(result.checks, { year: factorYear, pct: thresholdPct }, showCalcDetail) : [];
          const held = lines.filter((l) => !l.passed).length;
          return (
            <div key={r.ref} className="space-y-2">
              {rows.length > 1 && <h3 className="text-xs font-semibold text-muted">{r.label}</h3>}
              {!result ? (
                checking ? <Skeleton className="h-20 w-full rounded-control" /> : <p className="text-sm text-muted">Checked once the row is complete.</p>
              ) : (
                <>
                  <p className="text-sm text-ink">{held === 0 ? "Nothing here holds this entry back." : held === 1 ? "1 check would hold it back." : `${held} checks would hold it back.`}</p>
                  <CheckList lines={lines} testId={`live-checks-${r.ref}`} />
                </>
              )}
            </div>
          );
        })
      )}
      {error && results && <p className="text-xs text-muted">The latest check couldn't run; this is the last result.</p>}
    </section>
  );
}
