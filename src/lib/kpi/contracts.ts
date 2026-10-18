/**
 * KPI tracking contracts (KPI-0): the frontend copy of ESG-lite
 * `src/kpi/contracts/` (docs/kpi/01-contracts.md §1–§6). Enums, record types,
 * the HTTP shapes, error codes, review check ids and route ids. Pages read
 * their words from `labels.ts`, never their own strings.
 *
 * Change the backend contracts first (a KPI-0 follow-up), then this file.
 *
 * Where 01-contracts names an endpoint but not its exact response, the shape
 * here is marked "mock shape": the owning module confirms or changes it in a
 * KPI-0 follow-up, and `src/test/msw/kpi.ts` answers with it until then.
 */

// ---------------------------------------------------------------------------
// §1 Enums
// ---------------------------------------------------------------------------

export const FRAMEWORK_CODES = ["GRI", "BRSR", "ESRS"] as const;
export type FrameworkCode = (typeof FRAMEWORK_CODES)[number];

export const REQUIREMENT_LEVELS = ["required", "if_material", "voluntary", "core"] as const;
export type RequirementLevel = (typeof REQUIREMENT_LEVELS)[number];

export const KPI_TOPICS = [
  "climate",
  "energy",
  "water",
  "waste",
  "pollution",
  "biodiversity",
  "materials",
  "workforce",
  "health_safety",
  "diversity",
  "training",
  "human_rights",
  "community",
  "customers",
  "governance",
  "ethics",
] as const;
export type KpiTopic = (typeof KPI_TOPICS)[number];

export const KPI_VALUE_TYPES = ["number", "percent", "integer", "currency", "yes_no", "choice", "text"] as const;
export type KpiValueType = (typeof KPI_VALUE_TYPES)[number];

export const KPI_SOURCES = ["manual", "auto", "formula"] as const;
export type KpiSource = (typeof KPI_SOURCES)[number];

export const KPI_AGGREGATIONS = ["sum", "average", "weighted_average", "max", "latest", "none"] as const;
export type KpiAggregation = (typeof KPI_AGGREGATIONS)[number];

export const KPI_LEVELS = ["site", "company"] as const;
export type KpiLevel = (typeof KPI_LEVELS)[number];

export const KPI_FREQUENCIES = ["monthly", "quarterly", "annual"] as const;
export type KpiFrequency = (typeof KPI_FREQUENCIES)[number];

export const KPI_VALUE_STATUSES = ["draft", "pending", "approved", "rejected"] as const;
export type KpiValueStatus = (typeof KPI_VALUE_STATUSES)[number];

export const MAPPING_FITS = ["exact", "partial", "derived"] as const;
export type MappingFit = (typeof MAPPING_FITS)[number];

/** Each key is one KPI-5 adapter. `ghg_scope3_category_n` carries the category number in the definition's `auto_source_param`. */
export const AUTO_SOURCE_KEYS = [
  "ghg_scope1",
  "ghg_scope2_location",
  "ghg_scope2_market",
  "ghg_scope3_total",
  "ghg_scope3_category_n",
  "energy_total",
  "energy_renewable",
  "energy_non_renewable",
  "production_output",
  "waste_total",
] as const;
export type AutoSourceKey = (typeof AUTO_SOURCE_KEYS)[number];

/** §2 `kpi_definition.unit_dimension`. */
export const UNIT_DIMENSIONS = ["energy", "mass", "volume", "count", "currency", "ratio", "time", "none"] as const;
export type UnitDimension = (typeof UNIT_DIMENSIONS)[number];

/** §2 `kpi_disclosure.esrs_topic` and `company_material_topic.esrs_topic` (D13: E1–E5, S1–S4, G1). */
export const ESRS_TOPICS = ["E1", "E2", "E3", "E4", "E5", "S1", "S2", "S3", "S4", "G1"] as const;
export type EsrsTopic = (typeof ESRS_TOPICS)[number];

/** §2 `company_kpi_settings.year_type`. */
export const YEAR_TYPES = ["CY", "FY"] as const;
export type YearType = (typeof YEAR_TYPES)[number];

/** §2 `kpi_target.direction`. */
export const TARGET_DIRECTIONS = ["reduce", "increase", "maintain"] as const;
export type TargetDirection = (typeof TARGET_DIRECTIONS)[number];

/** Report download formats of `GET /kpi/reports/:framework`. */
export const REPORT_FORMATS = ["json", "xlsx", "pdf"] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

