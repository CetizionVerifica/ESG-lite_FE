/**
 * KPI-3 · Setup wizard logic (pure): which step to resume at, the defaults
 * each step starts from, the live counts, and the payload each step saves.
 */
import {
  ESRS_TOPICS,
  type EsrsTopic,
  type FrameworkCode,
  type KpiCatalogue,
  type KpiDefinition,
  type KpiFramework,
  type KpiFrequency,
  type KpiSetup,
  type KpiSetupPerson,
  type KpiSetupSite,
  type KpiTopic,
  KPI_TOPICS,
  type PutKpiSetupBody,
  type UnitDimension,
  type KpiValueType,
} from "../../../lib/kpi/contracts";
import type { FrameworkUse } from "../../../lib/kpi/badges";
import { type Recommendation, recommendKpis } from "../../../lib/kpi/recommend";
import { familyUnits, unitInfo } from "../../../lib/kpi/units";

export const STEPS = [
  { id: "frameworks", label: "Frameworks" },
  { id: "topics", label: "What matters to you", description: "Only for CSRD (ESRS)" },
  { id: "kpis", label: "KPIs" },
  { id: "owners", label: "Who enters what" },
] as const;
export type StepId = (typeof STEPS)[number]["id"];

export const isStep = (v: unknown): v is StepId => STEPS.some((s) => s.id === v);

// ---------------------------------------------------------------------------
// Step 1: frameworks and the year
// ---------------------------------------------------------------------------

/** Versions per framework code, newest first (by version text). */
export function versionsByCode(frameworks: KpiFramework[]): Record<FrameworkCode, KpiFramework[]> {
  const out: Record<FrameworkCode, KpiFramework[]> = { GRI: [], BRSR: [], ESRS: [] };
  for (const f of frameworks) if (f.active !== false && out[f.code]) out[f.code].push(f);
  for (const code of Object.keys(out) as FrameworkCode[]) out[code].sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));
  return out;
}

/** The versions picked so far: the saved ones, or (first time) those marked default for new companies. */
export function initialFrameworkIds(setup: KpiSetup, frameworks: KpiFramework[]): number[] {
  if (setup.frameworks.length) return setup.frameworks.map((f) => f.framework_id);
  return frameworks.filter((f) => f.default_for_new && f.active !== false).map((f) => f.id);
}

export const codesOf = (ids: number[], frameworks: KpiFramework[]): FrameworkCode[] =>
  [...new Set(ids.map((id) => frameworks.find((f) => f.id === id)?.code).filter((c): c is FrameworkCode => !!c))];

/** Picks or drops a framework: one version per code. */
export function toggleFramework(ids: number[], code: FrameworkCode, on: boolean, frameworks: KpiFramework[], versionId?: number): number[] {
  const others = ids.filter((id) => frameworks.find((f) => f.id === id)?.code !== code);
  if (!on) return others;
  const pick = versionId ?? versionsByCode(frameworks)[code][0]?.id;
  return pick ? [...others, pick] : others;
}

// ---------------------------------------------------------------------------
// Step 2: material topics (D13)
// ---------------------------------------------------------------------------

export type MaterialChoice = { material: boolean | null; reason: string };
export type MaterialState = Record<EsrsTopic, MaterialChoice>;

/** Saved decisions; first time, Climate (E1) is Yes and the rest are undecided. */
export function initialMaterial(setup: KpiSetup): MaterialState {
  const out = Object.fromEntries(ESRS_TOPICS.map((t) => [t, { material: t === "E1" ? true : null, reason: "" }])) as MaterialState;
  for (const t of setup.material_topics) out[t.esrs_topic] = { material: t.material, reason: t.reason ?? "" };
  return out;
}

export const materialMap = (m: MaterialState): Map<EsrsTopic, boolean> =>
  new Map(ESRS_TOPICS.filter((t) => m[t].material !== null).map((t) => [t, m[t].material as boolean]));

/** What's missing before step 2 saves: undecided topics and "No" without a reason. */
export function materialErrors(m: MaterialState): Partial<Record<EsrsTopic, string>> {
  const errors: Partial<Record<EsrsTopic, string>> = {};
  for (const t of ESRS_TOPICS) {
    if (m[t].material === null) errors[t] = "Choose yes or no.";
    else if (!m[t].material && !m[t].reason.trim()) errors[t] = "Say in one line why it doesn't matter. ESRS asks for it.";
  }
  return errors;
}

export const materialPayload = (m: MaterialState): NonNullable<PutKpiSetupBody["material_topics"]> =>
  ESRS_TOPICS.filter((t) => m[t].material !== null).map((t) => ({ esrs_topic: t, material: m[t].material as boolean, reason: m[t].material ? null : m[t].reason.trim() }));

// ---------------------------------------------------------------------------
// Step 3: KPIs
// ---------------------------------------------------------------------------

