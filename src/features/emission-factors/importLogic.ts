// P22 Import factors: pure logic shared by the simple-sheet and AI paths. No React here.
import type { Category, Site } from "./logic";

/** One factor read from a sheet, editable in the Preview step. */
export type ImportRow = {
  key: string;
  year: number;
  factor_value: number;
  denominator_unit: string;
  source: string;
  emission_category_name: string;
  /** Excel parent group (AI path); null on simple sheets. */
  group: string | null;
  excluded: boolean;
};

export type SimpleParse = { rows: ImportRow[]; errors: string[] };

const pick = (row: Record<string, unknown>, names: string[]): unknown => {
  for (const n of names) {
    const v = row[n];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return undefined;
};

/** Header spellings the old Bulk Upload accepted, kept so existing sheets still work. */
const COLS = {
  year: ["year", "Year", "YEAR"],
  value: ["factor_value", "Factor Value", "factor", "Factor", "FACTOR_VALUE"],
  unit: ["denominator_unit", "Denominator Unit", "unit", "Unit"],
  source: ["source", "Source", "SOURCE"],
  name: ["emission_category_name", "Emission Category", "emission_category", "Emission Category Name"],
};

/**
 * Rows of a simple sheet (first sheet, header row: year, factor_value, unit,
 * source, name). Rows with no year or factor are reported by Excel row number.
 */
export function parseSimpleRows(json: Record<string, unknown>[]): SimpleParse {
  const rows: ImportRow[] = [];
  const errors: string[] = [];
  json.forEach((r, i) => {
    const excelRow = i + 2;
    const year = pick(r, COLS.year);
    const value = pick(r, COLS.value);
    if (year === undefined || value === undefined) {
      errors.push(`Row ${excelRow}: year or factor is missing.`);
      return;
    }
    const y = parseInt(String(year), 10);
    const v = parseFloat(String(value).replace(/,/g, ""));
    if (!Number.isFinite(y) || !Number.isFinite(v)) {
      errors.push(`Row ${excelRow}: year or factor isn't a number.`);
      return;
    }
    rows.push({
      key: `r${excelRow}`,
      year: y,
      factor_value: v,
      denominator_unit: String(pick(r, COLS.unit) ?? "").trim(),
      source: String(pick(r, COLS.source) ?? "").trim(),
      emission_category_name: String(pick(r, COLS.name) ?? "").trim(),
      group: null,
      excluded: false,
    });
  });
  return { rows, errors };
}

/** Problems that stop a row from being saved; excluded rows are never checked. */
export function rowProblem(r: ImportRow): string | null {
  if (!Number.isInteger(r.year) || r.year < 1990 || r.year > 2100) return "Year must be between 1990 and 2100.";
  if (!Number.isFinite(r.factor_value) || r.factor_value < 0) return "Factor must be 0 or more.";
  if (Math.abs(r.factor_value) >= 1_000_000) return "Factor must be below 1,000,000.";
  return null;
}

/** Rows that pass the Preview's group, year and search filters (excluded rows stay visible). */
export function previewRows(rows: ImportRow[], f: { group: string | null; year: number | null; q: string }): ImportRow[] {
  const q = f.q.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (!f.group || r.group === f.group) &&
      (!f.year || r.year === f.year) &&
      (!q || [r.emission_category_name, r.source, r.denominator_unit, r.group ?? ""].some((s) => s.toLowerCase().includes(q))),
  );
}

export function distinctYears(rows: ImportRow[]): number[] {
  return [...new Set(rows.map((r) => r.year))].sort((a, b) => b - a);
}

/** Where factors go: one site, or every site of a client that reports the category. */
export type Target = { kind: "site"; siteId: number } | { kind: "client"; clientId: number };

/** Category per Excel group; simple sheets have one group, keyed by "" . */
export type CategoryMap = Record<string, number | null>;

export type FactorBody = {
  site_id: number;
  category_id: number;
  year: number;
  factor_value: number;
  denominator_unit?: string;
  source?: string;
  emission_category_name?: string;
  global_category_name?: string;
};

