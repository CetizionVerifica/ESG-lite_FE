import { describe, expect, it } from "vitest";
import type { Product } from "../../services/productService";
import {
  type ProductionRow,
  createPayload,
  draftErrors,
  draftFromRow,
  monthRange,
  newDraft,
  periodText,
  productCards,
  updatePayload,
  userSites,
  wholeMonth,
} from "./logic";

const hidd = { site_id: 1, name: "Hidd" };
const rod: Product = { product_id: 7, name: "Wire rod", unit: "t", site: hidd, created_at: "", updated_at: "" };
const cable: Product = { product_id: 8, name: "Cable", unit: "km", site: hidd, created_at: "", updated_at: "" };

function row(over: Partial<ProductionRow> = {}): ProductionRow {
  return {
    production_id: 1,
    quantity: 4200,
    unit: "t",
    start_date: "2025-09-01",
    end_date: "2025-09-30",
    status: "pending",
    product: { product_id: 7, name: "Wire rod", unit: "t" },
    site: hidd,
    created_at: "2025-10-02T08:00:00Z",
    updated_at: "2025-10-02T08:00:00Z",
    ...over,
  };
}

describe("periods", () => {
  it("covers whole months, leap years included", () => {
    expect(monthRange("2024-02")).toEqual({ start: "2024-02-01", end: "2024-02-29" });
    expect(monthRange("2025-12")).toEqual({ start: "2025-12-01", end: "2025-12-31" });
  });
  it("names a whole month by its month and other ranges by their days", () => {
    expect(wholeMonth("2025-09-01T00:00:00.000Z", "2025-09-30T00:00:00.000Z")).toBe("2025-09");
    expect(wholeMonth("2025-09-01", "2025-09-15")).toBeNull();
    expect(periodText("2025-09-01", "2025-09-30")).toBe("Sep 2025");
    expect(periodText("2025-09-01", "2025-09-15")).toBe("Sep 1 – Sep 15, 2025");
  });
});

describe("userSites", () => {
  it("reads sites, falls back to the single site, and drops bad entries", () => {
    expect(userSites({ sites: [hidd, { name: "no id" }] })).toEqual([hidd]);
    expect(userSites({ site: hidd })).toEqual([hidd]);
    expect(userSites(null)).toEqual([]);
  });
});

describe("productCards", () => {
  it("shows the month's state, approved over pending over rejected, and the latest record", () => {
    const rows = [
      row({ production_id: 1, status: "rejected" }),
      row({ production_id: 2, status: "pending", start_date: "2025-09-01", end_date: "2025-09-15" }),
      row({ production_id: 3, status: "approved", start_date: "2025-08-01", end_date: "2025-08-31", quantity: 3900 }),
    ];
    const [rodCard, cableCard] = productCards([rod, cable], rows, "2025-09");
    expect(rodCard.state).toBe("pending");
    expect(rodCard.record?.production_id).toBe(2);
    expect(rodCard.last?.production_id).toBe(1);
    expect(cableCard).toMatchObject({ state: "todo", last: null, record: null });
    expect(productCards([rod], rows, "2025-08")[0].state).toBe("approved");
    expect(productCards([rod], [rows[0]], "2025-09")[0].state).toBe("rejected");
  });
  it("only counts the product's own site", () => {
    const other = row({ site: { site_id: 2, name: "Sitra" } });
    expect(productCards([rod], [other], "2025-09")[0].state).toBe("todo");
  });
});

describe("draft", () => {
  it("lists what is missing, and checks a custom range's order", () => {
    expect(draftErrors(newDraft({ siteId: null }))).toEqual({
      site: "Choose a site",
      product: "Choose a product",
      quantity: "Enter a quantity above 0",
      unit: "Choose a unit",
      month: "Choose a month",
    });
    const d = { ...newDraft({ siteId: 1, product: rod }), quantity: 5, mode: "range" as const, start: "2025-09-10", end: "2025-09-01" };
    expect(draftErrors(d)).toEqual({ end: "End date can't be before the start date" });
  });
  it("posts a month as its first and last day, with the product's unit", () => {
    const d = { ...newDraft({ siteId: 1, product: rod, month: "2025-09" }), quantity: 4200, notes: "  " };
    expect(createPayload(d)).toEqual({ product_id: 7, site_id: 1, quantity: 4200, unit: "t", start_date: "2025-09-01", end_date: "2025-09-30" });
  });
  it("opens a whole-month record on the month picker and other ranges as a custom range", () => {
    expect(draftFromRow(row())).toMatchObject({ mode: "month", month: "2025-09", quantity: 4200 });
    const custom = draftFromRow(row({ start_date: "2025-09-01T00:00:00.000Z", end_date: "2025-09-15T00:00:00.000Z", notes: "half" }));
    expect(custom).toMatchObject({ mode: "range", month: null, start: "2025-09-01", end: "2025-09-15" });
    expect(updatePayload(custom)).toEqual({ quantity: 4200, unit: "t", start_date: "2025-09-01", end_date: "2025-09-15", notes: "half" });
  });
});
