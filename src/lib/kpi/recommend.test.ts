import { describe, expect, it } from "vitest";
import type { EsrsTopic } from "./contracts";
import { recommendKpis } from "./recommend";
import { KPI_DEFINITIONS, KPI_DISCLOSURES, KPI_FRAMEWORKS, KPI_MAPPINGS, kpiByCode } from "../../test/msw/kpiData";

const catalogue = { frameworks: KPI_FRAMEWORKS, disclosures: KPI_DISCLOSURES, definitions: KPI_DEFINITIONS, mappings: KPI_MAPPINGS };
const codes = (ids: Set<number>) => KPI_DEFINITIONS.filter((d) => ids.has(d.id)).map((d) => d.code);
const none = new Map<EsrsTopic, boolean>();

describe("KPI-3 recommendation rule", () => {
  it("GRI only: every KPI a required GRI disclosure needs, plus formula inputs", () => {
    const r = recommendKpis(catalogue, [1], none);
    const c = codes(r.ids);
    expect(c).toContain("WATER_WITHDRAWAL");
    expect(c).toContain("GHG_INTENSITY_REVENUE");
    // Pulled in by the intensity formulas, though no GRI disclosure maps it.
    expect(c).toContain("REVENUE");
    expect(r.neededFor.get(kpiByCode("REVENUE").id)).toEqual(expect.arrayContaining(["GHG intensity per revenue"]));
    expect(r.requiredBy.get(kpiByCode("WATER_WITHDRAWAL").id)).toEqual([{ framework: "GRI", code: "303-3" }]);
  });

  it("BRSR Core marks its KPIs core; voluntary disclosures add nothing", () => {
    const r = recommendKpis(catalogue, [2], none);
    expect(r.requiredBy.get(kpiByCode("WATER_WITHDRAWAL").id)).toEqual([{ framework: "BRSR", code: "P6-E3", core: true }]);
    expect(codes(r.ids)).not.toContain("GHG_SCOPE3");
  });

  it("ESRS with E3 not material leaves out the water datapoints", () => {
    const material = new Map<EsrsTopic, boolean>([["E3", false]]);
    const c = codes(recommendKpis(catalogue, [3], material).ids);
    expect(c).not.toContain("WATER_WITHDRAWAL");
    expect(c).not.toContain("WATER_CONSUMPTION");
    expect(c).toContain("GHG_SCOPE1");
    expect(codes(recommendKpis(catalogue, [3], none).ids)).toContain("WATER_WITHDRAWAL");
  });

  it("calculated KPIs pull in their inputs, transitively", () => {
    const c = codes(recommendKpis(catalogue, [3], new Map<EsrsTopic, boolean>([["S1", true]])).ids);
    expect(c).toContain("WOMEN_IN_WORKFORCE");
    expect(c).toContain("EMPLOYEES_WOMEN");
    expect(c).toContain("EMPLOYEES_TOTAL");
  });
});
