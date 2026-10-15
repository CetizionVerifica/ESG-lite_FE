/**
 * Review check ids (ESG-lite docs/scope3/01-contracts.md §8) and the fixed
 * copy the review screens show for each. Stand-in written by S3-15 ahead of
 * S3-0: when S3-0 lands `src/lib/scope3/contracts.ts` / `labels.ts`, the ids
 * move there and this file keeps the labels and helpers.
 *
 * Pages never write their own check copy: every label, hint and icon name
 * comes from here.
 */

export const CHECK_IDS = [
  "FACTOR_FOUND",
  "UNIT_OK",
  "EVIDENCE_ATTACHED",
  "WITHIN_THRESHOLD",
  "NO_DUPLICATE",
  "IMPORT_MATCH_SURE",
  "METHOD_GIVEN",
  "DQ_ACCEPTABLE",
] as const;

export type CheckId = (typeof CHECK_IDS)[number];

/** `emission.checks` as the API sends it; `null` while a pending row hasn't been checked yet. */
export type RowChecks = { ready: boolean; held: CheckId[] };

/** Icon names; `src/ui/CheckChip` maps them to icons. */
export type CheckIcon = "factor" | "unit" | "evidence" | "trend" | "duplicate" | "import" | "method" | "quality";

/**
 * Values some labels name: the factor year FACTOR_FOUND looks for (see
 * `factorYearFor`) and the company's change limit.
 */
export type CheckContext = { year?: number | null; pct?: number | null };

/**
 * The factor year FACTOR_FOUND looks for: the entry's reporting year − 1, as
 * the backend's `targetYearFor` reads it from the date (a 2026 entry uses 2025
 * factors). `null` when the date can't be read.
 */
export function factorYearFor(dateOfReporting: string | null | undefined): number | null {
  const y = Number(String(dateOfReporting ?? "").slice(0, 4));
  return Number.isInteger(y) && y > 1 ? y - 1 : null;
}

type CheckCopy = {
  icon: CheckIcon;
  /** Shown when the check passed. */
  pass: (c: CheckContext) => string;
  /** Shown when the check held the row back: the reason chip's word. */
  held: (c: CheckContext) => string;
  /** One plain sentence on what the check looks at. */
  hint: (c: CheckContext) => string;
};

/** The threshold the hint names when the company's can't be read (the backend's default too). */
export const DEFAULT_THRESHOLD_PCT = 5;

const yearOf = (c: CheckContext) => (c.year ? String(c.year) : "this year");
const pctOf = (c: CheckContext) => `${c.pct ?? DEFAULT_THRESHOLD_PCT} %`;

export const CHECK_COPY: Record<CheckId, CheckCopy> = {
  FACTOR_FOUND: {
    icon: "factor",
    pass: (c) => `Factor found for ${yearOf(c)}`,
    held: (c) => `No factor for ${yearOf(c)}`,
    hint: (c) => `No emission factor for ${yearOf(c)} matched this entry, so an earlier year's factor was used or none at all.`,
  },
  UNIT_OK: {
    icon: "unit",
    pass: () => "Unit matches the factor",
    held: () => "Unit doesn't match",
    hint: () => "The entry's unit can't be converted to the factor's unit.",
  },
  EVIDENCE_ATTACHED: {
    icon: "evidence",
    pass: () => "Evidence attached",
    held: () => "No evidence",
    hint: () => "No invoice, bill or other document is attached to this entry.",
  },
  WITHIN_THRESHOLD: {
    icon: "trend",
    pass: (c) => `Within your ${pctOf(c)} change limit`,
    held: (c) => `Over your ${pctOf(c)} change limit`,
    hint: (c) => `Changed by more than ${pctOf(c)} from the previous month for the same site, category and activity.`,
  },
  NO_DUPLICATE: {
    icon: "duplicate",
    pass: () => "No duplicate",
    held: () => "Possible duplicate",
    hint: () => "Another entry has the same site, category, activity, period and amount.",
  },
  IMPORT_MATCH_SURE: {
    icon: "import",
    pass: () => "Import match is sure",
    held: () => "Smart import unsure",
    hint: () => "The smart import matched this row below 80 %, or the row was changed before the import.",
  },
  METHOD_GIVEN: {
    icon: "method",
    pass: () => "Method given",
    held: () => "No method chosen",
    hint: () => "A Scope 3 entry needs the calculation method it used.",
  },
  DQ_ACCEPTABLE: {
    icon: "quality",
    pass: () => "Data quality acceptable",
    held: () => "Data quality too low",
    hint: () => "Overall data quality is below Fair and there's no note explaining why.",
  },
};

export const isCheckId = (value: unknown): value is CheckId => typeof value === "string" && (CHECK_IDS as readonly string[]).includes(value);

/**
 * The checks on a row as the API sent them, cleaned: unknown ids are dropped,
 * `ready` is true only with nothing held. `undefined` when the API sends no
 * `checks` field at all (an ESG-lite without S3-15), `null` when it sends null.
 */
export function readChecks(raw: unknown): RowChecks | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || typeof raw !== "object") return null;
  const held = Array.isArray((raw as { held?: unknown }).held) ? [...new Set((raw as { held: unknown[] }).held.filter(isCheckId))] : [];
  // Fixed order, so chips read the same on every row.
  held.sort((a, b) => CHECK_IDS.indexOf(a) - CHECK_IDS.indexOf(b));
  const ready = (raw as { ready?: unknown }).ready === true && held.length === 0;
  return { ready, held };
}

/** Ready rows pass every check; a row without checks (null) needs attention. */
export function isReady(checks: RowChecks | null | undefined): boolean {
  return !!checks && checks.ready && checks.held.length === 0;
}

export type ReviewGroup = "ready" | "attention";

/** `?group=`: "ready" or "attention"; anything else shows both. */
export function parseGroup(value: string | null | undefined): ReviewGroup | null {
  return value === "ready" || value === "attention" ? value : null;
}

/** Splits pending rows into ready and needs attention. Only pending rows are grouped; others are left out. */
export function groupRows<T extends { status: string; checks?: unknown }>(rows: T[]): { ready: T[]; attention: T[] } {
  const ready: T[] = [];
  const attention: T[] = [];
  for (const row of rows) {
    if (row.status !== "pending") continue;
    (isReady(readChecks(row.checks)) ? ready : attention).push(row);
  }
  return { ready, attention };
}

export type CheckLine = { id: CheckId; passed: boolean; label: string; hint: string; icon: CheckIcon };

/**
 * Every check with pass or fail, in contract order, for "Why held". The
 * server's `held` decides; nothing is passed here on its behalf.
 */
export function checkLines(checks: RowChecks, c: CheckContext = {}): CheckLine[] {
  return CHECK_IDS.map((id) => {
    const passed = !checks.held.includes(id);
    const copy = CHECK_COPY[id];
    return { id, passed, label: passed ? copy.pass(c) : copy.held(c), hint: copy.hint(c), icon: copy.icon };
  });
}

/** The reason chip for one held check. */
export function heldChip(id: CheckId, c: CheckContext = {}): { label: string; hint: string; icon: CheckIcon } {
  const copy = CHECK_COPY[id];
  return { label: copy.held(c), hint: copy.hint(c), icon: copy.icon };
}
