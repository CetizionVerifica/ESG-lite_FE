/**
 * KPI sample data (KPI-0): "ACME" (company 1) with three plants, reporting
 * GRI, BRSR and ESRS for 2026. 32 KPIs (8 auto, 4 calculated, 20 entered),
 * 52 disclosures, and a September 2026 for Ravi at Bahrain plant with 4 due,
 * 1 sent back and 7 done. Plain data, no MSW: the handlers in `kpi.ts` and
 * the Playwright specs both read it.
 *
 * Disclosure codes follow 01-contracts §7; titles are our own words (D7).
 * KPI-2 verifies every code against the official source before seeding.
 */
import type {
  CompanyKpi,
  CompanyMaterialTopic,
  EsrsTopic,
  FrameworkCode,
  KpiAssignment,
  KpiDefinition,
  KpiDisclosure,
  KpiDisclosureMap,
  KpiFramework,
  KpiTargetWithProgress,
  KpiTopicAssignment,
  KpiValue,
  KpiValueEvidence,
  MappingFit,
  RequirementLevel,
} from "../../lib/kpi/contracts";
import { KPI_TOPICS } from "../../lib/kpi/contracts";

export const ACME = { company_id: 1, name: "ACME" } as const;

export const KPI_SITES = [
  { site_id: 1, name: "Bahrain plant" },
  { site_id: 2, name: "Dammam" },
  { site_id: 3, name: "Matola" },
] as const;

export const KPI_USERS = [
  { user_id: 11, name: "Ravi Kumar", role: "User", site_id: 1 },
  { user_id: 12, name: "Mia Haddad", role: "Manager", site_id: null },
  { user_id: 13, name: "Omar Saleh", role: "Admin", site_id: null },
  { user_id: 14, name: "Sara Ali", role: "User", site_id: 2 },
  { user_id: 15, name: "João Mendes", role: "User", site_id: 3 },
] as const;

const CREATED = "2026-10-01T08:00:00.000Z";

// ---------------------------------------------------------------------------
// Library: KPI definitions
// ---------------------------------------------------------------------------

type DefInput = Pick<KpiDefinition, "id" | "code" | "name" | "question" | "topic"> & Partial<KpiDefinition>;

const def = (d: DefInput): KpiDefinition => ({
  help: null,
  value_type: "number",
  unit_dimension: "none",
  canonical_unit: null,
  allowed_units: [],
  aggregation: "sum",
  level: "site",
  default_frequency: "monthly",
  source: "manual",
  auto_source: null,
  formula: null,
  breakdowns: null,
  decimals: 1,
  company_id: null,
  active: true,
  created_at: CREATED,
  ...d,
});

const GHG: Partial<KpiDefinition> = { unit_dimension: "mass", canonical_unit: "tCO₂e", allowed_units: ["tCO₂e"], decimals: 2 };
const ENERGY: Partial<KpiDefinition> = { unit_dimension: "energy", canonical_unit: "MWh", allowed_units: ["MWh", "kWh", "GJ"], decimals: 0 };
const WATER: Partial<KpiDefinition> = { unit_dimension: "volume", canonical_unit: "m³", allowed_units: ["m³", "kL", "litres", "ML"], decimals: 0 };
const MASS: Partial<KpiDefinition> = { unit_dimension: "mass", canonical_unit: "t", allowed_units: ["t", "kg"], decimals: 1 };
const AIR: Partial<KpiDefinition> = { ...MASS, default_frequency: "quarterly", decimals: 2 };
const HEADCOUNT: Partial<KpiDefinition> = { value_type: "integer", unit_dimension: "count", level: "company", default_frequency: "annual", decimals: 0 };
const COMPANY_YEAR: Partial<KpiDefinition> = { level: "company", default_frequency: "annual" };

