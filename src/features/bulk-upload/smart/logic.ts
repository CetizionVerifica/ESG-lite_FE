/** Pure helpers for the smart import flow (XI4). No React, no requests. */
import { writeContext } from "../../../ui";
import type { PlanSummary } from "../../../services/excelService";
import type { PreviewRow } from "../logic";
import { CONFIRM_BELOW, type FieldMapping, type IssueSeverity, type MappingProfile, type MappingProposal, type MappingSource, type ProposedActivityMatch, type ResolvedCategory, type SheetPeriod, type SheetProposal, type SheetSource } from "./types";

export const SMART_STEPS = [
  { id: "upload", label: "Upload" },
  { id: "confirm", label: "Confirm mapping" },
  { id: "review", label: "Review rows" },
  { id: "import", label: "Import" },
] as const;

/** A value the user picked themselves counts as a rule match. */
const CONFIRMED: Pick<FieldMapping, "confidence" | "source"> = { confidence: 1, source: "rules" };

/**
 * The user kept the proposed value as is. Its confidence and source stay as the
 * mapper sent them, so a low-confidence match still reaches the approver's
 * "Needs attention" list; only the Check chip goes.
 */
const KEPT = { confirmed: true } as const;

type SiteLike = { company?: { ai_import_enabled?: boolean | null } | null };

/** The per-client switch (`company.ai_import_enabled`, XI0) as the site list carries it. */
export const smartImportEnabled = (sites: SiteLike[]): boolean => sites.some((s) => s.company?.ai_import_enabled === true);

/**
 * The mapping model is on (python's `MAPPING_MODEL_PROVIDER` with its key).
 * Rules only (no key) reports the model as "none". The name stays set when a
 * sheet's model answer was dropped and it fell back to rules, so this alone
 * never decides that a proposal needs no check: see `skipConfirm`.
 */
export const modelMapped = (p: MappingProposal): boolean => {
  const name = p.model?.name?.trim().toLowerCase();
  return !!name && name !== "none";
};

export const needsConfirmation = (confidence: number) => confidence < CONFIRM_BELOW;

export type MatchChip = "matched" | "remembered" | "suggested" | "check" | "skipped" | null;

const sourceChip = (source: MappingSource): MatchChip => (source === "profile" ? "remembered" : source === "llm" ? "suggested" : "matched");

/** A confirmed part is never Check, whatever its confidence. */
const chipFor = (part: { source: MappingSource; confidence: number; confirmed?: boolean }): MatchChip =>
  !part.confirmed && needsConfirmation(part.confidence) ? "check" : sourceChip(part.source);

/** Matched (rules), Remembered (profile), Suggested (model) or Check (low confidence or empty required). */
export function fieldChip(f: FieldMapping): MatchChip {
  if (f.skipped) return "skipped";
  if (!f.column) return f.required ? "check" : null;
  return chipFor(f);
}

export function activityChip(a: ProposedActivityMatch): MatchChip {
  if (!a.factor_name) return !a.confirmed && needsConfirmation(a.confidence) ? "check" : "skipped";
  return chipFor(a);
}

