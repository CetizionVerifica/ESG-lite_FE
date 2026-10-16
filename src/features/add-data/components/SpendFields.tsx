import { DateField, NumberField, Select } from "../../../ui";
import { useCurrencies } from "../../../lib/scope3/useSpendRates";
import { SPEND_FIELDS, SPEND_METHOD, SPEND_METHOD_FIELD } from "../../../lib/scope3/spend";
import type { ModalRow } from "../types";

type Props = {
  row: ModalRow;
  onChange: (column: string, value: string) => void;
  amountError?: string;
  /** "Choose the currency" and similar, under the Currency field. */
  currencyError?: string;
};

const parseAmount = (v: unknown): number | null => {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/**
 * S3-5 "From the amount spent": the amount, its currency (only the ones
 * ESGLite converts) and an optional invoice date. The currency is also the
 * row's unit, as the backend stores it.
 */
export function SpendFields({ row, onChange: change, amountError, currencyError }: Props) {
  const currencies = useCurrencies();
  // Any value typed here makes the row a spend row for the engine ("From the amount spent").
  const onChange = (column: string, value: string) => {
    if (String(row[SPEND_METHOD_FIELD] ?? "") !== SPEND_METHOD) change(SPEND_METHOD_FIELD, SPEND_METHOD);
    change(column, value);
  };
  const currency = String(row[SPEND_FIELDS.currency] ?? "");
  return (
    <>
      <NumberField
        label="Amount spent"
        value={parseAmount(row[SPEND_FIELDS.amount])}
        onChange={(v) => onChange(SPEND_FIELDS.amount, v === null ? "" : String(v))}
        min={0}
        unit={currency || undefined}
        error={amountError}
        required
      />
      <Select<string>
        label="Currency"
        value={currency || null}
        onChange={(v) => {
          onChange(SPEND_FIELDS.currency, v ?? "");
          onChange("activity_data_unit", v ?? "");
        }}
        options={currencies.map((c) => ({ value: c.code, label: c.name && c.name !== c.code ? `${c.code} · ${c.name}` : c.code }))}
        placeholder="Choose a currency"
        error={currencyError}
        required
      />
      <DateField
        label="Invoice date"
        value={String(row[SPEND_FIELDS.invoiceDate] ?? "")}
        onChange={(v) => onChange(SPEND_FIELDS.invoiceDate, v)}
        help="Optional. The exchange rate is the one on this date; without it, the reporting date."
      />
    </>
  );
}
