import { describe, expect, it } from "vitest";
import { checkMapping, checkValue, readMappingSuggestions, readValueSuggestions, sourceLine } from "./ai";

describe("KPI-12 AI suggestions (suggest only)", () => {
  it("reads value suggestions as served, and the older mock names", () => {
    const r = readValueSuggestions({
      document_id: 7,
      document_name: "water-bill.pdf",
      pages: 3,
      suggestions: [
        { kpi_code: "WATER_WITHDRAWAL", value: 1200, unit: "m³", breakdown_key: null, period_start: "2026-09-01", period_end: "2026-09-30", site_hint: "Bahrain plant", source_page: 2, quote: "Water consumed: 1,200 m³", confidence: 0.92, why: "found it on page 2" },
        { kpi: "WATER_DISCHARGE", value: 860, unit: "m³", period: "2026-09", source_page: 1, confidence: 71 },
        { kpi_code: "WOMEN_ON_BOARD", value: "", confidence: 0.9 },
      ],
    });
    expect(r).toMatchObject({ available: true, documentId: 7, documentName: "water-bill.pdf" });
    expect(r.suggestions).toHaveLength(2);
    expect(r.suggestions[1]).toMatchObject({ kpi_code: "WATER_DISCHARGE", period_start: "2026-09-01", confidence: 0.71, breakdown_key: null, quote: null });
    expect(readValueSuggestions({ suggestions: [] }, "hr.xlsx").documentName).toBe("hr.xlsx");
  });

  it("treats AI down as a calm note, not an error", () => {
    expect(readValueSuggestions({ available: false, message: "Back soon" })).toEqual({ available: false, message: "Back soon", documentId: null, documentName: null, suggestions: [] });
    expect(readMappingSuggestions({ available: false, message: "Back soon" }, () => 1).available).toBe(false);
  });

  it("finds a mapping's disclosure by framework and code and drops what isn't in the catalogue", () => {
    const find = (f: string, c: string) => (f === "GRI" && c === "303-3" ? 41 : undefined);
    const r = readMappingSuggestions({ suggestions: [{ framework: "gri", code: "303-3", title: "Water withdrawal", section: "303", why: "same measure", confidence: 0.8 }, { framework: "GRI", code: "999", confidence: 0.9 }] }, find);
    expect(r.suggestions).toEqual([{ disclosure_id: 41, framework: "GRI", code: "303-3", title: "Water withdrawal", section: "303", why: "same measure", confidence: 0.8 }]);
  });

  it("says Check this below 0.6 for values and at 0.5 or less for mappings, and names the source", () => {
    expect(checkValue({ confidence: 0.59 })).toBe(true);
    expect(checkValue({ confidence: 0.6 })).toBe(false);
    expect(checkMapping({ confidence: 0.5 })).toBe(true);
    expect(checkMapping({ confidence: 0.51 })).toBe(false);
    expect(sourceLine("water-bill.pdf", 2)).toBe("Suggested from water-bill.pdf, page 2");
    expect(sourceLine(null, null)).toBe("Suggested from your document");
  });
});
