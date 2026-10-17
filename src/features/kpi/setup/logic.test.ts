import { describe, expect, it } from "vitest";
import type { KpiSetup, KpiSetupPerson } from "../../../lib/kpi/contracts";
import { KPI_DEFINITIONS, KPI_DISCLOSURES, KPI_FRAMEWORKS, KPI_MAPPINGS, kpiByCode } from "../../../test/msw/kpiData";
import {
  applyToAllSites,
  assignmentsPayload,
  cellKey,
  codesOf,
  countSelected,
  defaultOwner,
  initialChoices,
  initialFrameworkIds,
  initialMaterial,
  initialOwners,
  kpisPayload,
  materialErrors,
  materialPayload,
  missingReasons,
  recommendationFor,
  resumeStep,
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

describe("KPI setup: owners", () => {
  const water = kpiByCode("WATER_WITHDRAWAL");
  const revenue = kpiByCode("REVENUE");

  it("defaults site KPIs to the site's data-entry user and company KPIs to an Admin", () => {
    expect(defaultOwner(1, PEOPLE)).toBe(11);
    expect(defaultOwner(2, PEOPLE)).toBe(12);
    expect(defaultOwner(null, PEOPLE)).toBe(13);
    const owners = initialOwners(fresh, [water, revenue], SITES, PEOPLE);
    expect([...owners]).toEqual([
      [cellKey(water.id, 1), 11],
      [cellKey(water.id, 2), 12],
      [cellKey(revenue.id, null), 13],
    ]);
  });

  it("applies one person to every site they work at", () => {
    const owners = initialOwners(fresh, [water], SITES, PEOPLE);
    expect(applyToAllSites(owners, water.id, 12, SITES, PEOPLE).skipped).toEqual([]);
    const ravi = applyToAllSites(owners, water.id, 11, SITES, PEOPLE);
    expect(ravi.skipped).toEqual(["Dammam"]);
    expect(assignmentsPayload(ravi.owners)).toEqual([
      { kpi_definition_id: water.id, site_id: 1, owner_user_id: 11, reviewer_user_id: null },
      { kpi_definition_id: water.id, site_id: 2, owner_user_id: 12, reviewer_user_id: null },
    ]);
  });
});
