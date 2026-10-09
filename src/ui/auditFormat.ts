import { formatDate } from "./format";

/** Keys the backend stores for bookkeeping; never shown in diffs (same list as AuditTrailTimeline). */
const HIDDEN_KEYS = new Set([
  "category_name",
  "category_scope",
  "fera_linked_id",
  "date_of_reporting",
  "activity_data_unit",
  "_extra_data",
  "_isFeraRow",
  "_ecmKey",
  "extra_data",
]);

/** "activity_data" → "Activity data" (sentence case). */
export function fieldLabel(field: string): string {
  const words = field.replace(/^_+/, "").replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Action words: "manager_edit" → "Manager edit". */
export const actionLabel = fieldLabel;

export type ActionTone = "good" | "bad" | "info" | "neutral";

export function actionTone(action: string): ActionTone {
  const a = action.toLowerCase();
  if (a.includes("approve")) return "good";
  if (a.includes("reject")) return "bad";
  if (a.includes("manager")) return "info";
  return "neutral";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/;

/** Human text for an old/new value. Objects become "Label: value" lines. */
export function formatAuditValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") {
    const lines = Object.entries(value as Record<string, unknown>)
      .filter(([k]) => !HIDDEN_KEYS.has(k))
      .map(([k, v]) => `${fieldLabel(k)}: ${v !== null && typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}`);
    return lines.length ? lines.join("\n") : "—";
  }
  if (typeof value === "string" && ISO_DATE.test(value)) return formatDate(value.length === 10 ? value : new Date(value));
  if (typeof value === "number") return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
  return String(value);
}

/** Changed fields to show, hidden keys removed. */
export function visibleChanges(changed: Record<string, { old: unknown; new: unknown }>): Array<{ field: string; old: string; new: string }> {
  return Object.entries(changed)
    .filter(([k]) => !HIDDEN_KEYS.has(k))
    .map(([field, c]) => ({ field, old: formatAuditValue(c.old), new: formatAuditValue(c.new) }));
}
