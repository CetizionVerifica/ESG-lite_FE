import { Link } from "react-router-dom";
import { Button, EmptyState, SkeletonText, cn, focusRing, formatEmissions } from "../../../ui";
import type { CategoryBar } from "../logic";

/** Top categories as horizontal bars; each bar opens the ledger for that category. */
export function CategoryBars(props: { bars: CategoryBar[]; loading: boolean; error: string | null; onRetry: () => void; linkFor: (id: number) => string }) {
  const { bars, loading, error, onRetry, linkFor } = props;
  const max = Math.max(0, ...bars.map((b) => b.total));
  return (
    <section aria-labelledby="overview-categories" className="rounded-card border border-line bg-panel p-4">
      <h3 id="overview-categories" className="mb-3 text-sm font-semibold text-ink">
        By category <span className="ml-1.5 text-xs font-normal text-muted">tCO₂e, gross</span>
      </h3>
      {loading ? (
        <SkeletonText lines={5} />
      ) : error ? (
        <EmptyState compact variant="error" title={error} action={<Button size="sm" onClick={onRetry}>Try again</Button>} />
      ) : bars.length === 0 ? (
        <EmptyState compact title="No approved emissions by category yet." />
      ) : (
        <ul className="space-y-2">
          {bars.map((b) => {
            const body = (
              <>
                <span className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate text-ink">{b.name}</span>
                  <span className="shrink-0 font-num tabular-nums text-ink">{formatEmissions(b.total)}</span>
                </span>
                <span aria-hidden className="mt-1 block h-2 rounded-full bg-tint">
                  <span className={cn("block h-full rounded-full", b.id === "other" ? "bg-muted" : "bg-brand")} style={{ width: `${max ? Math.max(1, (b.total / max) * 100) : 0}%` }} />
                </span>
              </>
            );
            return (
              <li key={b.id}>
                {b.id === "other" ? (
                  <div className="px-1 py-0.5">{body}</div>
                ) : (
                  <Link to={linkFor(b.id)} className={cn("block rounded px-1 py-0.5 hover:bg-tint", focusRing)}>
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
