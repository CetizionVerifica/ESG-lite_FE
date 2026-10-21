/**
 * Insights contracts (IN-0): the frontend copy of ESG-lite
 * `src/insights/contracts/` (docs/insights/01-contracts.md §1–§8). Enums,
 * the panel envelope and each panel's data shape, rule ids and params, error
 * codes, and the FE routes and URL state.
 *
 * Change the backend contracts first (an IN-0 follow-up), copy its
 * `ci/insights-contracts.json` to `contracts.snapshot.json`, then this file;
 * `contracts.test.ts` compares the two.
 *
 * Rules for every shape: numbers are raw (unrounded) except card `params`;
 * `null` means "no data", never zero; percentages are numbers of percent
 * (12.5 = 12.5 %). The FE formats; it never computes a reported figure.
 */

// ---------------------------------------------------------------------------
// §1 Enums
// ---------------------------------------------------------------------------

export const PANEL_IDS = ["summary", "esg_ring", "decoupling", "target_wall", "cards", "pathway", "completeness", "bridge", "flow", "materiality", "stripes"] as const;
export type PanelId = (typeof PANEL_IDS)[number];

/** Panels that need KPI tracking: `availability: 'kpi_off'` (hidden, not empty) while it's off. */
export const KPI_PANELS = ["esg_ring", "materiality"] as const satisfies readonly PanelId[];

export const AVAILABILITIES = ["ok", "kpi_off", "no_data", "setup_incomplete"] as const;
export type Availability = (typeof AVAILABILITIES)[number];

export const TARGET_STATUSES = ["on_track", "at_risk", "off_track", "reached", "no_data"] as const;
export type TargetStatus = (typeof TARGET_STATUSES)[number];
/** The target wall's order (worst first). */
export const TARGET_STATUS_ORDER = ["off_track", "at_risk", "on_track", "reached", "no_data"] as const satisfies readonly TargetStatus[];

export const TARGET_SOURCES = ["sbti", "kpi"] as const;
export type TargetSource = (typeof TARGET_SOURCES)[number];

/** = KPI_PILLARS (KPI D19). */
export const PILLARS = ["environment", "social", "governance"] as const;
export type Pillar = (typeof PILLARS)[number];

export const DRIVERS = ["activity", "intensity_s1", "energy_intensity_s2", "grid_and_renewables_s2", "scope3", "other"] as const;
export type Driver = (typeof DRIVERS)[number];

