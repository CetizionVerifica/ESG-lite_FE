import type { NotificationItem, NotificationTypeGroup } from "../../services/notificationService";
import { notificationKind } from "../../ui";

export const TABS = ["all", "unread", "approvals", "rejections", "reminders"] as const;
export type Tab = (typeof TABS)[number];

export const TAB_LABEL: Record<Tab, string> = {
  all: "All",
  unread: "Unread",
  approvals: "Approvals",
  rejections: "Rejections",
  reminders: "Reminders",
};

export const PAGE_SIZE = 30;

export function parseTab(v: string | null): Tab {
  return (TABS as readonly string[]).includes(v ?? "") ? (v as Tab) : "all";
}

export function parsePage(v: string | null): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 1 ? n : 1;
}

/** Server query for a tab: unread flag and the backend's type group. */
export function tabQuery(tab: Tab): { unreadOnly: boolean; type: NotificationTypeGroup | null } {
  if (tab === "unread") return { unreadOnly: true, type: null };
  if (tab === "all") return { unreadOnly: false, type: null };
  return { unreadOnly: false, type: tab };
}

/**
 * Whether a notification belongs on a tab. The server filters already; this
 * keeps the current page right when talking to a backend without `type`.
 * Reminders cover REMINDER, DEADLINE and ESCALATION alike.
 */
export function matchesTab(n: Pick<NotificationItem, "type" | "read">, tab: Tab): boolean {
  const kind = notificationKind(n.type);
  switch (tab) {
    case "all":
      return true;
    case "unread":
      return !n.read;
    case "approvals":
      return kind === "approved";
    case "rejections":
      return kind === "rejected";
    case "reminders":
      return kind === "reminder" || kind === "escalation";
  }
}

export type DateGroup = "Today" | "Yesterday" | "This week" | "Earlier";

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Calendar-day buckets in the viewer's time zone; "This week" is the 7 days up to yesterday. */
export function dateGroup(dateStr: string, now: Date = new Date()): DateGroup {
  const days = Math.round((startOfDay(now) - startOfDay(new Date(dateStr))) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  return "Earlier";
}

/** Groups in display order, keeping the server's newest-first order inside each. */
export function groupByDate<T extends { created_at: string }>(items: T[], now: Date = new Date()): { label: DateGroup; items: T[] }[] {
  const groups: { label: DateGroup; items: T[] }[] = [];
  for (const item of items) {
    const label = dateGroup(item.created_at, now);
    const g = groups.find((x) => x.label === label);
    if (g) g.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

export type NotificationDetails = {
  /** The message without the trailing ". Reason: …" (the reason shows on its own). */
  summary: string;
  reviewer: string | null;
  reason: string | null;
};

/**
 * Reviewer and reason. Prefer the structured `meta` the backend writes since
 * P13; rows written before that only have them inside the message text.
 */
export function notificationDetails(n: Pick<NotificationItem, "message" | "meta">): NotificationDetails {
  const at = n.message.indexOf(". Reason: ");
  const summary = at >= 0 ? n.message.slice(0, at) : n.message;
  const parsedReason = at >= 0 ? n.message.slice(at + ". Reason: ".length).trim() || null : null;
  const parsedReviewer = summary.match(/\b(?:approved|rejected) by (.+)$/i)?.[1]?.trim() || null;
  const meta = n.meta ?? null;
  return {
    summary,
    reviewer: meta?.reviewer?.trim() || parsedReviewer,
    reason: meta ? meta.reason?.trim() || parsedReason : parsedReason,
  };
}

/** "Approved by" / "Rejected by" / "By". */
export function reviewerLabel(type: string): string {
  const kind = notificationKind(type);
  if (kind === "approved") return "Approved by";
  if (kind === "rejected") return "Rejected by";
  return "By";
}

export function emptyText(tab: Tab): { title: string; description: string } {
  if (tab === "unread") return { title: "No unread notifications", description: "You're all caught up." };
  if (tab === "all") return { title: "No notifications yet", description: "You'll see approvals, rejections and reminders here." };
  return { title: `No ${TAB_LABEL[tab].toLowerCase()}`, description: "Nothing of this type yet." };
}
