import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { CheckList, Skeleton, cn, panel } from "../../../ui";
import { visibleCheckLines } from "../../../lib/scope3/checks";
import { checkEmissions } from "../../../services/reviewService";

export type LiveCheckRow = { pkId: number; label: string };

type Props = {
  rows: LiveCheckRow[];
  /** Reviewers see every check; a User only the ones they can act on (SE-1). */
  showCalcDetail: boolean;
  factorYear: number | null;
  thresholdPct: number | null;
};

/**
 * S3-15 · Fix and resubmit: the review checks on the entry being fixed, as
 * if it were submitted now (`POST /user/emissions/check {ids}`, nothing
 * saved). ESG-lite checks the saved entry, so the list reflects the last save;
 * it refreshes after every save (the emission queries are invalidated).
 */
export function LiveChecks({ rows, showCalcDetail, factorYear, thresholdPct }: Props) {
  const ids = [...new Set(rows.map((r) => r.pkId))].sort((a, b) => a - b);
  const q = useQuery({
    queryKey: ["add-data", "existing", "checks", ids],
    enabled: ids.length > 0,
    queryFn: () => checkEmissions(ids),
    retry: false,
  });
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="live-checks-heading" className={cn(panel, "space-y-3 p-4")} aria-busy={q.isFetching || undefined}>
      <div>
        <h2 id="live-checks-heading" className="flex items-center gap-2 text-sm font-semibold text-ink">
          <ShieldCheck aria-hidden className="size-4 text-brand-text" />
          Checks before you send
        </h2>
        <p className="mt-0.5 text-xs text-muted">Your manager sees the same checks. They read the entry as last saved, and run again after you save.</p>
      </div>
      {q.isPending ? (
        <Skeleton className="h-20 w-full rounded-control" />
      ) : q.isError ? (
        <p className="text-sm text-muted">The checks couldn't run just now. Your manager still sees them once you send.</p>
      ) : (
        rows.map((r) => {
          const checks = q.data.get(r.pkId);
          const lines = checks ? visibleCheckLines(checks, { year: factorYear, pct: thresholdPct }, showCalcDetail) : [];
          const held = lines.filter((l) => !l.passed).length;
          return (
            <div key={r.pkId} className="space-y-2" aria-live="polite">
              {rows.length > 1 && <h3 className="text-xs font-semibold text-muted">{r.label}</h3>}
              {!checks ? (
                <p className="text-sm text-muted">The checks run once you send.</p>
              ) : (
                <>
                  <p className="text-sm text-ink">{held === 0 ? "Nothing here holds this entry back." : held === 1 ? "1 check would hold it back." : `${held} checks would hold it back.`}</p>
                  <CheckList lines={lines} testId="live-checks" />
                </>
              )}
            </div>
          );
        })
      )}
    </section>
  );
}
