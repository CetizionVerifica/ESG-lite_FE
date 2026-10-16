import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { CheckList, Skeleton, cn, panel, useDebounced } from "../../../ui";
import { visibleCheckLines } from "../../../lib/scope3/checks";
import { type CheckDryRunBody, checkEmission } from "../../../services/reviewService";

export type LiveCheckRow = { id: number; label: string; body: CheckDryRunBody };

type Props = {
  rows: LiveCheckRow[];
  /** Reviewers see every check; a User only the ones they can act on (SE-1). */
  showCalcDetail: boolean;
  factorYear: number | null;
  thresholdPct: number | null;
};

/**
 * S3-15 · Fix and resubmit: the review checks for the row being fixed, run on
 * the server as a dry run (`POST /user/emissions/check`, nothing saved) a
 * moment after typing stops, so the contributor sees what would hold it back
 * before sending it again.
 */
export function LiveChecks({ rows, showCalcDetail, factorYear, thresholdPct }: Props) {
  // Debounced by value: the parent rebuilds `rows` on every render.
  const key = useDebounced(JSON.stringify(rows), 600);
  const settled = useMemo(() => JSON.parse(key) as LiveCheckRow[], [key]);
  const results = useQueries({
    queries: settled.map((r) => ({
      queryKey: ["add-data", "live-checks", r.body],
      queryFn: () => checkEmission(r.body),
      staleTime: 30_000,
      retry: false,
    })),
  });
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="live-checks-heading" className={cn(panel, "space-y-3 p-4")}>
      <div>
        <h2 id="live-checks-heading" className="flex items-center gap-2 text-sm font-semibold text-ink">
          <ShieldCheck aria-hidden className="size-4 text-brand-text" />
          Checks before you send
        </h2>
        <p className="mt-0.5 text-xs text-muted">Your manager sees the same checks. Fixing what's held gets your entry approved faster.</p>
      </div>
      {settled.map((r, i) => {
        const q = results[i];
        const lines = q?.data ? visibleCheckLines(q.data, { year: factorYear, pct: thresholdPct }, showCalcDetail) : [];
        const held = lines.filter((l) => !l.passed).length;
        return (
          <div key={r.id} className="space-y-2" aria-live="polite" aria-busy={q?.isFetching || undefined}>
            {settled.length > 1 && <h3 className="text-xs font-semibold text-muted">{r.label}</h3>}
            {q?.isPending ? (
              <Skeleton className="h-20 w-full rounded-control" />
            ) : q?.isError ? (
              <p className="text-sm text-muted">The checks couldn't run just now. Your manager still sees them once you send.</p>
            ) : !q?.data ? (
              <p className="text-sm text-muted">The checks run once you send.</p>
            ) : (
              <>
                <p className="text-sm text-ink">{held === 0 ? "Nothing here holds this entry back." : held === 1 ? "1 check would hold it back." : `${held} checks would hold it back.`}</p>
                <CheckList lines={lines} testId="live-checks" />
              </>
            )}
          </div>
        );
      })}
    </section>
  );
}
