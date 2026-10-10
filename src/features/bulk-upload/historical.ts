import { MONTH_SHORT } from "../../ui";
import type { HistoricalResult } from "./api";

/** The old import's sheet format, shown as help. Column names are matched exactly. */
export const HISTORICAL_COLUMNS: { name: string; text: string }[] = [
  { name: "year", text: "Year, such as 2025" },
  { name: "month", text: "Month: January, Jan or 1" },
  { name: "equipment", text: "Equipment" },
  { name: "fuelState", text: "Fuel state, such as Gas or Liquid" },
  { name: "fuelType", text: "Fuel type, such as Natural Gas" },
  { name: "unit", text: "Activity unit, such as kWh" },
  { name: "activity", text: "Activity value" },
  { name: "emissionFactor", text: "Emission factor value" },
  { name: "emissionFactorUnit", text: "Factor unit, such as kgCO2e/kWh" },
  { name: "calculatedEmission", text: "Total in tCO₂e, used only when the activity, factor and units don't give one" },
  { name: "notes", text: "Notes (optional)" },
  { name: "email", text: "Person who reported it (optional); a new address gets an invite" },
  { name: "name", text: "That person's name (optional)" },
];

/** The backend refuses larger files. */
export const HISTORICAL_MAX_BYTES = 10 * 1024 * 1024;
export const HISTORICAL_ACCEPT = [".xlsx", ".xls"];

/** "2019-01" → "Jan 2019"; null stays empty. */
export function monthLabel(period: string | null): string {
  const m = period?.match(/^(\d{4})-(\d{2})$/);
  return m ? `${MONTH_SHORT[Number(m[2]) - 1]} ${m[1]}` : "";
}

export function historicalFileProblem(file: File): string | null {
  if (!/\.(xlsx|xls)$/i.test(file.name)) return "Choose an .xlsx or .xls file.";
  if (file.size > HISTORICAL_MAX_BYTES) return "The file is over 10 MB.";
  return null;
}

/** Rows for the skipped-rows CSV; null when nothing was skipped. */
export function historicalSkippedMatrix(result: HistoricalResult): string[][] | null {
  if (!result.skippedRows.length) return null;
  return [["Row", "Month", "Reason"], ...result.skippedRows.map((r) => [String(r.row), monthLabel(r.period), r.reason ?? ""])];
}
