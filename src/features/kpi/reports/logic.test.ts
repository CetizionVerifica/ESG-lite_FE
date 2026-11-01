import { describe, expect, it } from "vitest";
import type { KpiReportRow } from "../../../lib/kpi/contracts";
import { fallbackName, formatsFor, groupBySection, omissionText, omissionTitle, pendingText, placesOf, reportValue, rowNote, tabLabel, yearLabel } from "./logic";

const row = (r: Partial<KpiReportRow>): KpiReportRow => ({ disclosure_id: 1, code: "302-1", title: "Energy", section: "GRI 302 Energy", value: 1, unit: "GJ", where: "site", notes: null, ...r });

describe("framework report logic", () => {
  it("names tabs and downloads per framework", () => {
    expect(tabLabel("GRI")).toBe("GRI content index");
    expect(tabLabel("ESRS")).toBe("ESRS");
    expect(formatsFor("GRI")).toEqual(["xlsx", "pdf"]);
    expect(formatsFor("BRSR")).toEqual(["xlsx"]);
    expect(fallbackName("GRI", 2026, "pdf")).toBe("GRI-2026-content-index.pdf");
    expect(fallbackName("BRSR", 2026, "xlsx")).toBe("BRSR-2026.xlsx");
  });

  it("groups rows by section in order", () => {
    const g = groupBySection([row({ disclosure_id: 1 }), row({ disclosure_id: 2, section: "GRI 303 Water" }), row({ disclosure_id: 3 })]);
    expect(g.map((x) => [x.section, x.rows.length])).toEqual([["GRI 302 Energy", 2], ["GRI 303 Water", 1]]);
  });

  it("shows the server's figure as sent", () => {
    expect(reportValue(173560, "GJ")).toBe("173,560 GJ");
    // #209: a tCO₂e figure always shows 3 decimals; the server's 512.4 is 512.400, never rounded.
    expect(reportValue(512.4, "tCO₂e")).toBe("512.400 tCO₂e");
    expect(reportValue(4650.2, "tCO2e")).toBe("4,650.200 tCO2e");
    expect(reportValue(12.3456, "tCO₂e / M USD")).toBe("12.346 tCO₂e / M USD");
    expect(reportValue(3.63, "ML")).toBe("3.63 ML");
    expect(reportValue("See page 12", null)).toBe("See page 12");
    expect(reportValue(null, "GJ")).toBe("—");
    expect(placesOf(0.1234)).toBe(3);
  });

  it("labels years, notes and omissions", () => {
    expect(yearLabel(2026, "CY")).toBe("2026");
    expect(yearLabel(2026, "FY")).toBe("FY 2026-27");
    expect(rowNote({ fit: "partial", notes: "ESRS asks for consumption." })).toBe("Partial: ESRS asks for consumption.");
    expect(rowNote({ fit: "exact", notes: "Calculated" })).toBe("Calculated");
    expect(omissionText({ disclosure_id: null, code: "E4", title: "x", reason: "No site nearby.", kind: "not_material", esrs_topic: "E4" })).toBe("Not material: No site nearby.");
    expect(omissionText({ disclosure_id: 2, code: "305-3", title: "x", reason: "No approved value for 2026 yet.", kind: "missing" })).toBe("No approved value for 2026 yet.");
    expect(omissionText({ disclosure_id: 2, code: "2-25", title: "x", reason: "Not tracked in ESGLite.", kind: "not_tracked" })).toBe("Not tracked in ESGLite.");
    expect(omissionTitle({ disclosure_id: null, code: "E4", title: "Biodiversity", reason: "", kind: "not_material", esrs_topic: "E4" })).toBe("E4 Biodiversity and ecosystems");
    expect(pendingText({ pending_count: 1 })).toBe("1 value is pending review and isn't in this report yet.");
    expect(pendingText({ pending_count: 0 })).toBeNull();
  });
});
