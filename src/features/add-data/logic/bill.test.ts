import { describe, expect, it } from "vitest";
import type { ExtractionResponse } from "../../../services/invoiceService";
import { applyChange, newRow, toFormModel } from "./form";
import { billOutsidePeriod, billGroups, billOf, billRowsFrom, billWarnings, markEdited } from "./bill";
import { buildPayload, type EntryPeriod } from "./entry";
import type { ColumnConfig, ColumnEntity, EmissionFactor } from "../types";

const col = (pk_id: number, column_name: string, column_type = "select"): ColumnEntity => ({ pk_id, column_name, column_type });

// Waste: Activity Type → Type of Waste → Disposal Method, mapped to factor names.
const waste: ColumnConfig = {
  pk_id: 1,
  config_name: "Waste",
  columns: [col(1, "activity_type"), col(2, "type_of_waste"), col(3, "disposal_method"), col(4, "quantity", "number"), col(5, "emission_category", "text")],
  column_options: { "1": [{ id: "m", label: "Metal" }, { id: "p", label: "Paper" }] },
  column_dependencies: { type_of_waste: "activity_type", disposal_method: "type_of_waste" },
  dependent_options: {
    type_of_waste: { Metal: [{ id: "am", label: "Any metals" }], Paper: [{ id: "bk", label: "Books" }] },
    disposal_method: { "Metal|Any metals": [{ id: "ol", label: "Open loop" }] },
  },
  emission_category_mapping: { "Metal|Any metals|Open loop": "Metal: open loop recycling" },
};

// Stationary fuel: one free column, no mapping; the category comes from the AI.
const fuel: ColumnConfig = {
  pk_id: 2,
  config_name: "Stationary",
  columns: [col(1, "Activity Data", "number"), col(2, "emission_category", "text")],
};
const factors = [{ emission_category_name: "Diesel (average biofuel blend)", factor_value: 2.68, denominator_unit: "litres", year: 2024 }] as EmissionFactor[];
const source = { invoiceId: 41, uploadKey: "u1", fileName: "bill.pdf", fileType: "application/pdf", url: "https://files/bill.pdf" };

const response = (over: Partial<ExtractionResponse>): ExtractionResponse => ({
  filename: "bill.pdf",
  data: [],
  error: null,
  validations: [],
  suggested_categories: [],
  emission: [],
  ...over,
});

const sep: EntryPeriod = { mode: "monthly", year: 2025, month: 9 };

