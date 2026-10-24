import { describe, expect, it } from "vitest";
import { type SourceConfig, draftFromConfig, removeField, renameField, toPreviewConfig, toUpdatePayload } from "./builder";
import {
  applyRecipe,
  choiceAnswers,
  clearMethod,
  fixableUnits,
  formSettingsIssues,
  methodMode,
  missingRecipeColumns,
  setChoiceColumn,
  setChoiceMethod,
  setFieldSetting,
  setFixedUnit,
  setOneMethod,
  stopOffering,
  unmappedOffered,
} from "./formSettings";
import { recipeFor } from "../../lib/forms/recipes";

const recordType = { pk_id: 1, column_name: "Record type", column_type: "select" };
const vehicle = { pk_id: 2, column_name: "Vehicle", column_type: "select" };
const litres = { pk_id: 3, column_name: "Fuel used (litres)", column_type: "number" };
const weight = { pk_id: 4, column_name: "Weight (tonne)", column_type: "number" };
const distance = { pk_id: 5, column_name: "Distance travelled", column_type: "number" };
const share = { pk_id: 6, column_name: "Your share of the load (%)", column_type: "number" };

// A Category 4 freight form in the client's words (SE-3's main path).
const freight: SourceConfig = {
  pk_id: 9,
  config_name: "Freight",
  columns: [recordType, vehicle],
  column_options: {
    "1": [
      { id: "fuel_bill", label: "Fuel bill" },
      { id: "trip", label: "Trip distance" },
    ],
    "2": [{ id: "hgv", label: "HGV" }],
  },
  extra_fields: [{ key: "paid_by", label: "Who paid?", type: "select", required: false, options: ["We paid", "Customer or other"] }],
  method_options: null,
  category: { category_id: 13, category_name: "Upstream transportation and distribution", scope: "Scope 3", ghg_category: 4 },
};
const library = [recordType, vehicle, litres, weight, distance, share];

describe("how the form's method is decided (SE-3)", () => {
  it("one method, then a choice whose answers pick the method; offered methods follow the map, most specific first", () => {
    let d = draftFromConfig(freight);
    expect(methodMode(d)).toBe("none");
    d = setOneMethod(d, "distance_based");
    expect(methodMode(d)).toBe("one");
    expect(d.methodOptions).toEqual([{ method: "distance_based", units: ["tonne.km", "km"] }]);

    d = setChoiceColumn(d, "Record type", 4);
    expect(methodMode(d)).toBe("choice");
    expect(choiceAnswers(d, "Record type").map((a) => a.label)).toEqual(["Fuel bill", "Trip distance"]);
    d = setChoiceMethod(d, "trip", "distance_based", 4);
    d = setChoiceMethod(d, "fuel_bill", "fuel_based", 4);
    // Category 4 lists fuel_based before distance_based.
    expect(d.methodOptions.map((o) => o.method)).toEqual(["fuel_based", "distance_based"]);
    // Units already set are kept.
    expect(d.methodOptions[1].units).toEqual(["tonne.km", "km"]);
    // Unmapping keeps the method offered (an unmapped answer may still use it); dropping it is explicit.
    d = setChoiceMethod(d, "fuel_bill", null, 4);
    expect(d.methodOptions.map((o) => o.method)).toEqual(["fuel_based", "distance_based"]);
    expect(unmappedOffered(d)).toEqual(["fuel_based"]);
    expect(stopOffering(d, "distance_based")).toBe(d);
    d = stopOffering(d, "fuel_based");
    expect(d.methodOptions.map((o) => o.method)).toEqual(["distance_based"]);
    expect(methodMode(clearMethod(d))).toBe("none");
  });

  it("a form with several methods and no question reads as 'several' (S3-8 transport forms)", () => {
    const d = draftFromConfig({ ...freight, method_options: [{ method: "fuel_based", units: ["litre"] }, { method: "distance_based", units: ["tonne.km"] }] });
    expect(methodMode(d)).toBe("several");
  });
});

