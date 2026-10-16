import { describe, expect, it } from "vitest";
import { createEmissionCalculator, normalizeUnitKey } from "../hooks/emissionCalc";
import type { CalculationSpec, ModalRow } from "../types";
import { buildPayload } from "./entry";
import { PAID_BY_HELP, isEstimatedRow, isTransportSpec, markEstimate, transportUnitHelp } from "./transport";

// The S3-8 standard transport spec (ESG-lite src/scope3/transport/configs.ts).
const spec: CalculationSpec = {
  mode: "per_unit",
  identity_columns: ["Shipment Ref"],
  legacy_field: "Distance travelled",
  methods: {
    "tonne.km": { multiply: ["Weight (tonne)", "Distance travelled"], activity_unit: "tonne.km" },
    km: { multiply: ["Distance travelled"], activity_unit: "km" },
    litre: { multiply: ["Fuel used (litres)", "Your share of the load (%)"], percent: ["Your share of the load (%)"], activity_unit: "litre" },
    kwh: { multiply: ["Energy used (kWh)", "Your share (%)"], percent: ["Your share (%)"], activity_unit: "kWh" },
    kg: { multiply: ["Refrigerant leaked (kg)", "Your share (%)"], percent: ["Your share (%)"], activity_unit: "kg" },
    "m3.day": { multiply: ["Volume stored", "Days stored"], activity_unit: "m3.day" },
    "pallet.day": { multiply: ["Volume stored", "Days stored"], activity_unit: "pallet.day" },
    "teu.day": { multiply: ["Volume stored", "Days stored"], activity_unit: "teu.day" },
  },
};

const factor = (name: string, value: number, unit: string) => ({ emission_factor_id: 1, emission_category_name: name, factor_value: value, denominator_unit: unit, year: 2025 });

describe("S3-8 unit keys", () => {
  it("mirror the backend aliases", () => {
    const cases: Record<string, string> = {
      "m³.day": "m3.day", "m3 day": "m3.day", "pallet day": "pallet.day", "Pallets-day": "pallet.day", "TEU day": "teu.day",
      kWh: "kwh", litres: "litre", Liters: "litre", tkm: "tonne.km", kms: "km",
    };
    for (const [input, key] of Object.entries(cases)) expect(normalizeUnitKey(input), input).toBe(key);
  });

  it("preview each new key the way the engine saves it", () => {
    const calc = createEmissionCalculator({
      emissionFactors: [
        factor("Diesel", 3.1818, "litre"),
        factor("Grid", 0.71, "kWh"),
        factor("R410A", 2256, "kg"),
        factor("Storage", 0.01, "m3.day"),
        factor("Pallets", 0.02, "pallet.day"),
      ],
      targetYear: 2025,
      calculationSpec: spec,
    });
    const row = (over: Partial<ModalRow>): ModalRow => ({ id: 1, ...over }) as ModalRow;
    // Fuel-based (Glochem, Mar 2026): 1,000 L at 100 % → 3.18 t, as saved.
    expect(calc.calculateEmission(row({ emission_category: "Diesel", activity_data_unit: "litre", "Fuel used (litres)": "1000", "Your share of the load (%)": "100" })).value).toBe(3.18);
    // Warehouse energy: 10,000 kWh × 25 % × 0.71 = 1,775 kg.
    expect(calc.calculateEmission(row({ emission_category: "Grid", activity_data_unit: "kWh", "Energy used (kWh)": "10000", "Your share (%)": "25" })).value).toBe(1.78);
    // Refrigerant: 2 kg × 50 % × 2,256.
    expect(calc.calculateEmission(row({ emission_category: "R410A", activity_data_unit: "kg", "Refrigerant leaked (kg)": "2", "Your share (%)": "50" })).value).toBe(2.26);
    // Average storage, with the unit written as people do.
    expect(calc.calculateEmission(row({ emission_category: "Storage", activity_data_unit: "m³.day", "Volume stored": "4000", "Days stored": "2" })).value).toBe(0.08);
    expect(calc.calculateEmission(row({ emission_category: "Pallets", activity_data_unit: "pallet.day", "Volume stored": "120", "Days stored": "30" })).value).toBe(0.07);
    // A share over 100 % is refused.
    expect(calc.calculateEmission(row({ emission_category: "Grid", activity_data_unit: "kWh", "Energy used (kWh)": "100", "Your share (%)": "150" })).status).toMatch(/cannot be more than 100/);
  });
});

describe("S3-8 helper copy", () => {
  it("shows per-method help on transport forms only", () => {
    expect(isTransportSpec(spec)).toBe(true);
    expect(transportUnitHelp(spec, "litre")).toMatch(/^Litres your carrier used for your goods/);
    expect(transportUnitHelp(spec, "kWh")).toMatch(/^Energy of the warehouse × your share of its volume/);
    expect(transportUnitHelp(spec, "m³.day")).toBe("Volume stored × days stored.");
    expect(transportUnitHelp(spec, "gallon")).toBeUndefined();
    expect(transportUnitHelp(null, "litre")).toBeUndefined();
    // kWh and kg read as the warehouse's under "Warehouse", as the vehicle's on any other mode.
    expect(transportUnitHelp(spec, "kWh", "Warehouse")).toMatch(/^Energy of the warehouse/);
    expect(transportUnitHelp(spec, "kWh", "Rail")).toMatch(/^Electricity the vehicle used for your goods/);
    expect(transportUnitHelp(spec, "kg", "Road")).toMatch(/^Refrigerant leaked from the refrigerated vehicle × your share/);
    expect(transportUnitHelp(spec, "kg", "Warehouse")).toMatch(/^Refrigerant leaked from the warehouse/);
    expect(transportUnitHelp(spec, "litre", "Road")).toMatch(/^Litres your carrier used for your goods/);
    const useOfSoldProducts: CalculationSpec = { mode: "per_method", method_column: "Method", methods: { Fuel: { multiply: ["Units Sold"] } } };
    expect(transportUnitHelp(useOfSoldProducts, "litre")).toBeUndefined();
    expect(PAID_BY_HELP).toMatch(/^If you paid for it, it belongs in Category 4/);
  });
});

describe("S3-8 estimated distance", () => {
  const ctx = { siteId: 23, categoryId: 13, period: { mode: "monthly" as const, year: 2026, month: 4 } };
  const base: ModalRow = { id: 1, emission_category: "Road - Rail", activity_data_unit: "tonne.km", "Weight (tonne)": "20", "Distance travelled": "147.91" } as ModalRow;

  it("an estimated distance is sent as is_estimate while the field keeps it", () => {
    const row = markEstimate(base, "Distance travelled", "147.91", true);
    expect(isEstimatedRow(row)).toBe(true);
    const payload = buildPayload(row, ctx);
    expect(payload.is_estimate).toBe(true);
    expect(payload.activity_data).not.toHaveProperty("_estimate");
  });

  it("typing over it, or a measured route, makes it a measured distance again", () => {
    const typed = { ...markEstimate(base, "Distance travelled", "147.91", true), "Distance travelled": "150" };
    expect(isEstimatedRow(typed)).toBe(false);
    expect(buildPayload(typed, ctx)).not.toHaveProperty("is_estimate");
    const road = markEstimate(markEstimate(base, "Distance travelled", "147.91", true), "Distance travelled", "147.91", false);
    expect(isEstimatedRow(road)).toBe(false);
    expect(road).not.toHaveProperty("_estimate");
  });
});