export const KPI_DEFINITIONS: KpiDefinition[] = [
  // Auto (KPI-5): read from approved rows, never typed.
  def({ id: 1, code: "GHG_SCOPE1", name: "Scope 1 emissions", question: "How much did {site} emit directly from fuel and gases in {period}?", topic: "climate", ...GHG, source: "auto", auto_source: "ghg_scope1" }),
  def({ id: 2, code: "GHG_SCOPE2_LB", name: "Scope 2 emissions, location based", question: "How much did the electricity {site} bought in {period} emit, at grid average?", topic: "climate", ...GHG, source: "auto", auto_source: "ghg_scope2_location" }),
  def({ id: 3, code: "GHG_SCOPE2_MB", name: "Scope 2 emissions, market based", question: "How much did the electricity {site} bought in {period} emit, under its contracts?", topic: "climate", ...GHG, source: "auto", auto_source: "ghg_scope2_market" }),
  def({ id: 4, code: "GHG_SCOPE3", name: "Scope 3 emissions", question: "How much did the value chain emit in {period}?", topic: "climate", ...GHG, ...COMPANY_YEAR, source: "auto", auto_source: "ghg_scope3_total" }),
  def({ id: 5, code: "ENERGY_TOTAL", name: "Energy consumed", question: "How much energy did {site} use in {period}?", topic: "energy", ...ENERGY, source: "auto", auto_source: "energy_total", breakdowns: { by: ["renewable"], values: ["renewable", "non_renewable"] } }),
  def({ id: 6, code: "ENERGY_RENEWABLE", name: "Renewable energy consumed", question: "How much renewable energy did {site} use in {period}?", topic: "energy", ...ENERGY, source: "auto", auto_source: "energy_renewable" }),
  def({ id: 7, code: "ENERGY_NON_RENEWABLE", name: "Non-renewable energy consumed", question: "How much non-renewable energy did {site} use in {period}?", topic: "energy", ...ENERGY, source: "auto", auto_source: "energy_non_renewable" }),
  def({ id: 8, code: "PRODUCTION_OUTPUT", name: "Production output", question: "How much did {site} produce in {period}?", topic: "materials", ...MASS, source: "auto", auto_source: "production_output" }),

  // Calculated (KPI-6).
  def({ id: 9, code: "GHG_INTENSITY_REVENUE", name: "GHG intensity per revenue", question: "Scope 1 and 2 emissions per million USD of revenue in {period}", topic: "climate", unit_dimension: "ratio", canonical_unit: "tCO₂e / M USD", allowed_units: ["tCO₂e / M USD"], aggregation: "none", ...COMPANY_YEAR, source: "formula", formula: "(GHG_SCOPE1 + GHG_SCOPE2_LB) / (REVENUE / 1000000)", decimals: 2 }),
  def({ id: 10, code: "ENERGY_INTENSITY_REVENUE", name: "Energy intensity per revenue", question: "Energy used per million USD of revenue in {period}", topic: "energy", unit_dimension: "ratio", canonical_unit: "MWh / M USD", allowed_units: ["MWh / M USD"], aggregation: "none", ...COMPANY_YEAR, source: "formula", formula: "ENERGY_TOTAL / (REVENUE / 1000000)", decimals: 2 }),
  def({ id: 11, code: "WATER_CONSUMPTION", name: "Water consumed", question: "How much water did {site} use up in {period}?", topic: "water", ...WATER, source: "formula", formula: "WATER_WITHDRAWAL - WATER_DISCHARGE" }),
  def({ id: 12, code: "WOMEN_IN_WORKFORCE", name: "Women in the workforce", question: "What share of employees were women at the end of {period}?", topic: "diversity", value_type: "percent", unit_dimension: "ratio", canonical_unit: "%", allowed_units: ["%"], aggregation: "none", ...COMPANY_YEAR, source: "formula", formula: "EMPLOYEES_WOMEN / EMPLOYEES_TOTAL * 100" }),

  // Entered.
  def({
    id: 13,
    code: "WATER_WITHDRAWAL",
    name: "Water withdrawn",
    question: "How much water did {site} take in during {period}?",
    help: "What counts: municipal supply, borewells, tankers and stored rainwater. Leave out water you recycled on site.",
    topic: "water",
    ...WATER,
    breakdowns: { by: ["source"], values: ["groundwater", "surface", "third_party"] },
  }),
  def({ id: 14, code: "WATER_DISCHARGE", name: "Water discharged", question: "How much water did {site} send out in {period}?", help: "What counts: effluent to sewers, rivers or the sea, and water sent to others. Leave out rainwater run-off.", topic: "water", ...WATER }),
  def({
    id: 15,
    code: "WASTE_GENERATED",
    name: "Waste generated",
    question: "How much waste did {site} produce in {period}?",
    help: "What counts: all solid and liquid waste leaving the site. Leave out scrap you sell back into production.",
    topic: "waste",
    ...MASS,
    breakdowns: { by: ["type"], values: ["hazardous", "non_hazardous"] },
  }),
  def({ id: 16, code: "WASTE_DIVERTED", name: "Waste recovered", question: "How much of {site}'s waste was recycled or reused in {period}?", topic: "waste", ...MASS }),
  def({ id: 17, code: "WASTE_DISPOSED", name: "Waste disposed of", question: "How much of {site}'s waste went to landfill or incineration in {period}?", topic: "waste", ...MASS }),
  def({ id: 18, code: "AIR_NOX", topic: "pollution", name: "NOx emitted", question: "How much NOx did {site} release in {period}?", ...AIR }),
  def({ id: 19, code: "AIR_SOX", topic: "pollution", name: "SOx emitted", question: "How much SOx did {site} release in {period}?", ...AIR }),
  def({ id: 20, code: "AIR_PM", topic: "pollution", name: "Particulate matter emitted", question: "How much dust and particulate matter did {site} release in {period}?", ...AIR }),
  def({ id: 21, code: "REVENUE", name: "Revenue", question: "What was the company's revenue in {period}?", topic: "governance", value_type: "currency", unit_dimension: "currency", canonical_unit: "USD", allowed_units: ["USD", "BHD", "SAR", "INR", "EUR"], ...COMPANY_YEAR, decimals: 0 }),
  def({ id: 22, code: "EMPLOYEES_TOTAL", name: "Employees", question: "How many employees did the company have at the end of {period}?", topic: "workforce", ...HEADCOUNT, aggregation: "latest", breakdowns: { by: ["gender"], values: ["women", "men", "other"] } }),
  def({ id: 23, code: "EMPLOYEES_WOMEN", name: "Women employees", question: "How many of the company's employees were women at the end of {period}?", topic: "diversity", ...HEADCOUNT, aggregation: "latest" }),
  def({ id: 24, code: "NEW_HIRES", name: "New hires", question: "How many people joined the company in {period}?", topic: "workforce", ...HEADCOUNT }),
  def({ id: 25, code: "EMPLOYEE_TURNOVER", name: "Employees who left", question: "How many employees left the company in {period}?", topic: "workforce", ...HEADCOUNT }),
  def({ id: 26, code: "LTIFR", name: "Lost-time injury rate", question: "What was {site}'s lost-time injury rate in {period}, per million hours worked?", topic: "health_safety", aggregation: "weighted_average", decimals: 2 }),
  def({ id: 27, code: "FATALITIES", name: "Fatalities", question: "How many people died from work-related injuries at {site} in {period}?", topic: "health_safety", value_type: "integer", unit_dimension: "count", decimals: 0 }),
  def({ id: 28, code: "RECORDABLE_INJURIES", name: "Recordable injuries", question: "How many recordable work injuries were there at {site} in {period}?", topic: "health_safety", value_type: "integer", unit_dimension: "count", decimals: 0 }),
  def({ id: 29, code: "TRAINING_HOURS_AVG", name: "Training hours per employee", question: "On average, how many hours of training did each employee get in {period}?", topic: "training", unit_dimension: "time", canonical_unit: "hours", allowed_units: ["hours"], aggregation: "weighted_average", ...COMPANY_YEAR }),
  def({ id: 30, code: "WOMEN_ON_BOARD", name: "Women on the board", question: "What share of the board were women at the end of {period}?", topic: "diversity", value_type: "percent", unit_dimension: "ratio", canonical_unit: "%", allowed_units: ["%"], aggregation: "latest", ...COMPANY_YEAR }),
  def({ id: 31, code: "GENDER_PAY_GAP", name: "Pay ratio, women to men", question: "What was women's average pay as a share of men's in {period}?", topic: "diversity", value_type: "percent", unit_dimension: "ratio", canonical_unit: "%", allowed_units: ["%"], aggregation: "none", ...COMPANY_YEAR }),
  def({ id: 32, code: "COMPLAINTS_RECEIVED", name: "Complaints received", question: "How many complaints did the company receive in {period}, and how many were resolved?", topic: "ethics", ...HEADCOUNT, breakdowns: { by: ["state"], values: ["resolved", "open"] } }),
];

