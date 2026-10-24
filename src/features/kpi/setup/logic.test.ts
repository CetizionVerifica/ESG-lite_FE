import { describe, expect, it } from "vitest";
import type { KpiSetup, KpiSetupPerson } from "../../../lib/kpi/contracts";
import { KPI_DEFINITIONS, KPI_DISCLOSURES, KPI_FRAMEWORKS, KPI_MAPPINGS, kpiByCode } from "../../../test/msw/kpiData";
import {
  groupByPillarTopic,
  cellKey,
  codesOf,
  countSelected,
  defaultOwner,
  initialChoices,
  initialFrameworkIds,
  initialMaterial,
  initialOverrides,
  initialTopicOwners,
  kpisPayload,
  materialErrors,
  materialPayload,
  missingReasons,
  overridesPayload,
  recommendationFor,
  resolveOwner,
  resumeStep,
  sameForEverySite,
  topicAssignmentsPayload,
  topicGrid,
  topicKey,
  unownedTopicSlots,
  differsFromTopic,
  toggleFramework,
  unitShape,
  usesFor,
  whyRequired,
} from "./logic";

const catalogue = { frameworks: KPI_FRAMEWORKS, disclosures: KPI_DISCLOSURES, definitions: KPI_DEFINITIONS, mappings: KPI_MAPPINGS };
const fresh: KpiSetup = { settings: { company_id: 1, year_type: "CY", first_year: 2026, due_day: 15, setup_completed_at: null }, frameworks: [], material_topics: [], kpis: [], assignments: [] };
const SITES = [
  { site_id: 1, name: "Bahrain plant" },
  { site_id: 2, name: "Dammam" },
];
const PEOPLE: KpiSetupPerson[] = [
  { user_id: 11, name: "Ravi Kumar", role: "User", site_ids: [1] },
  { user_id: 12, name: "Mia Haddad", role: "Manager", site_ids: [1, 2] },
  { user_id: 13, name: "Omar Saleh", role: "Admin", site_ids: [] },
];

describe("KPI setup: frameworks and topics", () => {
  it("starts with the frameworks marked for new companies, one version per code", () => {
    expect(initialFrameworkIds(fresh, KPI_FRAMEWORKS)).toEqual([1]);
    expect(toggleFramework([1], "ESRS", true, KPI_FRAMEWORKS)).toEqual([1, 3]);
    expect(toggleFramework([1, 3], "GRI", false, KPI_FRAMEWORKS)).toEqual([3]);
    expect(codesOf([1, 3], KPI_FRAMEWORKS)).toEqual(["GRI", "ESRS"]);
  });

  it("climate starts at Yes; No needs a reason", () => {
    const m = initialMaterial(fresh);
    expect(m.E1).toEqual({ material: true, reason: "" });
    expect(m.E3.material).toBeNull();
    expect(Object.keys(materialErrors(m))).toHaveLength(9);
    const answered = { ...m, E3: { material: false, reason: "" } };
    expect(materialErrors(answered).E3).toBe("Say in one line why it doesn't matter. ESRS asks for it.");
    expect(materialPayload({ ...answered, E3: { material: false, reason: " Desert site " } })).toEqual([
      { esrs_topic: "E1", material: true, reason: null },
      { esrs_topic: "E3", material: false, reason: "Desert site" },
    ]);
  });

  it("resumes at the first step not saved", () => {
    expect(resumeStep(fresh, KPI_FRAMEWORKS)).toBe("frameworks");
    const withEsrs = { ...fresh, frameworks: [{ company_id: 1, framework_id: 3, enabled_at: "", enabled_by: 1 }] };
    expect(resumeStep(withEsrs, KPI_FRAMEWORKS)).toBe("topics");
    const griOnly = { ...fresh, frameworks: [{ company_id: 1, framework_id: 1, enabled_at: "", enabled_by: 1 }] };
    expect(resumeStep(griOnly, KPI_FRAMEWORKS)).toBe("kpis");
    expect(resumeStep({ ...griOnly, kpis: [{ company_id: 1, kpi_definition_id: 1, selected: true, frequency: null, reason_excluded: null }] }, KPI_FRAMEWORKS)).toBe("owners");
  });
});

