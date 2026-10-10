import { describe, expect, it } from "vitest";
import { type ColumnConfigProposal, type ProposedConfigGroup, buildGroup, buildSelection, combine, defaultFormName, defaultSelection, depthsFor, missingUnits, rulePaths, splitName } from "./autoGenerate";

const group = (over: Partial<ProposedConfigGroup> = {}): ProposedConfigGroup => ({
  denominator_unit: "km",
  pattern: "THREE_DIM",
  columns: [],
  column_options: {},
  column_dependencies: {},
  dependent_options: {},
  emission_category_mapping: {},
  ef_names: ["Road - Van - Diesel", "Road - Van - Petrol", "Road - Car - Diesel", "Air - Short - -"],
  column_names_by_dim: {
    2: { activity_column_name: "distance", ef_names: ["Road - Van", "Air - Short"], columns: [{ existing_id: 4, column_name: "vehicle", column_type: "select", is_new: false }, { existing_id: null, column_name: "fuel", column_type: "select", is_new: true }] },
    3: {
      activity_column_name: "distance",
      columns: [
        { existing_id: 3, column_name: "mode", column_type: "select", is_new: false },
        { existing_id: 4, column_name: "vehicle", column_type: "select", is_new: false },
        { existing_id: null, column_name: "fuel", column_type: "select", is_new: true },
        { existing_id: 9, column_name: "distance", column_type: "number", is_new: false },
      ],
    },
  },
  ...over,
});

const proposal = (configs: ProposedConfigGroup[]): ColumnConfigProposal => ({
  config_name: "Site A - Business travel",
  site_id: 1,
  category_id: 2,
  site_name: "Site A",
  category_name: "Business travel",
  configs,
  proposed_units: [
    { unit_name: "km", already_exists: true },
    { unit_name: "tonne.km", already_exists: false },
  ],
  existing_config_ids: [],
});

describe("splitName", () => {
  it("splits on ' - ' and keeps the first levels", () => expect(splitName("Road - Van - Diesel", 2)).toEqual(["Road", "Van"]));
  it("pads short names in front and names blanks Unknown", () => {
    expect(splitName("Diesel", 3)).toEqual(["Unknown", "Unknown", "Diesel"]);
    expect(splitName("Air - Short - -", 3)).toEqual(["Air", "Short", "Unknown"]);
  });
});

describe("buildGroup", () => {
  it("builds dependent choices and one rule per factor name", () => {
    const g = buildGroup(group(), 3);
    expect(g.columns.map((c) => c.column_name)).toEqual(["mode", "vehicle", "fuel", "distance"]);
    expect(g.options.mode.map((o) => o.id)).toEqual(["Air", "Road"]);
    expect(g.deps).toEqual({ vehicle: "mode", fuel: "vehicle" });
    expect(g.depOpts.vehicle.Road.map((o) => o.id)).toEqual(["Car", "Van"]);
    expect(g.depOpts.fuel.Van.map((o) => o.id)).toEqual(["Diesel", "Petrol"]);
    expect(g.mappings["Road|Van|Diesel"]).toBe("Road - Van - Diesel");
    expect(g.mappings["Air|Short|Unknown"]).toBe("Air - Short - -");
  });
  it("uses only names with as many parts as levels when the backend sends no list for the depth", () => {
    expect(Object.keys(buildGroup(group({ column_names_by_dim: {} }), 2).mappings)).toEqual([]);
  });
  it("names missing columns and adds an activity field", () => {
    const g = buildGroup(group({ column_names_by_dim: {} }), 1);
    expect(g.columns).toEqual([
      { existing_id: null, column_name: "Dimension 1", column_type: "select", is_new: true },
      { existing_id: null, column_name: "Activity Data", column_type: "number", is_new: true },
    ]);
  });
  it("maps display names to lookup names when the backend sends pairs", () => {
    const g = buildGroup(group({ ef_name_pairs: [{ display_name: "Road - Van", lookup_name: "HGV diesel" }] }), 2);
    expect(g.mappings).toEqual({ "Road|Van": "HGV diesel" });
  });
});

describe("combine and selection", () => {
  it("merges choices and rules of several unit groups without repeats", () => {
    const a = buildGroup(group(), 2);
    const b = buildGroup(group({ ef_names: ["Sea - Ferry"], column_names_by_dim: { 2: { ...group().column_names_by_dim[2], ef_names: undefined } } }), 2);
    const both = combine([a, b]);
    expect(both.columns.map((c) => c.column_name)).toEqual(["vehicle", "fuel", "Activity Data"]);
    expect(both.options.vehicle.map((o) => o.id)).toEqual(["Air", "Road", "Sea"]);
    expect(Object.keys(both.mappings)).toContain("Sea|Ferry");
  });
  it("starts from the detected depth of every group and names the form after its units", () => {
    const p = proposal([group(), group({ denominator_unit: "tonne.km", pattern: "FLAT" })]);
    const sel = defaultSelection(p);
    expect([...sel]).toEqual([[0, 3], [1, 1]]);
    expect(defaultFormName(p, sel)).toBe("Site A - Business travel - km + tonne.km");
    expect(defaultFormName(p, new Map([[1, 1]]))).toBe("Site A - Business travel - tonne.km");
    expect(Object.keys(buildSelection(p, new Map([[0, 3]])).mappings)).toHaveLength(4);
  });
  it("offers the depths the backend named columns for", () => {
    expect(depthsFor(group())).toEqual([2, 3]);
    expect(depthsFor(group({ column_names_by_dim: {}, pattern: "TWO_DIM" }))).toEqual([2]);
  });
  it("lists units to create and rules in plain words", () => {
    expect(missingUnits(proposal([])).map((u) => u.unit_name)).toEqual(["tonne.km"]);
    expect(rulePaths(buildGroup(group(), 2))[0]).toBe("Air › Short");
  });
});
