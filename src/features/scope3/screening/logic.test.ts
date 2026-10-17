import { describe, expect, it } from "vitest";
import type { ScreeningCategory } from "../../../services/scope3ScreeningService";
import { RELEVANCE_CRITERIA, RELEVANCE_KEYS } from "../../../lib/scope3/screening";
import { PROXY_BASIS_LABELS, PROXY_BASES } from "../../../lib/scope3/contracts";
import {
  applyDraftFor,
  applyError,
  basesFor,
  draftFor,
  estimateCaption,
  extrapolateBody,
  extrapolateError,
  inputErrors,
  shareWidth,
  suggestionApplied,
  tickedLabels,
  toInput,
  toggleTick,
  yearFrom,
  yearOptions,
  yearTypeFrom,
} from "./logic";

const cat = (over: Partial<ScreeningCategory> = {}): ScreeningCategory => ({
  n: 6,
  key: "business_travel",
  name: "Business travel",
  direction: "upstream",
  status: "screening",
  reason: null,
  relevance: {},
  recorded_tco2e: 0.9,
  pending_tco2e: 0.05,
  proxy_tco2e: 0,
  estimate_tco2e: 12.4,
  basis: "spend",
  size_tco2e: 12.4,
  size_basis: "spend",
  share_pct: 40,
  suggestion: { status: "included", reason: "Among the categories that make up 95 % of estimated Scope 3 (≈ 12 tCO₂e, 40 %)" },
  inputs: [],
  mapped_categories: [],
  ...over,
});

const now = new Date("2026-10-16T00:00:00Z");

describe("year in the URL", () => {
  it("defaults to the last completed year and keeps a valid one", () => {
    expect(yearFrom(null, now)).toBe(2025);
    expect(yearFrom("2024", now)).toBe(2024);
    expect(yearFrom("abc", now)).toBe(2025);
    expect(yearFrom("3000", now)).toBe(2025);
    expect(yearTypeFrom("FY")).toBe("FY");
    expect(yearTypeFrom("x")).toBe("CY");
    expect(yearOptions(2025, now)).toEqual([2026, 2025, 2024, 2023, 2022, 2021]);
    expect(yearOptions(2015, now)).toEqual([2026, 2025, 2024, 2023, 2022, 2021, 2015]);
  });
});

describe("Table II ticks", () => {
  it("has the guidance's 8 criteria, each with its wording for the tooltip", () => {
    expect(RELEVANCE_KEYS).toEqual(["size", "influence", "risk", "stakeholders", "outsourcing", "sector_guidance", "spend_analysis", "other"]);
    for (const c of RELEVANCE_CRITERIA) expect(c.help.length).toBeGreaterThan(20);
  });

  it("toggles one tick and keeps only true ones, in Table II order", () => {
    expect(toggleTick({ risk: true }, "stakeholders", true)).toEqual({ risk: true, stakeholders: true });
    expect(toggleTick({ risk: true, stakeholders: true }, "risk", false)).toEqual({ stakeholders: true });
    expect(toggleTick(null, "made_up", true)).toEqual({});
    expect(tickedLabels({ stakeholders: true, size: true, other: false })).toEqual(["Size", "Stakeholders"]);
  });
});

