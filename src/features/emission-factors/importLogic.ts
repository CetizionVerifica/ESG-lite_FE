// P22 Import factors: pure logic shared by the simple-sheet and AI paths. No React here.
import { FACTOR_TYPES, FACTOR_TYPE_LABEL, GLOBAL_GEOGRAPHY, GWP_SETS, type FactorType, isFactorType } from "../../lib/scope3/factor";
import type { Category, Site } from "./logic";

/** S3-2 metadata a sheet may carry for a factor (sent as is; the server validates it). */
export type ImportMeta = {
  factor_type?: string;
  gwp_set?: string;
  geography?: string;
  dataset?: string;
  dataset_version?: string;
  co2_kg?: string;
  ch4_kg?: string;
  n2o_kg?: string;
  other_kgco2e?: string;
  biogenic_co2_kg?: string;
  includes_wtt?: boolean;
  price_base_year?: number;
  price_currency?: string;
};

/** One factor read from a sheet, editable in the Preview step. */
export type ImportRow = {
  key: string;
  year: number;
  factor_value: number;
  denominator_unit: string;
  source: string;
  emission_category_name: string;
  /** A simple sheet's "Global name": the name entries also match it by (a T&D-loss factor's activity). */
  global_name?: string;
  /** Excel parent group (AI path); null on simple sheets. */
  group: string | null;
  excluded: boolean;
  meta?: ImportMeta;
  /** The sheet's WTT sub-column, kept as its own factor (S3-2). */
  wtt?: boolean;
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
  global: ["global_category_name", "Global Category Name", "Global name", "Global Name"],
};

/** S3-2 metadata columns a simple sheet may add. */
const META_COLS: { field: Exclude<keyof ImportMeta, "includes_wtt" | "price_base_year">; names: string[] }[] = [
  // Only named headers: a generic "Type" or "GWP" column on an older sheet means something else.
  { field: "factor_type", names: ["factor_type", "Factor Type", "Factor type"] },
  { field: "gwp_set", names: ["gwp_set", "GWP Set", "GWP set"] },
  { field: "geography", names: ["geography", "Geography"] },
  { field: "dataset", names: ["dataset", "Dataset"] },
  { field: "dataset_version", names: ["dataset_version", "Dataset Version", "Dataset version"] },
  { field: "co2_kg", names: ["co2_kg", "CO2 kg", "kg CO2"] },
  { field: "ch4_kg", names: ["ch4_kg", "CH4 kg", "kg CH4"] },
  { field: "n2o_kg", names: ["n2o_kg", "N2O kg", "kg N2O"] },
  { field: "other_kgco2e", names: ["other_kgco2e", "Other kgCO2e"] },
  { field: "biogenic_co2_kg", names: ["biogenic_co2_kg", "Biogenic CO2 kg"] },
  { field: "price_currency", names: ["price_currency", "Price currency"] },
];
const PRICE_YEAR_COLS = ["price_base_year", "Price base year"];
const WTT_COLS = ["includes_wtt", "Includes WTT"];

const GAS_FIELDS = ["co2_kg", "ch4_kg", "n2o_kg", "other_kgco2e", "biogenic_co2_kg"] as const;
/** What ESG-lite accepts for a gas part (numeric(18,8), no sign, no exponent). */
const GAS_TEXT = /^\d{1,10}(\.\d{1,8})?$/;
/** What ESG-lite accepts for a geography: a country code or GLO. */
const GEOGRAPHY_TEXT = /^[A-Z0-9][A-Z0-9-]{1,15}$/;

/**
 * A gas part as ESG-lite stores it: a plain decimal rounded to 8 places.
 * Text that isn't a number 0 or more is returned as written, for rowProblem to report.
 */
export function gasText(cell: unknown): string {
  const raw = String(cell ?? "").trim();
  const n = typeof cell === "number" ? cell : parseFactor(raw);
  if (!Number.isFinite(n) || n < 0) return raw;
  const fixed = n.toFixed(8).replace(/\.?0+$/, "");
  return fixed === "" ? "0" : fixed;
}

