/**
 * S3-5 · spend-based rows, as the engine sees them (ESG-lite
 * src/scope3/spend/inputs.ts and emissionWrite/methods/spend.ts). Pure: the
 * rate and deflator come from `GET /fx-rates` (useSpendRates). The preview
 * mirrors the engine; the server always calculates the saved total.
 *
 *   kgCO₂e = amount × rate (to the factor's currency, on the purchase date)
 *            × index[factor price year] ÷ index[spend year] × factor value
 */
import type { SpendRate } from "../../services/fxRateService";
import { formatDate } from "../../ui/format";

export const SPEND_METHOD = "spend_based";
/** The row's method until rows carry `method` (S3-3); same key as ROW_METHOD_COLUMN in lib/emissions/emissionCalc.ts. */
const ROW_METHOD = "@method";

/** The currencies ESGLite converts (backend src/scope3/spend/currencies.ts); the form reads the list from `GET /fx-rates/currencies`. */
export const SUPPORTED_CURRENCIES = ["INR", "USD", "EUR", "GBP", "BHD", "SAR", "AED"] as const;

const SYMBOL: Record<string, string> = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };

/** Row fields a spend row uses (activity_data keys, as the backend reads them). */
export const SPEND_FIELDS = { amount: "spent_value", currency: "currency", invoiceDate: "invoice_date" } as const;
/** The row's method key (`@method`) and value the spend form writes. */
export const SPEND_METHOD_FIELD = "@method";

const ISO_CURRENCY = /^[A-Za-z]{3}$/;
// Fixed list so "kwh" or "ton" never read as a currency (backend looksLikeCurrency).
const KNOWN_CURRENCIES = new Set([
  ...SUPPORTED_CURRENCIES,
  "QAR", "OMR", "KWD", "JPY", "CNY", "AUD", "CAD", "CHF", "SGD", "HKD", "NZD", "SEK", "NOK", "DKK", "ZAR", "BRL", "MXN", "KRW", "IDR", "MYR", "THB", "PKR", "BDT", "LKR", "NPR",
]);

export const isSupportedCurrency = (code: unknown): boolean => (SUPPORTED_CURRENCIES as readonly string[]).includes(String(code ?? "").trim().toUpperCase());
export const looksLikeCurrency = (unit: unknown): boolean => {
  const u = String(unit ?? "").trim().toUpperCase();
  return ISO_CURRENCY.test(u) && KNOWN_CURRENCIES.has(u);
};

/** What the spend preview needs from a factor (the S3-2 metadata the factor list returns). */
export interface SpendFactor {
  factor_value: number | string;
  denominator_unit: string;
  factor_type?: string | null;
  price_currency?: string | null;
  price_base_year?: number | null;
}

type Row = Record<string, unknown> & { _extra_data?: Record<string, unknown> | null; activity_data_unit?: string };

const present = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== "";

/** A field from the row's values, else its extra fields (the backend reads both). */
const fieldOf = (row: Row, key: string): unknown => {
  for (const source of [row, row._extra_data ?? {}]) {
    const k = Object.keys(source).find((x) => x.toLowerCase() === key);
    if (k && present(source[k])) return source[k];
  }
  return undefined;
};

/** The row itself asked for the spend method (the spend form sets it). */
export const rowAsksForSpend = (row: Record<string, unknown>): boolean => String(row[ROW_METHOD] ?? "").trim() === SPEND_METHOD;

/** The row asked for the spend method, or its factor is a spend (EEIO) factor. */
export const isSpendRow = (row: Row, factor: Pick<SpendFactor, "factor_type"> | null | undefined): boolean =>
  rowAsksForSpend(row) || factor?.factor_type === "eeio_spend";

/** The currency the factor is per: its price currency, else its unit when that is a supported currency. */
export const factorCurrency = (factor: Pick<SpendFactor, "price_currency" | "denominator_unit">): string | null => {
  for (const c of [factor.price_currency, factor.denominator_unit]) if (isSupportedCurrency(c)) return String(c).trim().toUpperCase();
  return null;
};

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;
/** "2026-09-03" (or a timestamp) → "2026-09-03"; anything else → null. */
export const isoDay = (value: unknown): string | null => {
  const m = ISO_DAY.exec(String(value ?? "").trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]) ? m[0] : null;
};

export interface SpendInput {
  /** NaN when the amount isn't a number yet. */
  amount: number;
  currency: string;
  spend_date: string;
  amount_from: "spent_value" | "quantity";
}

/**
 * Amount, currency and purchase date, as the backend reads them: the amount
 * spent and its currency on a row that asks for spend, else the row's
 * quantity (`quantity`) when its unit is a currency. The date is the invoice
 * date, else the reporting date.
 */
export function spendInputOf(row: Row, reportingDate: string, quantity: number | null = null): SpendInput | null {
  const spend_date = isoDay(fieldOf(row, SPEND_FIELDS.invoiceDate)) ?? isoDay(row.date_of_reporting) ?? reportingDate.slice(0, 10);
  // As the backend: the amount and currency fields count only on a row that asks for the spend method
  // (older Category 1/2 rows carry an informational "Currency" extra next to their quantity). Either
  // field alone is enough here, so a half-filled spend row says what is still missing.
  const asks = rowAsksForSpend(row);
  const spent = asks ? fieldOf(row, SPEND_FIELDS.amount) : undefined;
  const currency = asks ? fieldOf(row, SPEND_FIELDS.currency) : undefined;
  if (present(spent) || present(currency)) {
    return { amount: parseFloat(String(spent ?? "").replace(/,/g, "")), currency: String(currency ?? "").trim().toUpperCase(), spend_date, amount_from: "spent_value" };
  }
  if (looksLikeCurrency(row.activity_data_unit)) {
    return { amount: quantity ?? NaN, currency: String(row.activity_data_unit).trim().toUpperCase(), spend_date, amount_from: "quantity" };
  }
  return null;
}