// ---------------------------------------------------------------------------
// §2 Records
// ---------------------------------------------------------------------------

/** `kpi_definition.breakdowns`, e.g. `{ by: ["source"], values: ["groundwater", "surface", "third_party"] }`. */
export interface KpiBreakdowns {
  by: string[];
  values: string[];
}

/** `kpi_definition`: one KPI, defined once (library) or a company's own (`company_id` set). */
export interface KpiDefinition {
  id: number;
  /** Stable, e.g. `ENERGY_TOTAL`. */
  code: string;
  name: string;
  /** Plain language, as asked to the contributor. `{site}` and `{period}` are filled in by the page. */
  question: string;
  /** Markdown: what counts and what to leave out. */
  help: string | null;
  topic: KpiTopic;
  value_type: KpiValueType;
  unit_dimension: UnitDimension;
  canonical_unit: string | null;
  allowed_units: string[];
  aggregation: KpiAggregation;
  level: KpiLevel;
  default_frequency: KpiFrequency;
  source: KpiSource;
  /** Null unless `source` is `auto`. */
  auto_source: AutoSourceKey | null;
  /** Null unless `source` is `formula`. KPI codes and + − × ÷ ( ), e.g. `(GHG_SCOPE1 + GHG_SCOPE2_LB) / REVENUE`. */
  formula: string | null;
  breakdowns: KpiBreakdowns | null;
  decimals: number;
  /** Null = the library; set = a company's custom KPI (KPI-3). */
  company_id: number | null;
  active: boolean;
  created_at: string;
}

/** `kpi_framework`: one framework version, e.g. `GRI 2021+`. */
export interface KpiFramework {
  id: number;
  code: FrameworkCode;
  version: string;
  name: string;
  source_url: string;
  active: boolean;
  default_for_new: boolean;
}

/** `kpi_disclosure`: one disclosure or datapoint of a framework version. `title` is our own words (D7). */
export interface KpiDisclosure {
  id: number;
  framework_id: number;
  /** e.g. `305-1`, `P6-E7`, `E1-6`. */
  code: string;
  title: string;
  /** e.g. `GRI 305`, `Principle 6 · Essential`, `E1 Climate change`. */
  section: string;
  requirement: RequirementLevel;
  esrs_topic: EsrsTopic | null;
  source_url: string;
  sort_key: number;
}

/** `kpi_disclosure_map`: a KPI answers a disclosure. */
export interface KpiDisclosureMap {
  id: number;
  disclosure_id: number;
  kpi_definition_id: number;
  fit: MappingFit;
  breakdown_key: string | null;
  /** The framework's unit, e.g. `GJ` for BRSR energy. */
  display_unit: string | null;
  /** Shown in exports for `partial` and `derived` fits. */
  note: string | null;
}

/** `company_kpi_settings` (KPI-3). */
export interface CompanyKpiSettings {
  company_id: number;
  year_type: YearType;
  first_year: number;
  /** Values for a period are due on this day of the following month / quarter / year (D16). */
  due_day: number;
  setup_completed_at: string | null;
}

/** `company_framework` (KPI-3). */
export interface CompanyFramework {
  company_id: number;
  framework_id: number;
  enabled_at: string;
  enabled_by: number;
}

/** `company_material_topic` (KPI-3, D13). `reason` is required when not material. */
export interface CompanyMaterialTopic {
  company_id: number;
  esrs_topic: EsrsTopic;
  material: boolean;
  reason: string | null;
  decided_by: number | null;
  decided_at: string | null;
}

/** `company_kpi` (KPI-3). */
export interface CompanyKpi {
  company_id: number;
  kpi_definition_id: number;
  selected: boolean;
  /** Null = the definition's default frequency. */
  frequency: KpiFrequency | null;
  reason_excluded: string | null;
}

/** `kpi_assignment` (KPI-3). `reviewer_user_id` null = the site's managers. */
export interface KpiAssignment {
  company_id: number;
  kpi_definition_id: number;
  /** Null for company-level KPIs. */
  site_id: number | null;
  owner_user_id: number;
  reviewer_user_id: number | null;
}

/**
 * `kpi_topic_assignment` (D17, wave D): per site (null = the company level)
 * each topic has one owner; the reviewer is optional (null = the site's
 * Managers). A `kpi_assignment` row for a KPI × site overrides it.
 */
export interface KpiTopicAssignment {
  id?: number;
  site_id: number | null;
  topic: KpiTopic;
  /** Null in a `PUT /kpi/setup` row removes the slot. */
  owner_user_id: number | null;
  reviewer_user_id: number | null;
}

