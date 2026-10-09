/** Record status words used across the app (copy: Pending / Approved / Rejected / Missing). */
export type Status = "pending" | "approved" | "rejected" | "missing" | "draft";

export const STATUSES: Status[] = ["pending", "approved", "rejected", "missing", "draft"];

export function isStatus(value: unknown): value is Status {
  return typeof value === "string" && (STATUSES as string[]).includes(value);
}
