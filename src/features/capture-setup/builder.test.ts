import { describe, expect, it } from "vitest";
import {
  type SourceConfig,
  addField,
  choicePaths,
  describeMethod,
  draftFromConfig,
  extraFieldErrors,
  fieldTitle,
  generateMappings,
  isDirty,
  keyFromLabel,
  mappingRows,
  moveField,
  parentBranches,
  parentCandidates,
  removeField,
  renameField,
  renameMap,
  setCalcMode,
  setMethodField,
  setParent,
  toPreviewConfig,
  toUpdatePayload,
  updateMethod,
  validateBuilder,
} from "./builder";

const mode = { pk_id: 1, column_name: "mode", column_type: "select" };
const vehicle = { pk_id: 2, column_name: "vehicle", column_type: "select" };
const fuel = { pk_id: 3, column_name: "fuel", column_type: "select" };
const distance = { pk_id: 4, column_name: "distance", column_type: "number" };
const weight = { pk_id: 5, column_name: "weight", column_type: "number" };

const transport: SourceConfig = {
  pk_id: 7,
  config_name: "Hidd transport",
  columns: [mode, vehicle, fuel, distance, weight],
  column_options: { "1": [{ id: "road", label: "Road" }, { id: "rail", label: "Rail" }] },
  column_dependencies: { vehicle: "mode", fuel: "vehicle" },
  dependent_options: {
    vehicle: { Road: [{ id: "van", label: "Van" }, { id: "hgv", label: "HGV" }], Rail: [{ id: "freight", label: "Freight train" }] },
    fuel: { "Road|Van": [{ id: "diesel", label: "Diesel" }], "Road|HGV": [{ id: "diesel", label: "Diesel" }, { id: "lng", label: "LNG" }], "Air|Jet": [] },
  },
  emission_category_mapping: { "Road|Van|Diesel": "Van - Diesel", "Boat|Ferry": "Ferry" },
  extra_fields: [],
  calculation: { mode: "per_unit", methods: { "tonne.km": { multiply: ["weight", "distance"], activity_unit: "tonne.km" } }, identity_columns: ["vehicle"] },
};

describe("draft", () => {
  it("keys choices by field name and remembers original names", () => {
    const d = draftFromConfig(transport);
    expect(d.options.mode).toHaveLength(2);
    expect(d.originalNames[4]).toBe("distance");
    expect(isDirty(d, draftFromConfig(transport))).toBe(false);
  });

  it("titles and keys in plain words", () => {
    expect(fieldTitle("fuel_type")).toBe("Fuel type");
    expect(keyFromLabel(" PO number ")).toBe("po_number");
  });
});

describe("fields", () => {
  it("renames a field everywhere and reports it for the backend", () => {
    const d = renameField(draftFromConfig(transport), 4, "distance_km");
    expect(d.calculation?.methods["tonne.km"].multiply).toEqual(["weight", "distance_km"]);
    expect(renameMap(d)).toEqual({ distance: "distance_km" });
    const v = renameField(draftFromConfig(transport), 2, "vehicle_type");
    expect(v.dependencies).toEqual({ vehicle_type: "mode", fuel: "vehicle_type" });
    expect(Object.keys(v.dependentOptions)).toContain("vehicle_type");
    expect(v.calculation?.identity_columns).toEqual(["vehicle_type"]);
    // Renaming back is no rename at all.
    expect(renameMap(renameField(d, 4, "distance"))).toEqual({});
  });

  it("removes a field and what referred to it", () => {
    const d = removeField(draftFromConfig(transport), 2);
    expect(d.dependencies).toEqual({});
    expect(d.dependentOptions.vehicle).toBeUndefined();
    expect(d.calculation?.identity_columns).toEqual([]);
    const w = removeField(draftFromConfig(transport), 5);
    expect(w.calculation?.methods["tonne.km"].multiply).toEqual(["distance"]);
  });

  it("adds library columns with their default choices and reorders", () => {
    const lib = { pk_id: 9, column_name: "cabin", column_type: "select", dropdown_options: [{ id: "eco", label: "Economy" }] };
    const d = addField(draftFromConfig(transport), lib);
    expect(d.options.cabin).toEqual([{ id: "eco", label: "Economy" }]);
    expect(addField(d, lib)).toBe(d);
    expect(moveField(d, 5, 0).fields[0].column_name).toBe("cabin");
  });
});