export type KpiChoice = { selected: boolean; reason: string; frequency: KpiFrequency | null };

/** The recommendation for the current choices: the server's list when it matches what's saved, else the local rule. */
export function recommendationFor(catalogue: KpiCatalogue, frameworkIds: number[], material: MaterialState): Recommendation {
  return recommendKpis(catalogue, frameworkIds, materialMap(material));
}

/** Pre-ticked: the saved choice, else what the chosen frameworks require (05-ux S2 step 3). */
export function initialChoices(setup: KpiSetup, defs: KpiDefinition[], required: Set<number>): Map<number, KpiChoice> {
  const saved = new Map(setup.kpis.map((k) => [k.kpi_definition_id, k]));
  const out = new Map<number, KpiChoice>();
  for (const d of defs) {
    const s = saved.get(d.id);
    out.set(d.id, s ? { selected: s.selected, reason: s.reason_excluded ?? "", frequency: s.frequency } : { selected: required.has(d.id), reason: "", frequency: null });
  }
  return out;
}

export interface TopicGroup {
  topic: KpiTopic;
  defs: KpiDefinition[];
}

/** KPIs grouped by topic in the library's topic order; within a topic, entered KPIs after auto and calculated ones. */
export function groupByTopic(defs: KpiDefinition[]): TopicGroup[] {
  return KPI_TOPICS.map((topic) => ({ topic, defs: defs.filter((d) => d.topic === topic).sort((a, b) => a.name.localeCompare(b.name)) })).filter((g) => g.defs.length);
}

/** "34 KPIs selected · 12 filled from your data · 4 calculated · 18 to enter" */
export function countSelected(defs: KpiDefinition[], choices: Map<number, KpiChoice>) {
  const chosen = defs.filter((d) => choices.get(d.id)?.selected);
  return {
    total: chosen.length,
    auto: chosen.filter((d) => d.source === "auto").length,
    formula: chosen.filter((d) => d.source === "formula").length,
    manual: chosen.filter((d) => d.source === "manual").length,
  };
}

/** Required KPIs left out without a reason. */
export const missingReasons = (choices: Map<number, KpiChoice>, required: Set<number>): number[] =>
  [...choices].filter(([id, c]) => required.has(id) && !c.selected && !c.reason.trim()).map(([id]) => id);

/**
 * Step 3's payload: every selected KPI, and each required KPI left out with
 * its reason. KPIs neither selected nor required are left out of the list
 * (assumed: the list replaces the company's selection).
 */
export function kpisPayload(choices: Map<number, KpiChoice>, required: Set<number>): NonNullable<PutKpiSetupBody["kpis"]> {
  return [...choices]
    .filter(([id, c]) => c.selected || required.has(id))
    .map(([id, c]) => ({ kpi_definition_id: id, selected: c.selected, frequency: c.frequency, reason_excluded: c.selected ? null : c.reason.trim() }));
}

/** "Required by GRI 303-3, BRSR P6-E3 (Core)" or "Needed to calculate …" for the reason prompt. */
export function whyRequired(id: number, rec: Recommendation): string {
  const uses: FrameworkUse[] = rec.requiredBy.get(id) ?? [];
  if (uses.length) return `Required by ${uses.map((u) => `${u.framework} ${u.code}${u.core ? " (Core)" : ""}`).join(", ")}.`;
  const needed = rec.neededFor.get(id);
  return needed?.length ? `Needed to calculate ${needed.join(" and ")}.` : "Recommended for your frameworks.";
}

// ---------------------------------------------------------------------------
// Step 4: who enters what
// ---------------------------------------------------------------------------

export const cellKey = (kpiId: number, siteId: number | null) => `${kpiId}:${siteId ?? "c"}`;

/** KPIs that need an owner: selected ones except calculated (auto ones go to the site so its people see them). */
export const ownedKpis = (defs: KpiDefinition[], choices: Map<number, KpiChoice>) => defs.filter((d) => choices.get(d.id)?.selected && d.source !== "formula");

