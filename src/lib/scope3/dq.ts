/**
 * S3-3 · How a row was calculated (method) and how good its data is (DQ), for
 * the screen. Spec: ./CLAUDE.md (docs/scope3/modules/S3-3-method-and-data-quality).
 *
 * The shapes are the S3-0 contracts (`contracts.ts` §1, §3); nothing here
 * restates the method list or the 1–3 scale. The automatic default mirrors
 * ESG-lite `src/scope3/dq/defaults.ts` rule for rule, so the live "Data
 * quality" line in Add data reaches the same answer the engine saves. The FE
 * never saves a score: drawers and lists read the server's `dq`.
 */
import {
  DQ_INDICATORS,
  METHOD_KEYS,
  type DataType,
  type Dq,
  type DqIndicator,
  type DqScore,
  type Method,
  type MethodOptions,
  ghgCategory,
} from "./contracts";
import { DATA_TYPE_LABELS, DQ_LABELS, dqLabel, methodLabel } from "./labels";

export { DQ_INDICATORS, DQ_LABELS, DATA_TYPE_LABELS, dqLabel, methodLabel };
export type { DataType, Dq, DqIndicator, DqScore, Method, MethodOptions };

/** A method a row can carry ("unknown" is only ever a backfill value). */
export type RowMethod = Exclude<Method, "unknown">;

export const isMethod = (value: unknown): value is Method => typeof value === "string" && (METHOD_KEYS as readonly string[]).includes(value);
export const isRowMethod = (value: unknown): value is RowMethod => isMethod(value) && value !== "unknown";
export const isDqScore = (value: unknown): value is DqScore => value === 1 || value === 2 || value === 3;

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

/** The five indicators in plain words (Scope 3 Standard §7.3). */
export const DQ_INDICATOR_LABELS: Record<DqIndicator, string> = {
  technology: "Technology",
  geography: "Geography",
  time: "Time",
  completeness: "Completeness",
  reliability: "Reliability",
};

/** What each indicator asks, for tooltips. */
export const DQ_INDICATOR_HINTS: Record<DqIndicator, string> = {
  technology: "How closely the factor describes the actual process or product.",
  geography: "Whether the factor is for the site's own country.",
  time: "How close the factor's year is to the reporting year.",
  completeness: "Whether the figure covers all the activity, not a sample scaled up.",
  reliability: "How the figure was obtained, and whether evidence backs it.",
};

/** One plain line per method for the Add data radio cards (canvas screen 3). */
export const METHOD_HINTS: Record<Method, string> = {
  supplier_specific: "Your supplier's own cradle-to-gate figure for what you bought.",
  hybrid: "Your supplier's energy and materials, with averages for the rest.",
  average_data: "The amount (mass, distance, floor area…) times an average factor.",
  spend_based: "The amount spent times an average factor per unit of money. Quickest, least exact.",
  fuel_based: "The fuel actually used times its factor.",
  distance_based: "The distance (and weight, for freight) times a factor per km.",
  site_specific: "Energy and fuel measured at the site.",
  waste_type_specific: "Each waste type and how it's treated, times its factor.",
  asset_specific: "Energy and fuel measured for each asset.",
  lessor_specific: "The lessor's own Scope 1 and 2 figure, for your share.",
  lessee_specific: "The lessee's own Scope 1 and 2 figure, for their share.",
  direct_use: "Energy, fuel or gases the product uses or releases over its life.",
  indirect_use: "Energy the product needs indirectly, such as heating water to wash it.",
  franchise_specific: "Each franchise's own Scope 1 and 2 figure.",
  investment_specific: "The investee's own Scope 1 and 2 figure, for your share.",
  project_specific: "The project's own emissions, for your share.",
  unknown: "How this entry was calculated wasn't recorded.",
};

export const methodHint = (key: string): string => (isMethod(key) ? METHOD_HINTS[key] : "");

const METHOD_LABEL_NONE = "Not recorded";

/** "How it was calculated" for a row; "Not recorded" for a row without a method. */
export function rowMethodText(method: string | null | undefined, ghg?: number | null): string {
  return method ? methodLabel(method, ghg) : METHOD_LABEL_NONE;
}

/** What a saved row says about its method and data quality (GET /user/emissions fields). */
export type RowQualityFields = {
  method?: string | null;
  dq?: unknown;
  data_type?: string | null;
  is_estimate?: boolean | null;
  category?: { scope?: string | null; ghg_category?: number | null } | null;
};

/**
 * The drawer lines for a saved row: "How it was calculated", the data quality
 * and primary / secondary. `show` is false for a Scope 1 or 2 row that carries
 * none of it, so those drawers don't gain empty lines.
 */