/** `GET /kpi/setup` `topics_in_use` (D17): topics of the selected KPIs, in `KPI_TOPICS` order. */
export interface KpiTopicInUse {
  topic: KpiTopic;
  kpi_count: number;
}

/** `GET /kpi/people/:user_id/topics` (D17): the topics a person owns, overall and per site. */
export interface KpiPersonTopics {
  topics: KpiTopic[];
  by_site: { site_id: number | null; site_name: string | null; topics: KpiTopic[] }[];
}

/** `PUT /kpi/people/:user_id/topics` body (D17). `site_ids` left out = all of the person's sites. */
export interface PutKpiPersonTopicsBody {
  topics: KpiTopic[];
  site_ids?: number[];
}

/** One slot that changed hands: "Water at Noida moved from Ravi to Priya". */
export interface KpiTopicMove {
  site_id: number | null;
  site_name: string | null;
  topic: KpiTopic;
  from_user_id: number | null;
  from_name: string | null;
}

/** `PUT /kpi/people/:user_id/topics` answer (D17). */
export interface PutKpiPersonTopicsResult {
  topics: KpiTopic[];
  site_ids: number[];
  moved: KpiTopicMove[];
}

/** `kpi_topic_grant` (wave B): no longer read since D17; topics come from topic assignments. */
export interface KpiTopicGrant {
  user_id: number;
  topic: KpiTopic;
}

/** `kpi_value.checks` (KPI-8): one held check. */
export interface KpiValueCheck {
  id: KpiCheckId;
  /** Plain words from the server, e.g. "3× last September". */
  detail?: string | null;
}

/** `kpi_value` (KPI-4). Unique per (company, site, kpi, period_start, frequency). */
export interface KpiValue {
  id: number;
  company_id: number;
  site_id: number | null;
  kpi_definition_id: number;
  /** YYYY-MM-DD */
  period_start: string;
  /** YYYY-MM-DD */
  period_end: string;
  frequency: KpiFrequency;
  year_type: YearType;
  value_numeric: number | null;
  value_text: string | null;
  /** As entered. */
  unit: string | null;
  /** In the definition's `canonical_unit`. */
  value_canonical: number | null;
  breakdown: Record<string, number> | null;
  source: KpiSource;
  status: KpiValueStatus;
  is_estimate: boolean;
  comment: string | null;
  entered_by: number | null;
  submitted_at: string | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  review_comment: string | null;
  checks: KpiValueCheck[] | null;
  /** KPI-5: what an auto value was read from. */
  auto_snapshot: { read_at: string; rows: number; link?: string | null } | null;
  created_at: string;
  updated_at: string;
  /** The server adds these to every value it answers with (KPI-4 as built). */
  kpi_code?: string;
  canonical_unit?: string | null;
  evidence?: KpiEvidenceOut[];
  /** Assumed (KPI-8 FE): read when the server adds them to a pending value; the review list falls back to the catalogue, the setup and last year's value. */
  kpi_name?: string | null;
  site_name?: string | null;
  entered_by_name?: string | null;
  last_value?: { value: number | null; unit: string | null; period_start: string } | null;
  change_pct?: number | null;
}

/** Evidence as listed on a value (`GET /kpi/values`, `PUT /kpi/values` results, `/kpi/my`). */
export type KpiEvidenceOut = Pick<KpiValueEvidence, "id" | "document_url" | "document_name" | "uploaded_by" | "uploaded_at">;

/** `kpi_value_evidence` (KPI-4). */
export interface KpiValueEvidence {
  id: number;
  kpi_value_id: number;
  document_url: string;
  document_name: string;
  uploaded_by: number;
  uploaded_at: string;
}

/** `kpi_period_lock` (KPI-8): site null = every site, period null = the whole year. Same shape as `period_lock`. */
export interface KpiPeriodLock {
  company_id: number;
  site_id: number | null;
  year: number;
  /** 1–12 for a month (quarters as their last month); null = the whole year. */
  period: number | null;
  locked_by: number;
  locked_at: string;
  reopened_by?: number | null;
  reopened_at?: string | null;
  reopened_reason?: string | null;
}

/** `kpi_target` (KPI-9). */
export interface KpiTarget {
  id: number;
  company_id: number;
  kpi_definition_id: number;
  site_id: number | null;
  baseline_year: number;
  baseline_value: number;
  target_year: number;
  target_value: number;
  direction: TargetDirection;
  note: string | null;
  created_by: number;
}