describe("screening inputs", () => {
  it("offers headcount only for Category 7", () => {
    expect(basesFor(7)[0]).toBe("headcount");
    expect(basesFor(6)).not.toContain("headcount");
  });

  it("starts a draft from the saved figure, and a money basis defaults to USD", () => {
    const saved = cat({
      inputs: [
        { ghg_category: 6, basis: "spend", amount: 1000, currency: "INR", eeio_sector: "481000", note: "Agency", updated_at: null, updated_by: null, estimate_tco2e: 0.5, estimate_note: null, sector: { code: "481000", name: "Air transportation (NAICS 481000)", factor_value: "0.5", price_base_year: 2022 }, fx: null, warnings: [] },
      ],
    });
    expect(draftFor(saved)).toMatchObject({ basis: "spend", amount: 1000, currency: "INR", eeio_sector: "481000", sector_name: "Air transportation (NAICS 481000)", note: "Agency" });
    expect(draftFor(cat(), "revenue")).toMatchObject({ basis: "revenue", amount: null, currency: "USD" });
    expect(draftFor(cat({ n: 7 }))).toMatchObject({ basis: "headcount", currency: null });
  });

  it("validates the amount, whole employees and the currency of a money figure", () => {
    expect(inputErrors({ basis: "spend", amount: null, currency: "USD", eeio_sector: null, sector_name: null, note: "" }).amount).toBe("Enter an amount.");
    expect(inputErrors({ basis: "spend", amount: -1, currency: "USD", eeio_sector: null, sector_name: null, note: "" }).amount).toMatch(/negative/);
    expect(inputErrors({ basis: "spend", amount: 5, currency: null, eeio_sector: null, sector_name: null, note: "" }).currency).toBe("Choose the currency.");
    expect(inputErrors({ basis: "headcount", amount: 12.5, currency: null, eeio_sector: null, sector_name: null, note: "" }).amount).toMatch(/whole/);
    expect(inputErrors({ basis: "headcount", amount: 12, currency: null, eeio_sector: null, sector_name: null, note: "" })).toEqual({});
  });

  it("sends only what the basis uses, never a total", () => {
    expect(toInput(6, { basis: "spend", amount: 1000, currency: "USD", eeio_sector: "481000", sector_name: "Air", note: " " })).toEqual({
      ghg_category: 6,
      basis: "spend",
      amount: 1000,
      currency: "USD",
      eeio_sector: "481000",
      note: null,
    });
    expect(toInput(7, { basis: "headcount", amount: 40, currency: "USD", eeio_sector: "x", sector_name: null, note: "HR" })).toEqual({
      ghg_category: 7,
      basis: "headcount",
      amount: 40,
      currency: null,
      eeio_sector: null,
      note: "HR",
    });
  });
});

describe("apply and texts", () => {
  it("starts Apply from the suggestion and needs a reason to leave a category out", () => {
    const c = cat({ suggestion: { status: "excluded", reason: "Estimated below 1 % of Scope 3 (≈ 2 tCO₂e by spend screening, 2025)" } });
    expect(applyDraftFor(c)).toEqual({ status: "excluded", reason: "Estimated below 1 % of Scope 3 (≈ 2 tCO₂e by spend screening, 2025)" });
    expect(applyError({ status: "excluded", reason: " " })).toMatch(/reason/);
    expect(applyError({ status: "included", reason: "" })).toBeNull();
    expect(suggestionApplied(cat({ status: "included" }))).toBe(true);
    expect(suggestionApplied(cat({ status: "screening" }))).toBe(false);
  });

  it("labels an estimate as not saved and draws a visible share bar", () => {
    expect(estimateCaption(cat())).toBe("Spend screening · Estimate, not saved");
    expect(estimateCaption(cat({ estimate_tco2e: null, basis: null }))).toBeNull();
    expect(shareWidth(0)).toBe(0);
    expect(shareWidth(0.3)).toBe(2);
    expect(shareWidth(140)).toBe(100);
  });

  it("names every proxy basis in plain words", () => {
    for (const b of PROXY_BASES) expect(PROXY_BASIS_LABELS[b]).toMatch(/^[A-Z]/);
  });
});

describe("extrapolate", () => {
  it("needs a site and a coverage from 1 to 99 %", () => {
    expect(extrapolateError({ site_id: null, basis: "coverage", coverage_pct: 85 })).toBe("Choose the site.");
    expect(extrapolateError({ site_id: 1, basis: "coverage", coverage_pct: 100 })).toMatch(/1 to 99/);
    expect(extrapolateError({ site_id: 1, basis: "intensity", coverage_pct: null })).toBeNull();
  });

  it("builds the contract body: coverage with its share, intensity with the site as the one without data", () => {
    expect(extrapolateBody(6, 2025, "CY", { site_id: 1, basis: "coverage", coverage_pct: 85 })).toEqual({ ghg_category: 6, site_id: 1, year: 2025, year_type: "CY", basis: "coverage", coverage_pct: 85 });
    expect(extrapolateBody(6, 2025, "FY", { site_id: 2, basis: "intensity", coverage_pct: 85 })).toEqual({ ghg_category: 6, site_id: 2, year: 2025, year_type: "FY", basis: "intensity", output_site_ids: [2] });
  });
});