export const kpiByCode = (code: string): KpiDefinition => {
  const d = KPI_DEFINITIONS.find((k) => k.code === code);
  if (!d) throw new Error(`Unknown KPI ${code}`);
  return d;
};

// ---------------------------------------------------------------------------
// Library: frameworks, disclosures and mappings
// ---------------------------------------------------------------------------

export const KPI_FRAMEWORKS: KpiFramework[] = [
  { id: 1, code: "GRI", version: "GRI 2021+", name: "GRI Standards", source_url: "https://www.globalreporting.org/standards/", active: true, default_for_new: true },
  { id: 2, code: "BRSR", version: "BRSR 2023", name: "Business Responsibility and Sustainability Report", source_url: "https://www.sebi.gov.in/", active: true, default_for_new: false },
  { id: 3, code: "ESRS", version: "ESRS 2023", name: "European Sustainability Reporting Standards", source_url: "https://www.efrag.org/", active: true, default_for_new: false },
];

const FRAMEWORK_ID: Record<FrameworkCode, number> = { GRI: 1, BRSR: 2, ESRS: 3 };

type DisclosureRow = [code: string, title: string, section: string, requirement: RequirementLevel, kpis: string[]];

const GRI_ROWS: DisclosureRow[] = [
  ["2-7", "Employees", "GRI 2 General disclosures", "required", ["EMPLOYEES_TOTAL", "EMPLOYEES_WOMEN"]],
  ["2-25", "How negative impacts are put right", "GRI 2 General disclosures", "required", []],
  ["2-26", "Ways to ask for advice and raise concerns", "GRI 2 General disclosures", "required", ["COMPLAINTS_RECEIVED"]],
  ["302-1", "Energy used within the organisation", "GRI 302 Energy", "required", ["ENERGY_TOTAL", "ENERGY_RENEWABLE", "ENERGY_NON_RENEWABLE"]],
  ["302-3", "Energy intensity", "GRI 302 Energy", "required", ["ENERGY_INTENSITY_REVENUE"]],
  ["302-4", "Cuts in energy use", "GRI 302 Energy", "voluntary", []],
  ["303-3", "Water taken in", "GRI 303 Water and effluents", "required", ["WATER_WITHDRAWAL"]],
  ["303-4", "Water sent out", "GRI 303 Water and effluents", "required", ["WATER_DISCHARGE"]],
  ["303-5", "Water used up", "GRI 303 Water and effluents", "required", ["WATER_CONSUMPTION"]],
  ["305-1", "Direct (Scope 1) GHG emissions", "GRI 305 Emissions", "required", ["GHG_SCOPE1"]],
  ["305-2", "Energy indirect (Scope 2) GHG emissions", "GRI 305 Emissions", "required", ["GHG_SCOPE2_LB", "GHG_SCOPE2_MB"]],
  ["305-3", "Other indirect (Scope 3) GHG emissions", "GRI 305 Emissions", "required", ["GHG_SCOPE3"]],
  ["305-4", "GHG emissions intensity", "GRI 305 Emissions", "required", ["GHG_INTENSITY_REVENUE"]],
  ["305-7", "NOx, SOx and other air emissions", "GRI 305 Emissions", "required", ["AIR_NOX", "AIR_SOX", "AIR_PM"]],
  ["306-3", "Waste generated", "GRI 306 Waste", "required", ["WASTE_GENERATED"]],
  ["306-4", "Waste kept out of disposal", "GRI 306 Waste", "required", ["WASTE_DIVERTED"]],
  ["306-5", "Waste sent to disposal", "GRI 306 Waste", "required", ["WASTE_DISPOSED"]],
  ["401-1", "New hires and people leaving", "GRI 401 Employment", "required", ["NEW_HIRES", "EMPLOYEE_TURNOVER"]],
  ["403-9", "Work-related injuries", "GRI 403 Health and safety", "required", ["LTIFR", "FATALITIES", "RECORDABLE_INJURIES"]],
  ["404-1", "Training hours per employee", "GRI 404 Training", "required", ["TRAINING_HOURS_AVG"]],
  ["405-1", "Diversity of the board and employees", "GRI 405 Diversity", "required", ["WOMEN_IN_WORKFORCE", "WOMEN_ON_BOARD"]],
  ["405-2", "Pay of women compared with men", "GRI 405 Diversity", "required", ["GENDER_PAY_GAP"]],
];