export const EVENT_KINDS = ["initiative", "acquisition", "divestment", "method_change", "disruption", "other"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const CARD_SEVERITIES = ["good", "info", "attention", "critical"] as const;
export type CardSeverity = (typeof CARD_SEVERITIES)[number];
/** Cards are ranked critical → attention → good → info (I12). */
export const CARD_SEVERITY_RANK = ["critical", "attention", "good", "info"] as const satisfies readonly CardSeverity[];

export const CARD_SOURCES = ["rule", "ai"] as const;
export type CardSource = (typeof CARD_SOURCES)[number];

export const YEAR_TYPES = ["CY", "FY"] as const;
export type YearType = (typeof YEAR_TYPES)[number];

export const COMPARES = ["prior", "base"] as const;
export type Compare = (typeof COMPARES)[number];

export interface Period {
  year: number;
  yearType: YearType;
}

export type SiteFilter = "all" | number[];

export const ATTENTION_KINDS = ["approvals", "kpi_gaps", "off_track", "missing_submitters", "threshold"] as const;
export type AttentionKind = (typeof ATTENTION_KINDS)[number];

/** Who may open Insights (I1). Users never. */
export const INSIGHTS_ROLES = ["Manager", "Admin", "Superadmin"] as const;
export const canOpenInsights = (role: string | null | undefined) => !!role && (INSIGHTS_ROLES as readonly string[]).includes(role);

export const DECOUPLING_YEARS_DEFAULT = 5;
export const DECOUPLING_YEARS_MAX = 10;
export const STRIPES_MONTHS_MAX = 72;
export const EVENT_LABEL_MAX = 60;
export const MAX_CARDS = 6;
export const AI_TEXT_MAX = 180;

// ---------------------------------------------------------------------------
// §2 Envelope
// ---------------------------------------------------------------------------

export interface PendingNotIn {
  emissions: number;
  kpi_values: number;
  link: string | null;
}

export interface PanelResponse<T> {
  panel: PanelId;
  /** Not 'ok' → data is null and the FE shows the matching state. */
  availability: Availability;
  /** Plain words for the empty state. */
  reason?: string;
  period: Period;
  sites: SiteFilter;
  /** "CY 2026 · All sites" */
  label: string;
  data: T | null;
  pending_not_in: PendingNotIn;
  stamp: string;
  /** Drill-down targets, keyed by element id. */
  links: Record<string, string>;
}

/** GET /insights/status (any role; answers while off). */
export interface InsightsStatus {
  enabled: boolean;
  kpi_tracking: boolean;
}

/** GET /insights/sites (IN-0 addition): the caller's sites for the header chips. */
export interface InsightsSites {
  sites: { site_id: number; name: string }[];
}

// ---------------------------------------------------------------------------
// §3 Panel data shapes
// ---------------------------------------------------------------------------

export interface Summary {
  net: { value: number; unit: "tCO2e"; prior: number | null; change_pct: number | null; good: boolean | null };
  pathway: { status: TargetStatus; gap_pct: number | null; target_year: number | null } | null;
  intensity: { value: number | null; unit: string; combined: boolean; change_pct: number | null; good: boolean | null };
  readiness: { pct: number; by_pillar: Record<Pillar, number> } | null;
  /**
   * FE-proposed IN-0 follow-up (IN-1 Build 6): the renewable electricity share
   * the hero shows in place of readiness when KPI tracking is off. Optional
   * until the backend sends it; without it the cell says what's needed.
   */
  renewable_share_pct?: number | null;
  attention: { total: number; items: { kind: AttentionKind; count: number; link: string }[] };
}

export interface EsgRingTopic {
  topic: string;
  label: string;
  kpis: number;
  approved: number;
  coverage_pct: number;
  auto_share: number;
}
export interface EsgRing {
  pct: number;
  pillars: { pillar: Pillar; label: string; kpis: number; approved: number; coverage_pct: number; topics: EsgRingTopic[] }[];
}

export type DecouplingSeriesKey = "output" | "emissions" | "intensity";
export interface Decoupling {
  base_year: number;
  years: number[];
  series: { key: DecouplingSeriesKey; label: string; index: (number | null)[]; raw: (number | null)[]; unit: string }[];
  combined_output: boolean;
  decoupled: boolean;
  headline: { output_change_pct: number; emissions_change_pct: number; intensity_change_pct: number };
}

export interface TargetWallItem {
  id: string;
  source: TargetSource;
  pillar: Pillar;
  name: string;
  unit: string;
  progress_pct: number | null;
  expected_pct: number | null;
  status: TargetStatus;
  baseline: { year: number; value: number };
  target: { year: number; value: number };
  latest: { year: number; value: number } | null;
  direction_good: "down" | "up";
  link: string;
}
export interface TargetWall {
  items: TargetWallItem[];
}

export interface InsightCard {
  id: string;
  rule: RuleId;
  severity: CardSeverity;
  source: CardSource;
  params: Record<string, number | string>;
  /** Only when source = 'ai'; {{v:key}} tokens only. */
  text?: string;
  link: string | null;
  panel?: PanelId;
}
export interface Cards {
  cards: InsightCard[];
}

export interface EventRef {
  id: number;
  date: string;
  label: string;
  kind: EventKind;
  site_id: number | null;
}

export interface Pathway {
  base_year: number;
  target_year: number;
  annual_rate_pct: number;
  years: number[];
  pathway: number[];
  actual: { s1: (number | null)[]; s2: (number | null)[]; s3: (number | null)[] };
  levers: { key: "renewable_share" | "energy_intensity"; label: string; unit: string; values: (number | null)[] }[];
  gap_band: { year: number; gap: number }[];
  events: EventRef[];
}

export interface CompletenessCell {
  month: string;
  pct: number | null;
  emissions_expected: number;
  emissions_approved: number;
  kpi_expected: number;
  kpi_approved: number;
  link: string;
}
export interface Completeness {
  months: string[];
  rows: { site_id: number; site: string; cells: CompletenessCell[] }[];
}

export interface Bridge {
  from: { year: number; value: number };
  to: { year: number; value: number };
  steps: { driver: Driver; label: string; value: number; inputs: Record<string, number> }[];
  method: "lmdi_additive";
  notes: string[];
}

export interface Flow {
  nodes: { id: string; label: string; column: 0 | 1 | 2 | 3; kind: "site" | "scope" | "kpi" | "disclosure" }[];
  links: { source: string; target: string; value: number; measure: "tCO2e" | "count"; fit?: "exact" | "partial" | "derived" }[];
}

export interface Materiality {
  scored: boolean;
  points: {
    esrs_topic: string;
    label: string;
    impact: number | null;
    financial: number | null;
    weight: number;
    status: TargetStatus;
    kpis: number;
    on_track: number;
    off_track: number;
    link: string;
  }[];
}

export interface Stripes {
  months: string[];
  values: (number | null)[];
  unit: "tCO2e";
  min: number;
  max: number;
}

export interface PanelDataMap {
  summary: Summary;
  esg_ring: EsgRing;
  decoupling: Decoupling;
  target_wall: TargetWall;
  cards: Cards;
  pathway: Pathway;
  completeness: Completeness;
  bridge: Bridge;
  flow: Flow;
  materiality: Materiality;
  stripes: Stripes;
}

// ---------------------------------------------------------------------------
// §4 API
// ---------------------------------------------------------------------------

/** Panel id → its GET path under /insights. */
export const PANEL_PATHS: Record<PanelId, string> = {
  summary: "/summary",
  esg_ring: "/esg-ring",
  decoupling: "/decoupling",
  target_wall: "/target-wall",
  cards: "/cards",
  pathway: "/pathway",
  completeness: "/completeness",
  bridge: "/bridge",
  flow: "/flow",
  materiality: "/materiality",
  stripes: "/stripes",
};
/** Non-panel endpoints under /insights. */
export const OTHER_PATHS = ["/status", "/sites", "/events", "/events/:id", "/snapshot.pdf"] as const;

/** The common panel query (zod `InsightsQuerySchema` on the server). */
export interface InsightsQuery {
  year: number;
  yearType: YearType;
  sites: SiteFilter;
  pillar: Pillar | null;
  compare: Compare;
}

export interface EventCreate {
  date: string;
  label: string;
  kind: EventKind;
  site_id?: number | null;
}

export interface MaterialityScoresBody {
  topics: { esrs_topic: string; impact_score: number | null; financial_score: number | null }[];
}

// ---------------------------------------------------------------------------
// §6 Insight rules
// ---------------------------------------------------------------------------

export const RULE_IDS = [
  "decoupling",
  "largest_source",
  "site_concentration",
  "pathway_gap",
  "pathway_on_track",
  "target_off_track",
  "renewables_jump",
  "intensity_change",
  "biggest_mover",
  "coverage_gap",
  "pending_large",
] as const;
export type RuleId = (typeof RULE_IDS)[number];

export const RULES: Record<RuleId, { severities: CardSeverity[]; params: string[] }> = {
  decoupling: { severities: ["good"], params: ["output_pct", "emissions_pct", "base_year"] },
  largest_source: { severities: ["info"], params: ["category", "share_pct"] },
  site_concentration: { severities: ["info"], params: ["site", "scope", "share_pct"] },
  pathway_gap: { severities: ["critical"], params: ["gap_pct", "target_year"] },
  pathway_on_track: { severities: ["good"], params: ["margin_pct"] },
  target_off_track: { severities: ["attention"], params: ["count", "first_name"] },
  renewables_jump: { severities: ["good"], params: ["from_pct", "to_pct"] },
  intensity_change: { severities: ["good", "attention"], params: ["change_pct", "unit"] },
  biggest_mover: { severities: ["good", "attention"], params: ["name", "change_pct"] },
  coverage_gap: { severities: ["attention"], params: ["pillar", "pct", "missing"] },
  pending_large: { severities: ["attention"], params: ["count", "link"] },
};

// ---------------------------------------------------------------------------
// §7 Error codes
// ---------------------------------------------------------------------------

export const IN_ERROR_STATUS = {
  IN_OFF: 403,
  IN_FORBIDDEN: 403,
  IN_SITE_NOT_FOUND: 404,
  IN_EVENT_NOT_FOUND: 404,
  IN_EVENT_INVALID: 400,
  IN_SCORES_INVALID: 400,
  IN_AI_BUDGET: 429,
  IN_SNAPSHOT_TIMEOUT: 504,
  IN_VALIDATION: 400,
  IN_COMPANY_REQUIRED: 400,
} as const;
export type InErrorCode = keyof typeof IN_ERROR_STATUS;
export const isInErrorCode = (v: unknown): v is InErrorCode => typeof v === "string" && v in IN_ERROR_STATUS;

export interface InErrorBody {
  code: InErrorCode;
  message: string;
  details?: unknown;
}

/** The API error code of a failed request, if it's an Insights one. */
export function inErrorCode(error: unknown): InErrorCode | null {
  const code = (error as { response?: { data?: { code?: unknown } } } | null)?.response?.data?.code;
  return isInErrorCode(code) ? code : null;
}

// ---------------------------------------------------------------------------
// §9 FE routes and URL state
// ---------------------------------------------------------------------------

export const INSIGHTS_ROUTES = { page: "/insights", present: "/insights/present" } as const;
/** URL state keys: `?year=&yearType=&sites=&pillar=&compare=&panel=` (panel = scroll target). */
export const URL_KEYS = ["year", "yearType", "sites", "pillar", "compare", "panel"] as const;
