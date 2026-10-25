import type { PeriodModeConflict } from "../../../services/emissionService";

/**
 * How the period is filed instead (#246), for "it is filed …": "monthly", "yearly", or
 * "under CY" / "under FY" when yearly data of the other calendar overlaps the year.
 */
export function filedAs(mode: "monthly" | "yearly", conflict: PeriodModeConflict | null | undefined): string {
  if (mode === "monthly") return "yearly";
  if (conflict?.conflicting_period === "yearly" && conflict.conflicting_year_type) return `under ${conflict.conflicting_year_type}`;
  return "monthly";
}

/** The title of the "filed the other way" note: monthly entries, yearly data, or the other calendar's yearly data. */
export function periodLockTitle(mode: "monthly" | "yearly", conflict: PeriodModeConflict | null | undefined): string {
  return mode === "monthly" ? "Filed yearly for this period" : `Filed ${filedAs(mode, conflict)} for this year`;
}
