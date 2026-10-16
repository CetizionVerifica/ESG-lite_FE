import { describe, expect, it } from "vitest";
import type { Investment } from "../../../services/scope3AssetsService";
import { basisOf, belowThreshold, commitKey, dataText, draftErrors, draftFrom, emptyDraft, planSummary, toBody, yearsOf } from "./logic";

const inv = (over: Partial<Investment> = {}): Investment => ({
  id: 1,
  company_id: 1,
  investee: "Acme Power",
  type: "equity",
  share_pct: 25,
  investee_scope12_tco2e: 60000,
  year: 2025,
  source: null,
  revenue: null,
  currency: null,
  eeio_sector: null,
  sector_split: null,
  updated_at: null,
  ...over,
});
const fmt = (n: number) => n.toLocaleString("en-US");

describe("investments register logic", () => {
  it("reads the basis from the saved fields", () => {
    expect(basisOf(inv())).toBe("reported");
    expect(basisOf(inv({ investee_scope12_tco2e: null, revenue: 3_000_000, eeio_sector: "Telecom" }))).toBe("revenue");
    expect(basisOf(inv({ investee_scope12_tco2e: null }))).toBe("reported");
  });

  it("asks for the fields the chosen basis needs", () => {
    expect(draftErrors(draftFrom(inv()))).toEqual({});
    const blank = emptyDraft(2025);
    expect(Object.keys(draftErrors(blank)).sort()).toEqual(["investee", "investee_scope12_tco2e", "share_pct"]);
    expect(Object.keys(draftErrors({ ...blank, investee: "X", share_pct: 10, basis: "revenue" })).sort()).toEqual(["eeio_sector", "revenue"]);
    expect(draftErrors({ ...blank, investee: "X", share_pct: 120 }).share_pct).toMatch(/between 0 and 100/);
    // Debt and project finance are listed, not calculated: no emissions data needed.
    expect(draftErrors({ ...blank, investee: "Bank loan", share_pct: 5, type: "debt" })).toEqual({});
  });

  it("clears the basis not chosen and keeps a stored sector split", () => {
    const reported = toBody({ ...draftFrom(inv()), revenue: 5, eeio_sector: "Telecom" });
    expect(reported).toMatchObject({ investee_scope12_tco2e: 60000, revenue: null, currency: null, eeio_sector: null, sector_split: null });
    const split = inv({ investee_scope12_tco2e: null, revenue: 5_500_000, currency: "USD", sector_split: { A: 0.6, B: 0.4 } });
    expect(toBody(draftFrom(split), split)).toMatchObject({ investee_scope12_tco2e: null, revenue: 5_500_000, currency: "USD", sector_split: { A: 0.6, B: 0.4 } });
    expect(toBody({ ...draftFrom(inv()), source: "  ", investee: " Acme " })).toMatchObject({ source: null, investee: "Acme" });
  });

  it("shows emissions, or revenue and sector, or Missing", () => {
    expect(dataText(inv(), fmt)).toBe("60,000 tCO₂e");
    expect(dataText(inv({ investee_scope12_tco2e: null, revenue: 3_000_000, currency: "USD", eeio_sector: "Telecom" }), fmt)).toBe("3,000,000 USD · Telecom");
    expect(dataText(inv({ investee_scope12_tco2e: null, revenue: 10, sector_split: { A: 0.5, B: 0.5 } }), fmt)).toBe("10 USD · 2 sectors");
    expect(dataText(inv({ investee_scope12_tco2e: null }), fmt)).toBe("Missing");
  });

  it("lists equity stakes under the threshold", () => {
    const rows = [inv({ id: 1, share_pct: 0.5 }), inv({ id: 2, share_pct: 25 }), inv({ id: 3, type: "debt", share_pct: 0.1 })];
    expect(belowThreshold(rows, 1).map((r) => r.id)).toEqual([1]);
    expect(belowThreshold(rows, null)).toEqual([]);
  });

  it("offers every year with investments plus this year, newest first", () => {
    expect(yearsOf([inv({ year: 2023 }), inv({ year: 2025 }), inv({ year: 2023 })], 2026)).toEqual([2026, 2025, 2023]);
  });

  it("summarises the plan and keys the commit by version", () => {
    const p = { plan_id: "p", version: 2, status: "draft" as const, counts: { rows: 3, ready: 2, issue: 1, skipped: 0, warnings: 0 }, totals: { tco2e: 15000 }, rows: [] };
    expect(planSummary(p)).toBe("2 rows ready · 1 needs a fix");
    expect(commitKey("p", 2)).toBe("scope3-investments-p-2");
  });
});