export type UploadJob = { site: Site; categoryId: number; factors: FactorBody[] };
export type UploadPlan = {
  jobs: UploadJob[];
  /** Client-wide target: sites skipped because they don't report the category. */
  notAssigned: { site: string; category: string }[];
  /** Groups with no category chosen; their rows are skipped. */
  unmappedGroups: string[];
  /** Rows that will be sent, before the server skips existing ones. */
  rowCount: number;
};

/**
 * Turns the preview into one bulk call per site and category. A client-wide
 * target only writes to sites that report the category (as the old Smart
 * Upload did), and lists the others.
 */
export function planUpload(rows: ImportRow[], map: CategoryMap, target: Target, sites: Site[], categories: Category[]): UploadPlan {
  const included = rows.filter((r) => !r.excluded && !rowProblem(r));
  const byGroup = new Map<string, ImportRow[]>();
  for (const r of included) {
    const g = r.group ?? "";
    byGroup.set(g, [...(byGroup.get(g) ?? []), r]);
  }
  const jobs: UploadJob[] = [];
  const notAssigned: UploadPlan["notAssigned"] = [];
  const unmappedGroups: string[] = [];
  const catName = (id: number) => categories.find((c) => c.category_id === id)?.category_name ?? `Category ${id}`;
  let rowCount = 0;

  for (const [group, groupRows] of byGroup) {
    const categoryId = map[group] ?? null;
    if (!categoryId) {
      unmappedGroups.push(group);
      continue;
    }
    let targets: Site[];
    if (target.kind === "site") {
      const s = sites.find((x) => x.site_id === target.siteId);
      targets = s ? [s] : [];
    } else {
      const clientSites = sites.filter((s) => s.company?.company_id === target.clientId);
      targets = clientSites.filter((s) => (s.categories ?? []).some((c) => c.category_id === categoryId));
      for (const s of clientSites) if (!targets.includes(s)) notAssigned.push({ site: s.name, category: catName(categoryId) });
    }
    for (const site of targets) {
      const factors = groupRows.map((r) => {
        const name = r.emission_category_name.trim() || undefined;
        const body: FactorBody = { site_id: site.site_id, category_id: categoryId, year: r.year, factor_value: r.factor_value };
        if (r.denominator_unit.trim()) body.denominator_unit = r.denominator_unit.trim();
        if (r.source.trim()) body.source = r.source.trim();
        // The full composite name: column configs split it on " - " and entries look factors up by it.
        if (name) {
          body.emission_category_name = name;
          body.global_category_name = name;
        }
        return body;
      });
      rowCount += factors.length;
      // Several groups can map to one category on one site: one call each keeps batches per group.
      jobs.push({ site, categoryId, factors });
    }
  }
  return { jobs, notAssigned, unmappedGroups, rowCount };
}

export type JobResult = { site: string; category: string; categoryId: number; siteId: number; created: number; skipped: number; error: string | null };

export function totals(results: JobResult[]): { created: number; skipped: number; failed: number } {
  return results.reduce((t, r) => ({ created: t.created + r.created, skipped: t.skipped + r.skipped, failed: t.failed + (r.error ? 1 : 0) }), { created: 0, skipped: 0, failed: 0 });
}

/** Site and category pairs that got new factors: each can have a data-entry form generated. */
export function formTargets(results: JobResult[]): { siteId: number; site: string; categoryId: number; category: string }[] {
  const seen = new Set<string>();
  const out: { siteId: number; site: string; categoryId: number; category: string }[] = [];
  for (const r of results) {
    const k = `${r.siteId}:${r.categoryId}`;
    if (r.created > 0 && !seen.has(k)) {
      seen.add(k);
      out.push({ siteId: r.siteId, site: r.site, categoryId: r.categoryId, category: r.category });
    }
  }
  return out;
}

export const SHEET_ACCEPT = [".xlsx", ".xls"];
export const SHEET_MAX = 10 * 1024 * 1024;

// ---------------------------------------------------------------------------
// AI read (python_AI_service /v1/emission-factors/parse-excel)
// ---------------------------------------------------------------------------