/** "Global" and "World" are the drawer's Global option (GLO); anything else is upper-cased. */
export function geographyText(cell: unknown): string {
  const s = String(cell ?? "").trim().toUpperCase();
  return s === "GLOBAL" || s === "WORLD" ? GLOBAL_GEOGRAPHY : s;
}

/** A type cell: the key ("wtt") or its label ("Well-to-tank (WTT)"), any case; anything else is kept to be reported. */
export function readFactorType(cell: unknown): string {
  const s = String(cell ?? "").trim();
  const lower = s.toLowerCase();
  const hit = FACTOR_TYPES.find((t) => t === lower || FACTOR_TYPE_LABEL[t].toLowerCase() === lower);
  return hit ?? s;
}

function readMeta(r: Record<string, unknown>): ImportMeta | undefined {
  const meta: ImportMeta = {};
  for (const { field, names } of META_COLS) {
    const v = pick(r, names);
    if (v === undefined) continue;
    meta[field] =
      field === "factor_type"
        ? readFactorType(v)
        : field === "gwp_set"
          ? String(v).trim().toUpperCase()
          : field === "geography"
            ? geographyText(v)
            : (GAS_FIELDS as readonly string[]).includes(field)
              ? gasText(v)
              : field === "price_currency"
                ? String(v).trim().toUpperCase()
                : String(v).trim();
  }
  const priceYear = pick(r, PRICE_YEAR_COLS);
  if (priceYear !== undefined) meta.price_base_year = Number(String(priceYear).trim());
  const wtt = pick(r, WTT_COLS);
  if (wtt !== undefined) meta.includes_wtt = /^(true|yes|y|1)$/i.test(String(wtt).trim());
  return Object.keys(meta).length ? meta : undefined;
}

/**
 * A factor from a cell. Numbers pass through; text may use comma thousands
 * grouping ("1,234.5"). Anything else, such as a decimal comma ("0,5"), is NaN
 * so the row is reported rather than read as a different number.
 */
export function parseFactor(cell: unknown): number {
  if (typeof cell === "number") return cell;
  const s = String(cell ?? "").trim();
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return Number(s.replace(/,/g, ""));
  if (/^-?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return Number(s);
  return NaN;
}

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
    const v = parseFactor(value);
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
      ...(pick(r, COLS.global) !== undefined ? { global_name: String(pick(r, COLS.global)).trim() } : {}),
      group: null,
      excluded: false,
      ...(readMeta(r) ? { meta: readMeta(r) } : {}),
    });
  });
  return { rows, errors };
}