describe("choices", () => {
  it("never offers a parent that would make a loop", () => {
    const d = draftFromConfig(transport);
    expect(parentCandidates(d, "mode").map((f) => f.column_name)).toEqual([]);
    expect(parentCandidates(d, "fuel").map((f) => f.column_name)).toEqual(["mode", "vehicle"]);
    expect(setParent(d, "fuel", null).dependencies).toEqual({ vehicle: "mode" });
  });

  it("lists parent branches as plain paths, including stored ones nothing reaches", () => {
    const d = draftFromConfig(transport);
    expect(parentBranches(d, "vehicle").map((b) => b.key)).toEqual(["Road", "Rail"]);
    const fuels = parentBranches(d, "fuel");
    expect(fuels.map((b) => [b.key, b.path.join(" › "), b.reachable])).toEqual([
      ["Road|Van", "Road › Van", true],
      ["Road|HGV", "Road › HGV", true],
      ["Rail|Freight train", "Rail › Freight train", true],
      ["Air|Jet", "Air › Jet", false],
    ]);
  });
});

describe("factor match", () => {
  it("walks every choice path and generates missing rules", () => {
    const d = draftFromConfig(transport);
    expect(choicePaths(d).map((p) => p.join("|"))).toEqual(["Road|Van|Diesel", "Road|HGV|Diesel", "Road|HGV|LNG"]);
    const { draft, added } = generateMappings(d);
    expect(added).toBe(2);
    expect(draft.mapping["Road|HGV|LNG"]).toBe("Road - HGV - LNG");
    expect(draft.mapping["Road|Van|Diesel"]).toBe("Van - Diesel");
  });

  it("flags targets without a factor and rules no path reaches", () => {
    const rows = mappingRows(draftFromConfig(transport), ["van - diesel"]);
    expect(rows.map((r) => [r.path, r.issue])).toEqual([
      ["Road › Van › Diesel", null],
      ["Boat › Ferry", "unknown-target"],
    ]);
    expect(mappingRows(draftFromConfig(transport), null)[1].issue).toBe("no-path");
  });

  it("uses each select's own choices when there are no dependencies", () => {
    const flat = draftFromConfig({ ...transport, column_dependencies: {}, dependent_options: {} });
    expect(choicePaths(flat)).toEqual([["Road"], ["Rail"]]);
  });
});

describe("calculation", () => {
  it("sets up one method per choice of the method field", () => {
    let d = setCalcMode(draftFromConfig(transport), "per_method");
    expect(d.calculation?.method_column).toBe("mode");
    expect(Object.keys(d.calculation?.methods ?? {})).toEqual(["road", "rail"]);
    d = updateMethod(d, "road", { multiply: ["distance", "weight"], percent: ["weight", "fuel"] });
    expect(d.calculation?.methods.road.percent).toEqual(["weight"]);
    expect(describeMethod(d, "road")).toBe('When Mode is "Road", multiply Distance × Weight (%).');
    expect(validateBuilder(d).map((i) => i.message)).toEqual(['Calculation: "Rail" has no fields to multiply.']);
    expect(setMethodField(d, "vehicle").calculation?.methods).toEqual({});
    expect(setCalcMode(d, "none").calculation).toBeNull();
  });

  it("describes per-unit rules", () => {
    expect(describeMethod(draftFromConfig(transport), "tonne.km")).toBe("When the unit is tonne.km, multiply Weight × Distance, in tonne.km.");
  });
});

describe("validation and save", () => {
  it("checks extra details", () => {
    expect(
      extraFieldErrors([
        { key: "po", label: "PO", type: "text", required: false },
        { key: "po", label: "PO 2", type: "text", required: false },
        { key: "kind", label: "Kind", type: "select", required: false, options: [" "] },
      ]),
    ).toEqual({ 1: 'Key "po" is used twice.', 2: "Add at least one choice." });
  });

  it("saves choices by column id with the renames", () => {
    const d = renameField(draftFromConfig(transport), 1, "transport_mode");
    const p = toUpdatePayload(d);
    expect(p.column_options).toEqual({ "1": [{ id: "road", label: "Road" }, { id: "rail", label: "Rail" }] });
    expect(p.column_ids).toEqual([1, 2, 3, 4, 5]);
    expect(p.rename_map).toEqual({ mode: "transport_mode" });
    expect(p.column_dependencies.vehicle).toBe("transport_mode");
    expect(toUpdatePayload(draftFromConfig(transport)).rename_map).toBeUndefined();
    expect(toPreviewConfig(d, 7).columns[0].column_name).toBe("transport_mode");
    expect(validateBuilder({ ...d, name: " " })[0]).toEqual({ tab: "fields", message: "Enter a form name." });
  });
});
