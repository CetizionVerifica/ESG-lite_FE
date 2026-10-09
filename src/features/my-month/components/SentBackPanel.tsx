import { Link } from "react-router-dom";
import { XCircle } from "lucide-react";
import { formatDate } from "../../../ui";
import { type SentBack, addDataLink } from "../logic";
import { linkButton } from "./linkStyles";

/** Rejected rows, always above the checklist; each [Fix] opens the entry form for that row. */
export function SentBackPanel({ items, month, showSite }: { items: SentBack[]; month: string; showSite: boolean }) {
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
                  <p key={r?.pk_id ?? i} className="mt-0.5 text-muted">
                    {r?.review_comment ? <q className="text-ink">{r.review_comment}</q> : "No reason given"}
                    {r?.reviewed_by && <> · {r.reviewed_by}</>}
                    {r?.reviewed_at && <> · {formatDate(r.reviewed_at)}</>}
                  </p>
                ))}
              </div>
              <Link
                to={addDataLink(siteId, category, month)}
                className={linkButton.secondarySm}
                aria-label={`Fix ${category.category_name}${showSite ? ` at ${siteName}` : ""}`}
              >
                Fix
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
