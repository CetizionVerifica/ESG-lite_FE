/** Pure helpers for the smart import flow (XI4). No React, no requests. */
import { writeContext } from "../../../ui";
import type { PlanSummary } from "../../../services/excelService";
import type { PreviewRow } from "../logic";
import { CONFIRM_BELOW, type FieldMapping, type IssueSeverity, type MappingProposal, type MappingSource, type ProposedActivityMatch, type ResolvedCategory, type SheetPeriod, type SheetProposal, type SheetSource } from "./types";

export const SMART_STEPS = [
  { id: "upload", label: "Upload" },
  { id: "confirm", label: "Confirm mapping" },
  { id: "review", label: "Review rows" },
  { id: "import", label: "Import" },
] as const;

/** Where a confirmed part comes from: the user's own pick counts as a rule match. */
const CONFIRMED: Pick<FieldMapping, "confidence" | "source"> = { confidence: 1, source: "rules" };

type SiteLike = { company?: { ai_import_enabled?: boolean | null } | null };

/** The per-client switch (`company.ai_import_enabled`, XI0) as the site list carries it. */
export const smartImportEnabled = (sites: SiteLike[]): boolean => sites.some((s) => s.company?.ai_import_enabled === true);

export const needsConfirmation = (confidence: number) => confidence < CONFIRM_BELOW;

export type MatchChip = "matched" | "remembered" | "suggested" | "check" | "skipped" | null;

const chipFor = (source: MappingSource, confidence: number): MatchChip =>
  needsConfirmation(confidence) ? "check" : source === "profile" ? "remembered" : source === "llm" ? "suggested" : "matched";

/** Matched (rules), Remembered (profile), Suggested (model) or Check (low confidence or empty required). */
export function fieldChip(f: FieldMapping): MatchChip {
  if (f.skipped) return "skipped";
  if (!f.column) return f.required ? "check" : null;
  return chipFor(f.source, f.confidence);
}

export function activityChip(a: ProposedActivityMatch): MatchChip {
  if (!a.factor_name) return needsConfirmation(a.confidence) ? "check" : "skipped";
  return chipFor(a.source, a.confidence);
}

export function categoryChip(c: ResolvedCategory): MatchChip {
  if (c.kind === "fixed") return chipFor(c.source, c.confidence);
  // Every value left out means nothing to import from the sheet.
  if (c.values.length === 0 || c.values.every((v) => v.id === null)) return "check";
  // A value the mapper couldn't place has confidence 0; once the user picks "Not imported" it is confirmed.
  const worst = c.values.reduce((m, v) => Math.min(m, v.confidence), 1);
  return needsConfirmation(worst) ? "check" : chipFor(c.values[0].source, worst);
}

export const CHIP_LABEL: Record<Exclude<MatchChip, null>, string> = {
  matched: "Matched",
  remembered: "Remembered",
  suggested: "Suggested",
  check: "Check",
  skipped: "Skipped",
};

/** What still needs the user's eyes on a sheet before Continue (decision 4). */
export function sheetBlockers(sheet: SheetProposal): string[] {
  if (sheet.excluded) return [];
  const out: string[] = [];
  if (categoryChip(sheet.category) === "check") out.push("Category");
  for (const f of sheet.fields) if (f.required && fieldChip(f) === "check") out.push(f.label);
  for (const a of sheet.activities) if (activityChip(a) === "check") out.push(`"${a.sheet_text}"`);
  return out;
}

/** Continue needs at least one sheet in and no Check chip left on a required part. */
export function canContinue(p: MappingProposal): boolean {
  const included = p.sheets.filter((s) => !s.excluded);
  return included.length > 0 && included.every((s) => sheetBlockers(s).length === 0);
}

// ── Edits on the confirm screen ──────────────────────────────────────────────

const withSheet = (p: MappingProposal, index: number, patch: (s: SheetProposal) => SheetProposal): MappingProposal => ({
  ...p,
  sheets: p.sheets.map((s, i) => (i === index ? patch(s) : s)),
});

export const setSheetExcluded = (p: MappingProposal, index: number, excluded: boolean) => withSheet(p, index, (s) => ({ ...s, excluded }));

/** The user picked a column (or cleared it): confirmed, so the Check chip goes. */
export const setFieldColumn = (p: MappingProposal, index: number, key: string, column: string | null) =>
  withSheet(p, index, (s) => ({ ...s, fields: s.fields.map((f) => (f.key === key ? { ...f, column, skipped: false, ...CONFIRMED } : f)) }));

