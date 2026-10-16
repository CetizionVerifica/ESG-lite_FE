import { describe, expect, it } from "vitest";
import { METHOD_KEYS } from "./contracts";
import {
  DQ_INDICATORS,
  PRIMARY_METHODS,
  autoDq,
  completenessScore,
  dataTypeFor,
  geographyScore,
  isMethodNotAllowed,
  methodHint,
  methodNotAllowedMessage,
  orderMethods,
  overallOf,
  parseDqMax,
  parseMethodFilter,
  readDq,
  readMethodOptions,
  reliabilityScore,
  rowMethodText,
  technologyScore,
  timeScore,
  unitsForMethod,
} from "./dq";

// The same cases as ESG-lite ci/unit/s3-3-dq-defaults.test.cjs, so the preview and the engine agree.
describe("automatic data quality (01-contracts §3, mirror of dq/defaults.ts)", () => {
  it("geography: the site's own country is good, a region fair, GLO, missing or another country poor", () => {
    expect(geographyScore("AE", "AE")).toBe(1);
    expect(geographyScore("ae", "AE")).toBe(1);
    expect(geographyScore("  AE  ", "AE")).toBe(1);
    expect(geographyScore("EU-27", "AE")).toBe(2);
    expect(geographyScore("RER", "AE")).toBe(2);
    expect(geographyScore("GLO", "AE")).toBe(3);
    expect(geographyScore(null, "AE")).toBe(3);
    expect(geographyScore("", "AE")).toBe(3);
    expect(geographyScore("IN", "AE")).toBe(3);
    expect(geographyScore("AE", null)).toBe(3);
  });

  it("time: this year or one off is good, within three fair, older poor", () => {
    expect(timeScore(2026, 2026)).toBe(1);
    expect(timeScore(2025, 2026)).toBe(1);
    expect(timeScore(2027, 2026)).toBe(1);
    expect(timeScore(2024, 2026)).toBe(2);
    expect(timeScore(2023, 2026)).toBe(2);
    expect(timeScore(2022, 2026)).toBe(3);
    expect(timeScore(null, 2026)).toBe(3);
    expect(timeScore(2026, null)).toBe(3);
  });

  it("reliability: the method sets it, and no evidence caps it at fair", () => {
    for (const method of PRIMARY_METHODS) {
      expect(reliabilityScore(method, true)).toBe(1);
      expect(reliabilityScore(method, false)).toBe(2);
    }
    for (const method of ["hybrid", "average_data", "distance_based", "fuel_based"] as const) {
      expect(reliabilityScore(method, true)).toBe(2);
      expect(reliabilityScore(method, false)).toBe(2);
    }
    expect(reliabilityScore("spend_based", true)).toBe(3);
    expect(reliabilityScore("spend_based", false)).toBe(3);
    expect(reliabilityScore("unknown", true)).toBe(3);
  });

  it("completeness: good unless the row is a proxy", () => {
    expect(completenessScore(false)).toBe(1);
    expect(completenessScore(undefined)).toBe(1);
    expect(completenessScore(true)).toBe(3);
  });

  it("technology: the factor type leads, then the method", () => {
    expect(technologyScore("average_data", "supplier")).toBe(1);
    expect(technologyScore("average_data", "process")).toBe(1);
    expect(technologyScore("supplier_specific", null)).toBe(1);
    expect(technologyScore("spend_based", "eeio_spend")).toBe(3);
    expect(technologyScore("spend_based", null)).toBe(3);
    expect(technologyScore("average_data", null)).toBe(2);
    expect(technologyScore("distance_based", "life_cycle")).toBe(2);
  });

  it("data type: a specific method or evidence is primary", () => {
    for (const method of PRIMARY_METHODS) expect(dataTypeFor({ method })).toBe("primary");
    expect(dataTypeFor({ method: "average_data" })).toBe("secondary");
    expect(dataTypeFor({ method: "average_data", hasEvidence: true })).toBe("primary");
    expect(dataTypeFor({ method: "spend_based", hasEvidence: false })).toBe("secondary");
  });

  it("autoDq: best and worst cases, and a bare row", () => {
    expect(
      autoDq({ method: "supplier_specific", factor: { geography: "AE", year: 2026, factor_type: "supplier" }, siteCountry: "AE", reportingYear: 2026, hasEvidence: true }),
    ).toEqual({ technology: 1, geography: 1, time: 1, completeness: 1, reliability: 1, overall: 1, source: "auto" });
    expect(
      autoDq({ method: "spend_based", factor: { geography: "GLO", year: 2019, factor_type: "eeio_spend" }, siteCountry: "AE", reportingYear: 2026, isProxy: true }),
    ).toEqual({ technology: 3, geography: 3, time: 3, completeness: 3, reliability: 3, overall: 3, source: "auto" });
    const bare = autoDq({ method: "average_data", reportingYear: 2026 });
    for (const k of DQ_INDICATORS) expect([1, 2, 3]).toContain(bare[k]);
    expect(bare.overall).toBe(overallOf(bare));
  });

  it("the spec's Playwright case: spend on a Category 1 form is Poor", () => {
    // A global spend factor from 2019 (USEEIO): technology 3, geography 3, time 3, completeness 1, reliability 3 → 2.6 → Poor.
    expect(autoDq({ method: "spend_based", factor: { geography: "GLO", year: 2019, factor_type: "eeio_spend" }, siteCountry: "AE", reportingYear: 2026 }).overall).toBe(3);
    // The same with a recent factor is only Fair (3, 3, 1, 1, 3 → 2.2).
    expect(autoDq({ method: "spend_based", factor: { geography: "GLO", year: 2025, factor_type: "eeio_spend" }, siteCountry: "AE", reportingYear: 2026 }).overall).toBe(2);
  });

  it("overall is always the rounded mean of the five", () => {
    for (const method of METHOD_KEYS) {
      for (const hasEvidence of [true, false]) {
        const dq = autoDq({ method, factor: { geography: "EU-27", year: 2024, factor_type: "life_cycle" }, siteCountry: "AE", reportingYear: 2026, hasEvidence });
        expect(dq.overall).toBe(overallOf(dq));
      }
    }
    expect(overallOf({ technology: 1, geography: 1, time: 2, completeness: 2, reliability: 2 })).toBe(2);
    expect(overallOf({ technology: 1, geography: 1, time: 1, completeness: 2, reliability: 2 })).toBe(1);
    expect(overallOf({ technology: 3, geography: 3, time: 3, completeness: 2, reliability: 2 })).toBe(3);
  });
});

