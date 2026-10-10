import { describe, expect, it } from "vitest";
import { type ImportRow, type JobResult, distinctYears, formTargets, parseSimpleRows, planUpload, previewRows, rowProblem, totals } from "./importLogic";
import type { Site } from "./logic";

const cat = (id: number, name: string) => ({ category_id: id, category_name: name, scope: "Scope 1" });
const FUEL = cat(1, "Fuel");
const POWER = cat(3, "Electricity");
const SITES: Site[] = [
  { site_id: 1, name: "Hidd", company: { company_id: 10, name: "Midal" }, categories: [FUEL, POWER] },
  { site_id: 2, name: "Sitra", company: { company_id: 10, name: "Midal" }, categories: [POWER] },
  { site_id: 3, name: "Pune", company: { company_id: 20, name: "Gulf" }, categories: [FUEL] },
];
const row = (key: string, patch: Partial<ImportRow> = {}): ImportRow => ({
  key,
  year: 2024,
  factor_value: 2.68,
  denominator_unit: "litre",
  source: "DEFRA",
  emission_category_name: "Diesel",
  group: null,
  excluded: false,
  ...patch,
});

describe("simple sheet", () => {
  it("reads the old Bulk Upload headers and keeps zero factors", () => {
    const { rows, errors } = parseSimpleRows([
      { year: 2024, factor_value: 2.68, unit: "litre ", source: "DEFRA", emission_category_name: "Diesel" },
      { Year: "2023", "Factor Value": "1,430", Unit: "kg", "Emission Category": "R-134a" },
      { year: 2024, factor: 0 },
    ]);
    expect(errors).toEqual([]);
    expect(rows.map((r) => [r.key, r.year, r.factor_value, r.denominator_unit, r.emission_category_name])).toEqual([
      ["r2", 2024, 2.68, "litre", "Diesel"],
      ["r3", 2023, 1430, "kg", "R-134a"],
      ["r4", 2024, 0, "", ""],
    ]);
  });
  it("reports rows with a missing or non-numeric year or factor by Excel row", () => {
    const { rows, errors } = parseSimpleRows([{ year: 2024 }, { year: "soon", factor_value: 1 }, { year: 2024, factor_value: " " }]);
    expect(rows).toEqual([]);
    expect(errors).toEqual(["Row 2: year or factor is missing.", "Row 3: year or factor isn't a number.", "Row 4: year or factor is missing."]);
  });
});

describe("preview", () => {
  it("flags rows that can't be saved", () => {
    expect(rowProblem(row("r2"))).toBeNull();
    expect(rowProblem(row("r2", { year: NaN }))).toMatch(/Year/);
    expect(rowProblem(row("r2", { factor_value: -1 }))).toMatch(/0 or more/);
    expect(rowProblem(row("r2", { factor_value: 2_000_000 }))).toMatch(/below/);
  });
  it("filters by year and search and lists years newest first", () => {
    const rows = [row("r2"), row("r3", { year: 2023, emission_category_name: "Petrol" }), row("r4", { source: "IPCC" })];
    expect(previewRows(rows, { group: null, year: 2023, q: "" }).map((r) => r.key)).toEqual(["r3"]);
    expect(previewRows(rows, { group: null, year: null, q: "ipcc" }).map((r) => r.key)).toEqual(["r4"]);
    expect(distinctYears(rows)).toEqual([2024, 2023]);
  });
});

describe("upload plan", () => {
  const categories = [FUEL, POWER];
  it("one site: sends included, valid rows with the full name twice and no blank fields", () => {
    const rows = [row("r2"), row("r3", { excluded: true }), row("r4", { factor_value: NaN }), row("r5", { emission_category_name: "", source: " " })];
    const plan = planUpload(rows, { "": 1 }, { kind: "site", siteId: 1 }, SITES, categories);
    expect(plan.rowCount).toBe(2);
    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0].factors).toEqual([
      { site_id: 1, category_id: 1, year: 2024, factor_value: 2.68, denominator_unit: "litre", source: "DEFRA", emission_category_name: "Diesel", global_category_name: "Diesel" },
      { site_id: 1, category_id: 1, year: 2024, factor_value: 2.68, denominator_unit: "litre" },
    ]);
  });
  it("all of a client's sites: only those that report the category; the rest are listed", () => {
    const plan = planUpload([row("r2")], { "": 3 }, { kind: "client", clientId: 10 }, SITES, categories);
    expect(plan.jobs.map((j) => j.site.name)).toEqual(["Hidd", "Sitra"]);
    expect(plan.notAssigned).toEqual([]);
    const fuel = planUpload([row("r2")], { "": 1 }, { kind: "client", clientId: 10 }, SITES, categories);
    expect(fuel.jobs.map((j) => j.site.name)).toEqual(["Hidd"]);
    expect(fuel.notAssigned).toEqual([{ site: "Sitra", category: "Fuel" }]);
    expect(fuel.rowCount).toBe(1);
  });
  it("groups without a category are skipped", () => {
    const rows = [row("r2", { group: "Fuels" }), row("r3", { group: "Bioenergy" })];
    const plan = planUpload(rows, { Fuels: 1, Bioenergy: null }, { kind: "site", siteId: 1 }, SITES, categories);
    expect(plan.unmappedGroups).toEqual(["Bioenergy"]);
    expect(plan.rowCount).toBe(1);
  });
});

describe("result", () => {
  const r = (site: string, siteId: number, created: number, error: string | null = null): JobResult => ({ site, siteId, category: "Fuel", categoryId: 1, created, skipped: 1, error });
  it("adds up and offers forms only where factors were added", () => {
    const results = [r("Hidd", 1, 3), r("Sitra", 2, 0), r("Pune", 3, 0, "Site not found")];
    expect(totals(results)).toEqual({ created: 3, skipped: 3, failed: 1 });
    expect(formTargets(results)).toEqual([{ siteId: 1, site: "Hidd", categoryId: 1, category: "Fuel" }]);
  });
});