describe("recipes (SE-3)", () => {
  it("one method: adds the recipe's fields from the library and its formula keyed by its unit", () => {
    const recipe = recipeFor("fuel_based")!;
    const d = applyRecipe(setOneMethod(draftFromConfig(freight), "fuel_based"), recipe, library);
    expect(d.fields.map((f) => f.column_name)).toEqual(["Record type", "Vehicle", "Fuel used (litres)", "Your share of the load (%)"]);
    expect(d.calculation).toEqual({
      mode: "per_unit",
      methods: { litre: { multiply: ["Fuel used (litres)", "Your share of the load (%)"], percent: ["Your share of the load (%)"], activity_unit: "litre" } },
    });
    // Applying again changes nothing.
    expect(applyRecipe(d, recipe, library)).toEqual(d);
  });

  it("it depends on the record: the formula goes on each answer that picks the method", () => {
    let d = setChoiceColumn(draftFromConfig(freight), "Record type", 4);
    d = setChoiceMethod(setChoiceMethod(d, "trip", "distance_based", 4), "fuel_bill", "fuel_based", 4);
    d = applyRecipe(applyRecipe(d, recipeFor("distance_based")!, library), recipeFor("fuel_based")!, library);
    expect(d.calculation?.mode).toBe("per_method");
    expect(d.calculation?.method_column).toBe("Record type");
    expect(d.calculation?.methods.trip).toEqual({ multiply: ["Weight (tonne)", "Distance travelled"], activity_unit: "tonne.km" });
    expect(d.calculation?.methods.fuel_bill.activity_unit).toBe("litre");
  });

  it("names the fields the library lacks, so the page can create them first", () => {
    const d = draftFromConfig(freight);
    expect(missingRecipeColumns(d, recipeFor("site_specific")!, library).map((f) => f.name)).toEqual(["Energy used (kWh)", "Your share (%)"]);
    expect(missingRecipeColumns(d, recipeFor("fuel_based")!, library)).toEqual([]);
  });

  it("every recipe is valid config: units, a formula over its own fields, a result unit it offers", () => {
    for (const m of ["fuel_based", "distance_based", "spend_based", "supplier_specific", "average_data", "site_specific", "waste_type_specific"]) {
      const r = recipeFor(m)!;
      expect(r.units.length, m).toBeGreaterThan(0);
      if (r.formula) {
        expect(r.formula.multiply.every((f) => r.fields.some((x) => x.name === f)), m).toBe(true);
        expect(r.units, m).toContain(r.formula.activity_unit);
      }
    }
  });
});

describe("field settings, unit and currency on save (SE-2 payload)", () => {
  it("round trip: settings load from the form and go back as SE-2 stores them", () => {
    const d = draftFromConfig({
      ...freight,
      method_options: [{ method: "distance_based", units: ["tonne.km", "km"] }],
      method_by_choice: { column: "Record type", map: { trip: "distance_based" } },
      field_settings: { Vehicle: { hidden: true, default: "hgv" }, paid_by: { label: "Who paid for it?" }, Gone: { hidden: true } },
      units: { fixed: "km" },
      currency: { fixed: "USD" },
    });
    const p = toUpdatePayload(d);
    expect(p.method_by_choice).toEqual({ column: "Record type", map: { trip: "distance_based" } });
    // A field no longer on the form is dropped.
    expect(p.field_settings).toEqual({ Vehicle: { hidden: true, default: "hgv" }, paid_by: { label: "Who paid for it?" } });
    expect(p.units).toEqual({ fixed: "km" });
    expect(p.currency).toEqual({ fixed: "USD" });
    expect(toPreviewConfig(d, 9).field_settings).toEqual(p.field_settings);
    expect(toUpdatePayload(draftFromConfig(freight))).toMatchObject({ method_by_choice: null, field_settings: {}, units: null, currency: null });
  });

  it("an empty setting is dropped; renaming or removing the field carries its settings and the question", () => {
    let d = setChoiceColumn(draftFromConfig(freight), "Record type", 4);
    d = setFieldSetting(d, "Record type", { label: "What does your record show?" });
    expect(d.fieldSettings["Record type"]).toEqual({ label: "What does your record show?" });
    expect(setFieldSetting(d, "Record type", { label: "" }).fieldSettings).toEqual({});
    const renamed = renameField(d, 1, "record_type");
    expect(renamed.fieldSettings).toEqual({ record_type: { label: "What does your record show?" } });
    expect(renamed.methodByChoice?.column).toBe("record_type");
    const removed = removeField(renamed, 1);
    expect(removed.fieldSettings).toEqual({});
    expect(removed.methodByChoice).toBeNull();
  });

  it("a fixed unit must be one every method a row can take offers; the checks name what to fix", () => {
    let d = setChoiceColumn(draftFromConfig(freight), "Record type", 4);
    d = setChoiceMethod(setChoiceMethod(d, "trip", "distance_based", 4), "fuel_bill", "fuel_based", 4);
    expect(fixableUnits(d)).toEqual([]);
    const [unitIssue] = formSettingsIssues(setFixedUnit(d, "km"));
    expect(unitIssue.tab).toBe("calculation");
    expect(unitIssue.message).toMatch(/^Unit: "km" isn't a unit .+ offers\.$/);
    const tripOnly = stopOffering(setChoiceMethod(d, "fuel_bill", null, 4), "fuel_based");
    expect(fixableUnits(tripOnly)).toEqual(["tonne.km", "km"]);
    expect(formSettingsIssues(setFixedUnit(tripOnly, "km"))).toEqual([]);
    // A hidden required field needs a default.
    const hiddenRequired = setFieldSetting(tripOnly, "Vehicle", { hidden: true, required: true });
    expect(formSettingsIssues(hiddenRequired).map((i) => i.message)).toEqual(['"Vehicle" is hidden and required: give it a default, or show it.']);
    // A question with no answers mapped.
    expect(formSettingsIssues(setChoiceColumn(draftFromConfig(freight), "Record type", 4)).map((i) => i.message)).toEqual(['Method: map at least one answer of "Record type" to a method.']);
  });
});