/** `audit_log.entity_type` values KPI work adds. */
export const KPI_AUDIT_ENTITY_TYPES = ["kpi_value", "kpi_setup", "kpi_period_lock", "kpi_target", "kpi_library"] as const;
export type KpiAuditEntityType = (typeof KPI_AUDIT_ENTITY_TYPES)[number];

// ---------------------------------------------------------------------------
// §3 HTTP shapes (all under /kpi)
// ---------------------------------------------------------------------------

/** `GET /kpi/status`: answers even when off. A Superadmin passes `?company_id=` (mock shape for the query). */
export interface KpiStatus {
  enabled: boolean;
  setup_completed: boolean;
}

/** `GET /kpi/library/frameworks` (Superadmin): bare array. */
export type LibraryFrameworks = KpiFramework[];
/** `GET /kpi/library/definitions?framework=&topic=&source=`: bare array (mock shape). */
export type LibraryDefinitions = KpiDefinition[];
/** `GET /kpi/library/disclosures?framework=`: bare array (mock shape). `framework` is a framework id or code. */
export type LibraryDisclosures = KpiDisclosure[];
/** `GET /kpi/library/mappings?framework=`: bare array (mock shape). */
export type LibraryMappings = KpiDisclosureMap[];

/** `POST /kpi/library/definitions` body; `PUT /kpi/library/definitions/:id` takes any part of it (mock shape for the `:id`). */
export type LibraryDefinitionBody = Omit<KpiDefinition, "id" | "created_at" | "company_id">;
export type LibraryFrameworkBody = Omit<KpiFramework, "id">;
export type LibraryDisclosureBody = Omit<KpiDisclosure, "id">;
export type LibraryMappingBody = Omit<KpiDisclosureMap, "id">;

/** `GET /kpi/catalogue`: the library as the company sees it (the framework versions it enabled). */
export interface KpiCatalogue {
  frameworks: KpiFramework[];
  disclosures: KpiDisclosure[];
  definitions: KpiDefinition[];
  mappings: KpiDisclosureMap[];
}

/** `GET /kpi/setup`; `PUT /kpi/setup` takes any part of it (Admin, Superadmin). */
export interface KpiSetup {
  settings: CompanyKpiSettings;
  frameworks: CompanyFramework[];
  material_topics: CompanyMaterialTopic[];
  kpis: CompanyKpi[];
  assignments: KpiAssignment[];
  /** KPI-3: ids the recommendation rule picks for the saved frameworks and material topics (a list of ids, or rows with `kpi_definition_id`). */
  recommended?: (number | { kpi_definition_id: number })[];
  /** Assumed (KPI-3 FE): the company's sites and people for the owners step, so a Superadmin needs no other endpoint. */
  sites?: KpiSetupSite[];
  people?: KpiSetupPerson[];
  /** D17: who owns each topic per site (null site = company level). Missing on an older server. */
  topic_assignments?: KpiTopicAssignment[];
  /** D17: the server's default (each site's first User; an Admin for the company level). */
  suggested_topic_assignments?: KpiTopicAssignment[];
  /** D17: topics of the selected KPIs with their counts. */
  topics_in_use?: KpiTopicInUse[];
}
export interface KpiSetupSite {
  site_id: number;
  name: string;
}
export interface KpiSetupPerson {
  user_id: number;
  name: string;
  role: string;
  /** Sites the person works at; empty for Admins (the whole company). */
  site_ids: number[];
}
/** Assumed (KPI-3 FE): `POST /kpi/setup/invite` tells every owner what they now enter (`kpi_assigned` notifications). */
export interface KpiInviteResult {
  notified: number;
}
export type PutKpiSetupBody = Partial<{
  settings: Partial<Omit<CompanyKpiSettings, "company_id" | "setup_completed_at">> & { complete?: boolean };
  framework_ids: number[];
  material_topics: Pick<CompanyMaterialTopic, "esrs_topic" | "material" | "reason">[];
  kpis: Pick<CompanyKpi, "kpi_definition_id" | "selected" | "frequency" | "reason_excluded">[];
  /** Per-KPI overrides of the topic owner (D17 "Exceptions"). */
  assignments: Omit<KpiAssignment, "company_id">[];
  /** D17: replaces the whole set of topic owners. */
  topic_assignments: Omit<KpiTopicAssignment, "id">[];
}>;

