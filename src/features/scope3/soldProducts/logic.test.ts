import { describe, expect, it } from "vitest";
import type { SoldProduct } from "../../../services/scope3SoldProductsService";
import { SALES_HEADERS, TEMPLATE_ROWS, draftErrors, eolBody, eolDraft, eolTotal, eolValid, monthText, parseSales, productDraft, toBody } from "./logic";

const product = (over: Partial<SoldProduct> = {}): SoldProduct => ({
  product_id: 1,
  name: "Cable drum 4 core",
  unit: "drum",
  declared_unit: null,
  site_id: 4,
  site_name: "Plant",
  mass_per_unit_kg: 2,
  lifetime_uses: null,
  eol_mix: null,
  use_profile: null,
  ...over,
});
const products = [product(), product({ product_id: 2, name: "Copper rod", unit: "t" })];

describe("sales sheet (S3-10)", () => {
  it("reads the template", () => {
    const parsed = parseSales([[...SALES_HEADERS], ...TEMPLATE_ROWS], products, 4);
    expect(parsed.errors).toEqual([]);
    expect(parsed.sales).toEqual([
      { product_id: 1, period: "2026-01", quantity: 1200, unit: "drum", region: "India" },
      { product_id: 1, period: "2026-02", quantity: 950, unit: "drum", region: "India" },
      { product_id: 2, period: "2026-01", quantity: 18, unit: "t", region: "Germany" },
    ]);
  });

  it("accepts close headers in any order, Excel dates and no region column", () => {
    const parsed = parseSales([["Qty", "UOM", "Product name", "Date"], ["1,500", "drum", "cable drum 4 core", 46037]], products, null);
    expect(parsed.missing).toEqual([]);
    // 46037 = 2026-01-15 in Excel.
    expect(parsed.sales).toEqual([{ product_id: 1, period: "2026-01", quantity: 1500, unit: "drum", region: null }]);
  });

  it("prefers the chosen site's product when two sites share a name", () => {
    const twin = product({ product_id: 9, site_id: 5 });
    expect(parseSales([["Product", "Month", "Quantity", "Unit"], ["Cable drum 4 core", "2026-03", 1, "drum"]], [twin, products[0]], 5).sales[0].product_id).toBe(9);
    expect(parseSales([["Product", "Month", "Quantity", "Unit"], ["Cable drum 4 core", "2026-03", 1, "drum"]], [twin, products[0]], 4).sales[0].product_id).toBe(1);
  });

  it("names missing columns and bad rows", () => {
    expect(parseSales([["Product", "Quantity"]], products, null).missing).toEqual(["Month", "Unit"]);
    const parsed = parseSales(
      [
        ["Product", "Month", "Quantity", "Unit"],
        ["Unknown", "2026-01", 1, "kg"],
        ["Copper rod", "March", 1, "t"],
        ["Copper rod", "2026-03", 0, "t"],
        ["Copper rod", "2026-03", 5, ""],
      ],
      products,
      null,
    );
    expect(parsed.errors).toEqual([
      'Row 2: "Unknown" isn\'t one of the products on your sites.',
      "Row 3: Month must look like 2026-03.",
      "Row 4: Quantity must be more than 0.",
      "Row 5: enter a unit.",
    ]);
  });

  it("monthText", () => {
    expect(monthText("2026-3")).toBe("2026-03");
    expect(monthText("2026-03-31")).toBe("2026-03");
    expect(monthText("2026-13")).toBeNull();
  });
});

describe("end-of-life mix", () => {
  it("must add up to 100 % or be blank; stored as fractions without the 0 % rows", () => {
    const d = eolDraft([
      { treatment: "landfill", share: 0.9 },
      { treatment: "incineration", share: 0.1 },
    ]);
    expect(eolTotal(d)).toBe(100);
    expect(eolValid(d)).toBe(true);
    expect(eolBody({ ...d, recycling: 0 })).toEqual([
      { treatment: "landfill", share: 0.9 },
      { treatment: "incineration", share: 0.1 },
    ]);
    expect(eolValid({ ...d, landfill: 80 })).toBe(false);
    expect(draftErrors({ ...productDraft(product()), eol: { ...d, landfill: 80 } }).eol).toBe("Shares must add up to 100 % (now 90 %).");
    expect(eolBody(eolDraft(null))).toBeNull();
  });
});

describe("use profile body", () => {
  it("keeps only the fields the use type needs", () => {
    const d = { ...productDraft(product()), use_type: "gas" as const, use_option: "R134a", gas_per_product_kg: 2, energy_per_use_kwh: 5, packaging_kg_per_unit: 0.5 };
    expect(toBody(d).use_profile).toEqual({
      packaging_kg_per_unit: 0.5,
      use_type: "gas",
      use_option: "R134a",
      energy_per_use_kwh: null,
      gas_per_product_kg: 2,
      gas_released_pct: null,
      final_product_share_pct: null,
    });
    expect(toBody(productDraft(product())).use_profile).toBeNull();
    expect(draftErrors({ ...d, use_option: "India" }).use_option).toBeDefined();
    const part = toBody({ ...productDraft(product()), use_type: "intermediate", use_option: "R134a", final_product_share_pct: 4, lifetime_uses: 300000 });
    expect(part).toMatchObject({ lifetime_uses: 300000, use_profile: { use_type: "intermediate", use_option: null, final_product_share_pct: 4 } });
  });
});
