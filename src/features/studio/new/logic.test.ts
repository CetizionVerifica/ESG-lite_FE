import { describe, expect, it } from "vitest";
import type { ReportTemplate } from "../../../lib/studio/contracts";
import { blankFormatFor, createBody, filterTemplates, initialState, yearOptions } from "./logic";

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