/** `POST /kpi/setup/custom-kpis` body (Admin): returns the `KpiDefinition` with `company_id` set. */
export type CustomKpiBody = Pick<
  KpiDefinition,
  "name" | "question" | "topic" | "value_type" | "unit_dimension" | "canonical_unit" | "allowed_units" | "aggregation" | "level" | "default_frequency" | "decimals"
> & { help?: string | null; mappings?: Pick<KpiDisclosureMap, "disclosure_id" | "fit" | "note">[] };

/** Where an item sits on My KPIs (05-ux S3). Mock shape. */
export const MY_KPI_GROUPS = ["due", "sent_back", "done"] as const;
export type MyKpiGroup = (typeof MY_KPI_GROUPS)[number];

/** One thing the caller owes: a KPI × site × period. Mock shape (KPI-7 confirms). */
export interface MyKpiItem {
  kpi_definition_id: number;
  code: string;
  name: string;
  question: string;
  help: string | null;
  topic: KpiTopic;
  /** D17: the topic's plain name ("Water"); `TOPIC_LABEL` when the server leaves it out. */
  topic_label?: string;
  source: KpiSource;
  value_type: KpiValueType;
  canonical_unit: string | null;
  allowed_units: string[];
  site_id: number | null;
  site_name: string | null;
  period_start: string;
  period_end: string;
  frequency: KpiFrequency;
  /** YYYY-MM-DD */
  due_date: string;
  group: MyKpiGroup;
  /** Null when nothing is entered yet. */
  value: KpiValue | null;
  last_value: { value: number | null; unit: string | null; period_start: string } | null;
  /** Framework disclosure codes the KPI is used in, e.g. `GRI 303-3`. */
  used_in: { framework: FrameworkCode; code: string; core?: boolean }[];
  // KPI-7 spec fields (`kpi.breakdowns`, `needs_evidence` …); optional until the server confirms them.
  level?: KpiLevel;
  decimals?: number;
  breakdowns?: KpiBreakdowns | null;
  /** BRSR Core (D15) or the company's setting: evidence is needed to submit. */
  needs_evidence?: boolean;
  auto_source?: AutoSourceKey | null;
  formula?: string | null;
  /** Formula items (KPI-6): the inputs the preview reads. Assumed shape. */
  inputs?: MyKpiFormulaInput[];
  year_type?: YearType;
  /** Who reviews it, e.g. "Mia Haddad"; null = the site's managers. */
  reviewer_name?: string | null;
}

/** One input of a calculated item on My KPIs (KPI-6 preview). Assumed shape. */
export interface MyKpiFormulaInput {
  code: string;
  name: string;
  value: number | null;
  unit: string | null;
  status?: KpiValueStatus | null;
  breakdown?: Record<string, number> | null;
}

/** `GET /kpi/my?period=YYYY-MM` (KPI-7 as built). */
export interface MyKpis {
  /** YYYY-MM */
  period: string;
  items: MyKpiItem[];
  counts: { due: number; sent_back: number; done: number; total: number; auto?: number };
}

/** `GET /kpi/values?kpi=&site=&from=&to=&status=`: bare array. */
export type KpiValues = KpiValue[];

/** One draft in `PUT /kpi/values {items}`. `id` edits a saved value. */
export interface KpiValueInput {
  id?: number;
  kpi_definition_id: number;
  kpi_code?: string;
  year_type?: YearType;
  site_id: number | null;
  period_start: string;
  frequency: KpiFrequency;
  value_numeric?: number | null;
  value_text?: string | null;
  unit?: string | null;
  breakdown?: Record<string, number> | null;
  is_estimate?: boolean;
  comment?: string | null;
  /** Assumed (KPI-8 FE): a reviewer editing a pending value (with `id`) says why; it stays pending and goes in its history. */
  reason?: string | null;
}
export interface PutKpiValuesBody {
  items: KpiValueInput[];
}
/** Per-item result of `PUT /kpi/values`, in the order sent (mock shape). */
export type KpiValueUpsertResult = { index: number; ok: true; value: KpiValue } | { index: number; ok: false; code: KpiErrorCode; message: string; details?: unknown };
export interface PutKpiValuesResult {
  /** How many items were saved. */
  saved: number;
  results: KpiValueUpsertResult[];
}

/** `POST /kpi/values/submit {ids}`. */
export interface SubmitKpiValuesBody {
  ids: number[];
}
export interface SubmitKpiValuesResult {
  submitted: number[];
  refused: { id: number; code: KpiErrorCode | string }[];
}

