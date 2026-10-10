import { formatDate } from "./format";

/** "just now", "5m ago", "3h ago", "2d ago", then the date ("19 Sep 2026"). */
export function timeAgo(dateStr: string, now: number = Date.now()): string {
  const seconds = Math.floor((now - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(dateStr);
}
