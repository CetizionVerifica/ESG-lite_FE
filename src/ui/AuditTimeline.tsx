import { History } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getAuditLogs, type AuditLogEntry } from "../services/auditLogService";
import { Avatar } from "./Avatar";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { SkeletonText } from "./Skeleton";
import { cn } from "./cn";
import { actionLabel, actionTone, fieldLabel, visibleChanges } from "./auditFormat";
import { formatDateTime } from "./format";

export type AuditTimelineProps = {
  entries: AuditLogEntry[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
};

/** Change history: who, when, action, old → new per field, and the reason. Newest first, as the API returns. */
export function AuditTimeline({ entries, loading, error, onRetry, className }: AuditTimelineProps) {
  if (loading) return <SkeletonText lines={4} className={className} />;
  if (error)
    return (
      <EmptyState compact variant="error" title={error} action={onRetry && <Button size="sm" onClick={onRetry}>Try again</Button>} className={className} />
    );
  if (entries.length === 0) return <EmptyState compact icon={History} title="No changes since this was created." className={className} />;

  return (
    <ol className={cn("relative space-y-5 border-l border-line pl-5", className)}>
      {entries.map((e) => {
        const changes = visibleChanges(e.changed_fields ?? {});
        return (
          <li key={e.id} className="relative">
            <span aria-hidden className="absolute -left-[27px] top-1 size-3 rounded-full border-2 border-panel bg-brand" />
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Avatar name={e.changed_by?.name ?? "Unknown"} size="sm" />
              <span className="text-sm font-medium text-ink">{e.changed_by?.name ?? "Unknown user"}</span>
              {e.changed_by?.role && <Badge>{fieldLabel(e.changed_by.role)}</Badge>}
              <Badge tone={actionTone(e.action)}>{actionLabel(e.action)}</Badge>
              <time dateTime={e.changed_at} className="ml-auto text-xs text-muted">
                {formatDateTime(e.changed_at)}
              </time>
            </div>
            {changes.length > 0 && (
              <dl className="mt-2 space-y-2">
                {changes.map((c) => (
                  <div key={c.field} className="text-sm">
                    <dt className="text-xs font-medium text-muted">{fieldLabel(c.field)}</dt>
                    <dd className="mt-0.5 flex flex-wrap items-start gap-2">
                      <span className="whitespace-pre-wrap break-words rounded-chip bg-tint px-1.5 py-0.5 text-muted line-through decoration-muted/60">
                        <span className="sr-only">Before: </span>
                        {c.old}
                      </span>
                      <span aria-hidden className="text-muted">→</span>
                      <span className="whitespace-pre-wrap break-words rounded-chip bg-tint px-1.5 py-0.5 text-ink">
                        <span className="sr-only">After: </span>
                        {c.new}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {e.reason && (
              <p className="mt-2 rounded-control bg-warn-soft px-2.5 py-1.5 text-sm text-ink">
                <span className="font-medium">Reason:</span> {e.reason}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Fetches /user/audit-logs for one record (TanStack Query) and renders it. Put it in a Drawer tab. */
export function EntityAuditTimeline({ entityType, entityId, className }: { entityType: "emission" | "production_data"; entityId: number; className?: string }) {
  const q = useQuery({ queryKey: ["audit-logs", entityType, entityId], queryFn: () => getAuditLogs(entityType, entityId) });
  return (
    <AuditTimeline
      entries={q.data ?? []}
      loading={q.isPending}
      error={q.isError ? "Couldn't load the change history." : null}
      onRetry={() => void q.refetch()}
      className={className}
    />
  );
}
