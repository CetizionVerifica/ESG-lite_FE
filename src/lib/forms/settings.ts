/**
 * SE-2/SE-3 · What a form fixes for the person entering data, as the server
 * stores it on `column_config` (ESG-lite src/forms/formConfig.ts):
 * `method_by_choice`, `field_settings`, `units`, `currency`. Read tolerantly:
 * a value that doesn't fit is skipped, so a form never breaks the entry screen.
 */
import type { ColumnConfig, ModalRow } from "../emissions/types";

/** One field's settings (a column name or an extra-field key). */
export type FieldSetting = {
  label?: string;
  help?: string;
  default?: string | number;
  hidden?: boolean;
  readonly?: boolean;
  required?: boolean;
};
export type FieldSettings = Record<string, FieldSetting>;

/** A select field whose answers pick the row's method ("Fuel bill" → fuel_based). */
export type MethodByChoice = { column: string; map: Record<string, string> };

export type FormSettings = {
  fieldSettings: FieldSettings;
  methodByChoice: MethodByChoice | null;
  fixedUnit: string | null;
  fixedCurrency: string | null;
};

export const NO_FORM_SETTINGS: FormSettings = { fieldSettings: {}, methodByChoice: null, fixedUnit: null, fixedCurrency: null };

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

function readFieldSetting(v: unknown): FieldSetting | null {
  if (!isRecord(v)) return null;
  const s: FieldSetting = {};
  if (text(v.label)) s.label = text(v.label);
  if (text(v.help)) s.help = text(v.help);
  if (typeof v.default === "number" || (typeof v.default === "string" && v.default !== "")) s.default = v.default;
  if (v.hidden === true) s.hidden = true;
  if (v.readonly === true) s.readonly = true;
  if (v.required === true) s.required = true;
  return s;
}

/** The form's settings; anything that doesn't fit its shape is left out. */
export function readFormSettings(config: Pick<ColumnConfig, "field_settings" | "method_by_choice" | "units" | "currency"> | null | undefined): FormSettings {
  if (!config) return NO_FORM_SETTINGS;
  const fieldSettings: FieldSettings = {};
  if (isRecord(config.field_settings)) {
    for (const [key, v] of Object.entries(config.field_settings)) {
      const s = readFieldSetting(v);
      if (s) fieldSettings[key] = s;
    }
  }
  const mbc = config.method_by_choice;
  const methodByChoice =
    isRecord(mbc) && text(mbc.column) && isRecord(mbc.map)
      ? { column: text(mbc.column)!, map: Object.fromEntries(Object.entries(mbc.map).filter(([, m]) => typeof m === "string" && m)) as Record<string, string> }
      : null;
  const fixed = (v: unknown) => (isRecord(v) ? (text(v.fixed) ?? null) : null);
  return { fieldSettings, methodByChoice, fixedUnit: fixed(config.units), fixedCurrency: fixed(config.currency) };
}

/** A field's settings, matching the key without regard to case (as the engine reads columns). */
export function settingFor(settings: FieldSettings, key: string): FieldSetting | undefined {
  if (settings[key]) return settings[key];
  const k = Object.keys(settings).find((name) => name.toLowerCase() === key.toLowerCase());
  return k ? settings[k] : undefined;
}

/** The label a contributor reads: the form's own words, else the field's usual title. */
export const fieldLabelFor = (settings: FieldSettings, key: string, fallback: string) => settingFor(settings, key)?.label ?? fallback;

/** The method the row's answer to the form's choice picks, or null (no map, no answer, or one the map doesn't name). */
export function methodForAnswer(mbc: MethodByChoice | null, answer: unknown): string | null {
  if (!mbc) return null;
  const a = String(answer ?? "").trim().toLowerCase();
  if (!a) return null;
  const hit = Object.entries(mbc.map).find(([choice]) => choice.trim().toLowerCase() === a);
  return hit ? hit[1] : null;
}

/**
 * A new row with the form's defaults filled in where it is empty: columns on
 * the row, extra fields in `_extra_data`. Hidden fields get theirs too, so the
 * preview total matches what the server stores (it fills them the same way).
 * What was filled is remembered in `_defaults` (see ModalRow).
 */
export function withDefaults(row: ModalRow, settings: FieldSettings, extraKeys: readonly string[]): ModalRow {
  const next: ModalRow = { ...row, _extra_data: { ...(row._extra_data ?? {}) } };
  const filled: Record<string, string> = { ...(row._defaults ?? {}) };
  for (const [key, s] of Object.entries(settings)) {
    if (s.default === undefined) continue;
    const value = String(s.default);
    if (extraKeys.includes(key)) {
      const extra = next._extra_data as Record<string, unknown>;
      if (!String(extra[key] ?? "").trim()) {
        extra[key] = value;
        filled[`_extra_data.${key}`] = value;
      }
    } else {
      const k = Object.keys(next).find((name) => name.toLowerCase() === key.toLowerCase()) ?? key;
      if (!String(next[k] ?? "").trim()) {
        next[k] = value;
        filled[k] = value;
      }
    }
  }
  if (Object.keys(filled).length) next._defaults = filled;
  return next;
}

/** True when the row's value for `key` is only what the form filled in. */
export const isDefaultValue = (row: ModalRow, key: string, value: unknown): boolean => row._defaults?.[key] !== undefined && row._defaults[key] === String(value);
