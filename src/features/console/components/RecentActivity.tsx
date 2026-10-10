import { Upload } from "lucide-react";
import { EmptyState, SkeletonText, cn, panel, timeAgo } from "../../../ui";
import type { Activity } from "../logic";

export function RecentActivity({ items, loading, error }: { items: Activity[]; loading: boolean; error: boolean }) {
  return (
    <section aria-labelledby="recent-activity" className={cn(panel, "p-4")}>
      <h2 id="recent-activity" className="mb-3 text-sm font-semibold text-ink">
        Recent activity
      </h2>
      {loading ? (
        <SkeletonText lines={3} />
      ) : error ? (
        <p className="text-sm text-muted">Couldn't load recent uploads.</p>
      ) : items.length === 0 ? (
        <EmptyState icon={Upload} title="No factor uploads yet." />
      ) : (
        <ol className="space-y-3" data-testid="recent-activity">
          {items.map((a) => (
            <li key={a.id} className="flex gap-2.5 text-sm">
              <Upload aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
              <span className="min-w-0">
                <span className="block text-ink">{a.title}</span>
                <span className="block truncate text-xs text-muted">
                  {a.detail} · <time dateTime={a.when}>{timeAgo(a.when)}</time>
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