/** `PUT /kpi/values/approve` and `/reject`. `reason` is required to reject. */
export interface ReviewKpiValuesBody {
  ids: number[];
  only_ready?: boolean;
  reason?: string;
}
/** KPI-8 as built: the ids changed and the ids left as they were, with why. */
export interface ReviewKpiValuesResult {
  updated: number[];
  refused: { id: number; code: KpiErrorCode | string }[];
}

/** `POST /kpi/periods/lock` body; unlock adds a reason. */
export interface KpiLockBody {
  site_id?: number | null;
  year: number;
  period?: number | null;
}
export interface KpiUnlockBody extends KpiLockBody {
  reason: string;
}

/** Why a site's period can't be locked yet (`KPI_PERIOD_INCOMPLETE` `details.left`). */
export const KPI_LOCK_LEFT_REASONS = ["missing", "draft", "pending", "rejected"] as const;
export type KpiLockLeftReason = (typeof KPI_LOCK_LEFT_REASONS)[number];

export interface KpiLockLeftItem {
  site_id: number | null;
  site_name: string | null;
  kpi_definition_id: number;
  kpi_name: string;
  reason: KpiLockLeftReason;
}

/** `GET /kpi/periods/lock?year=&period=&site=`: the same shape as `GET /periods/lock`, with KPIs for categories (assumed until KPI-8 confirms it; the reader is tolerant). */
export interface KpiPeriodLockStatus {
  year: number;
  period: number | null;
  sites: {
    site_id: number | null;
    name: string;
    locked: boolean;
    lock: KpiPeriodLock | null;
    kpis: { kpi_definition_id: number; name: string; counts: Record<KpiValueStatus, number>; missing: boolean }[];
  }[];
  left: KpiLockLeftItem[];
}

/** `POST /kpi/auto/refresh?year=` (Manager and above; KPI-5 as built). Counts are of auto values; `formulas` are the calculated values recomputed after them. */
export interface KpiAutoRefreshResult {
  year: number;
  refreshed: number;
  unchanged: number;
  removed: number;
  /** Values in locked periods, left as they were. */
  locked: number;
  values: KpiValue[];
  formulas: KpiValue[];
}

/** KPI-9 `progress.ts`: on a linear path from baseline to target, or no approved value yet. */
export const TARGET_STATUSES = ["on_track", "behind", "no_data"] as const;
export type TargetStatus = (typeof TARGET_STATUSES)[number];

/**
 * One row of `GET /kpi/targets` (KPI-9): the target with its progress.
 * Assumed (KPI-9 FE): the list comes wrapped as `{targets}`; `status`,
 * `series` (approved annual values from the baseline year, for the sparkline)
 * and the KPI's name and unit are optional and read when sent.
 */
export interface KpiTargetWithProgress extends KpiTarget {
  /** Latest approved value in the canonical unit, null when none yet. */
  current_value: number | null;
  current_year: number | null;
  /** 0–100 of the way from baseline to target; null without a current value. */
  progress_pct: number | null;
  status?: TargetStatus | null;
  series?: { year: number; value: number | null }[] | null;
  kpi_name?: string | null;
  kpi_code?: string | null;
  unit?: string | null;
  site_name?: string | null;
}
/** `PUT /kpi/targets` body: an upsert (with `id`) or a new target. Answers `{target}` (a bare row is read too). `DELETE /kpi/targets/:id` removes one. */
export type PutKpiTargetBody = Omit<KpiTarget, "id" | "company_id" | "created_by"> & { id?: number };

/**
 * `GET /kpi/dashboard?year=&framework=&site=&topic=` (KPI-10 spec shape,
 * assumed until the server confirms it). `src/services/kpiService.ts`
 * `readDashboard` also reads the KPI-0 mock shape (`frameworks[]`, flat gaps).
 * Every figure here is the server's; the page never adds them up.
 */
export interface KpiDashboard {
  year: number;
  coverage: KpiCoverage[];
  gaps: KpiGap[];
  cards: KpiDashboardCard[];
  /** Values waiting for review that would change the figures (D14). */
  pending_not_in: { count: number; value_ids?: number[]; emissions?: number };
}

/** One framework's readiness for the year. */
export interface KpiCoverage {
  framework: FrameworkCode;
  version: string | null;
  /** Disclosures the company has to report (excluded ones aren't counted). */
  required: number;
  approved: number;
  pending: number;
  missing: number;
  /** 0–100, the server's. */
  percent: number;
  /** BRSR Core only. */
  core: { done: number; total: number } | null;
  /** Disclosures left out with a reason (not counted as missing). */
  excluded?: number;
  /** ESRS: how many topics are material. */
  material_topics?: number | null;
}