export function rowQuality(row: RowQualityFields) {
  const dq = readDq(row.dq);
  const scope3 = /3/.test(String(row.category?.scope ?? "")) || row.category?.ghg_category != null;
  const dataType = row.data_type === "primary" || row.data_type === "secondary" ? DATA_TYPE_LABELS[row.data_type] : null;
  return {
    show: scope3 || !!row.method || dq !== null || !!row.is_estimate,
    method: rowMethodText(row.method, row.category?.ghg_category),
    dq,
    dataType,
    estimate: !!row.is_estimate,
  };
}

/** Badge tone per score: the word and glyph carry the meaning, the tone only helps. */
export const DQ_TONES: Record<DqScore, "good" | "info" | "warn"> = { 1: "good", 2: "info", 3: "warn" };

// ---------------------------------------------------------------------------
// Reading what the server sends
// ---------------------------------------------------------------------------

/** A row's `dq` (jsonb), checked: null unless it has all five indicators. `overall` is derived when missing. */
export function readDq(value: unknown): Dq | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (!DQ_INDICATORS.every((k) => isDqScore(v[k]))) return null;
  const indicators = Object.fromEntries(DQ_INDICATORS.map((k) => [k, v[k]])) as Record<DqIndicator, DqScore>;
  return {
    ...indicators,
    overall: isDqScore(v.overall) ? v.overall : overallOf(indicators),
    source: v.source === "manual" ? "manual" : "auto",
  };
}

/**
 * `column_config.method_options`, most specific first. The contract shape is
 * `[{method, units}]` (§6); a list of bare method keys (as ESG-lite #135 stores
 * it) is read too, with no units. Unknown keys, "unknown" and repeats are dropped.
 */
export function readMethodOptions(value: unknown): MethodOptions {
  if (!Array.isArray(value)) return [];
  const out: MethodOptions = [];
  for (const item of value) {
    const raw = typeof item === "string" ? { method: item, units: [] } : item && typeof item === "object" ? (item as { method?: unknown; units?: unknown }) : null;
    if (!raw || !isRowMethod(raw.method) || out.some((o) => o.method === raw.method)) continue;
    const units = Array.isArray(raw.units) ? raw.units.filter((u): u is string => typeof u === "string" && u.trim() !== "").map((u) => u.trim()) : [];
    out.push({ method: raw.method, units });
  }
  return out;
}

/** The units a method offers on this form, or null when the form doesn't limit them. */
export function unitsForMethod(options: MethodOptions, method: string | null | undefined): string[] | null {
  const units = options.find((o) => o.method === method)?.units ?? [];
  return units.length ? units : null;
}

/** A category's methods in contract order (most specific first), with their labels. */
export function categoryMethods(n: number | null | undefined): { key: RowMethod; label: string }[] {
  return n == null ? [] : (ghgCategory(n)?.methods ?? []).map((m) => ({ key: m.key, label: m.label }));
}

/**
 * Sort methods most specific first: the category's own order, then any others
 * in contract order (a form may offer a method the category table doesn't list).
 */
export function orderMethods<T extends string>(methods: readonly T[], n?: number | null): T[] {
  const rank = (m: string) => {
    const own = categoryMethods(n).findIndex((c) => c.key === m);
    return own >= 0 ? own : 100 + METHOD_KEYS.indexOf(m as Method);
  };
  return [...new Set(methods)].sort((a, b) => rank(a) - rank(b));
}

// ---------------------------------------------------------------------------
// The automatic default (mirror of ESG-lite src/scope3/dq/defaults.ts, §3)
// ---------------------------------------------------------------------------

/** Methods that describe the activity itself (Table III); they score 1 on reliability and make data primary. */
export const PRIMARY_METHODS: readonly Method[] = [
  "supplier_specific",
  "site_specific",
  "asset_specific",
  "lessor_specific",
  "lessee_specific",
  "franchise_specific",
  "investment_specific",
];

const isPrimaryMethod = (method: Method) => PRIMARY_METHODS.includes(method);

export interface DqFactorInput {
  /** ISO-3166 alpha-2, a region code, or `GLO`. */
  geography?: string | null;
  year?: number | null;
  factor_type?: string | null;
}

export interface DqInput {
  method: Method;
  factor?: DqFactorInput | null;
  /** The site's country, ISO-3166 alpha-2. */
  siteCountry?: string | null;
  /** The year the row is reported in (not the factor year). */
  reportingYear: number;
  hasEvidence?: boolean;
  /** A screening estimate or an extrapolation (S3-12). */
  isProxy?: boolean;
}