/** Who may own a cell: a person of that site (site KPIs), anyone of the company (company KPIs). Admins first for company KPIs. */
export function eligibleOwners(siteId: number | null, people: KpiSetupPerson[]): KpiSetupPerson[] {
  const rank = (p: KpiSetupPerson) => (siteId === null ? (p.role === "Admin" ? 0 : p.role === "Manager" ? 1 : 2) : p.role === "User" ? 0 : p.role === "Manager" ? 1 : 2);
  const list = siteId === null ? people : people.filter((p) => p.site_ids.includes(siteId));
  return [...list].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

/** The default owner: the site's data-entry user, else its manager; company KPIs go to an Admin (05-ux S2 step 4). */
export const defaultOwner = (siteId: number | null, people: KpiSetupPerson[]): number | null => eligibleOwners(siteId, people)[0]?.user_id ?? null;

/** Owner per cell: saved assignments, else the defaults. */
export function initialOwners(setup: KpiSetup, defs: KpiDefinition[], sites: KpiSetupSite[], people: KpiSetupPerson[]): Map<string, number | null> {
  const saved = new Map(setup.assignments.map((a) => [cellKey(a.kpi_definition_id, a.site_id), a.owner_user_id]));
  const out = new Map<string, number | null>();
  for (const d of defs) {
    const cells = d.level === "company" ? [null] : sites.map((s) => s.site_id);
    for (const siteId of cells) {
      const key = cellKey(d.id, siteId);
      out.set(key, saved.get(key) ?? defaultOwner(siteId, people));
    }
  }
  return out;
}

/** "Apply to all sites": the person goes to every site they work at; the others are named. */
export function applyToAllSites(owners: Map<string, number | null>, kpiId: number, personId: number, sites: KpiSetupSite[], people: KpiSetupPerson[]) {
  const next = new Map(owners);
  const skipped: string[] = [];
  for (const s of sites) {
    if (eligibleOwners(s.site_id, people).some((p) => p.user_id === personId)) next.set(cellKey(kpiId, s.site_id), personId);
    else skipped.push(s.name);
  }
  return { owners: next, skipped };
}

export const unownedCells = (owners: Map<string, number | null>) => [...owners].filter(([, v]) => v === null).map(([k]) => k);

/** Step 4's payload; the reviewer stays the site's managers (null). */
export function assignmentsPayload(owners: Map<string, number | null>): NonNullable<PutKpiSetupBody["assignments"]> {
  return [...owners]
    .filter(([, owner]) => owner !== null)
    .map(([key, owner]) => {
      const [kpi, site] = key.split(":");
      return { kpi_definition_id: Number(kpi), site_id: site === "c" ? null : Number(site), owner_user_id: owner as number, reviewer_user_id: null };
    });
}

// ---------------------------------------------------------------------------
// Resume
// ---------------------------------------------------------------------------

/** Where an unfinished setup picks up: the first step not saved yet. */
export function resumeStep(setup: KpiSetup, frameworks: KpiFramework[]): StepId {
  if (!setup.frameworks.length) return "frameworks";
  const esrs = codesOf(setup.frameworks.map((f) => f.framework_id), frameworks).includes("ESRS");
  if (esrs && setup.material_topics.length < ESRS_TOPICS.length) return "topics";
  if (!setup.kpis.length) return "kpis";
  return "owners";
}

// ---------------------------------------------------------------------------
// "Add your own KPI"
// ---------------------------------------------------------------------------

const FAMILY_DIMENSION: Record<string, UnitDimension> = {
  energy: "energy",
  mass: "mass",
  co2e: "mass",
  volume: "volume",
  count: "count",
  days: "count",
  percent: "ratio",
  injury_rate: "ratio",
  times: "ratio",
  time: "time",
};

/** Dimension, value type and allowed units for a custom KPI's unit (as the server's unit registry groups them). */
export function unitShape(unit: string): { unit_dimension: UnitDimension; value_type: KpiValueType; allowed_units: string[]; canonical_unit: string | null } {
  const trimmed = unit.trim();
  if (!trimmed) return { unit_dimension: "count", value_type: "integer", allowed_units: [], canonical_unit: null };
  const info = unitInfo(trimmed);
  if (!info) return { unit_dimension: "none", value_type: "number", allowed_units: [trimmed], canonical_unit: trimmed };
  const dimension = FAMILY_DIMENSION[info.family] ?? "currency";
  const value_type: KpiValueType = info.family === "percent" ? "percent" : dimension === "currency" ? "currency" : info.family === "count" ? "integer" : "number";
  return { unit_dimension: dimension, value_type, allowed_units: familyUnits(trimmed), canonical_unit: info.label };
}

/** Per KPI, where it's used in the chosen framework versions (for the badges). */
export function usesFor(catalogue: Pick<KpiCatalogue, "frameworks" | "disclosures" | "mappings">, frameworkIds: number[]): Map<number, FrameworkUse[]> {
  const enabled = new Set(frameworkIds);
  const fw = new Map(catalogue.frameworks.map((f) => [f.id, f.code]));
  const disclosures = new Map(catalogue.disclosures.map((d) => [d.id, d]));
  const out = new Map<number, FrameworkUse[]>();
  for (const m of catalogue.mappings) {
    const d = disclosures.get(m.disclosure_id);
    const code = d && enabled.has(d.framework_id) ? fw.get(d.framework_id) : undefined;
    if (!d || !code) continue;
    out.set(m.kpi_definition_id, [...(out.get(m.kpi_definition_id) ?? []), { framework: code, code: d.code, ...(d.requirement === "core" ? { core: true } : {}) }]);
  }
  return out;
}