describe("bill rows", () => {
  it("turns AI labels into option ids, parents first, and maps the emission category", () => {
    const m = toFormModel(waste);
    const [row] = billRowsFrom(
      m,
      response({
        emission: [
          {
            invoice_index: 0,
            activity_index: 0,
            site_id: 1,
            category_id: 3,
            // Keys in any case; labels as the bill writes them.
            activity_data: { Disposal_Method: "open loop", type_of_waste: "ANY METALS", activity_type: "metal", Quantity: "120" },
            activity_data_unit: "KG",
            date_of_reporting: "2025-09-30",
            total_emission: 0,
            unit: "kg CO2e",
          },
        ],
        suggested_categories: [null],
      }),
      { source, units: ["kg", "tonnes"], factors: [], firstId: 1 },
    );
    expect(row).toMatchObject({ activity_type: "m", type_of_waste: "am", disposal_method: "ol", quantity: "120", activity_data_unit: "kg" });
    expect(row.emission_category).toBe("Metal: open loop recycling");
    expect(row._ecmKey).toBe("Metal|Any metals|Open loop");
    const bill = billOf(row);
    expect(bill?.ai).toEqual(expect.arrayContaining(["activity_type", "type_of_waste", "disposal_method", "quantity", "activity_data_unit", "emission_category"]));
    // A mapped category is the user's form rules, not an AI guess: no confidence.
    expect(bill?.confidence).toBeNull();
    expect(bill?.confirmed).toBe(false);
    // Rows are filed in the page's period, not on the bill's date.
    expect(row.date_of_reporting).toBeUndefined();
  });

  it("keeps the suggestion's confidence when the row's category is that suggestion, and normalises it to the factor name", () => {
    const [row] = billRowsFrom(
      toFormModel(fuel),
      response({
        data: [{ vendor_name: "Bapco", invoice_number: "INV-7", invoice_date: "2025-09-12", billing_month_end: "2025-09-30", total_amount: 812.5, currency: "BHD" } as never],
        emission: [
          {
            invoice_index: 0,
            activity_index: 0,
            site_id: 1,
            category_id: 3,
            activity_data: { "Activity Data": "1600", emission_category: "diesel (average biofuel blend)", description: "Diesel delivery" },
            activity_data_unit: "Litres",
            date_of_reporting: "2025-09-30",
            total_emission: 0,
            unit: "kg CO2e",
          },
        ],
        suggested_categories: [
          { emission_category_name: "Diesel (average biofuel blend)", category_id: 3, category_name: "Stationary", scope: "1", denominator_unit: "litres", confidence: 54 },
        ],
      }),
      { source, units: ["litres"], factors, firstId: 1 },
    );
    expect(row.emission_category).toBe("Diesel (average biofuel blend)");
    expect(row.activity_data_unit).toBe("litres");
    expect(billOf(row)).toMatchObject({ confidence: 54, vendor: "Bapco", number: "INV-7", date: "2025-09-30", amount: 812.5, currency: "BHD", invoiceId: 41 });
  });

  it("produces the same payload as a typed row, apart from the bill's description line", () => {
    const m = toFormModel(fuel);
    const [fromBill] = billRowsFrom(
      m,
      response({
        emission: [
          {
            invoice_index: 0,
            activity_index: 0,
            site_id: 1,
            category_id: 3,
            activity_data: { "Activity Data": "1600", emission_category: "Diesel (average biofuel blend)", description: "Diesel delivery" },
            activity_data_unit: "litres",
            date_of_reporting: "2025-08-31",
            total_emission: 0,
            unit: "kg CO2e",
          },
        ],
      }),
      { source, units: ["litres"], factors, firstId: 1 },
    );
    let typed = newRow(m, 1);
    typed = applyChange(m, typed, "Activity Data", "1600");
    typed = applyChange(m, typed, "emission_category", "Diesel (average biofuel blend)");
    typed = applyChange(m, typed, "activity_data_unit", "litres");
    const ctx = { siteId: 1, categoryId: 3, period: sep };
    const { activity_data: billActivity, ...billRest } = buildPayload(fromBill, ctx);
    const { activity_data: typedActivity, ...typedRest } = buildPayload(typed, ctx);
    expect(billRest).toEqual(typedRest);
    expect(billRest.date_of_reporting).toBe("2025-09-30");
    const { description, ...billValues } = billActivity;
    expect(description).toBe("Diesel delivery");
    expect(billValues).toEqual(typedActivity);
    expect(JSON.stringify(billActivity)).not.toContain("bill.pdf");
  });

  it("groups rows per invoice in a file", () => {
    const m = toFormModel(fuel);
    const em = (invoice_index: number) => ({ invoice_index, activity_index: 0, site_id: 1, category_id: 3, activity_data: { "Activity Data": "1" }, activity_data_unit: null, date_of_reporting: null, total_emission: 0, unit: "kg CO2e" });
    const rows = billRowsFrom(m, response({ emission: [em(0), em(0), em(1)] }), { source, units: [], factors, firstId: 5 });
    expect(rows.map((r) => r.id)).toEqual([5, 6, 7]);
    expect(billGroups([newRow(m, 1), ...rows]).map((g) => [g.bill.key, g.rows.length])).toEqual([
      ["u1:0", 2],
      ["u1:1", 1],
    ]);
  });
});

describe("bill marks", () => {
  it("drops the AI mark from a field once a person edits it, and the confidence with the category", () => {
    const row = { id: 1, emission_category: "Diesel", _bill: { ai: ["emission_category", "Activity Data"], confidence: 54 } };
    const edited = markEdited(row, "Activity Data");
    expect(billOf(edited)).toMatchObject({ ai: ["emission_category"], confidence: 54 });
    expect(billOf(markEdited(edited, "emission_category"))).toMatchObject({ ai: [], confidence: null });
    expect(markEdited({ id: 2 }, "x")).toEqual({ id: 2 });
  });

  it("words failed checks and drops per-activity ones", () => {
    expect(
      billWarnings([
        { check: "subtotal_plus_tax_equals_total", ok: false, delta: 357621 },
        { check: "activity_unit_defined", ok: false, message: "No unit" },
        { check: "other", ok: false, message: "Vendor missing" },
        { check: "fine", ok: true, message: "ok" },
      ]),
    ).toEqual(["The total doesn't match subtotal plus tax (off by 357,621).", "Vendor missing"]);
  });

  it("refuses a bill dated outside the period", () => {
    expect(billOutsidePeriod("2025-09-30", sep)).toBeNull();
    expect(billOutsidePeriod("2025-08-31", sep)).toBe("This bill is dated 31 Aug 2025, outside Sep 2025. Remove it here and add it with its own period selected.");
    expect(billOutsidePeriod("2026-02-10", { mode: "yearly", yearType: "FY", year: 2025 })).toBeNull();
    expect(billOutsidePeriod("2025-03-31", { mode: "yearly", yearType: "FY", year: 2025 })).not.toBeNull();
    expect(billOutsidePeriod(null, sep)).toBeNull();
  });
});