describe("KPI setup: KPIs", () => {
  const rec = recommendationFor(catalogue, [1, 2], initialMaterial(fresh));

  it("pre-ticks what the frameworks require and counts it", () => {
    const choices = initialChoices(fresh, KPI_DEFINITIONS, rec.ids);
    expect(choices.get(kpiByCode("WATER_WITHDRAWAL").id)?.selected).toBe(true);
    expect(choices.get(kpiByCode("REVENUE").id)?.selected).toBe(true);
    const c = countSelected(KPI_DEFINITIONS, choices);
    expect(c.total).toBe(c.auto + c.formula + c.manual);
    expect(c.auto).toBeGreaterThan(0);
  });

  it("asks for a reason to leave out a required KPI, and sends only what matters", () => {
    const id = kpiByCode("WATER_DISCHARGE").id;
    const choices = initialChoices(fresh, KPI_DEFINITIONS, rec.ids);
    choices.set(id, { selected: false, reason: "", frequency: null });
    expect(missingReasons(choices, rec.ids)).toEqual([id]);
    choices.set(id, { selected: false, reason: "Zero liquid discharge", frequency: null });
    expect(missingReasons(choices, rec.ids)).toEqual([]);
    const body = kpisPayload(choices, rec.ids);
    expect(body).toContainEqual({ kpi_definition_id: id, selected: false, frequency: null, reason_excluded: "Zero liquid discharge" });
    expect(body.every((k) => k.selected || rec.ids.has(k.kpi_definition_id))).toBe(true);
    expect(whyRequired(id, rec)).toBe("Required by GRI 303-4, BRSR P6-E4.");
    expect(whyRequired(kpiByCode("REVENUE").id, rec)).toBe("Needed to calculate GHG intensity per revenue and Energy intensity per revenue.");
  });

  it("shows badges for the chosen frameworks only", () => {
    expect(usesFor(catalogue, [1]).get(kpiByCode("WATER_WITHDRAWAL").id)).toEqual([{ framework: "GRI", code: "303-3" }]);
  });

  it("works out a custom KPI's unit shape", () => {
    expect(unitShape("m³")).toMatchObject({ unit_dimension: "volume", value_type: "number", canonical_unit: "m³" });
    expect(unitShape("%")).toMatchObject({ unit_dimension: "ratio", value_type: "percent" });
    expect(unitShape("")).toMatchObject({ unit_dimension: "count", value_type: "integer", canonical_unit: null });
    expect(unitShape("trees")).toEqual({ unit_dimension: "none", value_type: "number", allowed_units: ["trees"], canonical_unit: "trees" });
    expect(unitShape("INR crore")).toMatchObject({ unit_dimension: "currency", value_type: "currency" });
  });
});

