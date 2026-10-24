import { describe, expect, it } from "vitest";
import { KPI_DEFINITIONS, KPI_DISCLOSURES, KPI_FRAMEWORKS, KPI_MAPPINGS } from "../../../test/msw/kpiData";
import type { Library } from "./logic";
import { checkFormula, compareCodes, countByPillar, countBySource, coverageText, filterLibrary, formulaCheckText, frameworkCoverage, libraryRows, topicsIn } from "./logic";

const lib: Library = { frameworks: KPI_FRAMEWORKS, definitions: KPI_DEFINITIONS, disclosures: KPI_DISCLOSURES, mappings: KPI_MAPPINGS };
const rows = libraryRows(lib);
const none = { q: "", framework: [], topic: [], source: [] };
const codes = (r: ReturnType<typeof libraryRows>) => r.map((x) => x.def.code);

describe("libraryRows", () => {
  it("has one row per library KPI, with where it's used in GRI, BRSR, ESRS order", () => {
    expect(rows).toHaveLength(KPI_DEFINITIONS.length);
    const water = rows.find((r) => r.def.code === "WATER_WITHDRAWAL")!;
    expect(water.frameworks).toEqual(["GRI", "BRSR", "ESRS"]);
    expect(water.usedIn.map((u) => `${u.framework} ${u.code}`)).toEqual(["GRI 303-3", "BRSR P6-E3", "ESRS E3-4"]);
    expect(water.usedIn.find((u) => u.framework === "BRSR")?.core).toBe(true);
    expect(water.usedIn.find((u) => u.framework === "ESRS")).toMatchObject({ fit: "partial", note: expect.stringContaining("consumption") });
  });

  it("leaves company KPIs out of the library", () => {
    const custom = { ...KPI_DEFINITIONS[0], id: 999, code: "CUSTOM_999", company_id: 4 };
    expect(libraryRows({ ...lib, definitions: [...KPI_DEFINITIONS, custom] })).toHaveLength(KPI_DEFINITIONS.length);
  });

  it("ignores a mapping whose disclosure or framework is gone", () => {
    const broken = { ...KPI_MAPPINGS[0], id: 9999, disclosure_id: 12345 };
    const r = libraryRows({ ...lib, mappings: [...KPI_MAPPINGS, broken] });
    expect(r.find((x) => x.def.id === broken.kpi_definition_id)?.usedIn.some((u) => u.mapping_id === 9999)).toBe(false);
  });
});

describe("filterLibrary", () => {
  it("keeps everything with no filters", () => expect(filterLibrary(rows, none)).toHaveLength(rows.length));

  it("filters by source, topic and framework, combined with AND", () => {
    expect(filterLibrary(rows, { ...none, source: ["auto"] })).toHaveLength(8);
    expect(filterLibrary(rows, { ...none, source: ["formula"] })).toHaveLength(4);
    expect(codes(filterLibrary(rows, { ...none, topic: ["water"] }))).toEqual(["WATER_CONSUMPTION", "WATER_WITHDRAWAL", "WATER_DISCHARGE"]);
    expect(codes(filterLibrary(rows, { ...none, topic: ["water"], source: ["formula"] }))).toEqual(["WATER_CONSUMPTION"]);
    // Revenue is only a denominator: no framework maps it.
    expect(codes(filterLibrary(rows, { ...none, framework: ["GRI"] }))).not.toContain("REVENUE");
    expect(filterLibrary(rows, { ...none, framework: ["BRSR", "ESRS"] }).length).toBeGreaterThan(filterLibrary(rows, { ...none, framework: ["BRSR"] }).length - 1);
  });

  it("searches names, codes, questions and disclosure codes", () => {
    expect(codes(filterLibrary(rows, { ...none, q: "303-3" }))).toEqual(["WATER_WITHDRAWAL"]);
    expect(codes(filterLibrary(rows, { ...none, q: "  ltifr " }))).toEqual(["LTIFR"]);
    expect(codes(filterLibrary(rows, { ...none, q: "board" }))).toEqual(["WOMEN_ON_BOARD"]);
    expect(filterLibrary(rows, { ...none, q: "no such kpi" })).toEqual([]);
  });

  it("counts by source and lists topics in use", () => {
    expect(countBySource(rows)).toEqual({ manual: 20, auto: 8, formula: 4 });
    expect(topicsIn(rows)).toContain("water");
    expect(topicsIn(rows)).not.toContain("biodiversity");
  });
});

