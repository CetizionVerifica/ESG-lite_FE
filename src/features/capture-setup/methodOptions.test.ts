import { describe, expect, it } from "vitest";
import { type SourceConfig, draftFromConfig, isDirty, toPreviewConfig, toUpdatePayload, validateBuilder } from "./builder";
import { methodCandidates, methodOptionIssues, offerCategoryMethods, setMethodUnits, suggestedUnits, toggleMethodOption, unitsText } from "./methodOptions";

// S3-3 "Methods offered" (column_config.method_options, contracts §6).

const amount = { pk_id: 1, column_name: "amount", column_type: "number" };
const distance = { pk_id: 2, column_name: "distance", column_type: "number" };

const goods: SourceConfig = {
  pk_id: 3,
  config_name: "Purchased goods",
  columns: [amount],
  category: { category_id: 11, category_name: "Purchased materials", scope: "Scope 3", ghg_category: 1 },
};

const commuting: SourceConfig = {
  pk_id: 4,
  config_name: "Commuting",
  columns: [distance],
  calculation: { mode: "per_method", method_column: "@method", methods: { distance_based: { multiply: ["distance"], activity_unit: "passenger.km" } } },
};

describe("Methods offered", () => {
  it("offers the category's methods, most specific first", () => {
    const d = draftFromConfig(goods);
    expect(methodCandidates(d, 1)).toEqual(["supplier_specific", "hybrid", "average_data", "spend_based"]);
    // A method the form already offers outside the category's list stays a choice.
    expect(methodCandidates({ ...d, methodOptions: [{ method: "fuel_based", units: ["litre"] }] }, 1)).toContain("fuel_based");
  });

  it("keeps the list most specific first whatever order they're ticked in", () => {
    let d = draftFromConfig(goods);
    d = toggleMethodOption(d, "spend_based", 1);
    d = toggleMethodOption(d, "supplier_specific", 1);
    d = toggleMethodOption(d, "average_data", 1);
    expect(d.methodOptions.map((o) => o.method)).toEqual(["supplier_specific", "average_data", "spend_based"]);
    d = toggleMethodOption(d, "average_data", 1);
    expect(d.methodOptions.map((o) => o.method)).toEqual(["supplier_specific", "spend_based"]);
  });

  it("prefills every method of the category, keeping units already set", () => {
    let d = draftFromConfig(goods);
    d = setMethodUnits(toggleMethodOption(d, "spend_based", 1), "spend_based", "USD, EUR");
    d = offerCategoryMethods(d, 1);
    expect(d.methodOptions.map((o) => o.method)).toEqual(["supplier_specific", "hybrid", "average_data", "spend_based"]);
    expect(d.methodOptions[3].units).toEqual(["USD", "EUR"]);
    expect(offerCategoryMethods(draftFromConfig(goods), null).methodOptions).toEqual([]);
  });

  it("suggests the formula's unit for an @method spec", () => {
    const d = draftFromConfig(commuting);
    expect(suggestedUnits(d, "distance_based")).toEqual(["passenger.km"]);
    expect(suggestedUnits(d, "fuel_based")).toEqual([]);
    expect(toggleMethodOption(d, "distance_based", 7).methodOptions).toEqual([{ method: "distance_based", units: ["passenger.km"] }]);
  });

  it("edits units as comma-separated text and drops empty ones on save", () => {
    let d = toggleMethodOption(draftFromConfig(goods), "average_data", 1);
    d = setMethodUnits(d, "average_data", "kg, ");
    expect(unitsText(d.methodOptions[0].units)).toBe("kg, ");
    d = setMethodUnits(d, "average_data", "kg, tonne");
    expect(toUpdatePayload(d).method_options).toEqual([{ method: "average_data", units: ["kg", "tonne"] }]);
    expect(toPreviewConfig(d, 3).method_options).toEqual([{ method: "average_data", units: ["kg", "tonne"] }]);
  });

  it("saves null when nothing is offered, and reads the saved list back unchanged", () => {
    expect(toUpdatePayload(draftFromConfig(goods)).method_options).toBeNull();
    const saved = { ...goods, method_options: [{ method: "supplier_specific", units: ["kg"] }, { method: "spend_based", units: ["USD"] }] };
    const d = draftFromConfig(saved);
    expect(d.methodOptions).toEqual(saved.method_options);
    expect(isDirty(d, draftFromConfig(saved))).toBe(false);
    expect(isDirty(toggleMethodOption(d, "hybrid", 1), draftFromConfig(saved))).toBe(true);
  });

  it("won't save a method without units, or an offered method the @method formula lacks", () => {
    let d = toggleMethodOption(draftFromConfig(goods), "spend_based", 1);
    expect(methodOptionIssues(d)).toEqual([{ tab: "calculation", message: 'Methods offered: enter the units "From the amount spent" offers.' }]);
    expect(validateBuilder(d).map((i) => i.message)).toContain('Methods offered: enter the units "From the amount spent" offers.');
    d = setMethodUnits(d, "spend_based", "USD");
    expect(methodOptionIssues(d)).toEqual([]);

    let c = toggleMethodOption(draftFromConfig(commuting), "fuel_based", 7);
    c = setMethodUnits(c, "fuel_based", "litre");
    expect(methodOptionIssues(c).map((i) => i.message)).toEqual(['Calculation: "From fuel used" is offered but has no formula. Add it below or stop offering it.']);
  });
});
