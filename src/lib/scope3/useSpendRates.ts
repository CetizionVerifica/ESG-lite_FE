import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { getCurrencies, getFxRate, type Currency, type SpendRate } from "../../services/fxRateService";
import { findEmissionFactor, findActivityValue, type EmissionCalcInput } from "../emissions/emissionCalc";
import type { ModalRow } from "../emissions/types";
import { SUPPORTED_CURRENCIES, isSpendRow, spendInputOf, spendRateKey, spendRateQuery } from "./spend";

const DAY = 24 * 60 * 60 * 1000;

/** The currencies a spend row may use (`GET /fx-rates/currencies`); the built-in list until it loads or if it fails. */
export function useCurrencies(): Currency[] {
  const q = useQuery({ queryKey: ["fx-rates", "currencies"], queryFn: getCurrencies, staleTime: DAY });
  return q.data ?? SUPPORTED_CURRENCIES.map((code) => ({ code, name: code }));
}

/**
 * The rates the spend rows need, keyed by spendRateKey, for the calculator's
 * `spendRates`. One `GET /fx-rates` per distinct currency, day, factor
 * currency and price year; rates for a past day don't change, so they stay cached.
 */
export function useSpendRates(rows: ModalRow[], input: EmissionCalcInput, reportingDate: string | null): { rates: Map<string, SpendRate>; failed: boolean } {
  const queries = useMemo(() => {
    if (!reportingDate) return [];
    const seen = new Map<string, NonNullable<ReturnType<typeof spendRateQuery>>>();
    for (const row of rows) {
      const factor = row.emission_category ? findEmissionFactor(input, row.emission_category) : undefined;
      if (!factor || !isSpendRow(row, factor)) continue;
      const spend = spendInputOf(row, reportingDate, findActivityValue(input, row));
      const q = spend && spendRateQuery(spend, factor);
      if (q) seen.set(spendRateKey(q.currency, q.date, q.to, q.price_year), q);
    }
    return [...seen.entries()];
  }, [rows, input, reportingDate]);

  const results = useQueries({
    queries: queries.map(([key, q]) => ({
      queryKey: ["fx-rates", key],
      queryFn: () => getFxRate(q),
      staleTime: DAY,
      retry: 1,
    })),
  });

  // A new map only when a rate arrives, so the calculator isn't rebuilt on every render.
  const signature = results.map((r, i) => (r.data ? queries[i][0] : "")).join(";");
  const rates = useMemo(() => {
    const map = new Map<string, SpendRate>();
    results.forEach((r, i) => {
      if (r.data) map.set(queries[i][0], r.data);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by the loaded rates
  }, [signature]);
  return { rates, failed: results.some((r) => r.isError) };
}
