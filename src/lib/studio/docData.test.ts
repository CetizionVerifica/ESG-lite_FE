import { describe, expect, it } from "vitest";
import ghg from "../../test/fixtures/studio/ghg-doc.json";
import sustainability from "../../test/fixtures/studio/sustainability-doc.json";
import type { BrandKit, ReportDoc, ResolveResponse } from "./contracts";
import { brandFromKit, docBindings, docFlows, docRenderData, docTokens, periodLabel, resolveRequestFor } from "./docData";
import { designThisReportLink } from "./designLink";
import { bindingKey, tokenKey } from "./render";

const GHG = ghg as unknown as ReportDoc;

describe("docData", () => {
  it("collects element bindings and chips in page order, as the backend resolves them", () => {
    const bindings = docBindings(GHG);
    const tokens = docTokens(GHG);
    // p-cover.total, then the summary's split chart, … (element order); chips from text and flow sections.
    expect(bindings[0]).toEqual({ source: "ghg", metric: "total", years: { last: 1 }, sites: "all", compare: "prior" });
    expect(tokens[0].attrs.binding).toEqual({ source: "ghg", metric: "scope1", years: { last: 1 }, sites: "all" });
    expect(tokens[1].attrs.measure).toBe("change_pct");
    const req = resolveRequestFor(GHG);
    expect(req).toMatchObject({ kind: "ghg", year: 2025, yearType: "CY", sites: "all" });
    expect(req.bindings).toHaveLength(bindings.length);
    expect(docBindings(sustainability as unknown as ReportDoc).length).toBeGreaterThan(0);
  });

  it("zips the /resolve answer into RenderData by binding and token key", () => {
    const bindings = docBindings(GHG);
    const tokens = docTokens(GHG);
    const res: ResolveResponse = {
      values: bindings.map((_, i) => ({ source: "ghg", display: `v${i}`, value: i, unit: "tCO₂e" })),
      tokens: tokens.map((_, i) => ({ source: "ghg", display: `t${i}`, value: i, unit: "tCO₂e" })),
      dataHash: "sha256:x",
      unavailable: [],
    };
    const data = docRenderData(GHG, res);
    expect(data?.values[bindingKey(bindings[0] as never)]?.display).toBe("v0");
    expect(data?.tokens[tokenKey(tokens[0].attrs as never)]?.display).toBe("t0");
    expect(docRenderData(GHG, null)).toBeNull();
  });

  it("brandFromKit maps colours, fonts, look and logo", () => {
    const kit = { colors: { primary: "#112233", accent: "#445566", coverFrom: "#000000", coverTo: "#111111" }, defaultLook: "night", fonts: { heading: "fraunces", body: null }, logos: { primary: "https://x/logo.png", onDark: null } } as unknown as BrandKit;
    expect(brandFromKit(kit)).toEqual({ primary: "#112233", accent: "#445566", look: "night", fontHeading: "fraunces", fontBody: null, logoUrl: "https://x/logo.png" });
    expect(brandFromKit(null)).toBeNull();
  });

  it("periodLabel and the Design this report link", () => {
    expect(periodLabel("FY", 2026)).toBe("FY 2025–26");
    expect(periodLabel("CY", 2025)).toBe("2025");
    expect(designThisReportLink({ year: 2026, yearType: "FY", compareYear: 2025, siteIds: [2, 1, 2] })).toBe("/studio/new?kind=ghg&format=a4&purpose=report&year=2026&yearType=FY&compareYear=2025&siteIds=1%2C2");
    expect(designThisReportLink({ year: 2025, yearType: "CY", compareYear: 2025 })).toBe("/studio/new?kind=ghg&format=a4&purpose=report&year=2025&yearType=CY");
  });
});

describe("server-filled flow sections", () => {
  const doc = ghg as unknown as ReportDoc;

  it("asks /resolve for the factor table and the Scope 3 categories by section id", () => {
    expect(docFlows(doc)).toEqual([
      { id: "p-categories", flowType: "scope3_categories" },
      { id: "p-factors", flowType: "ghg_factor_table" },
    ]);
    expect(resolveRequestFor(doc).flows).toEqual(docFlows(doc));
    expect(resolveRequestFor(sustainability as unknown as ReportDoc).flows).toBeUndefined();
  });

  it("passes the returned rows to the renderer, so the sections aren't 'Not reported'", () => {
    const req = resolveRequestFor(doc);
    const res = {
      values: req.bindings.map(() => ({ display: "1", value: 1 })),
      tokens: req.tokens.map(() => ({ display: "1", value: 1 })),
      dataHash: "sha256:x",
      unavailable: [],
      flow: { "p-factors": { columns: ["Factor"], rows: [{ cells: ["Diesel"] }] } },
      scope3: { "p-categories": [{ n: 6, name: "Business travel", status: "reported", display: "3.25" }] },
    } as unknown as ResolveResponse;
    const data = docRenderData(doc, res);
    expect(data?.flow?.["p-factors"]?.rows).toHaveLength(1);
    expect(data?.scope3?.["p-categories"]?.[0]).toMatchObject({ n: 6, status: "reported" });
  });
});
