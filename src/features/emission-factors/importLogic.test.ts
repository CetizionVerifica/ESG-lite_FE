import { describe, expect, it } from "vitest";
import {
  type ImportRow,
  type JobResult,
  type ParseResult,
  detectedColumns,
  distinctYears,
  groupsOf,
  initialMap,
  needsValueColumn,
  parseFactor,
  parseSimpleRows,
  planUpload,
  previewRows,
  rowProblem,
  rowsFromParse,
  schemaOverride,
  totals,
} from "./importLogic";
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
  it("reads comma thousands grouping but reports a decimal comma", () => {
    expect([1.5, "2.68", " 1,234.5 ", "1,430", "-0.5", ".5", "1e-3"].map(parseFactor)).toEqual([1.5, 2.68, 1234.5, 1430, -0.5, 0.5, 0.001]);
    for (const bad of ["0,5", "1,23", "12,34,567", "2.68 kg", "", "1.2.3", null]) expect(parseFactor(bad)).toBeNaN();
    const { rows, errors } = parseSimpleRows([{ year: 2024, factor_value: "0,5" }]);
    expect(rows).toEqual([]);
    expect(errors).toEqual(["Row 2: year or factor isn't a number."]);
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
  const r = (site: string, siteId: number, created: number, error: string | null = null): JobResult => ({ site, siteId, category: "Fuel", categoryId: 1, created, skipped: 1, problems: [], error });
  it("adds up created, skipped and failed sites", () => {
    const results = [r("Hidd", 1, 3), r("Sitra", 2, 0), r("Pune", 3, 0, "Site not found")];
    expect(totals(results)).toEqual({ created: 3, skipped: 3, failed: 1 });
  });
});

describe("AI read", () => {
  const schema = {
    layout_type: "simple",
    descriptor_columns: [{ column_index: 0, header_name: "Activity" }],
    unit_column: { column_index: 2, header_name: "Unit" },
    source_column: null,
    years: [{ year: 2024, value_column: 3 }],
  };
  const columns = [
    { column_index: 0, header_name: "Activity", sample_values: ["Diesel"] },
    { column_index: 1, header_name: "Fuel", sample_values: ["Gas oil"] },
    { column_index: 2, header_name: "Unit", sample_values: ["litres"] },
    { column_index: 3, header_name: "kg CO2e", sample_values: ["2.68"] },
  ];
  const parse = (over: Partial<ParseResult> = {}): ParseResult => ({
    factors: [
      { year: 2024, factor_value: 2.68, denominator_unit: "litres", emission_category_name: "Fuels - Diesel", parent_category: "Fuels" },
      { year: 2024, factor_value: 0.2, denominator_unit: null, emission_category_name: "Bio - Wood", parent_category: "Bio" },
    ],
    schema_detected: schema,
    warnings: [],
    available_years: [2024],
    parent_categories: ["Fuels", "Bio"],
    category_suggestions: [
      { parent_category: "Fuels", suggested_category_id: 1, suggested_category_name: "Fuel", confidence: "high" },
      { parent_category: "Bio", suggested_category_id: 3, suggested_category_name: "Electricity", confidence: "low" },
    ],
    upload_id: 9,
    sheet_names: ["2024"],
    available_columns: columns,
    ...over,
  });

  it("keeps groups only when the sheet has more than one", () => {
    expect(rowsFromParse(parse()).map((r) => [r.key, r.group, r.denominator_unit])).toEqual([
      ["a1", "Fuels", "litres"],
      ["a2", "Bio", ""],
    ]);
    expect(rowsFromParse(parse({ parent_categories: ["Fuels"] }))[0].group).toBeNull();
    expect(groupsOf(parse({ parent_categories: [] }))).toEqual([""]);
  });
  it("takes high and medium suggestions the target allows", () => {
    expect(initialMap(parse(), [1, 3])).toEqual({ Fuels: 1, Bio: null });
    expect(initialMap(parse(), [3])).toEqual({ Fuels: null, Bio: null });
    expect(initialMap(parse({ parent_categories: ["Fuels"] }), [1])).toEqual({ "": 1 });
  });
  it("builds an override only when columns change, and column 0 counts", () => {
    const d = detectedColumns(schema);
    expect(d).toEqual({ name: 0, value: 3, unit: 2, source: null });
    expect(schemaOverride(schema, d, columns)).toBeNull();
    const o = schemaOverride(schema, { ...d, name: 1, source: 0 }, columns)!;
    expect(o.descriptor_columns).toEqual([{ column_index: 1, header_name: "Fuel" }]);
    expect(o.source_column).toEqual({ column_index: 0, header_name: "Activity" });
    expect(o.years).toEqual([{ year: 2024, value_column: 3 }]);
  });
  it("sub-column layouts read one column per year, so no factor column is needed", () => {
    const sub = { ...schema, layout_type: "sub_columns", years: [{ year: 2024, value_column: null, primary_sub_column: "Total" }] };
    expect(needsValueColumn(sub)).toBe(false);
    expect(detectedColumns(sub).value).toBeNull();
    expect(schemaOverride(sub, { ...detectedColumns(sub), unit: null }, columns)!.years).toEqual(sub.years);
  });
});