/** What's missing, who owes it. */
export interface KpiGap {
  kpi_definition_id: number;
  kpi_name: string;
  site_id: number | null;
  site_name: string | null;
  /** YYYY-MM (or YYYY for annual KPIs). */
  periods_missing: string[];
  owner_user_id: number | null;
  owner_name: string | null;
  /** Where "Open" goes; the server's when it sends one. */
  link: string | null;
  /** Frameworks the KPI feeds, so a ring can filter the list. */
  frameworks: FrameworkCode[];
  /** The values aren't missing but waiting for review. */
  pending?: boolean;
}

export interface KpiDashboardCard {
  kpi_definition_id: number;
  code: string;
  name: string;
  topic: KpiTopic;
  source: KpiSource | null;
  unit: string | null;
  decimals: number | null;
  /** The year's value, aggregated by the server. */
  value: number | null;
  previous: number | null;
  change_pct: number | null;
  /** 12 periods: label (YYYY-MM) and value, oldest first. */
  series: { period: string; value: number | null }[];
  target: { progress_pct: number | null; status: TargetStatus | null; label: string | null; target_id: number | null } | null;
}

/** `POST /kpi/dashboard/remind {kpi, site}` (Manager+). Assumed answer: `{reminded}`; false = already reminded today (at most once a day per item). */
export interface KpiRemindResult {
  reminded: boolean;
  owner_name?: string | null;
  message?: string | null;
}

/**
 * `GET /kpi/reports/:framework?year=&sites=&format=json` (KPI-11 `reports/model.ts`,
 * assumed until the server confirms it); `xlsx` and `pdf` return a file.
 * Values are approved only, already in the framework's display unit. The page
 * shows them as they come.
 */
export interface KpiFrameworkReport {
  framework: FrameworkCode;
  version: string;
  year: number;
  /** Values for the year waiting for review: not in the report yet. */
  pending_count: number;
  pending_ids?: number[];
  rows: KpiReportRow[];
  omissions: KpiReportOmission[];
}

export interface KpiReportRow {
  disclosure_id: number;
  code: string;
  title: string;
  /** e.g. `GRI 305`, `Principle 6 · Essential`, `E1 Climate change`. */
  section: string;
  /** In the framework's display unit; text for narrative items; null when nothing is approved. */
  value: number | string | null;
  unit: string | null;
  /** The previous year (BRSR shows both). */
  previous?: number | string | null;
  where: "site" | "company" | null;
  notes: string | null;
  fit?: MappingFit | null;
  requirement?: RequirementLevel | null;
  /** KPIs and value ids behind the figure: every value links to its record. */
  kpi_definition_ids?: number[];
  value_ids?: number[];
  evidence_count?: number;
  /** Site names the figure covers. */
  sites?: string[];
}

export const KPI_OMISSION_KINDS = ["not_material", "excluded", "missing", "not_tracked"] as const;
export type KpiOmissionKind = (typeof KPI_OMISSION_KINDS)[number];

export interface KpiReportOmission {
  disclosure_id: number | null;
  code: string;
  title: string;
  reason: string;
  kind?: KpiOmissionKind;
  /** ESRS topic of a not-material topic. */
  esrs_topic?: EsrsTopic | null;
}

/** One row of a planned My KPIs template (`POST /kpi/my/template`, KPI-7 part 3). Assumed shape. */
export interface KpiTemplateRow {
  /** The sheet's row number, as the person sees it in Excel. */
  row: number;
  kpi_definition_id: number | null;
  kpi_code: string | null;
  name: string | null;
  site_id: number | null;
  site_name: string | null;
  period_start: string | null;
  value: number | string | null;
  unit: string | null;
  comment: string | null;
  /** Why the row won't be saved; null = it will be saved as a draft. */
  issue: { code: string; message: string } | null;
}

/** `POST /kpi/my/template` (multipart `file`, `period`, `site`): the plan, nothing saved yet. Assumed shape `{plan}`. */
export interface KpiTemplatePlan {
  plan_id: string;
  rows: KpiTemplateRow[];
  counts: { ready: number; issues: number };
}

/** `POST /kpi/my/template {plan_id, commit: true}`: the ready rows saved as drafts. Assumed shape. */
export interface KpiTemplateCommitResult {
  saved: number;
}