const BRSR_ROWS: DisclosureRow[] = [
  ["A-20", "Employees and workers, by gender", "Section A · General", "required", ["EMPLOYEES_TOTAL", "EMPLOYEES_WOMEN"]],
  ["A-21", "Women on the board and in leadership", "Section A · General", "core", ["WOMEN_ON_BOARD"]],
  ["A-22", "Turnover of permanent employees", "Section A · General", "required", ["EMPLOYEE_TURNOVER"]],
  ["P3-E8", "Training given to employees", "Principle 3 · Essential", "required", ["TRAINING_HOURS_AVG"]],
  ["P3-E11", "Safety incidents", "Principle 3 · Essential", "core", ["LTIFR", "FATALITIES", "RECORDABLE_INJURIES"]],
  ["P5-E3", "Wages paid to women", "Principle 5 · Essential", "core", ["GENDER_PAY_GAP"]],
  ["P6-E1", "Energy used and energy intensity", "Principle 6 · Essential", "core", ["ENERGY_TOTAL", "ENERGY_RENEWABLE", "ENERGY_NON_RENEWABLE", "ENERGY_INTENSITY_REVENUE"]],
  ["P6-E3", "Water taken in, used and water intensity", "Principle 6 · Essential", "core", ["WATER_WITHDRAWAL", "WATER_CONSUMPTION"]],
  ["P6-E4", "Water discharged, by destination", "Principle 6 · Essential", "required", ["WATER_DISCHARGE"]],
  ["P6-E6", "Air emissions other than GHG", "Principle 6 · Essential", "required", ["AIR_NOX", "AIR_SOX", "AIR_PM"]],
  ["P6-E7", "Scope 1 and 2 emissions and intensity", "Principle 6 · Essential", "core", ["GHG_SCOPE1", "GHG_SCOPE2_LB", "GHG_INTENSITY_REVENUE"]],
  ["P6-E9", "Waste generated and how it is handled", "Principle 6 · Essential", "core", ["WASTE_GENERATED", "WASTE_DIVERTED", "WASTE_DISPOSED"]],
  ["P6-L2", "Scope 3 emissions", "Principle 6 · Leadership", "voluntary", ["GHG_SCOPE3"]],
  ["P6-L4", "Water use in water-stressed areas", "Principle 6 · Leadership", "voluntary", []],
  ["P9-E2", "Consumer complaints received and resolved", "Principle 9 · Essential", "required", ["COMPLAINTS_RECEIVED"]],
];

