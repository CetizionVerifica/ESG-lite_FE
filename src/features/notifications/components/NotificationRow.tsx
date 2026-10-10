import { useId } from "react";
import { Check, ChevronDown, ExternalLink } from "lucide-react";
import type { NotificationItem } from "../../../services/notificationService";
import { Button, NotificationIcon, cn, focusRing, formatDateTime, timeAgo } from "../../../ui";
import { notificationDetails, reviewerLabel } from "../logic";

export type NotificationRowProps = {
  item: NotificationItem;
  expanded: boolean;
  onToggle: () => void;
  onMarkRead: () => void;
  onOpen: (link: string) => void;
};

/** One notification: a summary line that expands to who, why, when and a link. */
export function NotificationRow({ item: n, expanded, onToggle, onMarkRead, onOpen }: NotificationRowProps) {
  const detailsId = useId();
  const d = notificationDetails(n);
  return (
    <li className={cn("rounded-card border border-line", n.read ? "bg-panel" : "bg-info-soft")}>
      <div className="flex items-start gap-1 pr-2">
        <button
          type="button"
          data-row-toggle
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={onToggle}
          className={cn("flex min-w-0 flex-1 items-start gap-3 rounded-card px-4 py-3 text-left hover:bg-tint", focusRing)}
        >
          <NotificationIcon type={n.type} tile className="mt-0.5" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className={cn("truncate text-sm text-ink", n.read ? "font-medium" : "font-semibold")}>{n.title}</span>
              {!n.read && (
                <>
                  <span aria-hidden className="size-2 shrink-0 rounded-full bg-info" />
                  <span className="sr-only">(unread)</span>
                </>
              )}
              <span className="ml-auto shrink-0 pl-2 text-xs text-muted">{timeAgo(n.created_at)}</span>
            </span>
            <span className={cn("mt-0.5 block text-sm text-muted", !expanded && "line-clamp-1")}>{d.summary}</span>
          </span>
          <ChevronDown aria-hidden className={cn("mt-1.5 size-4 shrink-0 text-muted transition-transform", expanded && "rotate-180")} />
        </button>
        {!n.read && (
          <button
            type="button"
            aria-label={`Mark "${n.title}" as read`}
            title="Mark as read"
            onClick={onMarkRead}
            className={cn("mt-3 rounded-control p-1.5 text-muted hover:bg-tint hover:text-ink", focusRing)}
          >
            <Check aria-hidden className="size-4" />
          </button>
        )}
      </div>

      {expanded && (
        <div id={detailsId} className="space-y-3 border-t border-line px-4 py-3 text-sm sm:pl-15">
          <dl className="grid gap-3 sm:grid-cols-2">
            {d.reviewer && (
              <div>
                <dt className="text-xs font-medium text-muted">{reviewerLabel(n.type)}</dt>
                <dd className="mt-0.5 text-ink">{d.reviewer}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-medium text-muted">Date</dt>
              <dd className="mt-0.5 text-ink">{formatDateTime(n.created_at)}</dd>
            </div>
            {d.reason && (
              <div className="rounded-control bg-bad-soft px-3 py-2 sm:col-span-2">
                <dt className="text-xs font-medium text-bad">Reason</dt>
                <dd className="mt-0.5 text-ink">{d.reason}</dd>
              </div>
            )}
          </dl>
          {n.link && (
            <Button size="sm" icon={<ExternalLink aria-hidden className="size-4" />} onClick={() => onOpen(n.link as string)}>
              Open
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
