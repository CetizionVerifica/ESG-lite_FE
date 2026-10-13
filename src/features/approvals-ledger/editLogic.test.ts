import { describe, expect, it } from "vitest";
import {
  AMOUNT_ERROR,
  amountErrors,
  applyChange,
  blockedMessage,
  editErrors,
  editPayload,
  sameActivity,
  editableKeys,
  fieldOptions,
  initialActivity,
  isNumberField,
  parentPrompt,
  prefillFromCategory,
  resolveEmissionCategory,
  selectChain,
} from "./editLogic";
import type { ColumnConfig } from "./logic";

// Fuel type → grade, mapped to factor names.
const chained: ColumnConfig = {
  columns: [
    { pk_id: 5, column_name: "fuel_type", column_type: "select" },
    { pk_id: 6, column_name: "grade", column_type: "select" },
    { pk_id: 7, column_name: "quantity", column_type: "number" },
  ],
  column_options: { "5": [{ id: 1, label: "Diesel" }, { id: 2, label: "Petrol" }] },
  column_dependencies: { grade: "fuel_type" },
  dependent_options: {
    grade: { Diesel: [{ id: 11, label: "ULSD" }, { id: 12, label: "Red" }], Petrol: [{ id: 21, label: "95 RON" }] },
  },
  emission_category_mapping: { "Diesel|ULSD": "Diesel (average biofuel blend)", "Diesel|Red": "Gas oil", "Petrol|95 RON": "Petrol (average biofuel blend)" },
};

// Three levels: vehicle → size → fuel, keyed "vehicle|size" for the fuel list.
const threeLevel: ColumnConfig = {
  columns: [
    { pk_id: 1, column_name: "vehicle", column_type: "select" },
    { pk_id: 2, column_name: "size", column_type: "select" },
    { pk_id: 3, column_name: "fuel", column_type: "select" },
  ],
  column_options: { "1": [{ id: "v1", label: "Van" }] },
  column_dependencies: { size: "vehicle", fuel: "size" },
  dependent_options: {
    size: { Van: [{ id: "s1", label: "Large" }] },
    fuel: { "Van|Large": [{ id: "f1", label: "Diesel" }] },
  },
  emission_category_mapping: { "Van|Large|Diesel": "Vans large diesel" },
};

// No dependencies: single select mapped directly.
const flat: ColumnConfig = {
  columns: [{ pk_id: 9, column_name: "source", column_type: "select" }],
  column_options: { "9": [{ id: 1, label: "Grid" }] },
  emission_category_mapping: { Grid: "Electricity grid" },
};

describe("fieldOptions", () => {
  it("offers a column's own options", () => {
    expect(fieldOptions(chained, "fuel_type", {})?.map((o) => o.label)).toEqual(["Diesel", "Petrol"]);
  });

  it("offers dependent options only once the parent is chosen", () => {
    expect(fieldOptions(chained, "grade", {})).toBeNull();
    expect(fieldOptions(chained, "grade", { fuel_type: "2" })?.map((o) => o.label)).toEqual(["95 RON"]);
  });

  it("uses composite keys for three-level chains", () => {
    expect(fieldOptions(threeLevel, "fuel", { vehicle: "v1", size: "s1" })?.map((o) => o.id)).toEqual(["f1"]);
  });

  it("is a free input for number columns and when no config loaded", () => {
    expect(fieldOptions(chained, "quantity", {})).toBeNull();
    expect(fieldOptions(undefined, "fuel_type", {})).toBeNull();
  });
});

describe("applyChange", () => {
  it("clears dependants and re-resolves the emission category", () => {
    const a = applyChange(chained, { fuel_type: "1", grade: "11", emission_category: "Diesel (average biofuel blend)" }, "fuel_type", "2");
    expect(a).toMatchObject({ fuel_type: "2", grade: "", emission_category: "" });
    const b = applyChange(chained, a, "grade", "21");
    expect(b.emission_category).toBe("Petrol (average biofuel blend)");
  });

  it("clears grandchildren too", () => {
    const a = applyChange(threeLevel, { vehicle: "v1", size: "s1", fuel: "f1" }, "vehicle", "v1");
    expect(a).toMatchObject({ size: "", fuel: "" });
  });

  it("leaves number edits alone", () => {
    expect(applyChange(chained, { quantity: "1", emission_category: "X" }, "quantity", "2")).toEqual({ quantity: "2", emission_category: "X" });
  });
});

describe("resolveEmissionCategory", () => {
  it("walks the chain", () => {
    expect(resolveEmissionCategory(chained, { fuel_type: "1", grade: "12" })).toBe("Gas oil");
    expect(resolveEmissionCategory(threeLevel, { vehicle: "v1", size: "s1", fuel: "f1" })).toBe("Vans large diesel");
  });

  it("needs every select in the chain", () => {
    expect(resolveEmissionCategory(chained, { fuel_type: "1" })).toBeNull();
  });

  it("matches a single select without dependencies", () => {
    expect(resolveEmissionCategory(flat, { source: "1" })).toBe("Electricity grid");
  });
});