/** Cache key for one `GET /fx-rates` call. */
export const spendRateKey = (currency: string, date: string, to: string, priceYear: number | null | undefined): string =>
  `${currency}|${date}|${to}|${priceYear ?? ""}`;

/** The rate query a spend row needs, or null when it needs none (same currency, no price year) or can't ask yet. */
export function spendRateQuery(input: SpendInput, factor: SpendFactor): { currency: string; date: string; to: string; price_year: number | null } | null {
  const to = factorCurrency(factor);
  if (!to || !isSupportedCurrency(input.currency) || !isoDay(input.spend_date)) return null;
  const priceYear = factor.price_base_year ?? null;
  if (input.currency === to && (!priceYear || priceYear === Number(input.spend_date.slice(0, 4)))) return null;
  return { currency: input.currency, date: input.spend_date, to, price_year: priceYear };
}

/** Rate 1, no deflation: an amount already in the factor's currency and price year. */
const sameCurrencyRate = (input: SpendInput, to: string): SpendRate => ({
  currency: input.currency,
  to,
  date: input.spend_date,
  rate: 1,
  as_of: input.spend_date,
  source: "same currency",
  fallback: false,
  deflator: null,
  no_deflator: false,
});

export type SpendOutcome =
  | { ok: true; kg: number; tonnes: number; converted: number; rate: SpendRate; factorValue: number }
  | { ok: false; status: string; pending?: boolean };

/** The engine's spend total for a row, given the rate it would use (from `rates`, keyed by spendRateKey). */
export function spendOutcome(input: SpendInput, factor: SpendFactor, rates: ReadonlyMap<string, SpendRate> | undefined): SpendOutcome {
  if (!present(input.currency)) return { ok: false, status: "Choose the currency" };
  if (!isSupportedCurrency(input.currency)) return { ok: false, status: `${input.currency} can't be converted; use one of ${SUPPORTED_CURRENCIES.join(", ")}` };
  if (!(input.amount > 0)) return { ok: false, status: "Enter the amount spent (a number greater than 0)" };
  const to = factorCurrency(factor);
  if (!to) return { ok: false, status: "This factor isn't per an amount of money; choose a spend factor" };
  const q = spendRateQuery(input, factor);
  const rate = q ? rates?.get(spendRateKey(q.currency, q.date, q.to, q.price_year)) : sameCurrencyRate(input, to);
  if (!rate) return { ok: false, status: "Looking up the exchange rate", pending: true };
  const ratio = rate.deflator ? rate.deflator.base_index / rate.deflator.spend_index : 1;
  const converted = input.amount * rate.rate * ratio;
  const factorValue = Number(factor.factor_value);
  const kg = converted * factorValue;
  // Same rounding as the engine: tCO₂e to 2 dp at the end only.
  return { ok: true, kg, tonnes: Math.round((kg / 1000) * 100) / 100, converted, rate, factorValue };
}

const money = (amount: number, currency: string, decimals = 0) =>
  new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(amount);

const sig = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 4 });

/** "₹ 12,40,000" (Indian grouping for rupees), "AED 5,000". */
export const formatMoney = (amount: number, currency: string): string => `${SYMBOL[currency] ?? currency} ${money(amount, currency, 2)}`;

/**
 * "₹ 12,40,000 ≈ USD 13,950 (rate on 3 Sep 2026) × 0.42 kgCO₂e/USD (2022 USD, deflated)".
 */
export function spendPreviewLine(input: SpendInput, outcome: Extract<SpendOutcome, { ok: true }>, factor: SpendFactor): string {
  const { rate } = outcome;
  const priceYear = factor.price_base_year;
  const prices = priceYear ? (rate.deflator ? ` (${priceYear} ${rate.to}, deflated)` : rate.no_deflator ? ` (${priceYear} ${rate.to}, not deflated: no price index)` : ` (${priceYear} ${rate.to})`) : "";
  const rateNote = rate.source === "same currency" ? "" : rate.fallback ? ` (latest rate, ${formatDate(rate.as_of)})` : ` (rate on ${formatDate(rate.as_of)})`;
  return `${formatMoney(input.amount, input.currency)} ≈ ${rate.to} ${money(outcome.converted, rate.to)}${rateNote} × ${sig.format(outcome.factorValue)} kgCO₂e/${rate.to}${prices}`;
}

/** `emission.fx` as saved on a row (contracts §4 plus `to` and `spend_date`). 1 `currency` = `rate` `to`. */
export interface EmissionFx {
  currency: string;
  to: string;
  rate: number;
  as_of: string;
  source: string;
  spend_date?: string;
}

/** "1 INR = 0.01125 USD, rate of 3 Sep 2026 (ecb)" for drawers. */
export function fxLine(fx: EmissionFx): string {
  const rate = new Intl.NumberFormat("en-US", { maximumSignificantDigits: 6 }).format(fx.rate);
  const late = fx.spend_date && fx.as_of && fx.spend_date !== fx.as_of ? `, bought ${formatDate(fx.spend_date)}` : "";
  return `1 ${fx.currency} = ${rate} ${fx.to}, rate of ${formatDate(fx.as_of)}${late} (${fx.source})`;
}

/** "deflated from 2026 to 2022 prices (US CPI 330.2 → 292.655)" for drawers. */
export function deflatorLine(d: { country: string; base_year: number; spend_year: number; base_index: number; spend_index: number }): string {
  return `Deflated from ${d.spend_year} to ${d.base_year} prices (${d.country} index ${d.spend_index} → ${d.base_index})`;
}
