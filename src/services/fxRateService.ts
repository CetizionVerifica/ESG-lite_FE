import api from "../api/axios";

/** S3-5 exchange rates and price deflators (ESG-lite src/scope3/spend). */

export interface Currency {
  code: string;
  name: string;
}

/** The deflator a spend row uses: index[base_year] ÷ index[spend_year]. */
export interface DeflatorUsed {
  country: string;
  base_year: number;
  spend_year: number;
  base_index: number;
  spend_index: number;
  source: string;
}

/** `GET /fx-rates`: the rate and deflator a spend row of that currency and day would use. 1 `currency` = `rate` `to`. */
export interface SpendRate {
  currency: string;
  to: string;
  date: string;
  rate: number;
  /** The date of the stored rate (the spend date, or the nearest earlier day). */
  as_of: string;
  source: string;
  /** No rate within 7 days before the date: the latest one was used. */
  fallback: boolean;
  deflator: DeflatorUsed | null;
  no_deflator: boolean;
}

export const getCurrencies = async (): Promise<Currency[]> => {
  const { data } = await api.get<{ currencies: Currency[] }>("/fx-rates/currencies");
  return data.currencies;
};

export const getFxRate = async (q: { currency: string; date: string; to: string; price_year?: number | null }): Promise<SpendRate> => {
  const params: Record<string, string | number> = { currency: q.currency, date: q.date, to: q.to };
  if (q.price_year) params.price_year = q.price_year;
  const { data } = await api.get<SpendRate>("/fx-rates", { params });
  return data;
};
