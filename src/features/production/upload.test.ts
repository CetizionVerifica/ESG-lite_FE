import { describe, expect, it } from "vitest";
import type { Product } from "../../services/productService";
import { bulkEntries, failedLines, headerProblem, isValidRow, parseDateToMonthYear, parseRows, rowErrors, toReview } from "./upload";

const hidd = { site_id: 1, name: "Hidd" };
const rod: Product = { product_id: 7, name: "Wire Rod", unit: "t", site: hidd, created_at: "", updated_at: "" };

describe("parseDateToMonthYear (same formats as the old upload)", () => {
  it.each([
    ["19-03-2027", 3, 2027],
    ["19/03/2027", 3, 2027],
    ["03-04-2027", 4, 2027],
    ["03-2027", 3, 2027],
    ["2027-03-19", 3, 2027],
    ["2027-03", 3, 2027],
    ["March 2027", 3, 2027],
    ["mar, 2027", 3, 2027],
    ["Mar-27", 3, 2027],
    ["03, 2027", 3, 2027],
    ["03, 27", 3, 2027],
  ])("%s", (raw, month, year) => {
    expect(parseDateToMonthYear(raw)).toEqual({ month, year });
  });
  it("reads Excel serial days and dates", () => {
    expect(parseDateToMonthYear(46096)).toEqual({ month: 3, year: 2026 }); // 2026-03-15
    expect(parseDateToMonthYear(new Date(2025, 8, 1))).toEqual({ month: 9, year: 2025 });
  });
  it("gives up on anything else", () => {
    for (const raw of ["", null, "soon", "13-2027", "Smarch 2027", 0]) expect(parseDateToMonthYear(raw)).toEqual({ month: null, year: null });
  });
});

describe("headerProblem", () => {
  it("accepts the template and month + year columns, in any case or spacing", () => {
    expect(headerProblem(["product", "quantity", "unit", "date", "notes"])).toBeNull();
    expect(headerProblem(["Product", "Quantity", "Unit", "Month", "Year"])).toBeNull();
  });
  it("names what is missing", () => {
    expect(headerProblem(["product", "date"])).toBe("The sheet is missing the quantity, unit columns. Use the template's column names.");
    expect(headerProblem(["product", "quantity", "unit", "month"])).toMatch(/needs a "date" column/);
  });
});

describe("parse and review", () => {
  const headers = ["Product", "Quantity", "Unit", "Date", "Notes"];
  const sheet = [
    { line: 2, raw: { Product: " wire  rod ", Quantity: "1,200", Unit: "", Date: "march, 2025", Notes: "ok" } },
    { line: 3, raw: { Product: "Wire rod", Quantity: -1, Unit: "t", Date: "whenever", Notes: "" } },
    { line: 4, raw: { Product: "Cable", Quantity: 5, Unit: "km", Date: "04, 2025", Notes: "" } },
    { line: 5, raw: { Product: "", Quantity: 5, Unit: "t", Date: "04, 2025", Notes: "" } },
  ];

  it("matches products by name, takes the product's unit, and excludes the rest with a reason", () => {
    const { rows, excluded } = toReview(parseRows(headers, sheet), [rod], "Hidd");
    expect(rows.map((r) => r.line)).toEqual([2, 3]);
    expect(rows[0]).toMatchObject({ productId: 7, quantity: 1200, unit: "t", start: "2025-03-01", end: "2025-03-31", notes: "ok" });
    expect(excluded).toEqual([
      { line: 4, product: "Cable", reason: "Cable isn't a product of Hidd" },
      { line: 5, product: "", reason: "The product cell is empty" },
    ]);
    expect(isValidRow(rows[0])).toBe(true);
    expect(rowErrors(rows[1])).toEqual({ quantity: "Quantity must be above 0", start: 'Couldn\'t read "whenever"; pick the start', end: "Pick the end date" });
  });

  it("reads separate month and year columns", () => {
    const [p] = parseRows(["product", "quantity", "unit", "month", "year"], [{ line: 2, raw: { product: "Wire rod", quantity: 3, unit: "t", month: 2, year: 2024 } }]);
    expect(p).toMatchObject({ month: 2, year: 2024 });
    expect(toReview([p], [rod], "Hidd").rows[0]).toMatchObject({ start: "2024-02-01", end: "2024-02-29" });
  });

  it("builds the bulk body and maps server errors back to sheet rows", () => {
    const { rows } = toReview(parseRows(headers, sheet.slice(0, 1)), [rod], "Hidd");
    expect(bulkEntries(rows, 1)).toEqual([{ product_id: 7, site_id: 1, quantity: 1200, unit: "t", start_date: "2025-03-01", end_date: "2025-03-31", notes: "ok" }]);
    expect(failedLines(rows, [{ row: 1, message: "Product not found" }, { row: 9, message: "?" }])).toEqual([
      { line: 2, message: "Product not found" },
      { line: null, message: "?" },
    ]);
  });
});
