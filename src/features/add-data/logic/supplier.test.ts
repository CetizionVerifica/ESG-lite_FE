import { describe, expect, it } from "vitest";
import { createEmissionCalculator } from "../hooks/emissionCalc";
import type { SupplierDetail } from "../../../services/scope3SuppliersService";
import type { EmissionFactor, ModalRow } from "../types";
import { buildPayload, rowIssue } from "./entry";
import { NO_FIGURE_HINT, hasSupplierField, lineProblem, supplierPayload, withSuppliers } from "./supplier";

const factors: EmissionFactor[] = [
  { emission_factor_id: 1, emission_category_name: "Aluminium ingot", factor_value: 10, denominator_unit: "kg", year: 2024 },
  { emission_factor_id: 2, emission_category_name: "Alumina", factor_value: 1.2, denominator_unit: "kg", year: 2024 },
];
const input = { emissionFactors: factors, targetYear: 2024 };
const base = createEmissionCalculator(input);

const detail = (o: Partial<SupplierDetail> = {}): SupplierDetail => ({
  supplier: { supplier_id: 7, name: "Gulf Smelter Co.", country: "AE", email: null },
  factors: [
    { id: 3, supplier_factor_id: 3, supplier_id: 7, item: "P1020 ingot", unit: "kg", kgco2e_per_unit: 8.6, boundary: "cradle_to_gate", reference_year: 2025, gwp_set: "AR6", source: "manual", evidence_document_id: null, material_factor_id: null, supplier_request_id: null, has_evidence: true },
  ],
  facility_data: [{ id: 1, supplier_facility_data_id: 1, supplier_id: 7, year: 2025, scope12_tco2e: 500, output_qty: 100000, output_unit: "kg", allocation_key: "mass" }],
  requests: [],
  can_edit: true,
  ...o,
});

const row = (o: Partial<ModalRow> = {}): ModalRow => ({ id: 1, emission_category: "Aluminium ingot", activity_data_unit: "kg", quantity: "1000", ...o });
const period = { mode: "monthly" as const, year: 2025, month: 6 };

describe("Supplier field on Category 1 and 2 rows", () => {
  const calc = withSuppliers(base, input, new Map([[7, detail()]]), 2025);

  it("only Categories 1 and 2 get it", () => {
    expect([1, 2, 3, null].map(hasSupplierField)).toEqual([true, true, false, false]);
  });

  it("leaves average-data rows to the activity factor", () => {
    expect(calc.calculateEmission(row({ _supplier_id: 7 })).value).toBe(10);
  });

  it("Supplier's own figure: 1,000 kg × 8.6", () => {
    expect(calc.calculateEmission(row({ "@method": "supplier_specific", _supplier_id: 7 }))).toEqual({ value: 8.6, status: "ok" });
    expect(rowIssue(row({ "@method": "supplier_specific", _supplier_id: 7 }), calc)).toBeNull();
  });

  it("says what is missing, never falls back to an average", () => {
    expect(calc.calculateEmission(row({ "@method": "supplier_specific" })).status).toBe("Choose the supplier");
    expect(calc.calculateEmission(row({ "@method": "supplier_specific", _supplier_id: 8 })).status).toBe("Loading the supplier's figures");
    const bare = withSuppliers(base, input, new Map([[7, detail({ factors: [] })]]), 2025);
    expect(bare.calculateEmission(row({ "@method": "supplier_specific", _supplier_id: 7 })).status).toBe(NO_FIGURE_HINT);
    expect(rowIssue(row({ "@method": "supplier_specific", _supplier_id: 7 }), bare)).toEqual({ field: "values", message: NO_FIGURE_HINT });
  });

  it("hybrid: facility share by mass plus the lines", () => {
    const r = row({ "@method": "hybrid", _supplier_id: 7, _inputs: [{ kind: "material", name: "Alumina", quantity: "1930", unit: "kg" }] });
    // 500 t × 1,000 / 100,000 = 5,000 kg; 1,930 × 1.2 = 2,316 kg
    expect(calc.calculateEmission(r).value).toBe(7.32);
    expect(lineProblem([{ kind: "material", name: "", quantity: "1", unit: "kg" }])).toMatch(/line 1/);
  });

  it("sends the supplier, the method and the hybrid inputs; keeps them out of activity_data", () => {
    const own = buildPayload(row({ "@method": "supplier_specific", _supplier_id: 7, _supplier_factor_id: 3 }), { siteId: 1, categoryId: 9, period });
    expect(own).toMatchObject({ supplier_id: 7, supplier_factor_id: 3, method: "supplier_specific" });
    expect(Object.keys(own.activity_data).sort()).toEqual(["emission_category", "quantity"]);

    const hybrid = buildPayload(row({ "@method": "hybrid", _supplier_id: 7, _purchased_value: "5000", _inputs: [{ kind: "transport", name: "Truck", quantity: "20", unit: "tonne.km" }] }), { siteId: 1, categoryId: 9, period });
    expect(hybrid).toMatchObject({ supplier_id: 7, method: "hybrid", extra_data: { inputs: [{ kind: "transport", name: "Truck", quantity: 20, unit: "tonne.km" }], purchased_value: 5000 } });
    expect(hybrid.supplier_factor_id).toBeUndefined();

    // A supplier without a supplier method is still linked, and no method is sent.
    expect(supplierPayload(row({ _supplier_id: 7 }))).toEqual({ supplier_id: 7 });
    const plain = buildPayload(row({ _supplier_id: 7 }), { siteId: 1, categoryId: 9, period });
    expect(plain.method).toBeUndefined();
    expect(plain.supplier_id).toBe(7);
  });

  it("keeps S3-5's spend path for spend rows and off supplier-method rows", () => {
    const spendFactors: EmissionFactor[] = [{ emission_factor_id: 9, emission_category_name: "Aluminium (spend)", factor_value: 0.4, denominator_unit: "USD", year: 2024, factor_type: "eeio_spend" }];
    const spendInput = { emissionFactors: spendFactors, targetYear: 2024 };
    const wrapped = withSuppliers(createEmissionCalculator(spendInput), spendInput, new Map([[7, detail()]]), 2025);
    const spendRow = row({ emission_category: "Aluminium (spend)", "@method": "spend_based" });
    expect(wrapped.usesSpendForm(spendRow)).toBe(true);
    const supplierRow = row({ emission_category: "Aluminium (spend)", "@method": "supplier_specific", _supplier_id: 7 });
    expect(wrapped.usesSpendForm(supplierRow)).toBe(false);
    expect(wrapped.spendDetail(supplierRow)).toBeNull();
  });
});