type EsrsRow = [code: string, title: string, topic: EsrsTopic, requirement: RequirementLevel, kpis: string[]];

const ESRS_ROWS: EsrsRow[] = [
  ["E1-4", "Climate targets", "E1", "if_material", []],
  ["E1-5", "Energy use and mix", "E1", "if_material", ["ENERGY_TOTAL", "ENERGY_RENEWABLE", "ENERGY_NON_RENEWABLE", "ENERGY_INTENSITY_REVENUE"]],
  ["E1-6", "Gross Scope 1, 2 and 3 and total GHG emissions", "E1", "if_material", ["GHG_SCOPE1", "GHG_SCOPE2_LB", "GHG_SCOPE2_MB", "GHG_SCOPE3", "GHG_INTENSITY_REVENUE"]],
  ["E1-7", "GHG removals and carbon credits", "E1", "if_material", []],
  ["E2-4", "Pollution of air, water and soil", "E2", "if_material", ["AIR_NOX", "AIR_SOX", "AIR_PM"]],
  ["E3-4", "Water consumption", "E3", "if_material", ["WATER_CONSUMPTION", "WATER_WITHDRAWAL", "WATER_DISCHARGE"]],
  ["E4-5", "Biodiversity impact metrics", "E4", "if_material", []],
  ["E5-5", "Resource outflows: waste", "E5", "if_material", ["WASTE_GENERATED", "WASTE_DIVERTED", "WASTE_DISPOSED"]],
  ["S1-6", "Characteristics of employees", "S1", "if_material", ["EMPLOYEES_TOTAL", "NEW_HIRES", "EMPLOYEE_TURNOVER"]],
  ["S1-9", "Diversity metrics", "S1", "if_material", ["WOMEN_IN_WORKFORCE", "EMPLOYEES_WOMEN"]],
  ["S1-13", "Training and skills metrics", "S1", "if_material", ["TRAINING_HOURS_AVG"]],
  ["S1-14", "Health and safety metrics", "S1", "if_material", ["LTIFR", "FATALITIES", "RECORDABLE_INJURIES"]],
  ["S1-16", "Pay gap and pay ratio", "S1", "if_material", ["GENDER_PAY_GAP"]],
  ["S1-17", "Incidents, complaints and severe human rights impacts", "S1", "if_material", ["COMPLAINTS_RECEIVED"]],
  ["G1-4", "Incidents of corruption or bribery", "G1", "if_material", []],
];

const ESRS_SECTION: Record<EsrsTopic, string> = {
  E1: "E1 Climate change",
  E2: "E2 Pollution",
  E3: "E3 Water and marine resources",
  E4: "E4 Biodiversity and ecosystems",
  E5: "E5 Resource use and circular economy",
  S1: "S1 Own workforce",
  S2: "S2 Workers in the value chain",
  S3: "S3 Affected communities",
  S4: "S4 Consumers and end-users",
  G1: "G1 Business conduct",
};

/** Fits and notes where a framework's definition differs from the KPI (01-contracts §2). */
const FIT_NOTES: Record<string, { fit: MappingFit; note: string }> = {
  "ESRS E3-4 WATER_WITHDRAWAL": { fit: "partial", note: "ESRS asks for consumption; withdrawal is reported as context." },
  "ESRS E3-4 WATER_DISCHARGE": { fit: "partial", note: "Used to work out consumption; ESRS doesn't ask for discharge by destination." },
  "GRI 2-26 COMPLAINTS_RECEIVED": { fit: "partial", note: "GRI asks about the ways to raise concerns; the count supports it." },
  "BRSR P9-E2 COMPLAINTS_RECEIVED": { fit: "partial", note: "BRSR counts consumer complaints only." },
  "ESRS S1-17 COMPLAINTS_RECEIVED": { fit: "partial", note: "ESRS counts complaints from own workforce only." },
  "BRSR P5-E3 GENDER_PAY_GAP": { fit: "derived", note: "BRSR asks for gross wages paid to women as a share of all wages; worked out from the pay ratio." },
  "ESRS S1-9 EMPLOYEES_WOMEN": { fit: "derived", note: "ESRS reports gender split of top management; the count gives the workforce split." },
};

/** The framework's own unit where it differs from the KPI's canonical unit (D10). */
const DISPLAY_UNIT: Partial<Record<FrameworkCode, Partial<Record<string, string>>>> = {
  GRI: { energy: "GJ", volume: "ML" },
  BRSR: { energy: "GJ", volume: "kL" },
  ESRS: { energy: "MWh", volume: "m³" },
};

