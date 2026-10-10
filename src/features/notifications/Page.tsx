import { type KeyboardEvent, useEffect, useId, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { BellOff, CheckCheck, RotateCw } from "lucide-react";
import { useNotifications } from "../../context/NotificationContext";
import type { NotificationItem } from "../../services/notificationService";
import { Button, EmptyState, PageHeader, Skeleton, TabPanel, Tabs, useToast } from "../../ui";
import { notificationKeys, useMarkNotificationsRead, useNotificationList } from "./api";
import { NotificationRow } from "./components/NotificationRow";
import { PAGE_SIZE, TABS, TAB_LABEL, type Tab, emptyText, groupByDate, parsePage, parseTab } from "./logic";

/** Arrow keys move between rows; Home/End jump to the first/last. */
function moveRowFocus(e: KeyboardEvent<HTMLElement>) {
  const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
  if (!keys.includes(e.key)) return;
  const rows = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>("[data-row-toggle]"));
  const at = rows.findIndex((r) => r === document.activeElement || r.parentElement?.contains(document.activeElement));
  if (at < 0) return;
  e.preventDefault();
  const next = e.key === "Home" ? 0 : e.key === "End" ? rows.length - 1 : Math.min(rows.length - 1, Math.max(0, at + (e.key === "ArrowDown" ? 1 : -1)));
  rows[next]?.focus();
}

/** P13 · Notifications: everything sent to the signed-in user, by type and day. */
export default function NotificationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const idBase = useId();
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get("tab"));
  const page = parsePage(params.get("page"));
  const { unreadCount, latestNotification } = useNotifications();
  const list = useNotificationList(tab, page);
  const mark = useMarkNotificationsRead();
  const [expanded, setExpanded] = useState<number | null>(null);

  // A new notification reloads the list (the badge already knows).
  useEffect(() => {
    if (latestNotification) void queryClient.invalidateQueries({ queryKey: notificationKeys.lists });
  }, [latestNotification, queryClient]);

  const setView = (next: { tab: Tab } | { page: number }) => {
    const t = "tab" in next ? next.tab : tab;
    const pg = "page" in next ? next.page : 1;
    const entries = [...params.entries()].filter(([k]) => k !== "tab" && k !== "page");
    if (t !== "all") entries.push(["tab", t]);
    if (pg > 1) entries.push(["page", String(pg)]);
    setParams(new URLSearchParams(entries));
    setExpanded(null);
  };

  const markRead = (id: number | "all") =>
    mark.mutate(id, {
      onError: () => toast({ title: id === "all" ? "Couldn't mark everything read" : "Couldn't mark it read", tone: "bad" }),
    });

  const toggle = (n: NotificationItem) => {
    if (!n.read) markRead(n.id);
    setExpanded((cur) => (cur === n.id ? null : n.id));
  };

  const items = list.data?.notifications ?? [];
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const groups = groupByDate(items);
  const empty = emptyText(tab);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      <PageHeader
        title="Notifications"
        description={unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        primaryAction={{
          label: "Mark all read",
          icon: <CheckCheck aria-hidden className="size-4" />,
          onClick: () => markRead("all"),
          disabled: unreadCount === 0,
          loading: mark.isPending && mark.variables === "all",
        }}
      />

      <Tabs
        label="Notification type"
        idBase={idBase}
        items={TABS.map((t) => ({ value: t, label: TAB_LABEL[t] }))}
        value={tab}
        onChange={(t) => setView({ tab: t })}
      />

      <TabPanel idBase={idBase} value={tab} current={tab}>
        {list.isPending ? (
          <ul aria-label="Loading notifications" className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="flex gap-3 rounded-card border border-line p-4">
                <Skeleton className="size-8 rounded-control" />
                <span className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="h-3 w-4/5" />
                </span>
              </li>
            ))}
          </ul>
        ) : list.isError ? (
          <EmptyState
            variant="error"
            title="Couldn't load notifications"
            description="Check your connection and try again."
            action={
              <Button icon={<RotateCw aria-hidden className="size-4" />} onClick={() => void list.refetch()}>
                Retry
              </Button>
            }
          />
        ) : items.length === 0 ? (
          <EmptyState icon={BellOff} title={empty.title} description={empty.description} />
        ) : (
          <div className="space-y-6" onKeyDown={moveRowFocus}>
            {groups.map((g) => (
              <section key={g.label} aria-labelledby={`${idBase}-${g.label}`}>
                <h2 id={`${idBase}-${g.label}`} className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  {g.label}
                </h2>
                <ul className="space-y-2">
                  {g.items.map((n) => (
                    <NotificationRow
                      key={n.id}
                      item={n}
                      expanded={expanded === n.id}
                      onToggle={() => toggle(n)}
                      onMarkRead={() => markRead(n.id)}
                      onOpen={(link) => navigate(link)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {pages > 1 && !list.isError && (
          <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-3 text-sm text-muted">
            <Button size="sm" disabled={page <= 1} onClick={() => setView({ page: page - 1 })}>
              Previous
            </Button>
            <span>
              Page {Math.min(page, pages)} of {pages}
            </span>
            <Button size="sm" disabled={page >= pages} onClick={() => setView({ page: page + 1 })}>
              Next
            </Button>
          </nav>
        )}
      </TabPanel>
    </div>
  );
}
