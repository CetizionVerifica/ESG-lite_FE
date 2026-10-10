import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Check, RotateCw } from "lucide-react";
import { useNotifications } from "../../../context/NotificationContext";
import type { NotificationItem } from "../../../services/notificationService";
import { NotificationIcon, timeAgo, useToast } from "../../../ui";
import { useDismiss } from "../hooks/useDismiss";
import { useLatestNotifications, useMarkRead } from "../hooks/useShellQueries";
import { chromeIconButton, focusRing } from "./styles";

/**
 * Bell + popover with the last 8 unread notifications (mark one or all, "See all"),
 * and a 5s toast when a new one arrives. Badge count comes from NotificationContext.
 */
export default function BellPopover() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const navigate = useNavigate();
  const { unreadCount, latestNotification } = useNotifications();
  const latest = useLatestNotifications(open);
  const markRead = useMarkRead();
  const { refetch } = latest;
  const { toast } = useToast();
  const toasted = useRef<number | null>(null);

  // New-notification toast, once per notification, as today's top bar does.
  useEffect(() => {
    if (!latestNotification || toasted.current === latestNotification.id) return;
    toasted.current = latestNotification.id;
    const { title, message, link } = latestNotification;
    toast({ title, description: message, duration: 5000, action: link ? { label: "Open", onClick: () => navigate(link) } : undefined });
  }, [latestNotification, toast, navigate]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };
  useDismiss(rootRef, open, () => close(true));

  // A new notification while the popover is open shows up straight away.
  useEffect(() => {
    if (open && latestNotification) refetch();
  }, [open, latestNotification, refetch]);

  const openItem = (n: NotificationItem) => {
    if (!n.read) markRead.mutate(n.id);
    close(false);
    if (n.link) navigate(n.link);
  };

  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications";
  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
        className={chromeIconButton}
      >
        <Bell size={18} aria-hidden />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-(--t-bad) px-1 text-[10px] font-bold text-(--t-panel)">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          className="fixed inset-x-2 top-14 z-50 overflow-hidden rounded-(--r-lg) border border-(--t-line) bg-(--t-panel) text-(--t-ink) shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96"
        >
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-semibold">Notifications</span>
            <button
              type="button"
              disabled={unreadCount === 0 || markRead.isPending}
              onClick={() => markRead.mutate("all")}
              className={`rounded-(--r-sm) px-2 py-1 text-xs font-medium text-(--t-brand-text) hover:bg-(--t-tint) disabled:text-(--t-muted) disabled:hover:bg-transparent ${focusRing}`}
            >
              Mark all read
            </button>
          </div>
          <div className="h-px bg-(--t-line)" />

          <div className="max-h-96 overflow-y-auto">
            {latest.isPending ? (
              <ul aria-label="Loading notifications" className="space-y-3 p-4">
                {[0, 1, 2].map((i) => (
                  <li key={i} className="flex gap-3">
                    <span className="size-8 animate-pulse rounded-(--r-md) bg-(--t-tint)" />
                    <span className="flex-1 space-y-2">
                      <span className="block h-3 w-2/3 animate-pulse rounded bg-(--t-tint)" />
                      <span className="block h-3 w-full animate-pulse rounded bg-(--t-tint)" />
                    </span>
                  </li>
                ))}
              </ul>
            ) : latest.isError ? (
              <div role="alert" className="m-4 flex items-center justify-between gap-3 rounded-(--r-md) bg-(--t-bad-soft) px-3 py-2 text-sm text-(--t-bad)">
                Couldn't load notifications.
                <button type="button" onClick={() => refetch()} className={`inline-flex items-center gap-1 font-medium ${focusRing}`}>
                  <RotateCw size={14} aria-hidden /> Retry
                </button>
              </div>
            ) : latest.data.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-(--t-muted)">You're all caught up.</p>
            ) : (
              <ul>
                {latest.data.map((n) => (
                  <li key={n.id} className={`flex items-start ${n.read ? "" : "bg-(--t-info-soft)"}`}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className={`flex min-w-0 flex-1 gap-3 py-3 pl-4 pr-2 text-left hover:bg-(--t-tint) focus-visible:bg-(--t-tint) ${focusRing}`}
                    >
                      <NotificationIcon type={n.type} tile className="mt-0.5" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-semibold">{n.title}</span>
                          {!n.read && <span className="sr-only">(unread)</span>}
                        </span>
                        <span className="mt-0.5 line-clamp-2 block text-xs text-(--t-muted)">{n.message}</span>
                        <span className="mt-1 block text-[11px] text-(--t-muted)">{timeAgo(n.created_at)}</span>
                      </span>
                    </button>
                    {!n.read && (
                      <button
                        type="button"
                        aria-label={`Mark "${n.title}" as read`}
                        title="Mark as read"
                        disabled={markRead.isPending}
                        onClick={() => markRead.mutate(n.id)}
                        className={`mr-2 mt-3 rounded-(--r-sm) p-1.5 text-(--t-muted) hover:bg-(--t-tint) hover:text-(--t-ink) ${focusRing}`}
                      >
                        <Check size={16} aria-hidden />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="h-px bg-(--t-line)" />
          <button
            type="button"
            onClick={() => {
              close(false);
              navigate("/notifications");
            }}
            className={`block w-full py-2.5 text-center text-xs font-semibold text-(--t-brand-text) hover:bg-(--t-tint) ${focusRing}`}
          >
            See all
          </button>
        </div>
      )}
    </div>
  );
}
