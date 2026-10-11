import { describe, expect, it } from "vitest";
import {
  actionsFor,
  dqrWord,
  hotspots,
  latestVersion,
  leverText,
  perUnitText,
  periodLabel,
  periodParam,
  previousVersion,
  waterfall,
  type ResultLine,
  type Study,
} from "./logic";

const study = (id: number, version: number, status: Study["status"], total: number | null = null): Study =>
  ({
    pcf_study_id: id,
    version,
    status,
    stale: false,
    result: total == null ? null : { total_kg_per_unit: total },
  }) as Study;

const line = (over: Partial<ResultLine>): ResultLine => ({
  id: "in-1",
  pcf_input_id: 1,
  stage: "A1",
  name: "Primary aluminium",
  kgco2e_per_unit: 6.5,
  share_pct: 91,
  value_hidden: false,
  data_type: "secondary",
  dqr: { technology: 2, geography: 2, time: 2 },
  cut_off_candidate: false,
  quantity: 1,
  unit: "kg",
  recycled_share_pct: 20,
  supplier_specific: false,
  factor: null,
  recycled_factor: null,
  lever_kg_per_10pts: -0.75,
  ...over,
});

describe("perUnitText", () => {
  it("uses the declared unit exactly", () => {
    expect(perUnitText({ product_id: 1, name: "Rod", declared_unit: "kg", declared_unit_qty: 1, mass_per_unit_kg: 1 })).toBe("kgCO₂e / kg");
    expect(perUnitText({ product_id: 1, name: "Cable", declared_unit: "m", declared_unit_qty: 1000, mass_per_unit_kg: 1 })).toBe("kgCO₂e / 1,000 m");
    expect(perUnitText(null)).toBe("kgCO₂e per declared unit");
  });
});

describe("periods", () => {
  it("labels CY and FY periods and writes the URL value", () => {
    expect(periodLabel({ reference_start: "2025-01-01", reference_end: "2025-12-31", year_type: "CY" })).toBe("CY 2025");
    expect(periodLabel({ reference_start: "2025-04-01", reference_end: "2026-03-31", year_type: "FY" })).toBe("FY 2025–26");
    expect(periodParam({ reference_start: "2025-01-01", year_type: "CY" })).toMatch(/2025/);
  });
});

describe("latestVersion", () => {
  it("prefers the newest published or approved version", () => {
    expect(latestVersion([study(1, 1, "published"), study(2, 2, "approved"), study(3, 3, "draft")])?.pcf_study_id).toBe(2);
  });
  it("falls back to the newest version in progress, then anything", () => {
    expect(latestVersion([study(1, 1, "superseded"), study(2, 2, "draft")])?.pcf_study_id).toBe(2);
    expect(latestVersion([study(1, 1, "superseded")])?.pcf_study_id).toBe(1);
    expect(latestVersion([])).toBeNull();
  });
});

describe("previousVersion", () => {
  it("is the newest earlier version with a result", () => {
    const list = [study(1, 1, "superseded", 8), study(2, 2, "draft"), study(3, 3, "published", 7)];
    expect(previousVersion(list, list[2])?.pcf_study_id).toBe(1);
    expect(previousVersion(list, list[0])).toBeNull();
  });
});

describe("hotspots and levers", () => {
  it("ranks visible lines by contribution and skips hidden ones", () => {
    const lines = [
      line({ id: "a", name: "Pallet", kgco2e_per_unit: 0.1, share_pct: 1.4, lever_kg_per_10pts: null, stage: "A3_packaging" }),
      line({ id: "b" }),
      line({ id: "c", name: "Licensed alloy", kgco2e_per_unit: null, share_pct: null, value_hidden: true }),
    ];
    expect(hotspots(lines, "kgCO₂e / kg").map((h) => h.line.id)).toEqual(["b", "a"]);
    expect(hotspots(lines, "kgCO₂e / kg", 1)).toHaveLength(1);
  });
  it("writes the recycled-input lever from the server's re-run", () => {
    expect(leverText(line({}), "kgCO₂e / kg")).toBe("Primary aluminium is 91%. Each +10 pts of recycled input lowers the footprint by about 0.75 kgCO₂e per kg.");
    expect(leverText(line({ lever_kg_per_10pts: 0.2 }), "kgCO₂e / kg")).toContain("raises the footprint by about 0.2");
  });
  it("falls back to energy and data-quality hints", () => {
    expect(leverText(line({ stage: "A3_energy", name: "Electricity", lever_kg_per_10pts: null, share_pct: 30 }), "kgCO₂e / kg")).toContain("approved Scope 1 and 2");
    expect(leverText(line({ lever_kg_per_10pts: null, share_pct: 40 }), "kgCO₂e / kg")).toContain("supplier-specific");
    expect(leverText(line({ lever_kg_per_10pts: null, share_pct: 4 }), "kgCO₂e / kg")).toBe("Primary aluminium is 4%.");
    expect(leverText(line({ lever_kg_per_10pts: null, share_pct: 0.4 }), "kgCO₂e / kg")).toBe("Primary aluminium is 0.4%.");
  });
});

describe("waterfall", () => {
  it("stacks the stages in fixed order and ends on the total", () => {
    const steps = waterfall(7, { A1: 6, A2: 0.5, A3_energy: 0.4, A3_packaging: 0.1, A3_waste: 0 }, []);
    expect(steps.map((s) => [s.key, s.base, s.value])).toEqual([
      ["A1", 0, 6],
      ["A2", 6, 0.5],
      ["A3_energy", 6.5, 0.4],
      ["A3_packaging", 6.9, 0.1],
      ["total", 0, 7],
    ]);
  });
  it("shows hidden licensed stages as one step", () => {
    const steps = waterfall(10, { A1: null, A3_energy: 1, A3_packaging: null }, ["A1", "A3_packaging"]);
    expect(steps.map((s) => [s.key, s.value])).toEqual([
      ["A3_energy", 1],
      ["hidden", 9],
      ["total", 10],
    ]);
  });
});

describe("actionsFor", () => {
  it("offers what each status allows", () => {
    expect(actionsFor({ status: "draft", stale: false, result: null })).toEqual({ primary: "edit", secondary: [] });
    expect(actionsFor({ status: "in_review", stale: false, result: null }).primary).toBe("approve");
    expect(actionsFor({ status: "approved", stale: false, result: null }).secondary).toEqual(["publish", "new-version"]);
    expect(actionsFor({ status: "approved", stale: true, result: null }).secondary).toEqual(["new-version"]);
    expect(actionsFor({ status: "published", stale: false, result: null })).toEqual({ primary: "export", secondary: ["new-version"] });
  });
});

describe("dqrWord", () => {
  it("reads 1 as best", () => {
    expect(dqrWord(1.8)).toBe("good");
    expect(dqrWord(2.2)).toBe("fair");
    expect(dqrWord(2.7)).toBe("poor");
  });
});
