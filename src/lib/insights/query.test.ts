import { describe, expect, it } from "vitest";
import { parseSites, queryKeyPart, readInsightsQuery, writeInsightsQuery } from "./query";

const now = new Date("2026-10-20T10:00:00Z");
const read = (s: string) => readInsightsQuery(new URLSearchParams(s), now);
const write = (s: string, patch: Parameters<typeof writeInsightsQuery>[1]) => writeInsightsQuery(new URLSearchParams(s), patch, now).toString();

describe("readInsightsQuery (01-contracts §9)", () => {
  it("defaults: this calendar year, CY, all sites, no pillar, compare with last year, no panel", () => {
    expect(read("")).toEqual({ query: { year: 2026, yearType: "CY", sites: "all", pillar: null, compare: "prior" }, panel: null });
  });

  it("reads every key", () => {
    expect(read("year=2024&yearType=FY&sites=13,11&pillar=social&compare=base&panel=bridge")).toEqual({
      query: { year: 2024, yearType: "FY", sites: [11, 13], pillar: "social", compare: "base" },
      panel: "bridge",
    });
  });

  it("ignores values that aren't in the contract", () => {
    expect(read("year=26&yearType=QY&sites=1,,2&pillar=E&compare=last&panel=hero")).toEqual(read(""));
    expect(read("year=1800").query.year).toBe(2026);
  });

  it("parses sites", () => {
    expect(parseSites(null)).toBe("all");
    expect(parseSites("all")).toBe("all");
    expect(parseSites("0")).toBe("all");
    expect(parseSites("5,3,5")).toEqual([3, 5]);
    expect(parseSites("a")).toBe("all");
  });
});

describe("writeInsightsQuery", () => {
  it("leaves defaults out of the URL", () => {
    expect(write("year=2024&yearType=FY&compare=base&sites=1", { year: 2026, yearType: "CY", compare: "prior", sites: "all" })).toBe("");
  });

  it("writes sorted sites, the pillar and the panel; clears them with null", () => {
    expect(write("", { sites: [3, 1], pillar: "environment", panel: "decoupling" })).toBe("sites=1%2C3&pillar=environment&panel=decoupling");
    expect(write("sites=1&pillar=social&panel=bridge", { pillar: null, panel: null })).toBe("sites=1");
    expect(write("", { sites: [] })).toBe("");
  });

  it("keeps other params", () => {
    expect(write("client=4", { year: 2025 })).toBe("client=4&year=2025");
  });

  it("round-trips", () => {
    const q = read("year=2024&yearType=FY&sites=11,13&pillar=governance&compare=base").query;
    expect(read(write("", q)).query).toEqual(q);
  });
});

describe("queryKeyPart", () => {
  it("changes with every filter", () => {
    const base = read("").query;
    const keys = [base, { ...base, year: 2025 }, { ...base, yearType: "FY" as const }, { ...base, sites: [1] }, { ...base, pillar: "social" as const }, { ...base, compare: "base" as const }].map((q) => JSON.stringify(queryKeyPart(q)));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