const clean = (v?: string | null) => String(v ?? "").trim();

/** The rounded mean of the five indicators (contracts §3 `overallOf`). */
export function overallOf(dq: Record<DqIndicator, DqScore>): DqScore {
  const mean = DQ_INDICATORS.reduce((sum, k) => sum + dq[k], 0) / DQ_INDICATORS.length;
  return Math.min(3, Math.max(1, Math.round(mean))) as DqScore;
}

/** Site country 1, a region 2, `GLO`, missing or another country 3. */
export function geographyScore(factorGeography?: string | null, siteCountry?: string | null): DqScore {
  const geography = clean(factorGeography).toUpperCase();
  if (!geography || geography === "GLO") return 3;
  if (geography.length !== 2) return 2;
  const country = clean(siteCountry).toUpperCase();
  if (!country) return 3;
  return geography === country ? 1 : 3;
}

/** The reporting year or one year off 1, within three years 2, older 3. */
export function timeScore(factorYear?: number | null, reportingYear?: number | null): DqScore {
  if (!factorYear || !reportingYear) return 3;
  const distance = Math.abs(reportingYear - factorYear);
  return distance <= 1 ? 1 : distance <= 3 ? 2 : 3;
}

/** Specific methods 1, hybrid / average / distance / fuel 2, spend 3; no evidence caps it at 2. */
export function reliabilityScore(method: Method, hasEvidence?: boolean): DqScore {
  const base: DqScore = method === "spend_based" || method === "unknown" ? 3 : isPrimaryMethod(method) ? 1 : 2;
  return hasEvidence ? base : (Math.max(base, 2) as DqScore);
}

export const completenessScore = (isProxy?: boolean): DqScore => (isProxy ? 3 : 1);

/** Supplier or process factor 1, spend factor 3, else by method (specific 1, spend 3, others 2). */
export function technologyScore(method: Method, factorType?: string | null): DqScore {
  const type = clean(factorType);
  if (type === "supplier" || type === "process") return 1;
  if (type === "eeio_spend") return 3;
  if (isPrimaryMethod(method)) return 1;
  if (method === "spend_based" || method === "unknown") return 3;
  return 2;
}

export const dataTypeFor = (input: Pick<DqInput, "method" | "hasEvidence">): DataType =>
  isPrimaryMethod(input.method) || input.hasEvidence ? "primary" : "secondary";

/** The five indicators and the overall score, `source: 'auto'`: what the engine will save. */
export function autoDq(input: DqInput): Dq {
  const indicators = {
    technology: technologyScore(input.method, input.factor?.factor_type),
    geography: geographyScore(input.factor?.geography, input.siteCountry),
    time: timeScore(input.factor?.year, input.reportingYear),
    completeness: completenessScore(input.isProxy),
    reliability: reliabilityScore(input.method, input.hasEvidence),
  };
  return { ...indicators, overall: overallOf(indicators), source: "auto" };
}

// ---------------------------------------------------------------------------
// Filters (GET /user/emissions `method=`, `dq_max=`)
// ---------------------------------------------------------------------------

/** `dq_max` choices: rows at least this good (1 is best). */
export const DQ_FILTER_OPTIONS: { value: "1" | "2" | "3"; label: string }[] = [
  { value: "1", label: "Good" },
  { value: "2", label: "Good or fair" },
  { value: "3", label: "Scored (any)" },
];

export const parseDqMax = (value: string | null | undefined): DqScore | null => {
  const n = Number(value);
  return isDqScore(n) ? n : null;
};

export const parseMethodFilter = (value: string | null | undefined): Method | null => (isMethod(value) ? value : null);

/** Every method as a filter choice, in contract order, plain labels. */
export const METHOD_FILTER_OPTIONS: { value: Method; label: string }[] = METHOD_KEYS.map((k) => ({ value: k, label: methodLabel(k) }));

// ---------------------------------------------------------------------------
// METHOD_NOT_ALLOWED
// ---------------------------------------------------------------------------

/** True when a save failed because the form doesn't offer the row's method. */
export function isMethodNotAllowed(error: unknown): boolean {
  const data = (error as { response?: { data?: { code?: unknown } } })?.response?.data;
  return data?.code === "METHOD_NOT_ALLOWED";
}

/** The server's words for a refused method (they name the methods the form offers), or a fallback. */
export function methodNotAllowedMessage(error: unknown): string {
  const message = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  return typeof message === "string" && message ? message : "This calculation method isn't offered for this category. Pick another method.";
}