describe("reading server fields", () => {
  it("readDq keeps a full score, derives a missing overall and refuses anything else", () => {
    const full = { technology: 1, geography: 2, time: 1, completeness: 1, reliability: 3, overall: 2, source: "manual" };
    expect(readDq(full)).toEqual(full);
    expect(readDq({ ...full, overall: undefined, source: undefined })).toEqual({ ...full, overall: overallOf(full as never), source: "auto" });
    expect(readDq(null)).toBeNull();
    expect(readDq({ overall: 2 })).toBeNull();
    expect(readDq({ ...full, time: 4 })).toBeNull();
    expect(readDq("2")).toBeNull();
  });

  it("readMethodOptions reads the contract shape and bare keys, and drops junk", () => {
    expect(readMethodOptions([{ method: "distance_based", units: ["passenger.km", " vehicle.km "] }, { method: "fuel_based", units: ["litre"] }])).toEqual([
      { method: "distance_based", units: ["passenger.km", "vehicle.km"] },
      { method: "fuel_based", units: ["litre"] },
    ]);
    expect(readMethodOptions(["spend_based", "average_data"])).toEqual([
      { method: "spend_based", units: [] },
      { method: "average_data", units: [] },
    ]);
    expect(readMethodOptions(["unknown", "nope", "spend_based", "spend_based", null, 3])).toEqual([{ method: "spend_based", units: [] }]);
    expect(readMethodOptions(null)).toEqual([]);
    expect(readMethodOptions({ method: "spend_based" })).toEqual([]);
  });

  it("unitsForMethod limits units only when the method names some", () => {
    const opts = readMethodOptions([{ method: "distance_based", units: ["km"] }, "spend_based"]);
    expect(unitsForMethod(opts, "distance_based")).toEqual(["km"]);
    expect(unitsForMethod(opts, "spend_based")).toBeNull();
    expect(unitsForMethod(opts, null)).toBeNull();
  });

  it("orderMethods puts the category's most specific method first", () => {
    expect(orderMethods(["spend_based", "average_data", "supplier_specific"], 1)).toEqual(["supplier_specific", "average_data", "spend_based"]);
    // Category 6: fuel, distance, spend.
    expect(orderMethods(["spend_based", "distance_based", "fuel_based"], 6)).toEqual(["fuel_based", "distance_based", "spend_based"]);
    // A method the category doesn't list goes after its own, in contract order.
    expect(orderMethods(["hybrid", "average_data", "spend_based"], 7)).toEqual(["average_data", "hybrid", "spend_based"]);
    expect(orderMethods(["spend_based", "hybrid"])).toEqual(["hybrid", "spend_based"]);
  });
});

describe("words and filters", () => {
  it("labels a row's method in the category's wording, or says it wasn't recorded", () => {
    expect(rowMethodText("average_data", 7)).toBe("Headcount × national average");
    expect(rowMethodText("spend_based", 1)).toBe("From the amount spent");
    expect(rowMethodText(null)).toBe("Not recorded");
    expect(methodHint("spend_based")).toMatch(/amount spent/);
    expect(methodHint("nope")).toBe("");
  });

  it("parses the method= and dq_max= filters", () => {
    expect(parseDqMax("1")).toBe(1);
    expect(parseDqMax("3")).toBe(3);
    expect(parseDqMax("0")).toBeNull();
    expect(parseDqMax(null)).toBeNull();
    expect(parseMethodFilter("spend_based")).toBe("spend_based");
    expect(parseMethodFilter("SPEND")).toBeNull();
  });

  it("recognises METHOD_NOT_ALLOWED and keeps the server's words", () => {
    const e = { response: { status: 400, data: { code: "METHOD_NOT_ALLOWED", message: "This calculation method isn't offered for this category. This form offers: Supplier's own figure." } } };
    expect(isMethodNotAllowed(e)).toBe(true);
    expect(methodNotAllowedMessage(e)).toMatch(/This form offers: Supplier's own figure/);
    expect(isMethodNotAllowed({ response: { data: { code: "PERIOD_LOCKED" } } })).toBe(false);
    expect(isMethodNotAllowed(new Error("x"))).toBe(false);
    expect(methodNotAllowedMessage({})).toMatch(/isn't offered/);
  });
});
