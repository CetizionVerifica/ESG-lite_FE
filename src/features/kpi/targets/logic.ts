/**
 * KPI-9 · Targets logic (pure): how a target reads ("−20 % by 2030 from
 * 2024"), the direction a pair of values suggests, the form's checks, and the
 * status to show. Progress itself is the server's (`progress.ts`).
 */
import type { KpiTargetWithProgress, PutKpiTargetBody, TargetDirection, TargetStatus } from "../../../lib/kpi/contracts";
import { formatNumber } from "../../../ui/format";

export { suggestDirection, targetText } from "../../../lib/kpi/targets";

export interface TargetForm {
  id?: number;
  kpiId: number | null;
  siteId: number | null;
  baselineYear: number | null;
  baselineValue: number | null;
  targetYear: number | null;
  targetValue: number | null;
  direction: TargetDirection;
  note: string;
}

export const emptyForm = (thisYear: number): TargetForm => ({ kpiId: null, siteId: null, baselineYear: thisYear - 1, baselineValue: null, targetYear: 2030 > thisYear ? 2030 : thisYear + 5, targetValue: null, direction: "reduce", note: "" });

export const formOf = (t: KpiTargetWithProgress): TargetForm => ({
  id: t.id,
  kpiId: t.kpi_definition_id,
  siteId: t.site_id,
  baselineYear: t.baseline_year,
  baselineValue: t.baseline_value,
  targetYear: t.target_year,
  targetValue: t.target_value,
  direction: t.direction,
  note: t.note ?? "",
});

export type FormErrors = Partial<Record<"kpi" | "baselineYear" | "baselineValue" | "targetYear" | "targetValue" | "direction" | "note", string>>;

/**
 * The same checks the server makes (KPI-9 build 1), worded for the form. A
 * baseline that isn't the approved figure (`typedBaseline`) needs a note on
 * where it came from.
 */
export function checkForm(f: TargetForm, opts: { typedBaseline?: boolean } = {}): FormErrors {
  const e: FormErrors = {};
  if (opts.typedBaseline && f.baselineValue !== null && !f.note.trim()) e.note = "Say where the baseline came from: it isn't an approved figure in ESGLite.";
  if (!f.kpiId) e.kpi = "Pick a KPI.";
  if (!f.baselineYear) e.baselineYear = "Pick the baseline year.";
  if (f.baselineValue === null) e.baselineValue = "Add the baseline value.";
  if (!f.targetYear) e.targetYear = "Pick the target year.";
  else if (f.baselineYear && f.targetYear <= f.baselineYear) e.targetYear = "The target year comes after the baseline year.";
  if (f.targetValue === null) e.targetValue = "Add the target value.";
  if (f.baselineValue !== null && f.targetValue !== null) {
    if (f.direction === "reduce" && f.targetValue >= f.baselineValue) e.direction = "To reduce, the target must be lower than the baseline.";
    if (f.direction === "increase" && f.targetValue <= f.baselineValue) e.direction = "To increase, the target must be higher than the baseline.";
  }
  return e;
}

export function toBody(f: TargetForm): PutKpiTargetBody {
  return {
    ...(f.id ? { id: f.id } : {}),
    kpi_definition_id: f.kpiId as number,
    site_id: f.siteId,
    baseline_year: f.baselineYear as number,
    baseline_value: f.baselineValue as number,
    target_year: f.targetYear as number,
    target_value: f.targetValue as number,
    direction: f.direction,
    note: f.note.trim() || null,
  };
}

/** The server's status, or "no data" when it has no current value. */
export const statusOf = (t: Pick<KpiTargetWithProgress, "status" | "progress_pct">): TargetStatus => t.status ?? (t.progress_pct === null || t.progress_pct === undefined ? "no_data" : "on_track");

/** Bar width: the server's percent, kept inside the bar. */
export const barWidth = (pct: number | null | undefined) => (pct === null || pct === undefined || !Number.isFinite(pct) ? 0 : Math.max(0, Math.min(100, pct)));

/** "35 % of the way" / "No approved value yet". */
export const progressText = (pct: number | null | undefined) => (pct === null || pct === undefined ? "No approved value yet" : `${formatNumber(pct, pct % 1 ? 1 : 0)} % of the way`);

/** Years a baseline can be: from five years before KPI tracking started up to last year. */
export function baselineYears(firstYear: number, thisYear: number): number[] {
  const out: number[] = [];
  for (let y = thisYear; y >= Math.min(firstYear, thisYear) - 5; y -= 1) out.push(y);
  return out;
}

export function targetYears(from: number): number[] {
  return Array.from({ length: 26 }, (_, i) => from + 1 + i);
}
