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

// Mode matching, copied from the server (survey.ts MODE_ALIASES / matchMode) so
// the preview groups modes the way the plan will: "Train" and "Rail" are one
// line, walking and cycling get no row. Keep the two lists in step.
const SURVEY_LABELS = [
  "Rail [passenger.km]",
  "Underground or metro [passenger.km]",
  "Light rail and tram [passenger.km]",
  "Bus [passenger.km]",
  "Coach [passenger.km]",
  "Car, unknown fuel [vehicle.km]",
  "Car, petrol [vehicle.km]",
  "Car, diesel [vehicle.km]",
  "Car, hybrid [vehicle.km]",
  "Car, battery electric [vehicle.km]",
  "Motorbike [vehicle.km]",
  "Taxi [passenger.km]",
];

const MODE_ALIASES: Array<[RegExp, string]> = [
  [/^(walk(ing)?|on foot|foot|bicycle|bike|cycle|cycling|push ?bike)$/, ""], // zero emission
  [/^(underground|metro|subway|tube)$/, "Underground or metro [passenger.km]"],
  [/^(tram|light rail)$/, "Light rail and tram [passenger.km]"],
  [/^(rail|train|national rail|local train)$/, "Rail [passenger.km]"],
  [/^(bus|local bus)$/, "Bus [passenger.km]"],
  [/^coach$/, "Coach [passenger.km]"],
  [/^(car|drive|driving|car \(unknown fuel\)|car, unknown fuel)$/, "Car, unknown fuel [vehicle.km]"],
  [/^(petrol car|car, petrol|car \(petrol\))$/, "Car, petrol [vehicle.km]"],
  [/^(diesel car|car, diesel|car \(diesel\))$/, "Car, diesel [vehicle.km]"],
  [/^(hybrid car|car, hybrid|car \(hybrid\)|hybrid)$/, "Car, hybrid [vehicle.km]"],
  [/^(electric car|ev|battery electric car|car, electric|car, battery electric|car \(electric\))$/, "Car, battery electric [vehicle.km]"],
  [/^(motorbike|motorcycle|scooter|moped)$/, "Motorbike [vehicle.km]"],
  [/^(taxi|cab)$/, "Taxi [passenger.km]"],
];

const withoutUnit = (label: string) => label.replace(/\s*\[[^\]]+\]\s*$/, "");

export type ModeMatch = { kind: "mode"; label: string } | { kind: "zero" } | { kind: "unknown"; label: string };

/** A survey answer's mode → a form label, a zero-emission mode (walking, cycling), or unknown (kept as written). */
export function matchMode(raw: string): ModeMatch {
  const text = raw.trim().replace(/\s+/g, " ");
  const lower = text.toLowerCase();
  const exact = SURVEY_LABELS.find((l) => l.toLowerCase() === lower || withoutUnit(l).toLowerCase() === lower);
  if (exact) return { kind: "mode", label: exact };
  for (const [re, label] of MODE_ALIASES) if (re.test(lower)) return label ? { kind: "mode", label } : { kind: "zero" };
  return { kind: "unknown", label: text };
}

export interface ModePreview {
  /** Stable id for the line (the form label, or the survey wording when it matched none). */
  key: string;
  /** What the line shows: the form's mode without its unit, or the survey wording. */
  mode: string;
  /** False when the mode matched no form option; the plan will flag those rows. */
  matched: boolean;
  respondents: number;
  total_km: number;
}

export interface SkippedMode {
  mode: string;
  reason: "zero_emission" | "no_distance";
  respondents: number;
}

export interface SurveyPreview {
  respondents: number;
  modes: ModePreview[];
  /** Modes that get no row: walking and cycling, or no distance at all. */
  skipped: SkippedMode[];
}

/** Respondents (distinct refs; a blank ref counts as its own respondent) and km per mode, as the server sums them. */
export function previewSurvey(responses: SurveyResponse[]): SurveyPreview {
  const refs = new Set<string>();
  const byMode = new Map<string, { matched: boolean; refs: Set<string>; km: number }>();
  const zero = new Map<string, Set<string>>();
  responses.forEach((r, i) => {
    const ref = r.ref.trim() || `#${i + 1}`;
    refs.add(ref);
    const match = matchMode(r.mode);
    if (match.kind === "zero") {
      const key = r.mode.trim();
      zero.set(key, (zero.get(key) ?? new Set()).add(ref));
      return;
    }
    const entry = byMode.get(match.label) ?? { matched: match.kind === "mode", refs: new Set<string>(), km: 0 };
    entry.refs.add(ref);
    entry.km += r.one_way_km * 2 * r.days_per_week * r.weeks_per_year;
    byMode.set(match.label, entry);
  });
  const modes: ModePreview[] = [];
  const skipped: SkippedMode[] = [...zero].map(([mode, s]) => ({ mode, reason: "zero_emission" as const, respondents: s.size }));
  for (const [key, e] of byMode) {
    const mode = e.matched ? withoutUnit(key) : key;
    if (e.km <= 0) skipped.push({ mode, reason: "no_distance", respondents: e.refs.size });
    else modes.push({ key, mode, matched: e.matched, respondents: e.refs.size, total_km: Number(e.km.toFixed(6)) });
  }
  return { respondents: refs.size, modes, skipped };
}

/** A test id / DOM-safe slug of a mode line ("Car, unknown fuel" → "car-unknown-fuel"). */
export const modeSlug = (mode: string) =>
  mode
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** "scaled × 4.0 to 4,000 employees", or null until both counts are known. */
export function scaleText(respondents: number, totalEmployees: number | null): string | null {
  if (!respondents || !totalEmployees) return null;
  return `scaled × ${(totalEmployees / respondents).toFixed(1)} to ${totalEmployees.toLocaleString("en")} employees`;
}

/** Idempotency key for committing one plan version. */
export const commitKey = (planId: string, version: number) => `commuting-${planId}-v${version}`;
