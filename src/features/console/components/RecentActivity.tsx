import { Building2, FileSpreadsheet, Upload } from "lucide-react";
import { Button, EmptyState, SkeletonText, cn, panel, timeAgo } from "../../../ui";
import type { Activity } from "../logic";

const ICON = { bulk_upload: FileSpreadsheet, factor_upload: Upload, onboarding: Building2 } as const;

export function RecentActivity({ items, loading, error, onRetry }: { items: Activity[]; loading: boolean; error: boolean; onRetry: () => void }) {
  return (
    <section aria-labelledby="recent-activity" className={cn(panel, "p-4")}>
      <h2 id="recent-activity" className="mb-3 text-sm font-semibold text-ink">
        Recent activity
      </h2>
      {loading ? (
        <SkeletonText lines={3} />
      ) : error ? (
        <div className="space-y-2 text-sm">
          <p className="text-muted">Couldn't load recent activity.</p>
          <Button size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={Upload} title="No uploads or new clients yet." />
      ) : (
        <ol className="space-y-3" data-testid="recent-activity">
          {items.map((a) => {
            const Icon = ICON[a.kind];
            return (
              <li key={a.id} className="flex gap-2.5 text-sm">
                <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
                <span className="min-w-0">
                  <span className="block text-ink">{a.title}</span>
                  <span className="block truncate text-xs text-muted">
                    {a.detail} · <time dateTime={a.when}>{timeAgo(a.when)}</time>
                  </span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
