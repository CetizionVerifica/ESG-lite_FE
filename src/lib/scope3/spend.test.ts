import { describe, expect, it } from "vitest";
import type { SpendRate } from "../../services/fxRateService";
import { calculateEmission, createEmissionCalculator, SPEND_RATE_PENDING } from "../emissions/emissionCalc";
import type { EmissionFactor } from "../emissions/types";
import {
  deflatorLine,
  factorCurrency,
  fxLine,
  formatMoney,
  isSpendRow,
  looksLikeCurrency,
  spendInputOf,
  spendOutcome,
  spendPreviewLine,
  spendRateKey,
  spendRateQuery,
} from "./spend";

// S3-5: mirrors ESG-lite src/scope3/spend/inputs.ts and emissionWrite/methods/spend.ts
// (the API test s3-5-spend uses the same INR rate and US CPI figures).
const eeio: EmissionFactor = {
  emission_factor_id: 1,
  emission_category_name: "Chemicals (USEEIO)",
  factor_value: 0.42,
  denominator_unit: "USD",
  year: 2025,
  factor_type: "eeio_spend",
  price_currency: "USD",
  price_base_year: 2022,
};

const inrRate: SpendRate = {
  currency: "INR",
  to: "USD",
  date: "2026-09-03",
  rate: 1 / 88.9,
  as_of: "2026-09-03",
  source: "ecb",
  fallback: false,
  deflator: { country: "US", base_year: 2022, spend_year: 2026, base_index: 292.655, spend_index: 330.2, source: "BLS CPI-U" },
  no_deflator: false,
};

const rates = new Map([[spendRateKey("INR", "2026-09-03", "USD", 2022), inrRate]]);
const row = (over: Record<string, unknown> = {}) => ({ id: 1, emission_category: "Chemicals (USEEIO)", spent_value: "1240000", currency: "INR", invoice_date: "2026-09-03", activity_data_unit: "INR", ...over });

describe("spend inputs", () => {
  it("is a spend row by method or by an EEIO factor", () => {
    expect(isSpendRow({ "@method": "spend_based" }, null)).toBe(true);
    expect(isSpendRow({}, eeio)).toBe(true);
    expect(isSpendRow({}, { factor_type: "cradle_to_gate" })).toBe(false);
  });

  it("reads the amount, currency and invoice date; the reporting date without one", () => {
    expect(spendInputOf(row(), "2026-09-30")).toEqual({ amount: 1240000, currency: "INR", spend_date: "2026-09-03", amount_from: "spent_value" });
    expect(spendInputOf(row({ invoice_date: "" }), "2026-09-30")?.spend_date).toBe("2026-09-30");
    expect(spendInputOf(row({ invoice_date: "2026-02-30" }), "2026-09-30")?.spend_date).toBe("2026-09-30");
  });

  it("takes the quantity when the unit is a currency, and not for kWh", () => {
    expect(spendInputOf({ activity_data_unit: "usd" }, "2026-09-30", 500)).toMatchObject({ amount: 500, currency: "USD", amount_from: "quantity" });
    expect(spendInputOf({ activity_data_unit: "kwh" }, "2026-09-30", 500)).toBeNull();
    expect(looksLikeCurrency("ton")).toBe(false);
  });

  it("the factor's currency is its price currency, else a currency unit", () => {
    expect(factorCurrency(eeio)).toBe("USD");
    expect(factorCurrency({ price_currency: null, denominator_unit: "EUR" })).toBe("EUR");
    expect(factorCurrency({ price_currency: null, denominator_unit: "kg" })).toBeNull();
  });

  it("asks for no rate when the amount is already in the factor's currency and year", () => {
    expect(spendRateQuery({ amount: 1, currency: "USD", spend_date: "2022-05-01", amount_from: "spent_value" }, eeio)).toBeNull();
    expect(spendRateQuery({ amount: 1, currency: "USD", spend_date: "2026-05-01", amount_from: "spent_value" }, eeio)).toEqual({ currency: "USD", date: "2026-05-01", to: "USD", price_year: 2022 });
  });
});

describe("spend total (engine mirror)", () => {
  it("amount × rate × deflator × factor, tCO₂e rounded at the end", () => {
    const input = spendInputOf(row(), "2026-09-30")!;
    const out = spendOutcome(input, eeio, rates);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.kg).toBeCloseTo(5192.1603, 3);
    expect(out.tonnes).toBe(5.19);
    expect(spendPreviewLine(input, out, eeio)).toBe("₹ 12,40,000 ≈ USD 12,362 (rate on 3 Sep 2026) × 0.42 kgCO₂e/USD (2022 USD, deflated)");
  });

  it("says why it can't calculate yet", () => {
    expect(spendOutcome({ amount: 5, currency: "JPY", spend_date: "2026-09-03", amount_from: "spent_value" }, eeio, rates)).toMatchObject({ ok: false });
    expect(spendOutcome({ amount: 0, currency: "INR", spend_date: "2026-09-03", amount_from: "spent_value" }, eeio, rates)).toMatchObject({ ok: false });
    expect(spendOutcome({ amount: 5, currency: "INR", spend_date: "2026-09-04", amount_from: "spent_value" }, eeio, rates)).toMatchObject({ ok: false, pending: true });
  });

  it("the calculator uses it for spend rows and leaves other rows alone", () => {
    const input = { emissionFactors: [eeio], spendRates: rates, reportingDate: "2026-09-30" };
    expect(calculateEmission(input, row())).toEqual({ value: 5.19, status: "ok" });
    expect(calculateEmission({ ...input, spendRates: undefined }, row()).status).toBe(SPEND_RATE_PENDING);
    const kg: EmissionFactor = { ...eeio, factor_type: "cradle_to_gate", denominator_unit: "kg", price_currency: null, price_base_year: null };
    expect(calculateEmission({ emissionFactors: [kg] }, { id: 1, emission_category: "Chemicals (USEEIO)", quantity: "100", activity_data_unit: "kg" })).toEqual({ value: 0.04, status: "ok" });
    expect(createEmissionCalculator(input).spendDetail(row())?.outcome.ok).toBe(true);
  });

  it("the invoice date is never read as a quantity", () => {
    const usd = { ...row({ spent_value: undefined, currency: undefined, activity_data_unit: "USD", invoice_date: "2022-03-01" }), amount: "1000" };
    expect(calculateEmission({ emissionFactors: [eeio], reportingDate: "2022-03-31" }, usd)).toEqual({ value: 0.42, status: "ok" });
  });
});

describe("drawer lines", () => {
  it("shows the stored rate, its date and the deflator", () => {
    expect(fxLine({ currency: "INR", to: "USD", rate: 0.01125, as_of: "2026-09-01", source: "ecb", spend_date: "2026-09-03" })).toBe(
      "1 INR = 0.01125 USD, rate of 1 Sep 2026, bought 3 Sep 2026 (ecb)",
    );
    expect(deflatorLine(inrRate.deflator!)).toBe("Deflated from 2026 to 2022 prices (US index 330.2 → 292.655)");
    expect(formatMoney(5000, "AED")).toBe("AED 5,000");
  });
});