function build() {
  const disclosures: KpiDisclosure[] = [];
  const mappings: KpiDisclosureMap[] = [];
  const add = (framework: FrameworkCode, code: string, title: string, section: string, requirement: RequirementLevel, esrs: EsrsTopic | null, kpis: string[]) => {
    const fw = KPI_FRAMEWORKS.find((f) => f.code === framework) as KpiFramework;
    const id = FRAMEWORK_ID[framework] * 100 + disclosures.filter((d) => d.framework_id === fw.id).length + 1;
    disclosures.push({ id, framework_id: fw.id, code, title, section, requirement, esrs_topic: esrs, source_url: fw.source_url, sort_key: id });
    for (const kpiCode of kpis) {
      const kpi = kpiByCode(kpiCode);
      const special = FIT_NOTES[`${framework} ${code} ${kpiCode}`];
      mappings.push({
        id: mappings.length + 1,
        disclosure_id: id,
        kpi_definition_id: kpi.id,
        fit: special?.fit ?? "exact",
        breakdown_key: null,
        display_unit: DISPLAY_UNIT[framework]?.[kpi.unit_dimension] ?? kpi.canonical_unit,
        note: special?.note ?? null,
      });
    }
  };
  for (const [code, title, section, req, kpis] of GRI_ROWS) add("GRI", code, title, section, req, null, kpis);
  for (const [code, title, section, req, kpis] of BRSR_ROWS) add("BRSR", code, title, section, req, null, kpis);
  for (const [code, title, topic, req, kpis] of ESRS_ROWS) add("ESRS", code, title, ESRS_SECTION[topic], req, topic, kpis);
  return { disclosures, mappings };
}

const LIBRARY = build();
export const KPI_DISCLOSURES: KpiDisclosure[] = LIBRARY.disclosures;
export const KPI_MAPPINGS: KpiDisclosureMap[] = LIBRARY.mappings;

/** KPI ids answering a BRSR Core disclosure (evidence required to submit, D15). */
export const BRSR_CORE_KPI_IDS: ReadonlySet<number> = new Set(
  KPI_MAPPINGS.filter((m) => KPI_DISCLOSURES.find((d) => d.id === m.disclosure_id)?.requirement === "core").map((m) => m.kpi_definition_id),
);

// ---------------------------------------------------------------------------
// ACME's setup (KPI-3)
// ---------------------------------------------------------------------------

export const ACME_MATERIAL_TOPICS: CompanyMaterialTopic[] = (
  [
    ["E1", true, null],
    ["E2", true, null],
    ["E3", true, null],
    ["E4", false, "No site is in or next to a protected area."],
    ["E5", true, null],
    ["S1", true, null],
    ["S2", false, "Suppliers' workers are covered by the supplier code; no significant impact found."],
    ["S3", false, "Plants are in industrial zones with no nearby communities affected."],
    ["S4", false, "We sell to businesses only."],
    ["G1", true, null],
  ] as [EsrsTopic, boolean, string | null][]
).map(([esrs_topic, material, reason]) => ({ company_id: ACME.company_id, esrs_topic, material, reason, decided_by: 13, decided_at: "2026-09-02T09:00:00.000Z" }));

export const ACME_COMPANY_KPIS: CompanyKpi[] = KPI_DEFINITIONS.map((d) => ({
  company_id: ACME.company_id,
  kpi_definition_id: d.id,
  selected: d.code !== "AIR_PM",
  frequency: null,
  reason_excluded: d.code === "AIR_PM" ? "No combustion stacks; dust is measured under the site permit only." : null,
}));

/** Ravi's twelve at Bahrain plant: the My KPIs September sample. */
export const RAVI_KPI_CODES = [
  "GHG_SCOPE1",
  "GHG_SCOPE2_LB",
  "ENERGY_TOTAL",
  "ENERGY_RENEWABLE",
  "WATER_WITHDRAWAL",
  "WATER_DISCHARGE",
  "WASTE_GENERATED",
  "WASTE_DIVERTED",
  "WASTE_DISPOSED",
  "AIR_NOX",
  "AIR_SOX",
  "RECORDABLE_INJURIES",
] as const;

const SITE_OWNER: Record<number, number> = { 1: 11, 2: 14, 3: 15 };

/**
 * D17 · Who owns each topic: every site topic goes to the site's contributor
 * (materials at Bahrain plant to Mia), every company topic to Omar.
 */
export const ACME_TOPIC_ASSIGNMENTS: KpiTopicAssignment[] = (() => {
  const owned = KPI_DEFINITIONS.filter((d) => d.source !== "formula" && d.code !== "AIR_PM");
  const rows: KpiTopicAssignment[] = [];
  for (const topic of KPI_TOPICS) {
    const defs = owned.filter((d) => d.topic === topic);
    if (defs.some((d) => d.level === "site"))
      for (const s of KPI_SITES) rows.push({ id: rows.length + 1, site_id: s.site_id, topic, owner_user_id: s.site_id === 1 && topic === "materials" ? 12 : SITE_OWNER[s.site_id], reviewer_user_id: null });
    if (defs.some((d) => d.level === "company")) rows.push({ id: rows.length + 1, site_id: null, topic, owner_user_id: 13, reviewer_user_id: 12 });
  }
  return rows;
})();

