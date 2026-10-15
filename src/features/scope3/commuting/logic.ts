// S3-9 commuting survey: reading the sheet and the preview by mode. The
// preview mirrors ESG-lite src/scope3/commuting/survey.ts (one-way km × 2 ×
// days per week × weeks per year, summed per mode); the server's plan is what
// gets imported, and the engine calculates every total.
import type { SurveyResponse } from "../../../services/scope3CommutingService";

/** Template columns, in order (the spec's survey sheet). */
export const SURVEY_HEADERS = ["Ref", "Mode", "One-way km", "Days per week", "Weeks per year"] as const;

/** Example rows for the template: guidance example 7.1 (three people, 48 weeks). */
export const TEMPLATE_ROWS: Array<Array<string | number>> = [
  ["A", "Rail", 10, 5, 48],
  ["B", "Rail", 10, 4, 48],
  ["B", "Car", 15, 1, 48],
  ["C", "Car", 20, 5, 48],
];

export const MAX_RESPONSES = 20_000;

type Key = keyof SurveyResponse;
const norm = (s: unknown) =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
const ALIASES: Record<Key, string[]> = {
  ref: ["ref", "reference", "employee_ref", "id", "code"],
  mode: ["mode", "commuting_mode", "transport_mode", "mode_of_transport"],
  one_way_km: ["one_way_km", "one_way_distance_km", "one_way_distance", "distance_one_way_km", "one_way"],
  days_per_week: ["days_per_week", "days_week", "days"],
  weeks_per_year: ["weeks_per_year", "weeks_year", "weeks"],
};

const toNumber = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const text = String(v ?? "").replace(/,/g, "").trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
};

export interface ParsedSurvey {
  responses: SurveyResponse[];
  /** Template columns the sheet lacks. */
  missing: string[];
  /** Row-level problems ("Row 4: Days per week must be 0 to 7."); refs are never echoed. */
  errors: string[];
}

/**
 * The sheet's first row is the header (any order, the template's names or
 * close variants); blank rows are skipped. Values are checked like the server
 * does: km ≥ 0, days per week 0–7, weeks per year 0–53.
 */
export function parseSurvey(table: unknown[][]): ParsedSurvey {
  const [header = [], ...body] = table;
  const index: Partial<Record<Key, number>> = {};
  header.forEach((h, i) => {
    const n = norm(h);
    for (const [key, names] of Object.entries(ALIASES) as Array<[Key, string[]]>) if (index[key] === undefined && names.includes(n)) index[key] = i;
  });
  const missing = (Object.keys(ALIASES) as Key[]).filter((k) => index[k] === undefined).map((k) => SURVEY_HEADERS[(Object.keys(ALIASES) as Key[]).indexOf(k)]);
  if (missing.length) return { responses: [], missing, errors: [] };

  const responses: SurveyResponse[] = [];
  const errors: string[] = [];
  const cell = (row: unknown[], key: Key) => row[index[key] as number];
  body.forEach((row, i) => {
    if (!row || row.every((c) => String(c ?? "").trim() === "")) return;
    const line = i + 2;
    const mode = String(cell(row, "mode") ?? "").trim();
    const km = toNumber(cell(row, "one_way_km"));
    const days = toNumber(cell(row, "days_per_week"));
    const weeks = toNumber(cell(row, "weeks_per_year"));
    if (!mode) errors.push(`Row ${line}: enter a mode.`);
    else if (km === null || km < 0) errors.push(`Row ${line}: One-way km must be a number of 0 or more.`);
    else if (days === null || days < 0 || days > 7) errors.push(`Row ${line}: Days per week must be 0 to 7.`);
    else if (weeks === null || weeks < 0 || weeks > 53) errors.push(`Row ${line}: Weeks per year must be 0 to 53.`);
    else responses.push({ ref: String(cell(row, "ref") ?? "").trim(), mode, one_way_km: km, days_per_week: days, weeks_per_year: weeks });
  });
  if (responses.length > MAX_RESPONSES) errors.push(`The sheet has ${responses.length.toLocaleString("en")} responses; the limit is ${MAX_RESPONSES.toLocaleString("en")}.`);
  return { responses, missing, errors };
}

export interface ModePreview {
  mode: string;
  respondents: number;
  total_km: number;
}

export interface SurveyPreview {
  respondents: number;
  modes: ModePreview[];
}

/** Respondents (distinct refs; a blank ref counts once) and km per mode, as the server sums them. */
export function previewSurvey(responses: SurveyResponse[]): SurveyPreview {
  const refs = new Set<string>();
  const byMode = new Map<string, { mode: string; refs: Set<string>; km: number }>();
  responses.forEach((r, i) => {
    const ref = r.ref.trim() || `#${i + 1}`;
    refs.add(ref);
    const key = r.mode.trim().replace(/\s+/g, " ").toLowerCase();
    const entry = byMode.get(key) ?? { mode: r.mode.trim(), refs: new Set<string>(), km: 0 };
    entry.refs.add(ref);
    entry.km += r.one_way_km * 2 * r.days_per_week * r.weeks_per_year;
    byMode.set(key, entry);
  });
  return {
    respondents: refs.size,
    modes: [...byMode.values()].map((e) => ({ mode: e.mode, respondents: e.refs.size, total_km: Number(e.km.toFixed(6)) })),
  };
}

/** "scaled × 4.0 to 4,000 employees", or null until both counts are known. */
export function scaleText(respondents: number, totalEmployees: number | null): string | null {
  if (!respondents || !totalEmployees) return null;
  return `scaled × ${(totalEmployees / respondents).toFixed(1)} to ${totalEmployees.toLocaleString("en")} employees`;
}

/** Idempotency key for committing one plan version. */
export const commitKey = (planId: string, version: number) => `commuting-${planId}-v${version}`;
