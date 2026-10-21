import { Link } from "react-router-dom";
import type { InsightsQuery } from "../../../lib/insights/contracts";
import { Callout, cn, focusRing } from "../../../ui";
import { usePanel } from "../api";
import { pendingSentence } from "./heroLogic";

/**
 * IN-1 · "12 entries and 3 KPI values waiting for approval aren't in these
 * figures. Review →" (05-ux §3), from the summary's `pending_not_in`. Shares
 * the hero's query, so it costs no extra request. Hidden when nothing waits.
 */
export function PendingBanner({ query }: { query: InsightsQuery }) {
  const q = usePanel("summary", query);
  const pending = q.data?.pending_not_in;
  const text = pending ? pendingSentence(pending) : null;
  if (!pending || !text) return null;
  return (
    <div data-testid="pending-banner">
      <Callout tone="warn">
        <span className="text-ink">{text}</span>
        {pending.link && (
          <>
            {" "}
            <Link to={pending.link} className={cn("rounded-control font-medium text-brand-text hover:underline", focusRing)}>
              Review →
            </Link>
          </>
        )}
      </Callout>
    </div>
  );
}
