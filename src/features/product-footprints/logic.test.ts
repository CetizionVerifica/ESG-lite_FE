import { describe, expect, it } from "vitest";
import {
  type FootprintRow,
  type Study,
  buildRows,
  computeKpis,
  currentStudy,
  declaredUnitLabel,
  inFocus,
  insightLines,
  matchesFilters,
  nameList,
  previousTotal,
  productionByProduct,
  rowStatus,
  stageSegments,
} from "./logic";

const FROM = "2025-01-01";
const TO = "2025-12-31";

function study(over: Partial<Study> & { id: number; productId?: number; total?: number | null }): Study {
  const { id, productId = 1, total = 2, ...rest } = over;
  return {
    pcf_study_id: id,
    product: { product_id: productId, name: `P${productId}`, declared_unit: "kg", declared_unit_qty: 1 },
    site: { site_id: 10, name: "Bahrain" },
    reference_start: FROM,
    reference_end: TO,
    year_type: "CY",
    pcr_tag: null,
    version: 1,
    status: "approved",
    stale: false,
    updated_at: "2026-02-01T10:00:00Z",
    result:
      total === null
        ? null
        : {
            total_kg_per_unit: total,
            by_stage: { A1: total * 0.7, A2: total * 0.1, A3_energy: total * 0.2, A3_packaging: 0, A3_waste: 0 },
            primary_data_share_pct: 40,
            dqr_overall: 2,
            warnings: [],
            is_draft: false,
            calculated_at: "2026-02-01T10:00:00Z",
          },
    ...rest,
  };
}

const product = (id: number, name = `P${id}`, unit = "t") => ({ product_id: id, name, unit, site: { site_id: 10, name: "Bahrain" } });
const made = (id: number, quantity: number, unit = "t") => ({ product: { product_id: id }, quantity, unit });

describe("currentStudy", () => {
  it("takes the highest version whose period overlaps the year, never a superseded one", () => {
    const list = [
      study({ id: 1, version: 1, status: "superseded" }),
      study({ id: 2, version: 2, status: "published" }),
      study({ id: 3, version: 3, status: "draft", reference_start: "2026-01-01", reference_end: "2026-12-31" }),
    ];
    expect(currentStudy(list, FROM, TO)?.pcf_study_id).toBe(2);
    expect(currentStudy(list, "2026-01-01", "2026-12-31")?.pcf_study_id).toBe(3);
    expect(currentStudy(list, "2024-01-01", "2024-12-31")).toBeNull();
  });

  it("counts a fiscal-year study in each calendar year it overlaps", () => {
    const fy = study({ id: 4, reference_start: "2025-04-01", reference_end: "2026-03-31", year_type: "FY" });
    expect(currentStudy([fy], FROM, TO)?.pcf_study_id).toBe(4);
    expect(currentStudy([fy], "2026-01-01", "2026-12-31")?.pcf_study_id).toBe(4);
  });
});

describe("previousTotal", () => {
  it("compares with the latest earlier version that was approved or published", () => {
    const v1 = study({ id: 1, version: 1, status: "superseded", total: 2.5 });
    const v2 = study({ id: 2, version: 2, status: "draft", total: 9 });
    const v3 = study({ id: 3, version: 3, status: "published", total: 2 });
    expect(previousTotal([v1, v2, v3], v3)).toBe(2.5);
    expect(previousTotal([v1], v1)).toBeNull();
  });
});

describe("rowStatus", () => {
  it("shows a stale approved or published footprint as out of date", () => {
    expect(rowStatus(null)).toBe("none");
    expect(rowStatus(study({ id: 1, status: "published", stale: true }))).toBe("stale");
    expect(rowStatus(study({ id: 1, status: "draft", stale: true }))).toBe("draft");
    expect(rowStatus(study({ id: 1, status: "in_review" }))).toBe("in_review");
  });
});

describe("declaredUnitLabel", () => {
  it("prints the study's declared unit, and nothing before a study sets one", () => {
    expect(declaredUnitLabel(study({ id: 1 }))).toBe("1 kg");
    const km = study({ id: 1 });
    km.product = { product_id: 1, name: "Cable", declared_unit: "m", declared_unit_qty: 1000 };
    expect(declaredUnitLabel(km)).toBe("1,000 m");
    expect(declaredUnitLabel(null)).toBeNull();
  });
});

describe("productionByProduct", () => {
  it("sums approved quantities and marks mixed units", () => {
    const map = productionByProduct([made(1, 100), made(1, "50" as unknown as number), made(2, 5, "t"), made(2, 10, "kg")]);
    expect(map.get(1)).toEqual({ qty: 150, unit: "t" });
    expect(map.get(2)).toEqual({ qty: 15, unit: null });
  });
});

