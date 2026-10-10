/** What a notification is about, from its backend `type` (APPROVED, BULK_REJECTED, DEADLINE_REMINDER, …). */
export type NotificationKind = "approved" | "rejected" | "reminder" | "escalation" | "other";

export function notificationKind(type: string): NotificationKind {
  const t = type.toUpperCase();
  if (t.includes("APPROVED")) return "approved";
  if (t.includes("REJECTED")) return "rejected";
  if (t.includes("ESCALATION")) return "escalation";
  if (t.includes("REMINDER") || t.includes("DEADLINE")) return "reminder";
  return "other";
}