/** D17 · Per-KPI exceptions: at Bahrain plant these go to Mia, so Ravi owns exactly his twelve. */
export const ACME_ASSIGNMENTS: KpiAssignment[] = ["GHG_SCOPE2_MB", "ENERGY_NON_RENEWABLE", "LTIFR", "FATALITIES"].map((code) => ({
  company_id: ACME.company_id,
  kpi_definition_id: kpiByCode(code).id,
  site_id: 1,
  owner_user_id: 12,
  reviewer_user_id: null,
}));

// ---------------------------------------------------------------------------
// Values (KPI-4): September 2026, plus last September for comparison
// ---------------------------------------------------------------------------

type ValueInput = { id: number; code: string; site_id: number | null; period_start: string; value: number; unit?: string } & Partial<KpiValue>;

const monthEnd = (start: string, months: number): string => {
  const [y, m] = start.split("-").map(Number);
  const end = new Date(Date.UTC(y, m - 1 + months, 0));
  return end.toISOString().slice(0, 10);
};

const value = ({ id, code, site_id, period_start, value: v, unit, ...rest }: ValueInput): KpiValue => {
  const kpi = kpiByCode(code);
  const months = kpi.default_frequency === "monthly" ? 1 : kpi.default_frequency === "quarterly" ? 3 : 12;
  const status = rest.status ?? "approved";
  return {
    id,
    company_id: ACME.company_id,
    site_id,
    kpi_definition_id: kpi.id,
    period_start,
    period_end: monthEnd(period_start, months),
    frequency: kpi.default_frequency,
    year_type: "CY",
    value_numeric: v,
    value_text: null,
    unit: unit ?? kpi.canonical_unit,
    value_canonical: v,
    breakdown: null,
    source: kpi.source,
    status,
    is_estimate: false,
    comment: null,
    entered_by: kpi.source === "manual" ? (site_id ? SITE_OWNER[site_id] : 13) : null,
    submitted_at: status === "draft" ? null : "2026-10-05T10:00:00.000Z",
    reviewed_by: status === "approved" || status === "rejected" ? 12 : null,
    reviewed_at: status === "approved" || status === "rejected" ? "2026-10-07T10:00:00.000Z" : null,
    review_comment: null,
    checks: null,
    auto_snapshot: kpi.source === "auto" ? { read_at: "2026-10-08T06:00:00.000Z", rows: 14, link: `/data/ledger?site=${site_id ?? ""}&period=${period_start.slice(0, 7)}` } : null,
    created_at: "2026-10-03T10:00:00.000Z",
    updated_at: "2026-10-07T10:00:00.000Z",
    ...rest,
  };
};

/** The entered, site-level, monthly KPIs ACME tracks (what closing a month needs). */
const AUGUST_CODES = ["WATER_WITHDRAWAL", "WATER_DISCHARGE", "WASTE_GENERATED", "WASTE_DIVERTED", "WASTE_DISPOSED", "LTIFR", "FATALITIES", "RECORDABLE_INJURIES"] as const;
const AUGUST_VALUE: Record<(typeof AUGUST_CODES)[number], number> = {
  WATER_WITHDRAWAL: 1100,
  WATER_DISCHARGE: 820,
  WASTE_GENERATED: 11,
  WASTE_DIVERTED: 7.5,
  WASTE_DISPOSED: 3.5,
  LTIFR: 0.4,
  FATALITIES: 0,
  RECORDABLE_INJURIES: 0,
};

const SEP = "2026-09-01";
const Q3 = "2026-07-01";
const LAST_SEP = "2025-09-01";
const LAST_Q3 = "2025-07-01";

