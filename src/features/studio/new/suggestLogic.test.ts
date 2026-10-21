import { describe, expect, it } from "vitest";
import type { ReportDoc } from "../../../lib/studio/contracts";
import { defaultBrief, layoutName, pageNames, previewPages, previewTemplateDoc, suggestBody } from "./suggestLogic";

const state = { kind: "ghg" as const, year: 2026, yearType: "FY" as const, sites: [1] as number[] | "all", frameworks: ["GHGP", "GRI"] as never[] };

describe("AT-1 suggest logic", () => {
  it("defaultBrief: the kind's purpose and only the kind's frameworks", () => {
    expect(defaultBrief(state)).toEqual({ purpose: "ghg_inventory", frameworks: ["GHGP"], audience: "verifier", length: "medium", tone: "formal" });
    expect(defaultBrief({ kind: "sustainability", frameworks: ["GRI"] }).purpose).toBe("sustainability_report");
  });

  it("suggestBody: scope from the flow, trimmed note, an empty note left out, a purpose of the other kind replaced", () => {
    const b = suggestBody(state, { purpose: "ghg_inventory", frameworks: ["GHGP"], audience: "board", length: "short", note: "  Keep it formal.  " });
    expect(b).toEqual({ kind: "ghg", year: 2026, yearType: "FY", sites: [1], brief: { purpose: "ghg_inventory", frameworks: ["GHGP"], audience: "board", length: "short", note: "Keep it formal." } });
    expect(suggestBody(state, { purpose: "sustainability_report", frameworks: [], audience: "board", length: "short", note: "   " }).brief).toEqual({ purpose: "ghg_inventory", frameworks: [], audience: "board", length: "short" });
  });

  it("pageNames and layoutName", () => {
    const doc = { pages: [{ id: "p1", name: "Cover" }, { id: "p2", name: "Boundary" }] } as unknown as ReportDoc;
    expect(pageNames(doc, ["p2", "nope"])).toEqual(["Boundary"]);
    expect(pageNames(null, ["p2"])).toEqual([]);
    expect(layoutName("ghg-inventory/data_quality")).toBe("Data quality");
  });

  it("previewTemplateDoc: the flow's period and sites, placeholders filled, nothing else changed", () => {
    const tdoc = {
      schemaVersion: 2,
      kind: "ghg",
      purpose: "report",
      format: "a4",
      meta: { title: "{{company}} GHG inventory {{period}}", year: 2025, yearType: "CY", sites: "all", frameworks: ["GHGP"], language: "en" },
      design: {},
      pages: [
        { id: "c", kind: "freeform", name: "Cover", background: {}, elements: [] },
        { id: "t", kind: "flow", name: "Contents", flowType: "toc", options: {} },
      ],
      assets: [],
    } as unknown as ReportDoc;
    const d = previewTemplateDoc(tdoc, { ...state, frameworks: ["ISO14064"] as never[] }, "Midal Cables");
    expect(d.meta).toMatchObject({ year: 2026, yearType: "FY", sites: [1], frameworks: ["ISO14064"] });
    expect(d.meta.title).toContain("Midal Cables GHG inventory");
    expect(tdoc.meta.year).toBe(2025);
    expect(previewPages(d).map((p) => p.id)).toEqual(["c"]);
  });
});
