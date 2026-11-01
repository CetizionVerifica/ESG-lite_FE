import { describe, expect, it } from "vitest";
import { baseYearChoices, beforeAfterRows, noteError, proposalSentence, signedPct, signedT, significanceError, totalLabel } from "./baseYear";

describe("S3-14 base year wording", () => {
  it("offers 2015 to last year, newest first", () => {
    const years = baseYearChoices(new Date(2026, 9, 16));
    expect(years[0]).toBe(2025);
    expect(years[years.length - 1]).toBe(2015);
  });

  it("offers an FY once it has ended", () => {
    expect(baseYearChoices(new Date(2026, 9, 16), "FY")[0]).toBe(2026);
    expect(baseYearChoices(new Date(2026, 1, 10), "FY")[0]).toBe(2025);
  });

  it("writes the proposal sentence from the spec", () => {
    expect(proposalSentence({ delta_pct: 7.2, largest_category: 1 }, 5)).toBe("Base year moved by +7.2 %, above your 5 % threshold, mostly Category 1.");
    expect(proposalSentence({ delta_pct: -6, largest_category: null }, 5)).toBe("Base year moved by −6 %, above your 5 % threshold.");
  });

  it("signs changes with a true minus", () => {
    expect(signedT(600)).toBe("+600.000 tCO₂e");
    expect(signedT(-12.5)).toBe("−12.500 tCO₂e");
    expect(signedT(0)).toBe("0.000 tCO₂e");
    expect(signedPct(null)).toBe("—");
  });

  it("lists categories with a value before or after, Unmapped last", () => {
    const rows = beforeAfterRows(
      [{ n: 1, tco2e: 6000 }, { n: 4, tco2e: 4000 }, { n: 2, tco2e: 0 }, { n: null, tco2e: 0 }],
      [{ n: 1, tco2e: 6600 }, { n: 4, tco2e: 4000 }, { n: null, tco2e: 5 }],
    );
    expect(rows).toEqual([
      { n: 1, before: 6000, after: 6600, delta: 600 },
      { n: 4, before: 4000, after: 4000, delta: 0 },
      { n: null, before: 0, after: 5, delta: 5 },
    ]);
    expect(totalLabel(1)).toBe("Category 1 · Purchased goods and services");
    expect(totalLabel(null)).toBe("Unmapped");
  });

  it("validates the threshold and notes", () => {
    expect(significanceError(5)).toBeNull();
    expect(significanceError(null)).toMatch(/Enter/);
    expect(significanceError(0)).toMatch(/between/);
    expect(significanceError(101)).toMatch(/between/);
    expect(noteError("abc")).toMatch(/5 characters/);
    expect(noteError("Invoice keyed twice")).toBeNull();
  });
});