export type ParsedFactor = {
  year: number;
  factor_value: number;
  denominator_unit?: string | null;
  source?: string | null;
  emission_category_name?: string | null;
  parent_category?: string | null;
};
export type Suggestion = { parent_category: string; suggested_category_id: number | null; suggested_category_name: string | null; confidence: "high" | "medium" | "low" };
export type ColumnRef = { column_index: number; header_name: string };
export type SheetColumn = ColumnRef & { sample_values: string[] };
export type Schema = {
  layout_type: string;
  descriptor_columns: ColumnRef[];
  unit_column?: ColumnRef | null;
  source_column?: ColumnRef | null;
  years: { year: number; value_column?: number | null; sub_columns?: unknown; primary_sub_column?: string | null; disposal_columns?: unknown }[];
  [key: string]: unknown;
};
export type ParseResult = {
  factors: ParsedFactor[];
  schema_detected: Schema;
  warnings: string[];
  available_years: number[];
  parent_categories: string[];
  category_suggestions?: Suggestion[];
  upload_id?: number | null;
  sheet_names: string[];
  selected_sheet?: string | null;
  available_columns: SheetColumn[];
};

/** Groups only matter when the sheet has more than one; otherwise everything is one group (""). */
export function groupsOf(p: ParseResult): string[] {
  return p.parent_categories.length > 1 ? p.parent_categories : [""];
}

export function rowsFromParse(p: ParseResult): ImportRow[] {
  const grouped = p.parent_categories.length > 1;
  return p.factors.map((f, i) => ({
    key: `a${i + 1}`,
    year: f.year,
    factor_value: f.factor_value,
    denominator_unit: f.denominator_unit ?? "",
    source: f.source ?? "",
    emission_category_name: f.emission_category_name ?? "",
    group: grouped ? (f.parent_category ?? "") : null,
    excluded: false,
  }));
}

/** Starts each group on the AI's suggestion when it is high or medium confidence. */
export function initialMap(p: ParseResult, allowed: number[]): CategoryMap {
  const groups = groupsOf(p);
  const map: CategoryMap = Object.fromEntries(groups.map((g) => [g, null]));
  for (const s of p.category_suggestions ?? []) {
    if (s.suggested_category_id === null || s.confidence === "low" || !allowed.includes(s.suggested_category_id)) continue;
    const key = groups.length > 1 ? s.parent_category : "";
    if (key in map) map[key] = s.suggested_category_id;
  }
  return map;
}

export function suggestionFor(p: ParseResult, group: string): Suggestion | undefined {
  const list = p.category_suggestions ?? [];
  return groupsOf(p).length > 1 ? list.find((s) => s.parent_category === group) : list[0];
}

export type Columns = { name: number | null; value: number | null; unit: number | null; source: number | null };

/** The columns the AI picked. A factor column only exists for simple layouts; others read one per year. */
export function detectedColumns(s: Schema): Columns {
  return {
    name: s.descriptor_columns?.[0]?.column_index ?? null,
    value: s.layout_type === "simple" ? (s.years?.[0]?.value_column ?? null) : null,
    unit: s.unit_column?.column_index ?? null,
    source: s.source_column?.column_index ?? null,
  };
}

export function needsValueColumn(s: Schema): boolean {
  return s.layout_type === "simple";
}

/**
 * Schema override for re-analyze, or null when the columns are what the AI
 * found. Column 0 is a real column (the old modal treated it as "none").
 */
export function schemaOverride(s: Schema, c: Columns, columns: SheetColumn[]): Schema | null {
  const d = detectedColumns(s);
  if (d.name === c.name && d.value === c.value && d.unit === c.unit && d.source === c.source) return null;
  if (c.name === null) return null;
  const ref = (i: number | null, fallback: string): ColumnRef | null =>
    i === null ? null : { column_index: i, header_name: columns.find((x) => x.column_index === i)?.header_name ?? fallback };
  return {
    ...s,
    descriptor_columns: [ref(c.name, "Category")!],
    unit_column: ref(c.unit, "Unit"),
    source_column: ref(c.source, "Source"),
    years: c.value === null ? s.years : s.years.map((y) => ({ ...y, value_column: c.value })),
  };
}
