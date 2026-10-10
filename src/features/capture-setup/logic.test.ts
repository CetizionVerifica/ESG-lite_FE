import { describe, expect, it } from "vitest";
import {
  type FormConfig,
  type LibraryColumn,
  type Site,
  blockingForms,
  buildColumnRows,
  buildCoverage,
  buildFormRows,
  calculationLabel,
  columnUsage,
  draftFrom,
  choiceId,
  editChoice,
  savedChoice,
  removedChoices,
  hasErrors,
  matchesColumn,
  matchesForm,
  newChoice,
  singleClient,
  sitesInView,
  slugify,
  suggestedFormName,
  toPayload,
  validateDraft,
  validateNewForm,
  wipesChoices,
} from "./logic";

const midal = { company_id: 1, name: "Midal Cables" };
const acme = { company_id: 2, name: "Acme" };
const fuel = { category_id: 10, category_name: "Stationary combustion", scope: "Scope 1" };
const power = { category_id: 20, category_name: "Purchased electricity", scope: "Scope 2" };
const goods = { category_id: 30, category_name: "Purchased goods", scope: "Scope 3" };
const waste = { category_id: 40, category_name: "Waste", scope: "Scope 3" };

const SITES: Site[] = [
  { site_id: 1, name: "Hidd", company: midal, categories: [goods, fuel, power] },
  { site_id: 2, name: "Sitra", company: midal, categories: [fuel] },
  { site_id: 3, name: "Dallas", company: acme, categories: [power] },
];
const amount: LibraryColumn = { pk_id: 100, column_name: "Amount", column_type: "number" };
const fuelType: LibraryColumn = { pk_id: 101, column_name: "Fuel type", column_type: "select", dropdown_options: [{ id: "diesel", label: "Diesel" }] };
const CONFIGS: FormConfig[] = [
  {
    pk_id: 7,
    config_name: "Hidd fuel",
    site: { site_id: 1, name: "Hidd" },
    category: fuel,
    columns: [amount, fuelType],
    emission_category_mapping: { diesel: "Diesel", lpg: "LPG" },
    extra_fields: [{}],
    calculation: { mode: "per_unit" },
  },
  { pk_id: 8, config_name: "Hidd waste", site: { site_id: 1, name: "Hidd" }, category: waste, columns: [amount] },
  { pk_id: 9, config_name: "Dallas power", site: { site_id: 3, name: "Dallas" }, category: power, columns: [] },
];

describe("forms list", () => {
  it("builds one row per form with its client and counts", () => {
    const [hidd] = buildFormRows(CONFIGS, SITES);
    expect(hidd).toMatchObject({ id: 7, siteName: "Hidd", clientName: "Midal Cables", categoryName: "Stationary combustion", fields: 2, mappings: 2, extraFields: 1, calculation: "Per unit" });
  });

  it("labels calculation modes in plain words", () => {
    expect(calculationLabel(null)).toBe("None");
    expect(calculationLabel({ mode: "per_method" })).toBe("Per method");
  });

  it("filters by client, site and search text", () => {
    const rows = buildFormRows(CONFIGS, SITES);
    expect(rows.filter((r) => matchesForm(r, { q: "", clientIds: [2], siteIds: [] })).map((r) => r.id)).toEqual([9]);
    expect(rows.filter((r) => matchesForm(r, { q: "waste", clientIds: [], siteIds: [1] })).map((r) => r.id)).toEqual([8]);
    expect(sitesInView(SITES, { clientIds: [1], siteIds: [] }).map((s) => s.site_id)).toEqual([1, 2]);
  });
});

describe("coverage matrix", () => {
  const midalSites = sitesInView(SITES, { clientIds: [1], siteIds: [] });

  it("orders categories by scope and marks configured, missing and not reported", () => {
    const cov = buildCoverage(midalSites, CONFIGS);
    // Waste has a form on Hidd although Hidd no longer reports it, so it still shows.
    expect(cov.categories.map((c) => c.category_name)).toEqual(["Stationary combustion", "Purchased electricity", "Purchased goods", "Waste"]);
    const hidd = cov.rows[0].cells.map((c) => c.state);
    expect(hidd).toEqual(["configured", "missing", "missing", "configured"]);
    const sitra = cov.rows[1].cells.map((c) => c.state);
    expect(sitra).toEqual(["missing", "na", "na", "na"]);
    expect(cov.rows[0].cells[0].formIds).toEqual([7]);
    expect([cov.configured, cov.missing]).toEqual([2, 3]);
  });

  it("only draws for one client at a time", () => {
    expect(singleClient(midalSites)?.name).toBe("Midal Cables");
    expect(singleClient(SITES)).toBeNull();
    expect(singleClient([])).toBeNull();
  });
});

