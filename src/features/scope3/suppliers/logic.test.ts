import { describe, expect, it } from "vitest";
import { emptyFacility, emptyFigure, facilityBody, facilityErrors, figureBody, figureErrors, figureLine, figureState, lastRequestText, requestDataLink, supplierBody, supplierDraftErrors } from "./logic";

describe("suppliers page logic", () => {
  it("validates a supplier and sends the country upper-cased", () => {
    expect(supplierDraftErrors({ name: " ", country: "", email: "" })).toHaveProperty("name");
    expect(supplierDraftErrors({ name: "Gulf", country: "UAE", email: "x" })).toEqual({ country: expect.any(String), email: expect.any(String) });
    expect(supplierBody({ name: " Gulf Smelter Co. ", country: "ae", email: "" })).toEqual({ name: "Gulf Smelter Co.", country: "AE", email: null });
  });

  it("validates a figure and confirms the boundary only when asked", () => {
    expect(Object.keys(figureErrors(emptyFigure(2025)))).toEqual(["item", "kgco2e_per_unit"]);
    const d = { ...emptyFigure(2025), item: "P1020 ingot", kgco2e_per_unit: 8.6 };
    expect(figureErrors(d)).toEqual({});
    expect(figureBody(d)).toEqual({ item: "P1020 ingot", unit: "kg", kgco2e_per_unit: 8.6, reference_year: 2025, boundary: "cradle_to_gate", gwp_set: "AR6" });
    expect(figureBody({ ...d, boundary: "cradle_to_grave" }, true)).toMatchObject({ boundary: "cradle_to_grave", confirm_boundary: true });
  });

  it("validates facility data", () => {
    expect(Object.keys(facilityErrors(emptyFacility(2025)))).toEqual(["scope12_tco2e", "output_qty"]);
    const d = { ...emptyFacility(2025), scope12_tco2e: 500, output_qty: 100000 };
    expect(facilityBody(d)).toEqual({ year: 2025, scope12_tco2e: 500, output_qty: 100000, output_unit: "kg", allocation_key: "mass" });
  });

  it("words the match line, the figure state and the last request", () => {
    expect(figureLine("Gulf Smelter Co.", { item: "P1020 ingot", kgco2e_per_unit: 8.6, unit: "kg", reference_year: 2025 })).toBe("Gulf Smelter Co., P1020 ingot, 8.6 kgCO₂e/kg, 2025");
    expect(figureState({ has_factor: false, has_facility_data: false })).toBe("Missing");
    expect(figureState({ has_factor: false, has_facility_data: true })).toBe("Facility data");
    expect(lastRequestText({ last_request: null })).toBe("None");
    expect(lastRequestText({ last_request: { supplier_request_id: 1, status: "accepted", sent_at: null, material: "Ingot" } })).toBe("Accepted · Ingot");
  });

  it("opens the C06 request with the supplier filled in", () => {
    expect(requestDataLink({ name: "Gulf & Co", email: "a@b.example" })).toBe("/products/suppliers?new=1&supplier=Gulf+%26+Co&email=a%40b.example");
    expect(requestDataLink({ name: "Gulf", email: null })).toBe("/products/suppliers?new=1&supplier=Gulf");
  });
});
