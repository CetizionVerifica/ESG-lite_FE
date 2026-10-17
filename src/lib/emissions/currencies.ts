/**
 * Currencies the engine can convert (S3-4, ESG-lite
 * `emissionWrite/units.ts` CONVERTIBLE_CURRENCIES). GBP, BHD, SAR and AED were
 * offered by older forms but have no rate, so they are not offered any more.
 * A static list until S3-5 brings a real FX source.
 */
export const CONVERTIBLE_CURRENCIES = ["INR", "USD", "EUR"] as const;

const convertible = new Set<string>(CONVERTIBLE_CURRENCIES);

/**
 * The options to show for an extra field: a currency field offers only the
 * convertible currencies, in the form's order, plus the row's current value
 * when it is set to one that isn't (so editing an older entry never drops it
 * silently). Other fields keep their options as they are.
 */
export function extraFieldOptions(field: { key: string; options?: string[] }, current?: string | null): string[] {
  const options = field.options ?? [];
  if (field.key !== "currency") return options;
  const kept = options.filter((o) => convertible.has(o.trim().toUpperCase()));
  return current && !kept.includes(current) ? [...kept, current] : kept;
}