/** Keeps the proposed column and marks it confirmed. */
export const confirmField = (p: MappingProposal, index: number, key: string) =>
  withSheet(p, index, (s) => ({ ...s, fields: s.fields.map((f) => (f.key === key && f.column ? { ...f, ...CONFIRMED } : f)) }));

export const toggleFieldSkip = (p: MappingProposal, index: number, key: string) =>
  withSheet(p, index, (s) => ({
    ...s,
    fields: s.fields.map((f) => (f.key === key && !f.required ? { ...f, skipped: !f.skipped, column: f.skipped ? f.column : null, ...CONFIRMED } : f)),
  }));

export const setActivityFactor = (p: MappingProposal, index: number, sheetText: string, factorName: string | null) =>
  withSheet(p, index, (s) => ({
    ...s,
    activities: s.activities.map((a) => (a.sheet_text === sheetText ? { ...a, factor_name: factorName, save_mapping: factorName ? a.save_mapping : false, ...CONFIRMED } : a)),
  }));

export const confirmActivity = (p: MappingProposal, index: number, sheetText: string) =>
  withSheet(p, index, (s) => ({ ...s, activities: s.activities.map((a) => (a.sheet_text === sheetText && a.factor_name ? { ...a, ...CONFIRMED } : a)) }));

export const toggleSaveMapping = (p: MappingProposal, index: number, sheetText: string) =>
  withSheet(p, index, (s) => ({ ...s, activities: s.activities.map((a) => (a.sheet_text === sheetText ? { ...a, save_mapping: !a.save_mapping } : a)) }));

export const confirmCategory = (p: MappingProposal, index: number) =>
  withSheet(p, index, (s) => ({
    ...s,
    category:
      s.category.kind === "fixed"
        ? { ...s.category, ...CONFIRMED }
        : { ...s.category, values: s.category.values.map((v) => ({ ...v, ...CONFIRMED })) },
  }));

export const setFixedCategory = (p: MappingProposal, index: number, id: number, label: string) =>
  withSheet(p, index, (s) => ({ ...s, category: { kind: "fixed", id, label, ...CONFIRMED } }));

export const setCategoryValue = (p: MappingProposal, index: number, text: string, id: number | null) =>
  withSheet(p, index, (s) =>
    s.category.kind !== "column" ? s : { ...s, category: { ...s.category, values: s.category.values.map((v) => (v.text === text ? { ...v, id, ...CONFIRMED } : v)) } },
  );

/** Every column name a sheet's proposal mentions, plus the workbook headers the upload returned. */
export function knownColumns(sheet: SheetProposal, headers: string[]): string[] {
  const extra = (sheet as SheetProposal & { columns?: string[] }).columns ?? [];
  const names = new Set<string>([...extra, ...headers]);
  for (const f of sheet.fields) if (f.column) names.add(f.column);
  if (sheet.site_column) names.add(sheet.site_column.column);
  if (sheet.category.kind === "column") names.add(sheet.category.column);
  if (sheet.period.kind === "column") names.add(sheet.period.column);
  if (sheet.period.kind === "months_as_columns") for (const c of sheet.period.columns) names.add(c.column);
  return [...names];
}

// ── Copy ─────────────────────────────────────────────────────────────────────

