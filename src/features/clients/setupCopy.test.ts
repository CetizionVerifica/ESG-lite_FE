import { describe, expect, it } from "vitest";
import { type CopyReport, EMPTY_COPY, availableYears, defaultFactorYears, parseBundleFile, sourceName, summarize, toRequest } from "./setupCopy";

const bundle = { version: 1, source: { company_id: 1, company_name: "Midal Cables", taken_at: "2026-10-13T00:00:00Z" }, sites: [{ key: "Hidd", name: "Hidd", country_name: "Bahrain", factors: [], forms: [] }, { key: "Askar", name: "Askar", country_name: null, factors: [], forms: [] }], mappings: [], threshold: null };
const site = (key: string, kind: "create" | "reuse" | "skip", years: number[], forms = 0, factors = 0): CopyReport["sites"][number] => ({
  key,
  name: key,
  target: { kind, site_id: kind === "skip" ? null : 9, site_name: kind === "skip" ? null : key },
  country_name: null,
  available_factor_years: years,
  counts: { categories: { create: 0, skip: 0 }, units: { create: 1, skip: 0 }, forms: { create: forms, skip: 0 }, factors: { create: factors, skip: 2 }, products: { create: 0, skip: 0 } },
  skipped: { forms: [], units: [], products: [] },
  warnings: [],
});
const report: CopyReport = {
  source: { company_id: 1, company_name: "Midal Cables" },
  target: { company_id: null, company_name: null },
  sites: [site("Hidd", "create", [2025, 2024], 3, 10), site("Askar", "reuse", [2024, 2023], 2, 5)],
  mappings: { create: 4, skip: 1 },
  threshold: "create",
  material_factors: { create: 0, skip: 0, licensed_excluded: 2 },
  columns_created: [],
  errors: [],
  warnings: [],
  totals: { create: 26, skip: 5 },
};

describe("toRequest", () => {
  it("is null without a source", () => {
    expect(toRequest(EMPTY_COPY, { onboarding: true })).toBeNull();
  });
  it("sends a client source with the include flags and no site list, letting the backend create every site", () => {
    const body = toRequest({ ...EMPTY_COPY, source: { kind: "client", companyId: 1, name: "Midal" }, factorYears: [2025] }, { onboarding: false });
    expect(body).toEqual({ source: { company_id: 1 }, options: { include: EMPTY_COPY.include, factor_years: [2025], form_conflict: "skip" } });
  });
  it("during onboarding the first source site fills the main site and the rest are created, whatever the source", () => {
    const body = toRequest({ ...EMPTY_COPY, source: { kind: "file", bundle, fileName: "midal.json" }, sites: { Hidd: "skip" } }, { onboarding: true });
    expect(body?.source).toEqual({ bundle });
    expect(body?.options).toMatchObject({ first_site: "main" });
    expect(body?.options).not.toHaveProperty("sites");
  });
  it("on the client page the chosen site targets are sent as they are", () => {
    const body = toRequest({ ...EMPTY_COPY, source: { kind: "client", companyId: 1, name: "Midal" }, sites: { Hidd: 7, Askar: "skip" } }, { onboarding: false });
    expect((body?.options as { sites: unknown }).sites).toEqual([
      { key: "Hidd", target: 7 },
      { key: "Askar", target: "skip" },
    ]);
  });
});

describe("years", () => {
  it("lists the source's years newest first across its sites", () => {
    expect(availableYears(report)).toEqual([2025, 2024, 2023]);
    expect(availableYears(undefined)).toEqual([]);
  });
});

describe("summarize", () => {
  it("names what will be created and leaves out zero items", () => {
    expect(summarize(report)).toBe("1 new site, 5 forms, 2 units, 15 factors, 4 mappings, threshold");
    expect(summarize({ ...report, sites: [], mappings: { create: 0, skip: 0 }, threshold: "keep" })).toBe("Nothing to copy");
  });
});

describe("parseBundleFile", () => {
  it("rejects non-JSON, other JSON and other versions", () => {
    expect(parseBundleFile("nope")).toHaveProperty("error");
    expect(parseBundleFile('{"a":1}')).toHaveProperty("error");
    expect(parseBundleFile(JSON.stringify({ ...bundle, version: 2 }))).toEqual({ error: "This setup file is version 2; this app reads version 1." });
  });
  it("accepts a downloaded file", () => {
    expect(parseBundleFile(JSON.stringify(bundle))).toEqual({ bundle });
    expect(sourceName({ kind: "file", bundle, fileName: "midal.json" })).toBe("Midal Cables (file midal.json)");
    expect(sourceName({ kind: "client", companyId: 1, name: "Midal" })).toBe("Midal");
  });
});

describe("defaultFactorYears", () => {
  it("picks the source's newest year and the current year, newest first", () => {
    expect(defaultFactorYears([2023, 2026, 2024, 2025], new Date("2026-10-13"))).toEqual([2026]);
    expect(defaultFactorYears([2023, 2024, 2025], new Date("2026-10-13"))).toEqual([2025]);
    expect(defaultFactorYears([2024, 2025, 2026, 2027], new Date("2026-10-13"))).toEqual([2027, 2026]);
    expect(defaultFactorYears([], new Date("2026-10-13"))).toEqual([]);
  });
});
