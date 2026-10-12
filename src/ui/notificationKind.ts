/** What a notification is about, from its backend `type` (APPROVED, BULK_REJECTED, DEADLINE_REMINDER, UPLOAD_PENDING, …). */
export type NotificationKind = "approved" | "rejected" | "reminder" | "escalation" | "upload" | "other";

/** Short label for a kind, for filters and tiles. */
export const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  approved: "Approved",
  rejected: "Rejected",
  reminder: "Reminder",
  escalation: "Escalation",
  upload: "Waiting for review",
  other: "Notice",
};

export function notificationKind(type: string): NotificationKind {
  const t = type.toUpperCase();
  if (t.includes("APPROVED")) return "approved";
  if (t.includes("REJECTED")) return "rejected";
  if (t.includes("ESCALATION")) return "escalation";
  if (t.includes("REMINDER") || t.includes("DEADLINE")) return "reminder";
  if (t.includes("UPLOAD")) return "upload"; // IM4: an import batch waiting for review
  return "other";
}
