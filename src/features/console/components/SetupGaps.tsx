import { CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, EmptyState, SkeletonText, cn, focusRing, panel } from "../../../ui";
import type { Gap } from "../logic";

const SHOWN = 8;

/** Right-hand list of what's missing per client, each linking to the page that fixes it. */
export function SetupGaps({
  gaps,
  loading,
  error,
  partial,
  onRetry,
}: {
  gaps: Gap[];
  loading: boolean;
  /** The client lists didn't load, so nothing could be checked. */
  error: boolean;
  /** Some per-site or per-client checks didn't run. */
  partial: boolean;
  onRetry: () => void;
}) {
  return (
    <section aria-labelledby="setup-gaps" className={cn(panel, "p-4")}>
      <h2 id="setup-gaps" className="mb-3 text-sm font-semibold text-ink">
        Setup gaps {!loading && !error && gaps.length > 0 && <span className="font-num text-muted">· {gaps.length}</span>}
      </h2>
      {loading ? (
        <SkeletonText lines={4} />
      ) : error ? (
        <div className="space-y-2 text-sm">
          <p className="text-muted">Couldn't check setup.</p>
          <Button size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : gaps.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={partial ? "No gaps in the checks that ran." : "Every active client is fully set up."}
        />
      ) : (
        <ul className="space-y-1" data-testid="setup-gaps">
          {gaps.slice(0, SHOWN).map((g) => (
            <li key={`${g.clientId}-${g.check}-${g.subject}`}>
              <Link to={g.href} className={cn("block rounded-control px-2 py-1.5 text-sm hover:bg-tint", focusRing)}>
                <span className="font-medium text-ink">{g.subject}</span>
                <span className="text-muted"> · {g.text}</span>
                {g.subject !== g.clientName && <span className="block text-xs text-muted">{g.clientName}</span>}
              </Link>
            </li>
          ))}
          {gaps.length > SHOWN && <li className="px-2 pt-1 text-xs text-muted">and {gaps.length - SHOWN} more in the clients table</li>}
        </ul>
      )}
    </section>
  );
}
