import { describe, expect, it } from "vitest";
import { canExportPact, draftName, errorMessage, fileNameFrom, formatKg, periodLabel, stageRows, standardLabel } from "./logic";

describe("declaration export logic", () => {
  it("issues PACT files only for reviewed footprints", () => {
    expect(canExportPact("draft")).toBe(false);
    expect(canExportPact("in_review")).toBe(false);
    expect(canExportPact("approved")).toBe(true);
    expect(canExportPact("published")).toBe(true);
    expect(canExportPact("superseded")).toBe(true);
  });

  it("orders stages A1 to A3 and withholds licensed ones", () => {
    const rows = stageRows({
      total_kg_per_unit: 10,
      by_stage: { A1: 8, A2: 0.5, A3_energy: 1, A3_packaging: null, A3_waste: 0 },
      hidden_stages: ["A3_packaging"],
    });
    expect(rows.map((r) => r.id)).toEqual(["A1", "A2", "A3_energy", "A3_packaging", "A3_waste"]);
    expect(rows[0]).toMatchObject({ value: 8, sharePct: 80, withheld: false });
    expect(rows[3]).toMatchObject({ value: null, sharePct: null, withheld: true });
  });

  it("formats per-unit values", () => {
    expect(formatKg(9.1)).toBe("9.10");
    expect(formatKg(0.20251)).toBe("0.2025");
    expect(formatKg(1234.5)).toBe("1,234.50");
    expect(formatKg(null)).toBe("—");
  });

  it("labels calendar and financial years", () => {
    expect(periodLabel({ start: "2024-01-01", end: "2024-12-31", year_type: "CY" })).toBe("CY 2024 (1 Jan 2024 – 31 Dec 2024)");
    expect(periodLabel({ start: "2024-04-01", end: "2025-03-31", year_type: "FY" })).toBe("FY 2024–25 (1 Apr 2024 – 31 Mar 2025)");
    expect(standardLabel("iso14067")).toBe("ISO 14067");
  });

  it("names files", () => {
    expect(fileNameFrom('attachment; filename="Rod-12-v1.pact.json"', "x")).toBe("Rod-12-v1.pact.json");
    expect(fileNameFrom(null, "fallback.csv")).toBe("fallback.csv");
    expect(draftName("Rod-12-v1.pdf", true)).toBe("Rod-12-v1-DRAFT.pdf");
    expect(draftName("Rod-12-v1.pdf", false)).toBe("Rod-12-v1.pdf");
  });

  it("reads error messages from JSON and blob responses", async () => {
    const blob = new Blob([JSON.stringify({ message: "Set the product's mass per declared unit" })], { type: "application/json" });
    expect(await errorMessage({ response: { data: blob } }, "x")).toBe("Set the product's mass per declared unit");
    expect(await errorMessage({ response: { data: { message: "Nope" } } }, "x")).toBe("Nope");
    expect(await errorMessage(new Error("network"), "fallback")).toBe("fallback");
  });
});