describe("prefillFromCategory", () => {
  it("fills empty selects from the stored category", () => {
    expect(prefillFromCategory(chained, { emission_category: "Gas oil", quantity: "5" })).toMatchObject({ fuel_type: "1", grade: "12" });
  });

  it("keeps values already stored", () => {
    expect(prefillFromCategory(chained, { emission_category: "Gas oil", fuel_type: "2" })).toMatchObject({ fuel_type: "2" });
  });
});

describe("form helpers", () => {
  it("orders fields by the form and keeps extra stored keys", () => {
    expect(editableKeys(chained, { note: "x", quantity: "1", emission_category: "y", category_name: "z" })).toEqual(["fuel_type", "grade", "quantity", "note"]);
    expect(selectChain(chained)).toEqual(["fuel_type", "grade"]);
  });

  it("knows number fields", () => {
    expect(isNumberField(chained, "quantity", "")).toBe(true);
    expect(isNumberField(chained, "fuel_type", "1")).toBe(false);
    expect(isNumberField(undefined, "kwh", "12.5")).toBe(true);
  });

  it("builds the payload and requires a reason", () => {
    expect(editPayload({ quantity: "2", category_name: "Diesel", _isFeraRow: true }, "2025-09-30", "", " Fixed unit ")).toEqual({
      activity_data: { quantity: "2" },
      date_of_reporting: "2025-09-30",
      activity_data_unit: undefined,
      reason: "Fixed unit",
    });
    expect(editErrors("no").reason).toMatch(/at least 5/);
    expect(editErrors("Typo in litres")).toEqual({});
    expect(editErrors("Typo in litres", "").category).toMatch(/emission factor/);
    expect(editErrors("Typo in litres", "Diesel")).toEqual({});
  });

  it("sends only what the manager changed", () => {
    const start = { activity: { quantity: 2, emission_category: "Diesel" }, date: "2025-09-30", unit: "litres" };
    // Date-only fix: no activity_data, so the backend doesn't recalculate a row stored without a unit.
    expect(editPayload({ quantity: "2", emission_category: "Diesel", _isFeraRow: true }, "2025-10-01", "litres", "Wrong day", start)).toEqual({
      activity_data: undefined,
      date_of_reporting: "2025-10-01",
      activity_data_unit: undefined,
      reason: "Wrong day",
    });
    const amount = editPayload({ quantity: "3", emission_category: "Diesel" }, "2025-09-30", "litres", "Typo in litres", start);
    expect(amount.activity_data).toEqual({ quantity: "3", emission_category: "Diesel" });
    expect(amount.date_of_reporting).toBeUndefined();
    // A unit change carries the values (and a factor resolved on open) along.
    const unit = editPayload({ quantity: 2, emission_category: "Diesel" }, "2025-09-30", "kg", "Wrong unit", start);
    expect(unit.activity_data).toEqual({ quantity: 2, emission_category: "Diesel" });
    expect(unit.activity_data_unit).toBe("kg");
    expect(sameActivity({ b: "", a: 1 }, { a: "1" })).toBe(true);
    expect(sameActivity({ a: 1 }, { a: 2 })).toBe(false);
  });

  it("prompts for the parent", () => {
    expect(parentPrompt(chained, "grade")).toBe("Select fuel type first");
    expect(parentPrompt(chained, "fuel_type")).toBeUndefined();
  });
});

// Waste as configured for a real site: the child list's ids differ from the
// column's own options, and some mapping keys carry stray spaces.
const waste: ColumnConfig = {
  columns: [
    { pk_id: 5, column_name: "Waste Type", column_type: "select" },
    { pk_id: 7, column_name: "Disposal Method", column_type: "select" },
    { pk_id: 36, column_name: "Amount of waste", column_type: "number" },
  ],
  column_options: {
    "5": [{ id: 6, label: "ETP Sludge" }, { id: 8, label: "Process Organic Waste" }],
    "7": [{ id: 1, label: "Recycle" }, { id: 2, label: "Reuse" }, { id: 5, label: "Landfill" }],
  },
  column_dependencies: { "Disposal Method": "Waste Type" },
  dependent_options: {
    "Disposal Method": {
      "ETP Sludge": [{ id: 1, label: "Reuse" }, { id: 2, label: "Recycle" }, { id: 5, label: "Landfill" }],
      "Process Organic Waste": [{ id: 1, label: "Reuse" }, { id: 5, label: "Landfill" }],
    },
  },
  emission_category_mapping: {
    "ETP Sludge|Landfill": "ETP Sludge - Landfill",
    "ETP Sludge|Reuse": "ETP Sludge - Reuse",
    "Process Organic Waste |Reuse": "Process Organic Waste  - Reuse",
  },
};