describe("frameworkCoverage", () => {
  const esrs = KPI_FRAMEWORKS.find((f) => f.code === "ESRS")!;

  it("counts disclosures with at least one KPI, per section in order", () => {
    const c = frameworkCoverage(esrs, lib);
    expect(c.total).toBe(15);
    expect(c.mapped).toBe(11);
    expect(c.sections.map((s) => s.section)).toEqual([
      "E1 Climate change",
      "E2 Pollution",
      "E3 Water and marine resources",
      "E4 Biodiversity and ecosystems",
      "E5 Resource use and circular economy",
      "S1 Own workforce",
      "G1 Business conduct",
    ]);
    const e1 = c.sections[0];
    expect(coverageText(e1)).toBe("2 of 4 mapped");
    expect(e1.disclosures.filter((d) => d.kpis.length === 0).map((d) => d.disclosure.code)).toEqual(["E1-4", "E1-7"]);
  });

  it("is 0 of 0 for a framework with no disclosures yet", () => {
    const fresh = { ...esrs, id: 99, version: "ESRS simplified" };
    expect(frameworkCoverage(fresh, lib)).toMatchObject({ total: 0, mapped: 0, sections: [] });
  });

  it("counts a disclosure once however many KPIs answer it", () => {
    const gri = frameworkCoverage(KPI_FRAMEWORKS[0], lib);
    expect(gri.mapped).toBe(20);
    expect(gri.total).toBe(22);
  });
});

describe("checkFormula", () => {
  const known = KPI_DEFINITIONS.map((d) => d.code);

  it("passes the library's own formulas", () => {
    for (const d of KPI_DEFINITIONS.filter((x) => x.formula)) expect(checkFormula(d.formula!, d.code, known).ok, d.code).toBe(true);
    const c = checkFormula("(GHG_SCOPE1 + GHG_SCOPE2_LB) / (REVENUE / 1000000)", "GHG_INTENSITY_REVENUE", known);
    expect(c.codes).toEqual(["GHG_SCOPE1", "GHG_SCOPE2_LB", "REVENUE"]);
    expect(formulaCheckText(c)).toBe("Formula checks out: uses 3 KPIs, all in the library.");
  });

  it("names unknown codes, self-reference, stray characters and unmatched brackets", () => {
    expect(formulaCheckText(checkFormula("WATER_IN - WATER_DISCHARGE", "X", known))).toBe("Not in the library: WATER_IN.");
    expect(formulaCheckText(checkFormula("WATER_CONSUMPTION * 2", "WATER_CONSUMPTION", known))).toBe("The formula uses the KPI itself.");
    expect(formulaCheckText(checkFormula("REVENUE ^ 2", "X", known))).toBe("The formula has characters it can't use: ^.");
    expect(formulaCheckText(checkFormula("(REVENUE / 2", "X", known))).toBe("The brackets don't match.");
    expect(formulaCheckText(checkFormula(")REVENUE(", "X", known))).toBe("The brackets don't match.");
    expect(formulaCheckText(checkFormula("12 / 4", "X", known))).toBe("The formula doesn't use any KPI.");
  });
});

describe("compareCodes", () => {
  it("sorts disclosure codes numerically", () => {
    expect(["2-25", "302-1", "2-7"].sort(compareCodes)).toEqual(["2-7", "2-25", "302-1"]);
    expect(["S1-13", "S1-9", "S1-14"].sort(compareCodes)).toEqual(["S1-9", "S1-13", "S1-14"]);
  });
});

describe("D19 · pillars in the library", () => {
  const none = { q: "", framework: [], topic: [], source: [] };
  it("lists rows Environment first, then Social, then Governance", () => {
    const order = rows.map((r) => r.def.pillar);
    expect(order.indexOf("social")).toBeGreaterThan(order.lastIndexOf("environment"));
    expect(order.indexOf("governance")).toBeGreaterThan(order.lastIndexOf("social"));
  });
  it("filters by pillar and counts each", () => {
    expect(countByPillar(rows)).toEqual({ environment: 19, social: 10, governance: 3 });
    expect(codes(filterLibrary(rows, { ...none, pillar: "governance" }))).toEqual(["WOMEN_ON_BOARD", "REVENUE", "COMPLAINTS_RECEIVED"]);
    expect(filterLibrary(rows, { ...none, pillar: null })).toHaveLength(rows.length);
  });
});