/** Problems that stop a row from being saved; excluded rows are never checked. */
export function rowProblem(r: ImportRow): string | null {
  if (!Number.isInteger(r.year) || r.year < 1990 || r.year > 2100) return "Year must be between 1990 and 2100.";
  if (!Number.isFinite(r.factor_value) || r.factor_value < 0) return "Factor must be 0 or more.";
  // numeric(18,8) since S3-2.
  if (Math.abs(r.factor_value) >= 10_000_000_000) return "Factor must be below 10,000,000,000.";
  if (!r.denominator_unit.trim()) return "Unit is required.";
  const t = r.meta?.factor_type;
  if (t && !isFactorType(t)) return `Type "${t}" isn't one of the factor types.`;
  const g = r.meta?.gwp_set;
  if (g && !(GWP_SETS as readonly string[]).includes(g)) return "GWP set must be AR4, AR5 or AR6.";
  // S3-0 rule, enforced by the server: a spend (EEIO) factor needs its price base year and currency.
  if (t === "eeio_spend" && !(Number.isInteger(r.meta?.price_base_year) && /^[A-Z]{3}$/.test(r.meta?.price_currency ?? "")))
    return "A spend (EEIO) factor needs its price base year and currency (price_base_year, price_currency columns).";
  const geo = r.meta?.geography;
  if (geo && !GEOGRAPHY_TEXT.test(geo)) return `Geography "${geo}" must be a country code (for example GB) or Global.`;
  for (const k of GAS_FIELDS) {
    const v = r.meta?.[k];
    if (v != null && !GAS_TEXT.test(v)) return `Gas part "${v}" must be a number 0 or more, below 10,000,000,000.`;
  }
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
} & ImportMeta;

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
        const body: FactorBody = { ...r.meta, site_id: site.site_id, category_id: categoryId, year: r.year, factor_value: r.factor_value };
        if (r.denominator_unit.trim()) body.denominator_unit = r.denominator_unit.trim();
        if (r.source.trim()) body.source = r.source.trim();
        // The full composite name: column configs split it on " - " and entries look factors up by it.
        if (name) {
          body.emission_category_name = name;
          // The sheet's global name when it has one (a T&D-loss factor's activity, S3-7), else the name again.
          body.global_category_name = r.global_name?.trim() || name;
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

/** One bulk call's outcome; `problems` are the server's reasons for each skipped row. */
export type JobResult = { site: string; category: string; categoryId: number; siteId: number; created: number; skipped: number; problems: string[]; error: string | null };

export function totals(results: JobResult[]): { created: number; skipped: number; failed: number } {
  return results.reduce((t, r) => ({ created: t.created + r.created, skipped: t.skipped + r.skipped, failed: t.failed + (r.error ? 1 : 0) }), { created: 0, skipped: 0, failed: 0 });
}

export const SHEET_ACCEPT = [".xlsx", ".xls"];
export const SHEET_MAX = 10 * 1024 * 1024;

// ---------------------------------------------------------------------------
// AI read (python_AI_service /v1/emission-factors/parse-excel)
// ---------------------------------------------------------------------------

export type ParsedFactor = {
  year: number;
  factor_value: number;
  /** The exact figure (S3-2); preferred over `factor_value` when present. */
  factor_value_text?: string | null;
  denominator_unit?: string | null;
  source?: string | null;
  emission_category_name?: string | null;
  parent_category?: string | null;
  // S3-2: one candidate per sub-column, with its type and gas parts.
  factor_type?: string | null;
  sub_column?: string | null;
  /** The sub-column older imports took ("Total"). Absent = true. */
  primary?: boolean | null;
  includes_wtt?: boolean | null;
  co2_kg?: string | null;
  ch4_kg?: string | null;
  n2o_kg?: string | null;
  biogenic_co2_kg?: string | null;
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

/** The sheet's own groups matter only when it has more than one. */
const sheetGrouped = (p: ParseResult) => p.parent_categories.length > 1;

/** A WTT sub-column kept as its own factor (S3-2): not the primary column, typed wtt. */
const isWttCandidate = (f: ParsedFactor) => f.factor_type === "wtt" && f.primary === false;

/** WTT factors get a group of their own, so they can be mapped to a FERA / Category 3 category or skipped. */
export const WTT_GROUP_SUFFIX = "WTT";
function groupOf(p: ParseResult, f: ParsedFactor): string | null {
  const base = sheetGrouped(p) ? (f.parent_category ?? "") : null;
  if (!isWttCandidate(f)) return base;
  return base ? `${base} · ${WTT_GROUP_SUFFIX}` : WTT_GROUP_SUFFIX;
}
const isWttGroup = (g: string) => g === WTT_GROUP_SUFFIX || g.endsWith(` · ${WTT_GROUP_SUFFIX}`);

/** Groups only matter when the sheet has more than one, or has WTT factors; otherwise everything is one group (""). */
export function groupsOf(p: ParseResult): string[] {
  const base = sheetGrouped(p) ? p.parent_categories : [""];
  const wtt = [...new Set(p.factors.filter(isWttCandidate).map((f) => groupOf(p, f) ?? ""))].sort();
  return [...base, ...wtt];
}

/** A factor of the AI read as a Preview row: exact value, its type and gas parts carried along. */
const PARSED_GASES = ["co2_kg", "ch4_kg", "n2o_kg", "biogenic_co2_kg"] as const;
const hasGases = (f: ParsedFactor) => PARSED_GASES.some((k) => f[k] != null);

/**
 * The AI service puts a sheet's gas columns on its "Direct" candidate, which
 * starts excluded. The kept primary takes them when it has none of its own, so
 * a default import doesn't drop them.
 */
function gasSource(p: ParseResult, f: ParsedFactor): ParsedFactor {
  if (f.primary === false || hasGases(f)) return f;
  const name = f.emission_category_name ?? "";
  if (!name) return f;
  // "<name><separator><sub-column>": only a short separator may sit between them,
  // so "Petrol" never takes "Petrol (average biofuel blend) - Direct".
  const isSibling = (d: ParsedFactor) => {
    const n = d.emission_category_name ?? "";
    const sub = d.sub_column ?? "";
    if (!sub || !n.startsWith(name) || !n.endsWith(sub) || n.length < name.length + sub.length) return false;
    return /^\W{1,5}$/.test(n.slice(name.length, n.length - sub.length));
  };
  const direct = p.factors.find(
    (d) =>
      d.primary === false &&
      d.year === f.year &&
      /\bdirect\b/i.test(d.sub_column ?? "") &&
      (d.parent_category ?? null) === (f.parent_category ?? null) &&
      isSibling(d) &&
      hasGases(d),
  );
  return direct ?? f;
}

export function rowsFromParse(p: ParseResult): ImportRow[] {
  return p.factors.map((f, i) => {
    const exact = f.factor_value_text != null ? Number(f.factor_value_text) : NaN;
    const meta: ImportMeta = {};
    if (f.factor_type) meta.factor_type = f.factor_type;
    if (f.includes_wtt) meta.includes_wtt = true;
    const gases = gasSource(p, f);
    for (const k of PARSED_GASES) if (gases[k] != null) meta[k] = gasText(gases[k]);
    const wtt = isWttCandidate(f);
    return {
      key: `a${i + 1}`,
      year: f.year,
      factor_value: Number.isFinite(exact) ? exact : f.factor_value,
      denominator_unit: f.denominator_unit ?? "",
      source: f.source ?? "",
      emission_category_name: f.emission_category_name ?? "",
      group: groupOf(p, f),
      // Other non-primary sub-columns (e.g. "Direct") start excluded: the primary keeps the name entries look up.
      excluded: f.primary === false && !wtt,
      ...(Object.keys(meta).length ? { meta } : {}),
      ...(wtt ? { wtt: true } : {}),
    };
  });
}

/** Starts each group on the AI's suggestion when it is high or medium confidence. WTT groups start skipped. */
export function initialMap(p: ParseResult, allowed: number[]): CategoryMap {
  const groups = groupsOf(p);
  const map: CategoryMap = Object.fromEntries(groups.map((g) => [g, null]));
  for (const s of p.category_suggestions ?? []) {
    if (s.suggested_category_id === null || s.confidence === "low" || !allowed.includes(s.suggested_category_id)) continue;
    const key = sheetGrouped(p) ? s.parent_category : "";
    if (key in map) map[key] = s.suggested_category_id;
  }
  return map;
}

export function suggestionFor(p: ParseResult, group: string): Suggestion | undefined {
  if (isWttGroup(group)) return undefined;
  const list = p.category_suggestions ?? [];
  return sheetGrouped(p) ? list.find((s) => s.parent_category === group) : list[0];
}

/** The plain label of a row's type, for the Preview. */
export function rowTypeLabel(r: ImportRow): string {
  const t = r.meta?.factor_type;
  return t ? (isFactorType(t) ? FACTOR_TYPE_LABEL[t as FactorType] : t) : "";
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