describe("KPI setup: owners by topic (D17)", () => {
  const water = kpiByCode("WATER_WITHDRAWAL");
  const discharge = kpiByCode("WATER_DISCHARGE");
  const revenue = kpiByCode("REVENUE");
  const injuries = kpiByCode("RECORDABLE_INJURIES");

  it("builds a topics × sites grid with a Company column, counting KPIs per slot", () => {
    const grid = topicGrid([water, discharge, revenue, injuries], SITES);
    expect(grid.topics).toEqual(["water", "health_safety", "governance"]);
    expect(grid.company).toBe(true);
    expect(grid.cells.get(topicKey("water", 1))).toEqual([water.id, discharge.id]);
    expect(grid.cells.get(topicKey("governance", null))).toEqual([revenue.id]);
    expect(grid.cells.has(topicKey("governance", 1))).toBe(false);
  });

  it("starts from what's saved, then the server's suggestion, then the site's first User or an Admin", () => {
    expect(defaultOwner(1, PEOPLE)).toBe(11);
    expect(defaultOwner(2, PEOPLE)).toBe(12);
    expect(defaultOwner(null, PEOPLE)).toBe(13);
    const grid = topicGrid([water, revenue], SITES);
    expect([...initialTopicOwners(fresh, grid, PEOPLE)]).toEqual([
      [topicKey("water", 1), 11],
      [topicKey("water", 2), 12],
      [topicKey("governance", null), 13],
    ]);
    const setup: KpiSetup = {
      ...fresh,
      topic_assignments: [{ id: 1, site_id: 1, topic: "water", owner_user_id: 12, reviewer_user_id: null }],
      // A suggestion for someone who doesn't work at the site is ignored.
      suggested_topic_assignments: [{ site_id: 2, topic: "water", owner_user_id: 11, reviewer_user_id: null }],
    };
    expect(initialTopicOwners(setup, grid, PEOPLE).get(topicKey("water", 1))).toBe(12);
    expect(initialTopicOwners(setup, grid, PEOPLE).get(topicKey("water", 2))).toBe(12);
  });

  it("resolves an owner as the server does: the exception, else the topic's person", () => {
    const owners = new Map([[topicKey("water", 1), 11]]);
    const overrides = new Map([[cellKey(discharge.id, 1), 12]]);
    expect(resolveOwner(water, 1, overrides, owners)).toBe(11);
    expect(resolveOwner(discharge, 1, overrides, owners)).toBe(12);
    expect(resolveOwner(water, 2, overrides, owners)).toBeNull();
    expect(differsFromTopic(discharge, 1, 12, owners)).toBe(true);
    expect(differsFromTopic(discharge, 1, 11, owners)).toBe(false);
  });

  it("fills a row with the same person where they work, and names the other sites", () => {
    const grid = topicGrid([water, revenue], SITES);
    const owners = initialTopicOwners(fresh, grid, PEOPLE);
    expect(sameForEverySite(owners, "water", 12, SITES, PEOPLE).skipped).toEqual([]);
    const ravi = sameForEverySite(owners, "water", 11, SITES, PEOPLE);
    expect(ravi.skipped).toEqual(["Dammam"]);
    expect(ravi.owners.get(topicKey("governance", null))).toBe(13);
  });

  it("asks for an owner only where a KPI would be left with nobody", () => {
    const grid = topicGrid([water, discharge], SITES);
    const owners = new Map<string, number | null>([
      [topicKey("water", 1), null],
      [topicKey("water", 2), 12],
    ]);
    expect(unownedTopicSlots(grid, owners, new Map())).toEqual([topicKey("water", 1)]);
    const both = new Map<string, number | null>([
      [cellKey(water.id, 1), 12],
      [cellKey(discharge.id, 1), 12],
    ]);
    expect(unownedTopicSlots(grid, owners, both)).toEqual([]);
  });

  it("saves the whole set of topic owners, keeps saved slots off the grid, and only real exceptions", () => {
    const setup: KpiSetup = { ...fresh, topic_assignments: [{ id: 4, site_id: 1, topic: "biodiversity", owner_user_id: 11, reviewer_user_id: 12 }] };
    const owners = new Map<string, number | null>([
      [topicKey("water", 1), 11],
      [topicKey("water", 2), null],
    ]);
    expect(topicAssignmentsPayload(owners, setup)).toEqual([
      { site_id: 1, topic: "water", owner_user_id: 11, reviewer_user_id: null },
      { site_id: 1, topic: "biodiversity", owner_user_id: 11, reviewer_user_id: 12 },
    ]);
    const overrides = initialOverrides({
      ...fresh,
      assignments: [
        { company_id: 1, kpi_definition_id: water.id, site_id: 1, owner_user_id: 11, reviewer_user_id: null },
        { company_id: 1, kpi_definition_id: discharge.id, site_id: 1, owner_user_id: 12, reviewer_user_id: null },
      ],
    });
    expect(overridesPayload(overrides, owners, [water, discharge])).toEqual([{ kpi_definition_id: discharge.id, site_id: 1, owner_user_id: 12, reviewer_user_id: null }]);
  });
});

describe("D19 · step 3 groups by pillar, then topic", () => {
  it("puts each KPI under its own pillar (board diversity under Governance) and counts the ticked ones", () => {
    const choices = new Map(KPI_DEFINITIONS.map((d) => [d.id, { selected: d.code !== "AIR_PM" && d.code !== "AIR_NOX", reason: "", frequency: null }]));
    const groups = groupByPillarTopic(KPI_DEFINITIONS, choices);
    expect(groups.map((g) => g.pillar)).toEqual(["environment", "social", "governance"]);
    expect(groups.map((g) => g.items.map((t) => t.topic))).toEqual([
      ["climate", "energy", "water", "waste", "pollution", "materials"],
      ["workforce", "health_safety", "diversity", "training"],
      ["diversity", "governance", "ethics"],
    ]);
    expect(groups[2].items[0].defs.map((d) => d.code)).toEqual(["WOMEN_ON_BOARD"]);
    expect(groups.map((g) => [g.selected, g.total])).toEqual([
      [17, 19],
      [10, 10],
      [3, 3],
    ]);
  });
});
