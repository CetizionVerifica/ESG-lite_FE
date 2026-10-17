/**
 * KPI words for the screen (KPI-0). Pages take topic, framework, source,
 * status and check words from here, never their own strings
 * (src/features/kpi/CLAUDE.md, 05-ux copy rules: sentence case, plain words,
 * no raw codes in the UI).
 */
import type {
  AutoSourceKey,
  EsrsTopic,
  FrameworkCode,
  KpiAggregation,
  KpiCheckId,
  KpiErrorCode,
  KpiFrequency,
  KpiLevel,
  KpiLockLeftReason,
  KpiSource,
  KpiTopic,
  KpiValueStatus,
  KpiValueType,
  MappingFit,
  MyKpiGroup,
  RequirementLevel,
  TargetDirection,
  UnitDimension,
  YearType,
} from "./contracts";

/** Short name used in badges and reports (05-ux: "ESRS" in badges). */
export const FRAMEWORK_LABEL: Record<FrameworkCode, string> = { GRI: "GRI", BRSR: "BRSR", ESRS: "ESRS" };

/** The name used in setup (05-ux: "CSRD (ESRS)"). */
export const FRAMEWORK_SETUP_LABEL: Record<FrameworkCode, string> = { GRI: "GRI", BRSR: "BRSR", ESRS: "CSRD (ESRS)" };

/** One line on what each framework is, for tooltips and setup cards. */
export const FRAMEWORK_DESCRIPTION: Record<FrameworkCode, string> = {
  GRI: "GRI Standards: the most widely used global sustainability reporting standards.",
  BRSR: "Business Responsibility and Sustainability Report: SEBI's format for Indian listed companies, with BRSR Core.",
  ESRS: "European Sustainability Reporting Standards, used for CSRD reports in the EU.",
};

export const REQUIREMENT_LABEL: Record<RequirementLevel, string> = {
  required: "Required",
  if_material: "If material",
  voluntary: "Voluntary",
  core: "BRSR Core",
};

export const TOPIC_LABEL: Record<KpiTopic, string> = {
  climate: "Climate",
  energy: "Energy",
  water: "Water",
  waste: "Waste",
  pollution: "Pollution",
  biodiversity: "Biodiversity",
  materials: "Materials",
  workforce: "Own workforce",
  health_safety: "Health and safety",
  diversity: "Diversity",
  training: "Training",
  human_rights: "Human rights",
  community: "Community",
  customers: "Customers",
  governance: "Governance",
  ethics: "Business ethics",
};

export const VALUE_TYPE_LABEL: Record<KpiValueType, string> = {
  number: "Number",
  percent: "Percentage",
  integer: "Whole number",
  currency: "Amount of money",
  yes_no: "Yes or no",
  choice: "One of a list",
  text: "Text",
};

/** How a value gets in: "Entered", "Auto" (from your data) or "Calculated" (05-ux S2 chips). */
export const SOURCE_LABEL: Record<KpiSource, string> = { manual: "Entered", auto: "Auto", formula: "Calculated" };

/** A longer line for a source, for drawers and tooltips. */
export const SOURCE_DESCRIPTION: Record<KpiSource, string> = {
  manual: "Someone at the site or company enters it.",
  auto: "Filled in from your data in ESGLite. Nobody types it.",
  formula: "Calculated from other KPIs.",
};

export const AGGREGATION_LABEL: Record<KpiAggregation, string> = {
  sum: "Added up",
  average: "Average",
  weighted_average: "Weighted average",
  max: "Highest",
  latest: "Latest value",
  none: "Not combined",
};

export const LEVEL_LABEL: Record<KpiLevel, string> = { site: "Site", company: "Company" };

export const FREQUENCY_LABEL: Record<KpiFrequency, string> = { monthly: "Monthly", quarterly: "Quarterly", annual: "Annual" };

/** Same words as emissions (StatusPill). */
export const VALUE_STATUS_LABEL: Record<KpiValueStatus, string> = { draft: "Draft", pending: "Pending", approved: "Approved", rejected: "Rejected" };

export const FIT_LABEL: Record<MappingFit, string> = { exact: "Exact", partial: "Partial", derived: "Derived" };

export const FIT_DESCRIPTION: Record<MappingFit, string> = {
  exact: "The KPI answers the disclosure as it is.",
  partial: "The KPI answers part of the disclosure; the note says what differs.",
  derived: "The disclosure's figure is worked out from the KPI; the note says how.",
};

