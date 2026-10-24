/**
 * KPI-11 · Framework report logic (pure): tab names, rows grouped by section,
 * the value as the server sends it (already in the framework's unit), the
 * year columns and the omissions' words. No figure is worked out here.
 */
import type { FrameworkCode, KpiFrameworkReport, KpiReportOmission, KpiReportRow, YearType } from "../../../lib/kpi/contracts";
import { ESRS_TOPIC_LABEL, FIT_LABEL, FRAMEWORK_LABEL, OMISSION_KIND_LABEL, REQUIREMENT_LABEL } from "../../../lib/kpi/labels";
import { formatWithUnit } from "../../../lib/kpi/units";

/** "GRI content index", "BRSR", "ESRS". */
export const tabLabel = (f: FrameworkCode) => (f === "GRI" ? "GRI content index" : FRAMEWORK_LABEL[f]);

/** Downloads per framework (D12): XLSX for all, the branded PDF for the GRI content index. */
export const formatsFor = (f: FrameworkCode): ("xlsx" | "pdf")[] => (f === "GRI" ? ["xlsx", "pdf"] : ["xlsx"]);

export function groupBySection(rows: KpiReportRow[]): { section: string; rows: KpiReportRow[] }[] {
  const out: { section: string; rows: KpiReportRow[] }[] = [];
  for (const r of rows) {
    const g = out.find((x) => x.section === r.section);
    if (g) g.rows.push(r);
    else out.push({ section: r.section || "Other", rows: [r] });
  }
  return out;
}

/** Decimals the server's figure has (up to 3): a report shows it as sent, never rounded to look tidier. */
export function placesOf(v: number): number {
  const text = String(Number(v.toFixed(3)));
  return text.includes(".") ? text.length - text.indexOf(".") - 1 : 0;
}

/** "173,560 GJ", "512.4 tCO₂e", a narrative answer, or "—". */
export function reportValue(v: KpiReportRow["value"] | undefined, unit: string | null): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return formatWithUnit(v, unit, placesOf(v));
  return v;
}

/** The year columns: "2026" and "2025", or "FY 2026-27" and "FY 2025-26". */
export function yearLabel(year: number, yearType: YearType): string {
  return yearType === "FY" ? `FY ${year}-${String((year + 1) % 100).padStart(2, "0")}` : String(year);
}

/** "Partial: ESRS asks for consumption…", or the note, or nothing. */
export function rowNote(r: Pick<KpiReportRow, "notes" | "fit">): string | null {
  if (r.fit && r.fit !== "exact") return r.notes ? `${FIT_LABEL[r.fit]}: ${r.notes}` : FIT_LABEL[r.fit];
  return r.notes;
}

/** "BRSR Core", "If material" … for the status column. */
export const requirementText = (r: Pick<KpiReportRow, "requirement">) => (r.requirement ? REQUIREMENT_LABEL[r.requirement] : null);

/** "Not material: No site is in or next to a protected area." */
export function omissionText(o: KpiReportOmission): string {
  const kind = o.kind ? OMISSION_KIND_LABEL[o.kind] : null;
  if (!kind || !o.reason) return kind ?? o.reason;
  // "No approved value for 2026 yet." already says it; don't say it twice.
  if (o.reason.toLowerCase().startsWith(kind.toLowerCase())) return o.reason;
  return `${kind}: ${o.reason}`;
}

/** "E4 Biodiversity and ecosystems" for a topic, else the disclosure's title. */
export const omissionTitle = (o: KpiReportOmission) => (o.kind === "not_material" && o.esrs_topic ? `${o.esrs_topic} ${ESRS_TOPIC_LABEL[o.esrs_topic]}` : o.title);

/** "2 values are pending review and aren't in this report yet." */
export function pendingText(r: Pick<KpiFrameworkReport, "pending_count">): string | null {
  const n = r.pending_count;
  if (!n) return null;
  return `${n} ${n === 1 ? "value is" : "values are"} pending review and ${n === 1 ? "isn't" : "aren't"} in this report yet.`;
}

/** The download's file name when the server doesn't name it. */
export const fallbackName = (f: FrameworkCode, year: number, format: "xlsx" | "pdf") => `${f}-${year}${f === "GRI" && format === "pdf" ? "-content-index" : ""}.${format}`;
