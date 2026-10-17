import { describe, expect, it } from "vitest";
import { evaluateFormula, explainFormula, formulaCodes, parseFormula } from "./formula";

/**
 * KPI-6 golden cases (ci/golden/kpi/formulas.json in ESG-lite): the FE
 * preview must give the server's numbers for the same inputs.
 */
const GOLDEN = [
  { name: "GHG intensity per revenue", formula: "(GHG_SCOPE1 + GHG_SCOPE2_LB) / (REVENUE / 1000000)", inputs: { GHG_SCOPE1: 4650.2, GHG_SCOPE2_LB: 21000, REVENUE: 180_000_000 }, value: 142.5011111111 },
  { name: "Energy intensity per tonne", formula: "ENERGY_TOTAL / PRODUCTION_OUTPUT", inputs: { ENERGY_TOTAL: 37210, PRODUCTION_OUTPUT: 12400 }, value: 3.000806451613 },
  { name: "Water consumption", formula: "WATER_WITHDRAWAL - WATER_DISCHARGE", inputs: { WATER_WITHDRAWAL: 1200, WATER_DISCHARGE: 840 }, value: 360 },
  { name: "Women in the workforce in %", formula: "EMPLOYEES_WOMEN / EMPLOYEES_TOTAL * 100", inputs: { EMPLOYEES_WOMEN: 132, EMPLOYEES_TOTAL: 600 }, value: 22 },
] as const;

const asInputs = (o: Record<string, number | null>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v }]));

describe("KPI formulas: parse", () => {
  it("parses codes, numbers, groups, breakdowns and sum/avg", () => {
    expect(parseFormula("(A_B + 2) × C.groundwater ÷ sum(D)").ok).toBe(true);
    expect(formulaCodes("(GHG_SCOPE1 + GHG_SCOPE2_LB) / (REVENUE / 1000000)")).toEqual(["GHG_SCOPE1", "GHG_SCOPE2_LB", "REVENUE"]);
    expect(formulaCodes("WATER_WITHDRAWAL.groundwater - avg(WATER_DISCHARGE)")).toEqual(["WATER_WITHDRAWAL", "WATER_DISCHARGE"]);
  });

  it("refuses invalid formulas with a position", () => {
    expect(parseFormula("A +")).toMatchObject({ ok: false, position: 3 });
    expect(parseFormula("A $ B")).toMatchObject({ ok: false, position: 2 });
    expect(parseFormula("(A + B")).toMatchObject({ ok: false });
    expect(parseFormula("lower_case")).toMatchObject({ ok: false, message: expect.stringContaining("isn't a KPI code") });
    expect(parseFormula("")).toMatchObject({ ok: false });
  });
});

describe("KPI formulas: evaluate (golden parity)", () => {
  for (const g of GOLDEN) {
    it(g.name, () => {
      const r = evaluateFormula(g.formula, asInputs(g.inputs));
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBeCloseTo(g.value, 8);
    });
  }

  it("a missing input gives no value, never a 0", () => {
    expect(evaluateFormula("WATER_WITHDRAWAL - WATER_DISCHARGE", asInputs({ WATER_WITHDRAWAL: 1200, WATER_DISCHARGE: null }))).toEqual({ ok: false, reason: "missing", missing: ["WATER_DISCHARGE"] });
    expect(evaluateFormula("A / B", {})).toEqual({ ok: false, reason: "missing", missing: ["A", "B"] });
  });

  it("division by zero gives no value with a reason", () => {
    expect(evaluateFormula("ENERGY_TOTAL / REVENUE", asInputs({ ENERGY_TOTAL: 10, REVENUE: 0 }))).toEqual({ ok: false, reason: "divide_by_zero" });
  });

  it("reads breakdown parts and site values", () => {
    expect(evaluateFormula("W.groundwater", { W: { value: 10, breakdown: { groundwater: 7 } } })).toEqual({ ok: true, value: 7 });
    expect(evaluateFormula("sum(W)", { W: { value: null, sites: [1, 2, null] } })).toEqual({ ok: true, value: 3 });
    expect(evaluateFormula("avg(W)", { W: { value: null, sites: [1, 2] } })).toEqual({ ok: true, value: 1.5 });
  });
});

describe("KPI formulas: how it's calculated", () => {
  it("says the working (KPI-6: water consumed = withdrawn − discharged)", () => {
    const inputs = { WATER_WITHDRAWAL: { value: 1200, unit: "m³", label: "water withdrawn" }, WATER_DISCHARGE: { value: 840, unit: "m³", label: "water discharged" } };
    expect(explainFormula("WATER_WITHDRAWAL - WATER_DISCHARGE", inputs, { name: "Water consumed", unit: "m³" })).toBe("Water consumed = water withdrawn 1,200 m³ − water discharged 840 m³ = 360 m³");
  });

  it("says what it's waiting for", () => {
    const inputs = { WATER_WITHDRAWAL: { value: 1200, unit: "m³", label: "water withdrawn" }, WATER_DISCHARGE: { value: null, label: "water discharged" } };
    expect(explainFormula("WATER_WITHDRAWAL - WATER_DISCHARGE", inputs, { name: "Water consumed", unit: "m³" })).toBe(
      "Water consumed = water withdrawn 1,200 m³ − water discharged (missing). Waiting for water discharged.",
    );
  });

  it("keeps parentheses and numbers", () => {
    const text = explainFormula("(A + B) / (R / 1000000)", { A: { value: 1, label: "a" }, B: { value: 2, label: "b" }, R: { value: 3000000, label: "revenue", unit: "USD" } }, { name: "X", decimals: 2 });
    expect(text).toBe("X = (a 1 + b 2) ÷ (revenue 3,000,000 USD ÷ 1,000,000) = 1.00");
  });
});
