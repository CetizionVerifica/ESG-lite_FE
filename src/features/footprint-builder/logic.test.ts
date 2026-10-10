import { describe, expect, it } from "vitest";
import {
  type FactorBook,
  type Line,
  blankLine,
  canCalculate,
  checklist,
  lineProblem,
  periodFor,
  priceLine,
  runningTotal,
  savableInputs,
  stageParts,
} from "./logic";

const book: FactorBook = {
  material: new Map([
    [1, { unit: "kg", value: 2 }], // virgin aluminium-ish
    [2, { unit: "kg", value: 0.5 }], // recycled variant
    [3, { unit: "t", value: 1500 }],
    [4, { unit: "kg", value: null }], // ecoinvent, hidden
    [5, { unit: "unit", value: 3 }],
  ]),
  transport: new Map([
    [10, { unit: "tonne.km", value: 0.1 }],
    [11, { unit: "km", value: 0.2 }],
  ]),
};

const line = (patch: Partial<Line>): Line => ({ ...blankLine("A1"), name: "Rod", quantity: 1, material_factor_id: 1, ...patch });

describe("periodFor", () => {
  it("gives a calendar year and an April–March financial year", () => {
    expect(periodFor("CY", 2024)).toEqual({ reference_start: "2024-01-01", reference_end: "2024-12-31" });
    expect(periodFor("FY", 2024)).toEqual({ reference_start: "2024-04-01", reference_end: "2025-03-31" });
  });
});

describe("priceLine (mirrors computePcf)", () => {
  it("prices a virgin line in the factor's unit", () => {
    expect(priceLine(line({ quantity: 1.03 }), book)).toEqual({ kg: 2.06 });
  });

  it("converts mass units to the factor's unit", () => {
    expect(priceLine(line({ quantity: 1030, unit: "g" }), book).kg).toBeCloseTo(2.06, 10);
    expect(priceLine(line({ quantity: 2, unit: "kg", material_factor_id: 3 }), book).kg).toBeCloseTo(3, 10);
  });

  it("splits a recycled share onto the recycled factor (cut-off)", () => {
    const p = priceLine(line({ quantity: 10, recycled_share_pct: 30, recycled_material_factor_id: 2 }), book);
    expect(p.kg).toBeCloseTo(0.7 * 10 * 2 + 0.3 * 10 * 0.5, 10);
  });

  it("uses the supplier's footprint over any factor", () => {
    expect(priceLine(line({ quantity: 4, supplier_pcf_kgco2e: 1.25, material_factor_id: null }), book)).toEqual({ kg: 5 });
  });

  it("prices a transport leg as payload × distance × factor", () => {
    const leg = { ...blankLine("A2"), name: "Sea leg", payload_t: 1.03, distance_km: 2000, emission_factor_id: 10 };
    expect(priceLine(leg, book).kg).toBeCloseTo(206, 10);
  });

  it("says why a line can't be priced", () => {
    expect(priceLine(line({ material_factor_id: null }), book)).toEqual({ kg: null, reason: "Pick a factor" });
    expect(priceLine(line({ quantity: null }), book).kg).toBeNull();
    expect(priceLine(line({ unit: "m" }), book)).toEqual({ kg: null, reason: '"m" can\'t be converted to the factor\'s unit "kg"' });
    expect(priceLine(line({ material_factor_id: 4 }), book)).toEqual({ kg: null, reason: "Licensed value, shown after Calculate" });
    expect(priceLine(line({ recycled_share_pct: 20 }), book).kg).toBeNull();
    const leg = { ...blankLine("A2"), name: "Leg", payload_t: 1, distance_km: 10, emission_factor_id: 11 };
    expect(priceLine(leg, book)).toEqual({ kg: null, reason: "The transport factor must be per tonne.km" });
  });
});

describe("runningTotal", () => {
  it("adds priced lines by stage plus allocated energy and lists the rest", () => {
    const lines = [
      line({ key: "a", quantity: 1 }),
      line({ key: "b", stage: "A3_packaging", name: "Reel", quantity: 0.5, unit: "unit", material_factor_id: 5 }),
      line({ key: "c", name: "Alloy", material_factor_id: 4 }),
    ];
    const rt = runningTotal(lines, book, 0.4);
    expect(rt.byStage.A1).toBe(2);
    expect(rt.byStage.A3_packaging).toBe(1.5);
    expect(rt.byStage.A3_energy).toBe(0.4);
    expect(rt.total).toBeCloseTo(3.9, 10);
    expect(rt.unpriced).toEqual([{ key: "c", name: "Alloy", reason: "Licensed value, shown after Calculate" }]);
  });

  it("gives stage parts in the fixed stage order without empty ones", () => {
    const rt = runningTotal([line({ quantity: 3 })], book, 2);
    expect(stageParts(rt).map((p) => [p.stage, p.pct])).toEqual([
      ["A1", 75],
      ["A3_energy", 25],
    ]);
    expect(stageParts(runningTotal([], book, null))).toEqual([]);
  });
});

describe("saving", () => {
  it("names the first thing the server would refuse", () => {
    expect(lineProblem(line({ name: " " }))).toBe("Name the line");
    expect(lineProblem(line({ material_factor_id: null }))).toBe("Pick a factor or enter the supplier's footprint");
    expect(lineProblem(line({ recycled_share_pct: 10 }))).toBe("Pick a recycled factor");
    expect(lineProblem({ ...blankLine("A2"), name: "Leg", payload_t: 1 })).toBe("Enter the mass and distance");
    expect(lineProblem(line({}))).toBeNull();
  });

  it("sends only finished lines and drops editor-only keys", () => {
    const rows = savableInputs([line({ key: "a", pcf_input_id: 9 }), line({ key: "b", quantity: null })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).not.toHaveProperty("key");
    expect(rows[0]).not.toHaveProperty("pcf_input_id");
  });
});

describe("checklist", () => {
  const product = { product_id: 1, name: "Rod", declared_unit: "t", declared_unit_qty: 1, mass_per_unit_kg: 1000 };
  const preview = { blockers: [] } as never;

  it("allows Calculate when every blocking item is done", () => {
    const items = checklist({ product }, [line({})], book, preview);
    expect(canCalculate(items)).toBe(true);
  });

  it("blocks on unconfirmed low-confidence AI lines and plant blockers", () => {
    const ai = line({ ai_suggested: true, ai_confidence: 0.4 });
    expect(canCalculate(checklist({ product }, [ai], book, preview))).toBe(false);
    expect(canCalculate(checklist({ product }, [line({})], book, { blockers: ["No production"] } as never))).toBe(false);
    expect(canCalculate(checklist({ product }, [], book, preview))).toBe(false);
  });

  it("does not block on licensed lines priced by the server", () => {
    expect(canCalculate(checklist({ product }, [line({ material_factor_id: 4 })], book, preview))).toBe(true);
  });
});
