import { describe, expect, it } from "vitest";
import { allocatedKg, allocationShare, hybridEmission, pickFacility, pickSupplierFigure, supplierEmission, type EmissionCalcInput } from "./emissionCalc";
import type { EmissionFactor } from "./types";

// S3-6: the preview mirrors ESG-lite methods/supplier.ts and hybrid.ts, so
// the guidance's worked examples (ci/golden/scope3 cases 1.1-1.3) come out the
// same here as in the engine.

const figure = (id: number, item: string, kg: number, year: number, unit = "kg") => ({ supplier_factor_id: id, item, unit, kgco2e_per_unit: kg, reference_year: year });
const ef = (id: number, name: string, value: number, unit: string): EmissionFactor => ({ emission_factor_id: id, emission_category_name: name, factor_value: value, denominator_unit: unit, year: 2025 });

describe("supplier-specific preview", () => {
  it("reproduces Example 1.1: 145,000 kg", () => {
    const rows: [number, number][] = [[200000, 0.15], [600000, 0.1], [200000, 0.1], [100000, 0.25], [50000, 0.2]];
    const kg = rows.reduce((s, [q, f], i) => s + (supplierEmission(q, "kg", figure(i + 1, "x", f, 2025)).kg ?? NaN), 0);
    expect(kg).toBeCloseTo(145000, 4);
  });

  it("converts the quantity into the figure's unit and rounds like the engine", () => {
    expect(supplierEmission(2, "tonne", figure(1, "Ingot", 8.6, 2025))).toMatchObject({ value: 17.2, kg: 17200, status: "converted" });
    expect(supplierEmission(1000, "kwh", figure(1, "Ingot", 8.6, 2025)).value).toBeNull();
    expect(supplierEmission(1000, "kg", null).status).toBe("No figure from this supplier yet. Request one or use an average.");
  });

  it("picks the newest figure up to the reporting year, by item, else the only item", () => {
    const figs = [figure(1, "Ingot", 7, 2023), figure(2, "Ingot", 8, 2025), figure(3, "Ingot", 9, 2027)];
    expect(pickSupplierFigure(figs, 2026, "ingot")).toMatchObject({ ok: true, figure: { supplier_factor_id: 2 } });
    expect(pickSupplierFigure(figs, 2026, "Something")).toMatchObject({ ok: true, figure: { supplier_factor_id: 2 } });
    expect(pickSupplierFigure(figs, 2022, "Ingot")).toEqual({ ok: false, reason: "none_for_year" });
    expect(pickSupplierFigure(figs, 2026, "Ingot", 3)).toEqual({ ok: false, reason: "future_year" });
    expect(pickSupplierFigure([...figs, figure(4, "Billet", 5, 2024)], 2026, "Wire")).toEqual({ ok: false, reason: "ambiguous" });
    expect(pickSupplierFigure([], 2026, "Ingot")).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("hybrid preview", () => {
  const factors = [
    ef(1, "Electricity", 0.5, "kwh"),
    ef(2, "Natural gas", 0.2, "kwh"),
    ef(3, "Cotton", 7, "kg"),
    ef(4, "Polymer", 5, "kg"),
    ef(5, "Chemical A", 2, "kg"),
    ef(6, "Chemical B", 1.5, "kg"),
    ef(7, "Cotton transport", 0.01, "kg.km"),
    ef(8, "Polymer transport", 0.02, "kg.km"),
    ef(9, "Chemical A transport", 0.05, "kg.km"),
    ef(10, "Chemical B transport", 0.1, "kg.km"),
    ef(11, "Landfill", 0.5, "kg"),
    ef(12, "T-shirt rest", 5.6, "unit"),
  ];
  const input: EmissionCalcInput = { emissionFactors: factors, targetYear: 2025 };

  it("reproduces Example 1.2 (257,300 kg) and 1.3 (70,250 kg) from energy, material, transport and waste lines", () => {
    const energy = [
      { kind: "energy" as const, name: "Electricity", quantity: 5000, unit: "kwh" },
      { kind: "energy" as const, name: "Natural gas", quantity: 2500, unit: "kwh" },
    ];
    const ex12 = hybridEmission(input, {
      activityValue: 1,
      unit: "unit",
      facility: null,
      lines: [
        ...energy,
        { kind: "material", name: "Cotton", quantity: 5000, unit: "kg" },
        { kind: "material", name: "Polymer", quantity: 2500, unit: "kg" },
        { kind: "material", name: "Chemical A", quantity: 500, unit: "kg" },
        { kind: "material", name: "Chemical B", quantity: 500, unit: "kg" },
        { kind: "transport", name: "Cotton transport", quantity: 5000000, unit: "kg.km" },
        { kind: "transport", name: "Polymer transport", quantity: 6250000, unit: "kg.km" },
        { kind: "transport", name: "Chemical A transport", quantity: 400000, unit: "kg.km" },
        { kind: "transport", name: "Chemical B transport", quantity: 100000, unit: "kg.km" },
        { kind: "waste", name: "Landfill", quantity: 100, unit: "kg" },
      ],
    });
    expect(ex12.kg).toBe(257300);
    const ex13 = hybridEmission(input, {
      activityValue: 12000,
      unit: "unit",
      facility: null,
      lines: [...energy, { kind: "waste", name: "Landfill", quantity: 100, unit: "kg" }, { kind: "material", name: "T-shirt rest", quantity: 12000, unit: "unit" }],
    });
    expect(ex13).toMatchObject({ kg: 70250, value: 70.25 });
  });

  const facility = { supplier_facility_data_id: 1, year: 2025, scope12_tco2e: 500, output_qty: 100000, output_unit: "kg", allocation_key: "mass" as const };

  it("allocates the facility's Scope 1+2 by mass, converting the quantity", () => {
    const r = hybridEmission(input, { activityValue: 1, unit: "tonne", facility, lines: [{ kind: "material", name: "Cotton", quantity: 10, unit: "kg" }] });
    expect(r.components.map((c) => [c.kind, c.kg])).toEqual([["supplier_scope12", 5000], ["material", 70]]);
    expect(r).toMatchObject({ kg: 5070, value: 5.07 });
  });

  it("allocates by economic value from what was paid", () => {
    const econ = { ...facility, output_qty: 2000000, output_unit: "USD", allocation_key: "economic" as const };
    expect(hybridEmission(input, { activityValue: 5, unit: "kg", facility: econ, lines: [], purchasedValue: 50000 }).kg).toBe(12500);
    expect(hybridEmission(input, { activityValue: 5, unit: "kg", facility: econ, lines: [] }).status).toBe("Enter what was paid, in USD");
  });

  it("falls back to another year's factor for a line as the engine does, and says so", () => {
    // The engine (FactorIndex.find): the target year first, else the newest year of that name, with FACTOR_FALLBACK_YEAR.
    const yearly: EmissionCalcInput = {
      targetYear: 2025,
      emissionFactors: [{ ...ef(20, "Steel", 2, "kg"), year: 2023 }, { ...ef(21, "Steel", 1.9, "kg"), year: 2024 }, ef(22, "Zinc", 3, "kg"), { ...ef(23, "Zinc", 3.5, "kg"), year: 2024 }],
    };
    const lines = [
      { kind: "material" as const, name: "Steel", quantity: 100, unit: "kg" },
      { kind: "material" as const, name: "Zinc", quantity: 10, unit: "kg" },
    ];
    const r = hybridEmission(yearly, { activityValue: 1, unit: "kg", facility, lines });
    // Steel: no 2025 factor, so the newest (2024, 1.9) × 100 = 190; Zinc: the 2025 factor, 3 × 10 = 30.
    expect(r.components.filter((c) => c.kind === "material").map((c) => c.kg)).toEqual([190, 30]);
    expect(r.notes).toEqual(['No 2025 factor for "Steel"; the 2024 factor was used.']);
    // Every line in the target year: no note.
    expect(hybridEmission(input, { activityValue: 1, unit: "tonne", facility, lines: [{ kind: "material", name: "Cotton", quantity: 10, unit: "kg" }] }).notes).toEqual([]);
  });

  it("refuses what the engine refuses", () => {
    expect(hybridEmission(input, { activityValue: 1, unit: "kg", facility: null, lines: [] }).value).toBeNull();
    expect(hybridEmission(input, { activityValue: 200000, unit: "kg", facility, lines: [] }).value).toBeNull();
    expect(hybridEmission(input, { activityValue: 1, unit: "kg", facility, lines: [{ kind: "material", name: "Unobtainium", quantity: 1, unit: "kg" }] }).status).toMatch(/no emission factor/);
  });

  it("uses the PCF allocation rule and the newest facility year up to the reporting year", () => {
    expect(allocatedKg(2, allocationShare(25, 100))).toBe(500);
    const list = [{ ...facility, supplier_facility_data_id: 1, year: 2023 }, { ...facility, supplier_facility_data_id: 2, year: 2025 }, { ...facility, supplier_facility_data_id: 3, year: 2027 }];
    expect(pickFacility(list, 2026)?.supplier_facility_data_id).toBe(2);
    expect(pickFacility(list, 2022)).toBeNull();
  });
});
