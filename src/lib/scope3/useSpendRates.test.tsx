// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { createEmissionCalculator } from "../emissions/emissionCalc";
import type { EmissionFactor } from "../emissions/types";
import { SPEND_RATE_FAILED, spendRateKey } from "./spend";
import { useSpendRates } from "./useSpendRates";

vi.mock("../../services/fxRateService", () => ({
  getCurrencies: vi.fn(),
  getFxRate: vi.fn(() => Promise.reject(new Error("503"))),
}));

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
const row = { id: 1, "@method": "spend_based", emission_category: "Chemicals (USEEIO)", spent_value: "1000", currency: "INR", invoice_date: "2026-09-03" };
const input = { emissionFactors: [eeio] };

describe("useSpendRates", () => {
  it("reports the rate keys whose lookup failed, and the preview says the server calculates the total", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useSpendRates([row], input, "2026-09-30"), { wrapper });
    const key = spendRateKey("INR", "2026-09-03", "USD", 2022);
    await waitFor(() => expect(result.current.failed.has(key)).toBe(true));
    expect(result.current.rates.size).toBe(0);

    const calc = createEmissionCalculator({ ...input, spendRates: result.current.rates, spendRateErrors: result.current.failed, reportingDate: "2026-09-30" });
    expect(calc.calculateEmission(row)).toEqual({ value: null, status: SPEND_RATE_FAILED });
  });
});