export function categoryChip(c: ResolvedCategory): MatchChip {
  if (c.kind === "fixed") return chipFor(c);
  // Every value left out means nothing to import from the sheet.
  if (c.values.length === 0 || c.values.every((v) => v.id === null)) return "check";
  // A value the mapper couldn't place has confidence 0; once the user picks "Not imported" or confirms it, it is settled.
  return c.values.some((v) => chipFor(v) === "check") ? "check" : sourceChip(c.values[0].source);
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

/**
 * With the model on, a proposal with nothing left to check goes straight to
 * Review rows (Shyam, 2026-10-15). Anything with a Check chip (a guessed
 * category, an empty required field, a match below 0.8, a sheet the model
 * didn't map) still stops on Confirm mapping, so no unreviewed guess is
 * imported or remembered as a mapping.
 */
export const skipConfirm = (p: MappingProposal): boolean => modelMapped(p) && canContinue(p);

/** A sheet, or some of its optional columns and activity wordings, the model wasn't sure of and that was left out of the plan. */
export type HeldPart = {
  sheet: string;
  /** True: the whole sheet is out (its category, a required field or the Activity column is unsure). False: only the parts below. */
  whole: boolean;
  /** Whole sheet: what wasn't sure ("Category", field labels). Otherwise: the quoted sheet wordings left without a factor. */
  reasons: string[];
  /** Not whole: the optional fields left unmapped (their column was a guess). */
  fields?: string[];
};

/** The Activity column: optional in python's field specs, but every row's factor comes from it. */
const ACTIVITY_KEY = "activity_name";

/**
 * Splits a proposal into what the model was sure of and what it wasn't
 * (Shyam, 2026-10-15: "at least the data points where the AI is confident can
 * be marked for review rows and make it pending status"). A sheet whose
 * category, a required field or its Activity column is unsure is left out
 * whole, since none of its rows can be built reliably. Any other optional field
 * on Check is left unmapped (column cleared, not skipped, so it is neither
 * imported nor remembered as "skip"). An unsure activity wording is unmatched
 * (no factor, nothing saved), so its rows reach Review rows as issues the user
 * can fix there and are left out at import if they don't. Nothing unsure is
 * imported or learned as a mapping.
 */
export function holdUnsure(p: MappingProposal): { proposal: MappingProposal; held: HeldPart[] } {
  const held: HeldPart[] = [];
  const sheets = p.sheets.map((s) => {
    if (s.excluded) return s;
    const sheetLevel = [
      ...(categoryChip(s.category) === "check" ? ["Category"] : []),
      ...s.fields.filter((f) => (f.required || f.key === ACTIVITY_KEY) && fieldChip(f) === "check").map((f) => f.label),
    ];
    if (sheetLevel.length) {
      held.push({ sheet: s.sheet_name, whole: true, reasons: sheetLevel });
      return { ...s, excluded: true };
    }
    const unsureFields = new Set(s.fields.filter((f) => fieldChip(f) === "check").map((f) => f.key));
    const unsure = s.activities.filter((a) => activityChip(a) === "check");
    if (!unsure.length && !unsureFields.size) return s;
    const fields = s.fields.filter((f) => unsureFields.has(f.key)).map((f) => f.label);
    held.push({ sheet: s.sheet_name, whole: false, reasons: unsure.map((a) => `"${a.sheet_text}"`), ...(fields.length ? { fields } : {}) });
    const names = new Set(unsure.map((a) => a.sheet_text));
    return {
      ...s,
      fields: s.fields.map((f) => (unsureFields.has(f.key) ? { ...f, column: null } : f)),
      activities: s.activities.map((a) => (names.has(a.sheet_text) ? { ...a, factor_name: null, save_mapping: false } : a)),
    };
  });
  return { proposal: { ...p, sheets }, held };
}

/**
 * With the model on, the upload goes straight to Review rows whenever at least
 * one sheet is sure enough to plan; what isn't sure is held back (`holdUnsure`)
 * and listed there for the user to check. The flow uses this, not `skipConfirm`,
 * whose `canContinue` ignores optional fields. Rules only, or nothing sure at all,
 * still opens Confirm mapping.
 */
export const autoReview = (p: MappingProposal): boolean => modelMapped(p) && holdUnsure(p).proposal.sheets.some((s) => !s.excluded);

/** "2 sheets and 3 wordings held back" style summary for the review callout. */
export function heldText(held: HeldPart[]): string {
  const sheets = held.filter((h) => h.whole).length;
  const columns = held.filter((h) => !h.whole).reduce((n, h) => n + (h.fields?.length ?? 0), 0);
  const wordings = held.filter((h) => !h.whole).reduce((n, h) => n + h.reasons.length, 0);
  const parts = [
    sheets ? `${sheets} ${sheets === 1 ? "sheet" : "sheets"}` : "",
    columns ? `${columns} ${columns === 1 ? "column" : "columns"}` : "",
    wordings ? `${wordings} ${wordings === 1 ? "activity wording" : "activity wordings"}` : "",
  ].filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts.join("");
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

/** Keeps the proposed column and marks it confirmed; its confidence and source stay. */
export const confirmField = (p: MappingProposal, index: number, key: string) =>
  withSheet(p, index, (s) => ({ ...s, fields: s.fields.map((f) => (f.key === key && f.column ? { ...f, ...KEPT } : f)) }));

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
  withSheet(p, index, (s) => ({ ...s, activities: s.activities.map((a) => (a.sheet_text === sheetText && a.factor_name ? { ...a, ...KEPT } : a)) }));

export const toggleSaveMapping = (p: MappingProposal, index: number, sheetText: string) =>
  withSheet(p, index, (s) => ({ ...s, activities: s.activities.map((a) => (a.sheet_text === sheetText ? { ...a, save_mapping: !a.save_mapping } : a)) }));

export const confirmCategory = (p: MappingProposal, index: number) =>
  withSheet(p, index, (s) => ({
    ...s,
    category:
      s.category.kind === "fixed"
        ? { ...s.category, ...KEPT }
        : { ...s.category, values: s.category.values.map((v) => ({ ...v, ...KEPT })) },
  }));

/**
 * No layer worked out this sheet's category: the engine sends the site's first
 * category as a placeholder with confidence 0 from the rules. The screen shows
 * "Choose a category" instead of presenting the placeholder as a suggestion.
 */
export const categoryNotFound = (sheet: SheetProposal) => sheet.category.kind === "fixed" && sheet.category.confidence === 0 && sheet.category.source === "rules";

/** The mapper's answer for a sheet is for the category the user picked. */
export const answersCategory = (sheet: SheetProposal, categoryId: number) => sheet.category.kind === "fixed" && sheet.category.id === categoryId;

/** Swap in the mapper's fresh answer for one sheet, keeping whether the user left it out. */
export const replaceSheet = (p: MappingProposal, sheetName: string, next: SheetProposal): MappingProposal => ({
  ...p,
  sheets: p.sheets.map((s) => (s.sheet_name === sheetName ? { ...next, excluded: s.excluded } : s)),
});

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
  if (err.code === "IMPORT_TOO_MANY_PLANS") return "You have 10 unfinished imports. Finish one, or try again once older drafts expire (after 24 hours).";
  if (err.status === 429) return "Too many smart imports in a short time. Wait a few minutes and try again.";
  if (smartUnavailable(e)) return "The mapper isn't available right now. You can still map the columns yourself.";
  return typeof err.message === "string" && err.message ? err.message : fallback;
}

export const rowsText = (n: number) => `${n} ${n === 1 ? "row" : "rows"}`;

// ── Mapping memory (XI3 profiles, "Last time you mapped this as…") ───────────

/**
 * The profile that fits a sheet: same fingerprint and, when several exist,
 * the one keyed on the sheet's category (its fixed id, or none when the
 * category comes from a column); else the newest. `undefined` while loading.
 */
export function profileFor(sheet: SheetProposal, profiles: MappingProfile[] | undefined): MappingProfile | null {
  if (!profiles) return null;
  const same = profiles.filter((p) => p.fingerprint === sheet.fingerprint && p.site_id === sheet.site_id);
  if (same.length === 0) return null;
  const key = sheet.category.kind === "fixed" ? sheet.category.id : null;
  return same.find((p) => p.category_id === key) ?? same[0];
}

/** JSON with object keys sorted, so the same value always reads the same (jsonb reorders keys). */
const canonical = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(canonical).join(",")}]`
    : v !== null && typeof v === "object"
      ? `{${Object.keys(v as Record<string, unknown>)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
          .join(",")}}`
      : JSON.stringify(v);

const byFirst = (a: [string, ...unknown[]], b: [string, ...unknown[]]) => a[0].localeCompare(b[0]);

/** What a mapping decides, in a fixed order: the profile and the card compare equal when they map the sheet the same way. */
const shapeOf = (s: SheetProposal) =>
  canonical({
    category: s.category.kind === "fixed" ? { id: s.category.id } : { column: s.category.column, values: s.category.values.map((v): [string, number | null] => [v.text, v.id]).sort(byFirst) },
    period: s.period.kind === "months_as_columns" ? { kind: s.period.kind, columns: [...s.period.columns].sort((a, b) => a.column.localeCompare(b.column)) } : s.period,
    fields: s.fields.map((f): [string, string | null, boolean] => [f.key, f.skipped ? null : f.column, f.skipped]).sort(byFirst),
    activities: s.activities.map((a): [string, string | null] => [a.sheet_text, a.factor_name]).sort(byFirst),
  });

/**
 * True when "Use it" would change the card: the remembered category, period
 * and fields differ, or a wording on the card was matched differently last
 * time. Wordings only one side has don't count (a new name keeps its own match).
 */
export function profileDiffers(sheet: SheetProposal, profile: MappingProfile): boolean {
  const wordings = (s: SheetProposal) => [...s.activities.map((a) => a.sheet_text), ...(s.category.kind === "column" ? s.category.values.map((v) => v.text) : [])];
  const theirs = new Set(wordings(profile.sheet_proposal));
  const texts = new Set(wordings(sheet).filter((t) => theirs.has(t)));
  const restrict = (s: SheetProposal): SheetProposal => ({
    ...s,
    activities: s.activities.filter((a) => texts.has(a.sheet_text)),
    category: s.category.kind === "column" ? { ...s.category, values: s.category.values.filter((v) => texts.has(v.text)) } : s.category,
  });
  return shapeOf(restrict(sheet)) !== shapeOf(restrict(profile.sheet_proposal));
}

const remembered = <T extends { confidence: number; source: MappingSource }>(x: T): T => ({ ...x, confidence: 1, source: "profile" });

/**
 * Puts the remembered mapping on the sheet: category, period and fields as
 * confirmed last time, marked Remembered. Activities and column-category
 * values stay the ones this upload holds: a wording the profile knows takes
 * its remembered match, a new wording keeps its own (and its Check chip), and
 * a wording only the profile knows is not added. What the reader found (name,
 * rows, header row, site column, names out of scope) stays; so does whether
 * the sheet is left out.
 */
export const applyProfile = (p: MappingProposal, index: number, profile: MappingProfile) =>
  withSheet(p, index, (s) => {
    const r = profile.sheet_proposal;
    const rememberedMatch = new Map(r.activities.map((a) => [a.sheet_text, a]));
    const activities = s.activities.map((a) => {
      const m = rememberedMatch.get(a.sheet_text);
      return m ? { ...a, factor_name: m.factor_name, category_id: m.category_id, confidence: 1, source: "profile" as const, save_mapping: false } : a;
    });
    let category: ResolvedCategory;
    if (r.category.kind === "fixed") {
      category = remembered(r.category);
    } else {
      const rememberedValue = new Map(r.category.values.map((v) => [v.text, v]));
      const current = s.category.kind === "column" ? s.category.values : [];
      category = {
        kind: "column",
        column: r.category.column,
        values: current.map((v) => {
          const m = rememberedValue.get(v.text);
          return m ? { ...v, id: m.id, confidence: 1, source: "profile" as const } : v;
        }),
      };
    }
    const keepsOwnParts = activities.some((a) => a.source !== "profile") || (category.kind === "column" && category.values.some((v) => v.source !== "profile"));
    return {
      ...s,
      layout: r.layout,
      category,
      period: r.period,
      fields: r.fields.map(remembered),
      activities,
      confidence: keepsOwnParts ? Math.min(1, ...activities.map((a) => a.confidence)) : 1,
      source: keepsOwnParts ? "mixed" : "profile",
    };
  });

/** "Fuel, each row's date from column "Month"; Quantity from "Litres used", Unit from "UoM"; "Diesel (gen-set)" as Diesel". */
export function profileSummary(profile: MappingProfile): string {
  const s = profile.sheet_proposal;
  const fields = s.fields.filter((f) => f.column && !f.skipped).map((f) => `${f.label} from "${f.column}"`);
  const activities = s.activities.filter((a) => a.factor_name).map((a) => `"${a.sheet_text}" as ${a.factor_name}`);
  const parts = [`${categoryText(s.category)}, ${periodText(s.period).replace(/^Each/, "each").replace(/^Every/, "every")}`];
  if (fields.length) parts.push(fields.join(", "));
  if (activities.length) parts.push(activities.join(", "));
  return parts.join("; ");
}

/** "on 3 Oct 2026, used 4 times" for the profile line. */
export function profileWhenText(profile: MappingProfile): string {
  const when = profile.confirmed_at ?? profile.updated_at;
  const d = new Date(when);
  const date = Number.isNaN(d.getTime()) ? null : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const uses = profile.uses === 1 ? "used once" : `used ${profile.uses} times`;
  return date ? `on ${date}, ${uses}` : uses;
}

/** Why a DELETE was refused, in the reader's words. */
export function forgetErrorMessage(e: unknown): string {
  const err = (e as ServiceError) ?? {};
  if (err.status === 403) return "Only the person who confirmed this mapping, or an admin, can forget it.";
  if (err.status === 404) return "This mapping was already forgotten.";
  return smartErrorMessage(e, "The mapping couldn't be forgotten. Try again.");
}

/**
 * #183: the category a plan row belongs to, from the confirmed mapping: the sheet activity whose
 * factor name or sheet wording is the row's activity, else the one category every included sheet
 * names. Null when the mapping doesn't say (the unit stays free text).
 */
export function categoryForRow(p: MappingProposal | null, activityName: string): number | null {
  if (!p) return null;
  const name = activityName.trim().toLowerCase();
  const sheets = p.sheets.filter((s) => !s.excluded);
  const match = name ? sheets.flatMap((s) => s.activities).find((a) => [a.factor_name, a.sheet_text].some((t) => (t ?? "").trim().toLowerCase() === name)) : undefined;
  if (match) return match.category_id;
  const fixed = [...new Set(sheets.map((s) => (s.category.kind === "fixed" ? s.category.id : null)))];
  return fixed.length === 1 ? fixed[0] : null;
}

/** The engine's unit issue on a plan row (UNIT_NOT_CONVERTIBLE), shown on the Unit field. */
export const rowUnitIssue = (row: PreviewRow | null): string | null =>
  (row?.issues ?? []).find((i) => i.code === "UNIT_NOT_CONVERTIBLE" || i.field === "activity_unit")?.message ?? null;
