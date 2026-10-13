// Moving a saved entry to another period (My entries and the manager edit).
import type { EmissionData } from "../../services/emissionService";

/** "YYYY-MM" of a monthly entry. */
export const entryMonth = (entry: Pick<EmissionData, "date_of_reporting">) => entry.date_of_reporting.slice(0, 7);

/** Month-end date of "YYYY-MM", where Add data files monthly entries. */
export function monthEndDate(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}

/**
 * The date to save. A yearly entry keeps its period-end date; a monthly entry
 * keeps its own date while its month is unchanged, else moves to the new
 * month's end.
 */
export function editedDate(entry: Pick<EmissionData, "date_of_reporting" | "reporting_period">, month: string): string {
  const original = entry.date_of_reporting.slice(0, 10);
  if (entry.reporting_period === "yearly" || month === entryMonth(entry)) return original;
  return monthEndDate(month);
}

/**
 * Months a monthly entry can move to: its own calendar year, up to this month.
 * The backend picks the factor from the entry's stored date before applying a
 * new one, so a move across years would be recalculated with the old year's factor.
 */
export function monthBounds(entry: Pick<EmissionData, "date_of_reporting">, today = new Date()): { min: string; max: string } {
  const year = entry.date_of_reporting.slice(0, 4);
  const now = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const end = `${year}-12`;
  return { min: `${year}-01`, max: end < now ? end : now };
}