describe("columns library", () => {
  it("counts the forms using each column", () => {
    const usage = columnUsage(CONFIGS);
    expect(usage.get(100)?.map((f) => f.name)).toEqual(["Hidd fuel", "Hidd waste"]);
    const rows = buildColumnRows([amount, fuelType], usage);
    expect(rows.map((r) => [r.typeLabel, r.optionCount, r.usedBy.length])).toEqual([
      ["Number", null, 2],
      ["Select", 1, 1],
    ]);
    expect(rows.filter((r) => matchesColumn(r, "fuel", [])).length).toBe(1);
    expect(rows.filter((r) => matchesColumn(r, "", ["number"])).map((r) => r.pk_id)).toEqual([100]);
  });

  it("derives stored values from labels until edited", () => {
    expect(slugify("  Recycled paper (EU) ")).toBe("recycled_paper_eu");
    expect(slugify("Électricité")).toBe("electricite");
    expect(newChoice("Diesel").auto).toBe(true);
    expect(newChoice("Diesel", "DSL").auto).toBe(false);
    expect(draftFrom(fuelType).choices[0]).toMatchObject({ label: "Diesel", value: "diesel", auto: false });
    expect(editChoice(newChoice("Dies"), { label: "Diesel" }).value).toBe("diesel");
  });

  it("keeps the stored id of a saved choice when its label changes", () => {
    const saved = draftFrom({ ...fuelType, dropdown_options: [{ id: "diesel", label: "Diesel" }, { id: 7, label: "LPG" }] });
    const renamed = saved.choices.map((c) => editChoice(c, { label: `${c.label} (road)` }));
    expect(renamed.map((c) => c.value)).toEqual(["diesel", "7"]);
    // A saved stored value is read-only, and goes back exactly as stored.
    expect(choiceId(savedChoice({ id: " road ", label: "Road" }))).toBe(" road ");
    expect(editChoice(savedChoice({ id: "x", label: "X" }), { label: "Y" }, true).label).toBe("X");
    expect(editChoice(renamed[0], { value: "dsl" }).value).toBe("diesel");
    expect(toPayload({ ...saved, choices: renamed }).dropdown_options).toEqual([
      { id: "diesel", label: "Diesel (road)" },
      { id: 7, label: "LPG (road)" },
    ]);
  });

  it("lists saved choices a Select draft drops", () => {
    const d = draftFrom({ ...fuelType, dropdown_options: [{ id: "diesel", label: "Diesel" }, { id: 7, label: "LPG" }] });
    const col = { ...fuelType, dropdown_options: [{ id: "diesel", label: "Diesel" }, { id: 7, label: "LPG" }] };
    expect(removedChoices(col, { ...d, choices: [d.choices[0], newChoice("LPG")] })).toEqual([{ id: 7, label: "LPG" }]);
    expect(removedChoices(col, d)).toEqual([]);
    expect(removedChoices(col, { ...d, type: "text", choices: [] })).toEqual([]);
  });

  it("validates name, type and choices", () => {
    const d = { name: "fuel TYPE", type: "select" as const, choices: [newChoice("Diesel"), newChoice("Diesel"), newChoice("")] };
    const e = validateDraft(d, [fuelType]);
    expect(e.name).toMatch(/already exists/);
    expect(Object.values(e.rows)).toEqual(['Same stored value as "Diesel".', "Enter a label or remove this choice."]);
    expect(hasErrors(validateDraft({ name: "Litres", type: "number", choices: [] }, [fuelType]))).toBe(false);
    expect(validateDraft({ name: "", type: null, choices: [] }, []).type).toBe("Choose a type.");
  });

  it("sends choices only for Select columns", () => {
    expect(toPayload({ name: " Fuel ", type: "select", choices: [newChoice("Diesel")] })).toEqual({
      column_name: "Fuel",
      column_type: "select",
      dropdown_options: [{ id: "diesel", label: "Diesel" }],
    });
    expect(toPayload({ name: "Fuel", type: "text", choices: [newChoice("Diesel")] }).dropdown_options).toBeNull();
  });

  it("warns before a type change wipes choices", () => {
    expect(wipesChoices(fuelType, { ...draftFrom(fuelType), type: "text" })).toBe(1);
    expect(wipesChoices(fuelType, draftFrom(fuelType))).toBe(0);
    expect(wipesChoices(null, { name: "x", type: "text", choices: [] })).toBe(0);
  });

  it("reads the forms the server says block a delete", () => {
    const err = { response: { status: 400, data: { associatedConfigs: [{ pk_id: 7, config_name: "Hidd fuel" }] } } };
    expect(blockingForms(err)).toEqual([{ id: 7, name: "Hidd fuel" }]);
    expect(blockingForms(new Error("x"))).toEqual([]);
  });
});

describe("new form", () => {
  it("suggests a name and rejects a duplicate on the same site and category", () => {
    expect(suggestedFormName(SITES[0], fuel)).toBe("Hidd · Stationary combustion");
    expect(validateNewForm({ name: "hidd FUEL", siteId: 1, categoryId: 10 }, CONFIGS).name).toMatch(/already have/);
    expect(validateNewForm({ name: "Hidd fuel", siteId: 2, categoryId: 10 }, CONFIGS)).toEqual({});
    expect(validateNewForm({ name: "", siteId: null, categoryId: null }, CONFIGS)).toEqual({
      name: "Enter a form name.",
      siteId: "Choose a site.",
      categoryId: "Choose a category.",
    });
  });
});
