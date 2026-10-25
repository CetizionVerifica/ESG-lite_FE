import { describe, expect, it } from "vitest";
import type { ReportTemplate } from "../../../lib/studio/contracts";
import { blankFormatFor, companySites, createBody, filterTemplates, initialState, scopeRefusal, SITES_SCOPE_MESSAGE, toggleScopeSite, yearOptions } from "./logic";

const NOW = new Date(2026, 9, 20);
const t = (id: number, purpose: ReportTemplate["purpose"], format: ReportTemplate["format"]): ReportTemplate => ({ id, companyId: null, kind: "ghg", purpose, format, name: `T${id}`, tags: [], version: 1, thumbnailUrl: null, pageCount: 3 });

describe("new design logic", () => {
  it("initialState reads the GHG report's filters from the URL", () => {
    const s = initialState(new URLSearchParams("kind=ghg&year=2026&yearType=FY&compareYear=2024&siteIds=2,1,x&format=a4&purpose=report"), NOW);
    expect(s).toMatchObject({ kind: "ghg", year: 2026, yearType: "FY", compareYear: 2024, sites: [2, 1], formatFilter: "report", frameworks: ["GHGP"], ai: true, templateId: null });
    const d = initialState(new URLSearchParams(""), NOW);
    expect(d).toMatchObject({ kind: "ghg", year: 2026, yearType: "FY", compareYear: null, sites: "all", formatFilter: "all" });
    expect(initialState(new URLSearchParams("kind=sustainability&template=5&yearType=CY&compareYear=2030"), NOW)).toMatchObject({ kind: "sustainability", templateId: 5, year: 2025, compareYear: null, frameworks: ["GRI"] });
    expect(initialState(new URLSearchParams("format=slide_16_9&template=blank"), NOW)).toMatchObject({ formatFilter: "deck", templateId: "blank", blankFormat: "slide_16_9" });
  });

  it("filters templates by format and purpose; the blank card follows the filter", () => {
    const list = [t(1, "report", "a4"), t(2, "deck", "slide_16_9"), t(3, "summary", "a4"), t(4, "social", "square")];
    expect(filterTemplates(list, "all").map((x) => x.id)).toEqual([1, 2, 3, 4]);
    expect(filterTemplates(list, "deck").map((x) => x.id)).toEqual([2]);
    expect(filterTemplates(list, "summary").map((x) => x.id)).toEqual([3]);
    expect(filterTemplates(list, "social").map((x) => x.id)).toEqual([4]);
    expect(blankFormatFor("deck", "a4")).toBe("slide_16_9");
    expect(blankFormatFor("report", "slide_16_9")).toBe("a4");
    expect(yearOptions("CY", NOW)).toEqual([2026, 2025, 2024, 2023, 2022, 2021, 2020]);
  });

  it("createBody sends the choices, inputs as a patch, and the blank format only for blank", () => {
    const s = initialState(new URLSearchParams("year=2026&yearType=FY&compareYear=2025&siteIds=1"), NOW);
    expect(() => createBody(s)).toThrow();
    const body = createBody({
      ...s,
      templateId: 7,
      frameworks: ["GHGP", "ISO14064"],
      title: "  Our inventory ",
      inputs: { responsible_person: { value: "Asha", source: "typed", updatedBy: null, updatedAt: "x" } },
    });
    expect(body).toEqual({ kind: "ghg", templateId: 7, year: 2026, yearType: "FY", sites: [1], frameworks: ["GHGP", "ISO14064"], compareYear: 2025, title: "Our inventory", inputs: { responsible_person: { value: "Asha", source: "typed" } }, ai: true });
    expect(createBody({ ...s, templateId: "blank", blankFormat: "slide_16_9" }).format).toBe("slide_16_9");
  });
});

describe("scope step sites (#243)", () => {
  const midal = { company_id: 1 };
  const sites = [
    { site_id: 17, name: "Saudi Arabia", company: midal },
    { site_id: 24, name: "Chieron - Main Site", company: { company_id: 5 } },
    { site_id: 18, name: "Mozambique", company: midal },
    { site_id: 99, name: "No company on it" },
  ];

  it("companySites keeps the sites of the company being worked in", () => {
    expect(companySites(sites, 1).map((s) => s.site_id)).toEqual([17, 18, 99]);
    expect(companySites(sites, null)).toEqual(sites);
  });

  it("toggleScopeSite: nothing left is all sites only when that's allowed", () => {
    expect(toggleScopeSite("all", 17, true)).toEqual([17]);
    expect(toggleScopeSite([17, 18], 17, true)).toEqual([18]);
    expect(toggleScopeSite([17], 17, true)).toBe("all");
    expect(toggleScopeSite([17], 17, false)).toEqual([]);
  });

  it("scopeRefusal words the server's site answers and ignores the rest", () => {
    const res = (code: string, details?: unknown) => ({ response: { status: code === "DS_SITES_SCOPE" ? 403 : 404, data: { code, details } } });
    expect(scopeRefusal(res("DS_SITES_SCOPE"), sites)).toBe(SITES_SCOPE_MESSAGE);
    expect(scopeRefusal(res("DS_DOC_NOT_FOUND", { sites: [24] }), sites)).toBe("You can't report on Chieron - Main Site in this company. Untick it.");
    expect(scopeRefusal(res("DS_DOC_NOT_FOUND", { sites: [24, 50] }), sites)).toBe("You can't report on some of these sites in this company. Pick your own sites.");
    expect(scopeRefusal(res("DS_DOC_NOT_FOUND"), sites)).toBeNull();
    expect(scopeRefusal(new Error("Network Error"), sites)).toBeNull();
  });
});