export const AUTO_SOURCE_LABEL: Record<AutoSourceKey, string> = {
  ghg_scope1: "Approved Scope 1 emission rows",
  ghg_scope2_location: "Approved Scope 2 rows, location based",
  ghg_scope2_market: "Approved Scope 2 rows, market based",
  ghg_scope3_total: "Approved Scope 3 rows",
  ghg_scope3_category_n: "Approved Scope 3 rows of one category",
  energy_total: "Approved fuel and electricity rows",
  energy_renewable: "Approved renewable electricity and fuel rows",
  energy_non_renewable: "Approved non-renewable electricity and fuel rows",
  production_output: "Production data",
  waste_total: "Approved waste rows",
};

export const UNIT_DIMENSION_LABEL: Record<UnitDimension, string> = {
  energy: "Energy",
  mass: "Mass",
  volume: "Volume",
  count: "Count",
  currency: "Money",
  ratio: "Ratio",
  time: "Time",
  none: "No unit",
};

/** ESRS topical standards, "E1 Climate change" style. */
export const ESRS_TOPIC_LABEL: Record<EsrsTopic, string> = {
  E1: "Climate change",
  E2: "Pollution",
  E3: "Water and marine resources",
  E4: "Biodiversity and ecosystems",
  E5: "Resource use and circular economy",
  S1: "Own workforce",
  S2: "Workers in the value chain",
  S3: "Affected communities",
  S4: "Consumers and end-users",
  G1: "Business conduct",
};

export const esrsTopicLabel = (t: EsrsTopic): string => `${t} ${ESRS_TOPIC_LABEL[t]}`;

export const YEAR_TYPE_LABEL: Record<YearType, string> = { CY: "Calendar year", FY: "Financial year" };

export const TARGET_DIRECTION_LABEL: Record<TargetDirection, string> = { reduce: "Reduce", increase: "Increase", maintain: "Keep level" };

export const MY_KPI_GROUP_LABEL: Record<MyKpiGroup, string> = { due: "Due", sent_back: "Sent back", done: "Done" };

export const LOCK_LEFT_REASON_LABEL: Record<KpiLockLeftReason, string> = {
  missing: "Nothing entered yet",
  draft: "Drafts not submitted",
  pending: "Waiting for approval",
  rejected: "Sent back, not fixed yet",
};

/** Review check chips (05-ux S4). */
export const CHECK_LABEL: Record<KpiCheckId, string> = {
  KPI_EVIDENCE: "No evidence",
  KPI_CHANGE_LIMIT: "Big change on last year",
  KPI_BREAKDOWN_SUM: "Split doesn't add up",
  KPI_UNIT_CONVERTED: "Unit converted",
  KPI_ESTIMATE: "Estimate",
  KPI_AUTO_STALE: "Source data changed",
};

/** What to tell a person for each error code: what happened and what to do next. Never the code itself. */
export const ERROR_MESSAGE: Record<KpiErrorCode, string> = {
  KPI_TRACKING_OFF: "KPI tracking isn't turned on for your company.",
  KPI_SETUP_INCOMPLETE: "KPI setup isn't finished yet. Your admin completes it in KPI setup.",
  KPI_NOT_SELECTED: "Your company doesn't track this KPI. Your admin chooses KPIs in KPI setup.",
  KPI_NOT_ASSIGNED: "This KPI isn't assigned to you for this site. Ask your admin if it should be.",
  KPI_UNIT_NOT_ALLOWED: "This unit can't be used for this KPI. Pick one from the list.",
  KPI_VALUE_INVALID: "This value doesn't look right. Check the number and the split.",
  KPI_AUTO_READ_ONLY: "This value comes from your data, so it can't be typed. Fix the source rows instead.",
  KPI_PERIOD_LOCKED: "This period is closed. Ask your manager to reopen it.",
  KPI_PERIOD_INCOMPLETE: "Some values are still missing or waiting for review, so the period can't be closed yet.",
  KPI_NOT_DRAFT: "This value was already sent for review.",
  KPI_EVIDENCE_REQUIRED: "Attach a document before sending this value: BRSR Core needs evidence.",
  KPI_FORMULA_INVALID: "The formula uses a KPI that doesn't exist, refers to itself, or mixes units.",
  KPI_REASON_REQUIRED: "Add a short reason.",
  KPI_VALIDATION: "Some fields aren't filled in correctly. Check them and try again.",
  KPI_NOT_FOUND: "We couldn't find this item. It may have been removed.",
  KPI_FORBIDDEN: "Your role can't do this.",
  KPI_COMPANY_REQUIRED: "Choose a client first.",
  KPI_CODE_TAKEN: "A KPI with this code already exists. Pick another code.",
};

/** "GRI 303-3", "BRSR P6-E3", "ESRS E3-4": a badge's text. */
export const disclosureBadge = (framework: FrameworkCode, code: string): string => `${FRAMEWORK_LABEL[framework]} ${code}`;