export const KPI_VALUES_SEED: KpiValue[] = [
  // Bahrain plant, September 2026: 1 sent back, 1 draft (due), 7 done.
  value({ id: 1, code: "WATER_WITHDRAWAL", site_id: 1, period_start: SEP, value: 1200, status: "rejected", review_comment: "Please split it by source for BRSR." }),
  value({ id: 2, code: "WATER_DISCHARGE", site_id: 1, period_start: SEP, value: 860, status: "draft" }),
  value({ id: 3, code: "GHG_SCOPE1", site_id: 1, period_start: SEP, value: 512.4 }),
  value({ id: 4, code: "GHG_SCOPE2_LB", site_id: 1, period_start: SEP, value: 1803.2 }),
  value({ id: 5, code: "ENERGY_TOTAL", site_id: 1, period_start: SEP, value: 4120 }),
  value({ id: 6, code: "ENERGY_RENEWABLE", site_id: 1, period_start: SEP, value: 310 }),
  value({ id: 7, code: "WASTE_DIVERTED", site_id: 1, period_start: SEP, value: 8.1, status: "pending" }),
  value({ id: 8, code: "WASTE_DISPOSED", site_id: 1, period_start: SEP, value: 3.2 }),
  value({ id: 9, code: "AIR_SOX", site_id: 1, period_start: Q3, value: 0.42, status: "pending" }),
  // Other plants, September 2026: waiting for Mia.
  value({ id: 10, code: "WATER_WITHDRAWAL", site_id: 2, period_start: SEP, value: 3600, status: "pending", comment: "New cooling tower filled", checks: [{ id: "KPI_CHANGE_LIMIT", detail: "3× last September" }] }),
  value({ id: 11, code: "WASTE_GENERATED", site_id: 2, period_start: SEP, value: 9.8, status: "pending" }),
  value({ id: 12, code: "WASTE_GENERATED", site_id: 3, period_start: SEP, value: 14.2, status: "pending", checks: [{ id: "KPI_EVIDENCE", detail: null }] }),
  value({ id: 13, code: "RECORDABLE_INJURIES", site_id: 3, period_start: SEP, value: 0, status: "pending" }),
  // Bahrain plant, last September (for "Last September: …").
  value({ id: 20, code: "WATER_WITHDRAWAL", site_id: 1, period_start: LAST_SEP, value: 1050 }),
  value({ id: 21, code: "WATER_DISCHARGE", site_id: 1, period_start: LAST_SEP, value: 840 }),
  value({ id: 22, code: "WASTE_GENERATED", site_id: 1, period_start: LAST_SEP, value: 12.4 }),
  value({ id: 23, code: "RECORDABLE_INJURIES", site_id: 1, period_start: LAST_SEP, value: 0 }),
  value({ id: 24, code: "AIR_NOX", site_id: 1, period_start: LAST_Q3, value: 1.9 }),
  value({ id: 25, code: "WASTE_DIVERTED", site_id: 1, period_start: LAST_SEP, value: 7.6 }),
  value({ id: 26, code: "WASTE_DISPOSED", site_id: 1, period_start: LAST_SEP, value: 4.1 }),
  value({ id: 27, code: "AIR_SOX", site_id: 1, period_start: LAST_Q3, value: 0.5 }),
  value({ id: 28, code: "GHG_SCOPE1", site_id: 1, period_start: LAST_SEP, value: 540.1 }),
  value({ id: 29, code: "GHG_SCOPE2_LB", site_id: 1, period_start: LAST_SEP, value: 1890.6 }),
  value({ id: 30, code: "ENERGY_TOTAL", site_id: 1, period_start: LAST_SEP, value: 4305 }),
  value({ id: 31, code: "ENERGY_RENEWABLE", site_id: 1, period_start: LAST_SEP, value: 0 }),
  // Dammam and Matola, last September (the review list's "vs last year").
  value({ id: 32, code: "WATER_WITHDRAWAL", site_id: 2, period_start: LAST_SEP, value: 1150 }),
  value({ id: 33, code: "WASTE_GENERATED", site_id: 2, period_start: LAST_SEP, value: 10.4 }),
  value({ id: 34, code: "WASTE_GENERATED", site_id: 3, period_start: LAST_SEP, value: 13.6 }),
  value({ id: 35, code: "RECORDABLE_INJURIES", site_id: 3, period_start: LAST_SEP, value: 1 }),
  // August 2026: every entered monthly KPI of every plant approved, so the month can be closed (KPI-8).
  ...AUGUST_CODES.flatMap((code, i) =>
    KPI_SITES.map((s, j) => value({ id: 100 + i * KPI_SITES.length + j, code, site_id: s.site_id, period_start: "2026-08-01", value: Math.round(AUGUST_VALUE[code] * (1 + j * 0.1) * 100) / 100 })),
  ),
];

export const KPI_EVIDENCE_SEED: KpiValueEvidence[] = [
  { id: 1, kpi_value_id: 1, document_url: "https://assets.example.invalid/kpi/EWA-bill-Sep-2026.pdf", document_name: "EWA-bill-Sep-2026.pdf", uploaded_by: 11, uploaded_at: "2026-10-04T09:00:00.000Z" },
];

export const KPI_TARGETS_SEED: KpiTargetWithProgress[] = [
  { id: 1, company_id: 1, kpi_definition_id: 1, site_id: null, baseline_year: 2024, baseline_value: 7000, target_year: 2030, target_value: 4200, direction: "reduce", note: "SBTi near-term, Scope 1", created_by: 13, current_value: 6212, current_year: 2025, progress_pct: 28.1 },
  { id: 2, company_id: 1, kpi_definition_id: 13, site_id: null, baseline_year: 2024, baseline_value: 48000, target_year: 2030, target_value: 38000, direction: "reduce", note: null, created_by: 13, current_value: 41600, current_year: 2025, progress_pct: 64 },
];
