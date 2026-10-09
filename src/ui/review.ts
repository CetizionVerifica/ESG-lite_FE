// Shared review rules for approval lists (P07 emissions, P08 production).

export const REJECT_MIN = 5;
export const SUGGESTED_REASONS = ["Wrong unit", "Missing invoice", "Duplicate", "Wrong period"];

/** Error text for a reject reason, or null when it is long enough. */
export function rejectReasonError(reason: string): string | null {
  return reason.trim().length >= REJECT_MIN ? null : `Give a reason of at least ${REJECT_MIN} characters`;
}

/** Index of the row to focus after J/K, clamped to the list. */
export function stepIndex(current: number, delta: number, count: number): number {
  if (count === 0) return -1;
  if (current < 0) return delta > 0 ? 0 : count - 1;
  return Math.min(count - 1, Math.max(0, current + delta));
}