describe("buildRows + computeKpis", () => {
  const products = [product(1, "Wire rod"), product(2, "AAAC conductor"), product(3, "Cu rod")];
  const studies = [
    study({ id: 11, productId: 1, total: 2, status: "published" }),
    study({ id: 12, productId: 1, total: 2.5, status: "superseded", version: 0 }),
    study({ id: 31, productId: 3, total: 4, status: "approved", stale: true }),
  ];
  studies[2].result!.primary_data_share_pct = 10;
  const production = [made(1, 300), made(2, 100), made(3, 100)];
  const rows = buildRows({ products, studies, production, from: FROM, to: TO });

  it("builds one row per product with its latest study", () => {
    expect(rows.map((r) => [r.product_name, r.status, r.total, r.previous, r.approved_qty])).toEqual([
      ["Wire rod", "published", 2, 2.5, 300],
      ["AAAC conductor", "none", null, null, 100],
      ["Cu rod", "stale", 4, null, 100],
    ]);
  });

  it("counts footprinted products, covered volume, allocation and the emission-weighted primary share", () => {
    const recon = [{ site_id: 10, plant_s1_s2_tco2e: 1000, covered_tco2e: 960, coverage_pct: 96, products: [{ product_id: 1, pcf_study_id: 11 }] }];
    const k = computeKpis(rows, recon);
    expect(k.footprinted).toBe(2);
    expect(k.withProduction).toBe(3);
    expect(k.outOfDate).toBe(1);
    expect(k.coveredPct).toBeCloseTo(80); // 400 of 500 t
    expect(k.allocatedPct).toBeCloseTo(96);
    // Weights: wire rod 2 × 300 = 600 at 40%, Cu rod 4 × 100 = 400 at 10%.
    expect(k.primaryPct).toBeCloseTo((600 * 40 + 400 * 10) / 1000);
  });

  it("leaves production covered empty when products use different units", () => {
    const mixed = buildRows({ products, studies, production: [made(1, 300), made(2, 100, "km")], from: FROM, to: TO });
    const k = computeKpis(mixed, null);
    expect(k.coveredPct).toBeNull();
    expect(k.mixedUnits).toBe(true);
    expect(k.allocatedPct).toBeNull();
  });

  it("filters the table to the rows behind each KPI", () => {
    const allocated = new Set([1]);
    const names = (focus: Parameters<typeof inFocus>[1]) => rows.filter((r) => inFocus(r, focus, allocated)).map((r) => r.product_name);
    expect(names("footprinted")).toEqual(["Wire rod", "AAAC conductor", "Cu rod"]);
    expect(names("covered")).toEqual(["Wire rod", "Cu rod"]);
    expect(names("allocated")).toEqual(["Wire rod"]);
    expect(names("primary")).toEqual(["Wire rod", "Cu rod"]);
  });

  it("says which site is allocated and which products have no footprint", () => {
    const recon = [{ site_id: 10, plant_s1_s2_tco2e: 1000, covered_tco2e: 960, coverage_pct: 96, products: [] }];
    expect(insightLines(rows, recon, () => "Bahrain")).toEqual(["Bahrain plant energy is 96% allocated.", "AAAC conductor has no footprint yet."]);
  });
});

describe("stageSegments", () => {
  it("splits the total by stage and groups licensed stages as hidden", () => {
    expect(stageSegments(10, { A1: 7, A2: 1, A3_energy: 2, A3_packaging: 0, A3_waste: 0 }).map((s) => [s.stage, Math.round(s.pct)])).toEqual([
      ["A1", 70],
      ["A2", 10],
      ["A3_energy", 20],
    ]);
    expect(stageSegments(10, { A1: null, A2: 1, A3_energy: 2, A3_packaging: 0, A3_waste: 0 }).map((s) => [s.stage, s.value])).toEqual([
      ["A2", 1],
      ["A3_energy", 2],
      ["hidden", 7],
    ]);
    expect(stageSegments(null, null)).toEqual([]);
  });
});

describe("matchesFilters and nameList", () => {
  const row = { product_name: "AAAC conductor", status: "none", pcr_tag: null } as FootprintRow;
  it("matches status, PCR and search", () => {
    expect(matchesFilters(row, { q: "aaac", statuses: [], pcr: [] })).toBe(true);
    expect(matchesFilters(row, { q: "", statuses: ["published"], pcr: [] })).toBe(false);
    expect(matchesFilters(row, { q: "", statuses: [], pcr: ["—"] })).toBe(true);
  });
  it("lists names in plain English", () => {
    expect(nameList(["A"])).toBe("A");
    expect(nameList(["A", "B"])).toBe("A and B");
    expect(nameList(["A", "B", "C", "D"])).toBe("A, B and 2 more");
  });
});
