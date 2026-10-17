import { Link } from "react-router-dom";
import { XCircle } from "lucide-react";
import { formatDate } from "../../../ui";
import { type SentBack, addDataLink, fixLink, rowPeriod } from "../logic";
import { linkButton } from "./linkStyles";

type Props = {
  items: SentBack[];
  month: string;
  showSite: boolean;
  /**
   * S3-15, with the review workflow on: each reason gets its own Fix, which
   * opens that rejected row in Add data; rows of a locked month get none.
   */
  workflow?: { lockedSiteIds: number[] };
};

/** Rejected rows, always above the checklist; each [Fix] opens the entry form for that row. */
export function SentBackPanel({ items, month, showSite, workflow }: Props) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="sent-back-heading" className="rounded-card border border-bad/30 bg-bad-soft p-4">
      <h2 id="sent-back-heading" className="flex items-center gap-2 text-sm font-semibold text-ink">
        <XCircle aria-hidden className="size-4 text-bad" />
        Sent back to you
      </h2>
      <ul className="mt-3 space-y-2">
        {items.map(({ siteId, siteName, category }) => {
          const reasons = category.rejections.length ? category.rejections : [null];
          const locked = !!workflow?.lockedSiteIds.includes(siteId);
          // One Fix per rejected row when the workflow can open that row; otherwise one per category, as today.
          const perRow = !!workflow && category.rejections.length > 0;
          const where = showSite ? ` at ${siteName}` : "";
          return (
            <li
              key={`${siteId}-${category.category_id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-line bg-panel p-3"
            >
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium text-ink">
                  {category.category_name}
                  {showSite && <span className="font-normal text-muted"> · {siteName}</span>}
                </p>
                {reasons.map((r, i) => (
                  <div key={r?.pk_id ?? i} className="mt-0.5 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-muted">
                      {r?.review_comment ? <q className="text-ink">{r.review_comment}</q> : "No reason given"}
                      {r?.reviewed_by && <> · {r.reviewed_by}</>}
                      {r?.reviewed_at && <> · {formatDate(r.reviewed_at)}</>}
                    </p>
                    {perRow && r && !locked && (
                      <Link
                        to={fixLink(siteId, category.category_id, rowPeriod(category, month), r.pk_id)}
                        className={linkButton.secondarySm}
                        aria-label={`Fix ${category.category_name}${where}${reasons.length > 1 ? ` (${i + 1} of ${reasons.length})` : ""}`}
                      >
                        Fix
                      </Link>
                    )}
                  </div>
                ))}
              </div>
              {!perRow && !locked && (
                <Link to={addDataLink(siteId, category, month)} className={linkButton.secondarySm} aria-label={`Fix ${category.category_name}${where}`}>
                  Fix
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