describe("initialActivity", () => {
  it("fills a missing emission category from the chosen options", () => {
    const start = initialActivity(waste, { "Waste Type": "6", "Disposal Method": "5", "Amount of waste": "9.17" });
    expect(start.emission_category).toBe("ETP Sludge - Landfill");
  });

  it("reads the child's id from its dependent list, not the column's own list", () => {
    // Id 1 is Reuse under ETP Sludge but Recycle in the column's own options.
    expect(initialActivity(waste, { "Waste Type": "6", "Disposal Method": "1" }).emission_category).toBe("ETP Sludge - Reuse");
  });

  it("matches mapping keys that carry stray spaces", () => {
    expect(initialActivity(waste, { "Waste Type": "8", "Disposal Method": "1" }).emission_category).toBe("Process Organic Waste  - Reuse");
  });

  it("falls back to the parent-only key when no full key matches", () => {
    const parentOnly: ColumnConfig = { ...waste, emission_category_mapping: { "ETP Sludge": "ETP Sludge - any disposal" } };
    expect(initialActivity(parentOnly, { "Waste Type": "6", "Disposal Method": "5" }).emission_category).toBe("ETP Sludge - any disposal");
  });

  it("leaves the factor unset when keys differ only in spacing (ambiguous)", () => {
    const ambiguous: ColumnConfig = {
      ...waste,
      emission_category_mapping: { "Process Organic Waste |Reuse": "A", "Process Organic Waste|Reuse ": "B" },
    };
    expect(initialActivity(ambiguous, { "Waste Type": "8", "Disposal Method": "1" }).emission_category).toBeUndefined();
  });

  it("keeps a stored category and leaves unresolvable rows empty", () => {
    expect(initialActivity(waste, { "Waste Type": "6", "Disposal Method": "5", emission_category: "Custom" }).emission_category).toBe("Custom");
    expect(initialActivity(waste, { "Waste Type": "6" }).emission_category).toBeUndefined();
  });
});

describe("blockedMessage", () => {
  it("says why a save didn't go through", () => {
    expect(blockedMessage({})).toBeNull();
    expect(blockedMessage(editErrors(""))).toMatch(/add a reason/);
    expect(blockedMessage(editErrors("Typo in litres", ""))).toMatch(/emission factor/);
    expect(blockedMessage(editErrors("", ""))).toMatch(/emission factor.*reason/);
    expect(blockedMessage(editErrors("Typo in litres", "", false))).toBe("Not saved yet: choose an emission factor.");
    // No unit: the backend would save the total as 0.
    expect(blockedMessage(editErrors("Typo in litres", "Diesel", true, ""))).toBe("Not saved yet: choose a unit, without one the total would be 0.");
    expect(editErrors("Typo in litres", "Diesel", true, "", false).unit).toMatch(/none are set up/);
    expect(editErrors("Typo in litres", "Diesel", true, "litres")).toEqual({});
  });
});

describe("amountErrors", () => {
  const start = { fuel_type: "1", quantity: "100", emission_category: "Diesel" };
  const at = (quantity: string) => ({ ...start, quantity });

  it("blocks an empty, zero or negative amount", () => {
    expect(amountErrors(chained, at(""), start)).toEqual({ quantity: AMOUNT_ERROR });
    expect(amountErrors(chained, at("0"), start)).toEqual({ quantity: AMOUNT_ERROR });
    expect(amountErrors(chained, at("-5"), start)).toEqual({ quantity: AMOUNT_ERROR });
  });

  it("lets a positive amount through and ignores select fields", () => {
    expect(amountErrors(chained, at("150"), start)).toEqual({});
  });

  it("without a config, judges the stored number fields, even once cleared", () => {
    const stored = { activity_value: "1600", Fuel: "Diesel" };
    expect(amountErrors(undefined, { ...stored, activity_value: "" }, stored)).toEqual({ activity_value: AMOUNT_ERROR });
    expect(amountErrors(undefined, stored, stored)).toEqual({});
  });

  it("never takes 0 or a negative as an amount, even next to a positive one", () => {
    const two = { distance: "10", passengers: "2" };
    expect(amountErrors(undefined, { distance: "10", passengers: "0" }, two)).toEqual({ passengers: AMOUNT_ERROR });
    expect(amountErrors(undefined, { distance: "10", passengers: "-1" }, two)).toEqual({ passengers: AMOUNT_ERROR });
    expect(amountErrors(undefined, { distance: "10", passengers: "" }, two)).toEqual({});
  });
});

describe("blockedMessage with an amount", () => {
  it("names the amount", () => {
    expect(blockedMessage({ amount: AMOUNT_ERROR })).toBe("Not saved yet: enter an amount greater than 0.");
  });
});
