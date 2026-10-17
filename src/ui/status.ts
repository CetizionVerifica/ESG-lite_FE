/** Record status words used across the app (copy: Draft / Pending / Approved / Rejected / Missing / Locked). */
export type Status = "pending" | "approved" | "rejected" | "missing" | "draft" | "locked";

export const STATUSES: Status[] = ["pending", "approved", "rejected", "missing", "draft", "locked"];

export function isStatus(value: unknown): value is Status {
  return typeof value === "string" && (STATUSES as string[]).includes(value);
}