export const SOURCE_LABEL: Record<SheetSource, string> = {
  profile: "remembered from your last upload",
  rules: "matched by name",
  llm: "suggested",
  mixed: "partly remembered, partly suggested",
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthText = (date: string) => {
  const [y, m] = date.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
};

export function periodText(p: SheetPeriod): string {
  switch (p.kind) {
    case "column":
      return `Each row's date from column "${p.column}"`;
    case "monthly_fixed":
      return `Every row filed in ${monthText(p.date)}`;
    case "yearly":
      return p.year_type === "FY" ? `Financial year ${p.year}–${String(p.year + 1).slice(-2)} (April to March)` : `Calendar year ${p.year}`;
    case "months_as_columns":
      return p.columns.length === 0
        ? "Months as columns"
        : `Months as columns: ${monthText(p.columns[0].date)} to ${monthText(p.columns[p.columns.length - 1].date)} (${p.columns.length} ${p.columns.length === 1 ? "column" : "columns"})`;
  }
}

export const categoryText = (c: ResolvedCategory): string => (c.kind === "fixed" ? c.label : `From column "${c.column}"`);

/** "Askar: its rows will be skipped (this upload is for Hidd)" for each other site the sheet names. */
export function otherSiteLines(sheet: SheetProposal, siteName: string): string[] {
  const others = sheet.site_column?.values.filter((v) => !v.matches_site) ?? [];
  return others.map((v) => `${v.text}: its rows will be skipped (this upload is for ${siteName})`);
}

export const notInContextText = (names: string[]): string | null =>
  names.length === 0 ? null : `The sheet names ${names.join(", ")}, which you cannot import into. Those parts were left out.`;

// ── Review rows (the plan) ───────────────────────────────────────────────────

export const SEVERITY_TONE: Record<IssueSeverity, "bad" | "warn" | "info"> = { error: "bad", warning: "warn", info: "info" };

export const ISSUE_LABEL: Record<string, string> = {
  SITE_NOT_ALLOWED: "Other site",
  CATEGORY_NOT_ASSIGNED: "Category not at this site",
  NO_FORM: "No entry form",
  UNKNOWN_ACTIVITY: "Unknown activity",
  NO_FACTOR_FOR_YEAR: "No factor for the year",
  UNIT_NOT_CONVERTIBLE: "Unit can't be converted",
  MISSING_VALUE: "Missing value",
  NON_POSITIVE_VALUE: "Value not above 0",
  FIELD_REQUIRED: "Required field empty",
  FIELD_INVALID: "Field not valid",
  PERIOD_INVALID: "Period not valid",
  MODE_LOCK: "Period mode locked",
  DUPLICATE_EXISTING: "Already entered",
  DUPLICATE_IN_PLAN: "Duplicate in the sheet",
  DISTANCE_REQUIRED: "Distance needed",
  FACTOR_FALLBACK_YEAR: "Factor from another year",
  CLIENT_TOTAL_IGNORED: "Sheet total ignored",
  NOT_IN_CONTEXT: "Not in your scope",
  LOW_CONFIDENCE_MATCH: "Matched with low confidence",
  PIVOT_EMPTY_CELL: "Empty month cell",
};

export const issueLabel = (code: string) => ISSUE_LABEL[code] ?? code.toLowerCase().replace(/_/g, " ");

/** Issue codes the plan reports, for the filter, most frequent first. */
export function issueOptions(plan: PlanSummary | null): { value: string; label: string }[] {
  return [...(plan?.issues_summary ?? [])]
    .sort((a, b) => b.count - a.count)
    .map((i) => ({ value: i.code, label: `${issueLabel(i.code)} (${i.count})` }));
}

export const rowHasCode = (row: PreviewRow, code: string) => (row.issues ?? []).some((i) => i.code === code);

/** Rows still in state `issue` block the commit; skipped rows don't. */
export const errorRowsRemain = (plan: PlanSummary | null) => !!plan && plan.counts.issue > 0;

/** The worst severity on a row, for its chip. */
export function rowSeverity(row: PreviewRow): IssueSeverity | null {
  const codes = row.issues ?? [];
  if (row.state === "issue" || codes.some((i) => i.severity === "error")) return "error";
  if (codes.some((i) => i.severity === "warning")) return "warning";
  if (codes.some((i) => i.severity === "info")) return "info";
  return null;
}

/** "Review rows" in Approvals for the batch, over any period, scoped to the upload's site (P07). */
export function reviewRowsLink(siteId: number, batchId: string): string {
  const params = writeContext(new URLSearchParams(), { siteIds: [siteId], categoryIds: [], period: null });
  params.set("batch", batchId);
  return `/data/approvals?${params.toString()}`;
}

// ── Errors ───────────────────────────────────────────────────────────────────

type ServiceError = { status?: number; code?: string | null; message?: string };

/** The mapper isn't deployed or can't answer: the manual mapper still works, so offer it. */
export function smartUnavailable(e: unknown): boolean {
  const status = (e as ServiceError)?.status;
  return status === 404 || status === 501 || status === 502 || status === 503 || status === 504;
}

export function smartErrorMessage(e: unknown, fallback: string): string {
  const err = (e as ServiceError) ?? {};
  if (err.code === "AI_IMPORT_DISABLED_FOR_CLIENT") return "Smart import is switched off for this client.";
  if (err.status === 429) return "Too many smart imports in a short time. Wait a few minutes and try again.";
  if (smartUnavailable(e)) return "The mapper isn't available right now. You can still map the columns yourself.";
  return typeof err.message === "string" && err.message ? err.message : fallback;
}

export const rowsText = (n: number) => `${n} ${n === 1 ? "row" : "rows"}`;