/** `GET /kpi/overview` (KPI-10 wave D): the Overview page's two tiles, for the caller's scope. */
export interface KpiOverview {
  readiness: { framework: FrameworkCode; version: string | null; percent: number | null }[];
  due: { due: number; sent_back: number; done: number };
  /** YYYY-MM the due counts are for. */
  period: string | null;
}

/** `POST /kpi/ai/suggest-values {document_id}` (KPI-12): suggestions only, a person confirms. */
export interface KpiValueSuggestion {
  kpi: string;
  value: number;
  unit: string;
  /** YYYY-MM */
  period: string;
  source_page: number | null;
  confidence: number;
}
export interface SuggestValuesResult {
  suggestions: KpiValueSuggestion[];
}

/** `POST /kpi/ai/suggest-mapping {name, question, unit}` (KPI-12). Mock shape. */
export interface KpiMappingSuggestion {
  disclosure_id: number;
  framework: FrameworkCode;
  code: string;
  fit: MappingFit;
  confidence: number;
}
export interface SuggestMappingResult {
  suggestions: KpiMappingSuggestion[];
}

// ---------------------------------------------------------------------------
// §4 Error codes
// ---------------------------------------------------------------------------

export const KPI_ERROR_STATUS = {
  KPI_TRACKING_OFF: 403,
  KPI_SETUP_INCOMPLETE: 409,
  KPI_NOT_SELECTED: 422,
  KPI_NOT_ASSIGNED: 403,
  KPI_UNIT_NOT_ALLOWED: 422,
  KPI_VALUE_INVALID: 422,
  KPI_AUTO_READ_ONLY: 409,
  KPI_PERIOD_LOCKED: 409,
  KPI_PERIOD_INCOMPLETE: 422,
  KPI_NOT_DRAFT: 409,
  KPI_EVIDENCE_REQUIRED: 422,
  KPI_FORMULA_INVALID: 422,
  KPI_REASON_REQUIRED: 400,
  // Plumbing codes the server adds on every route (ESG-lite src/kpi/contracts/errors.ts).
  KPI_VALIDATION: 400,
  KPI_NOT_FOUND: 404,
  KPI_FORBIDDEN: 403,
  KPI_COMPANY_REQUIRED: 400,
  KPI_CODE_TAKEN: 409,
  // Per-id refusals of approve and reject (KPI-8).
  KPI_NOT_PENDING: 409,
  KPI_NOT_READY: 409,
  KPI_SELF_REVIEW: 403,
} as const;
export type KpiErrorCode = keyof typeof KPI_ERROR_STATUS;
export const KPI_ERROR_CODES = Object.keys(KPI_ERROR_STATUS) as KpiErrorCode[];

/** Error body, as `src/imports/errors.ts`. */
export interface KpiErrorBody {
  code: KpiErrorCode;
  message: string;
  details?: unknown;
}

export const isKpiErrorCode = (v: unknown): v is KpiErrorCode => typeof v === "string" && v in KPI_ERROR_STATUS;

// ---------------------------------------------------------------------------
// §5 Review checks
// ---------------------------------------------------------------------------

export const KPI_CHECK_IDS = ["KPI_EVIDENCE", "KPI_CHANGE_LIMIT", "KPI_BREAKDOWN_SUM", "KPI_UNIT_CONVERTED", "KPI_ESTIMATE", "KPI_AUTO_STALE"] as const;
export type KpiCheckId = (typeof KPI_CHECK_IDS)[number];

// ---------------------------------------------------------------------------
// §6 FE routes (ids in src/features/shell/routeMap.ts)
// ---------------------------------------------------------------------------

export const KPI_ROUTE_IDS = ["kpi-setup", "kpi-my", "kpi-review", "kpi-targets", "kpi-dashboard", "kpi-reports", "kpi-library"] as const;
export type KpiRouteId = (typeof KPI_ROUTE_IDS)[number];

/** Paths per route id. `kpi-review` is a tab of Approvals, not a route of its own. */
export const KPI_PATHS: Record<KpiRouteId, string> = {
  "kpi-setup": "/kpi/setup",
  "kpi-my": "/kpi",
  "kpi-review": "/data/approvals?view=kpi",
  "kpi-targets": "/kpi/targets",
  "kpi-dashboard": "/kpi/dashboard",
  "kpi-reports": "/reports/kpi/:framework",
  "kpi-library": "/setup/kpi-library",
};
