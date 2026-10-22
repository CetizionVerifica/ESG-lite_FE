/**
 * Manager edit of one entry, ported from the old Manager EmissionsTable edit
 * modal: which options a field offers (dependent selects), what a change
 * clears, and how the emission category follows the selects when the form
 * has a category mapping.
 */
import { sameUnit, unitNotOfferedMessage } from "../../lib/emissions/unitOptions";
import { type ColumnConfig, META_KEYS, humanize } from "./logic";

type Option = { id: string | number; label: string };
export type Activity = Record<string, unknown>;

const lower = (v: unknown) => String(v).toLowerCase();
/** Mapping keys as stored can carry stray spaces ("Process Organic Waste |Reuse"). */
const mapKey = (v: string) =>
  v
    .split("|")
    .map((part) => part.trim().replace(/\s+/g, " ").toLowerCase())
    .join("|");
const byName = (config: ColumnConfig, name: string) => config.columns?.find((c) => lower(c.column_name) === lower(name));
const optionsOf = (config: ColumnConfig, name: string): Option[] => {
  const col = byName(config, name);
  return col ? config.column_options?.[String(col.pk_id)] ?? [] : [];
};

export function parentOf(config: ColumnConfig, column: string): string | undefined {
  const deps = config.column_dependencies ?? {};
  const key = Object.keys(deps).find((k) => lower(k) === lower(column));
  return key ? deps[key] : undefined;
}

/** Select columns in chain order (root → leaf), or every select column when there are no dependencies. */
export function selectChain(config: ColumnConfig): string[] {
  const deps = config.column_dependencies ?? {};
  const children = new Set(Object.keys(deps));
  const roots = [...new Set(Object.values(deps))].filter((c) => !children.has(c));
  if (roots.length === 0) return (config.columns ?? []).filter((c) => c.column_type === "select").map((c) => c.column_name);
  const out: string[] = [];
  const walk = (col: string) => {
    out.push(col);
    for (const [child, parent] of Object.entries(deps)) if (parent === col) walk(child);
  };
  roots.forEach(walk);
  return out;
}

/** The label of `column`'s current value, looked up in its dependent lists under `parentKeys` first. */
function labelOf(config: ColumnConfig, column: string, value: unknown, parentKeys: string[] = []): string {
  for (const key of parentKeys) {
    const dep = config.dependent_options?.[column]?.[key]?.find((o) => String(o.id) === String(value));
    if (dep) return dep.label;
  }
  const own = optionsOf(config, column).find((o) => String(o.id) === String(value) || lower(o.label) === lower(value));
  return own?.label ?? String(value);
}

/** Options for a field given the current values; null means a free input. */
export function fieldOptions(config: ColumnConfig | undefined, column: string, activity: Activity): Option[] | null {
  if (!config?.columns) return null;
  const parent = parentOf(config, column);
  const depOpts = config.dependent_options;
  if (parent && depOpts) {
    const childDeps = depOpts[column] ?? Object.entries(depOpts).find(([k]) => lower(k) === lower(column))?.[1];
    if (!childDeps) return null;
    const parentValue = activity[parent];
    if (!parentValue) return null;

    let parentLabel = String(parentValue);
    const grandparent = parentOf(config, parent);
    if (grandparent) {
      // A dependent parent's id lives in its own dependent lists.
      for (const opts of Object.values(depOpts[parent] ?? {})) {
        const hit = opts.find((o) => String(o.id) === String(parentValue));
        if (hit) {
          parentLabel = hit.label;
          break;
        }
      }
    }
    if (parentLabel === String(parentValue)) {
      const hit = optionsOf(config, parent).find((o) => String(o.id) === String(parentValue) || lower(o.label) === lower(parentValue));
      if (hit) parentLabel = hit.label;
    }
    if (grandparent) {
      // Three-level chains key the child's options by "grandparent|parent".
      for (const gp of optionsOf(config, grandparent)) {
        const composite = childDeps[`${gp.label}|${parentLabel}`];
        if (composite?.length) return composite;
      }
    }
    const result =
      childDeps[parentLabel] ??
      Object.entries(childDeps).find(([k]) => lower(k) === lower(parentLabel))?.[1] ??
      childDeps[String(parentValue)];
    return result?.length ? result : null;
  }
  const own = optionsOf(config, column);
  return own.length ? own : null;
}

/** emission_category from the select values, via the form's category mapping ("a|b|c" keys, longest match first). */
export function resolveEmissionCategory(config: ColumnConfig, activity: Activity): string | null {
  const ecm = config.emission_category_mapping ?? {};
  if (Object.keys(ecm).length === 0) return null;
  const find = (key: string) => {
    if (ecm[key]) return ecm[key];
    // Loose match only when it is unambiguous: two keys that differ only in spacing could name different factors.
    const hits = Object.entries(ecm).filter(([k]) => mapKey(k) === mapKey(key));
    return hits.length === 1 ? hits[0][1] : null;
  };
  const deps = config.column_dependencies ?? {};

  if (Object.keys(deps).length === 0) {
    for (const col of selectChain(config)) {
      const val = activity[col];
      if (!val) continue;
      const hit = find(labelOf(config, col, val));
      if (hit) return hit;
    }
    return null;
  }

  // Every select in the chain must be filled, as in the old form.
  const labels: string[] = [];
  for (const col of selectChain(config)) {
    const val = activity[col];
    if (!val) return null;
    // Dependent lists are keyed by the parent's label, or "grandparent|parent" in three-level chains.
    const keys = parentOf(config, col) && labels.length ? [labels[labels.length - 1], labels.slice(-2).join("|")] : [];
    labels.push(labelOf(config, col, val, keys));
  }
  for (let i = labels.length; i > 0; i--) {
    const hit = find(labels.slice(0, i).join("|"));
    if (hit) return hit;
  }
  return null;
}

/** Sets one field, clears the fields that depend on it, and re-resolves the emission category. */
export function applyChange(config: ColumnConfig | undefined, activity: Activity, column: string, value: string): Activity {
  const next: Activity = { ...activity, [column]: value };
  if (!config) return next;
  const deps = config.column_dependencies ?? {};
  const clear = (col: string) => {
    for (const [child, parent] of Object.entries(deps)) {
      if (lower(parent) === lower(col)) {
        next[child] = "";
        clear(child);
      }
    }
  };
  clear(column);
  if (Object.keys(config.emission_category_mapping ?? {}).length > 0 && byName(config, column)?.column_type === "select") {
    next.emission_category = resolveEmissionCategory(config, next) ?? "";
  }
  return next;
}

/**
 * Older entries store only emission_category; fill empty select fields from
 * the mapping key that produced it, so the form shows what was chosen.
 */
export function prefillFromCategory(config: ColumnConfig | undefined, activity: Activity): Activity {
  const stored = activity.emission_category;
  const ecm = config?.emission_category_mapping ?? {};
  if (!config || !stored || Object.keys(ecm).length === 0) return activity;
  const key = Object.entries(ecm).find(([, v]) => lower(v) === lower(stored))?.[0];
  if (!key) return activity;
  const next = { ...activity };
  const chain = selectChain(config);
  key.split("|").forEach((label, i) => {
    const col = chain[i];
    if (!col || next[col]) return;
    const opts = fieldOptions(config, col, next) ?? optionsOf(config, col);
    const hit = opts.find((o) => mapKey(o.label) === mapKey(label));
    if (hit) next[col] = String(hit.id);
  });
  return next;
}

/**
 * The form's starting values. Entries saved without an emission_category
 * (older imports) get it from their select values, so a manager who changes
 * only the amount isn't blocked by "choose every option" with every option
 * already chosen.
 */
export function initialActivity(config: ColumnConfig | undefined, activity: Activity): Activity {
  const next = prefillFromCategory(config, activity);
  if (!config || next.emission_category || Object.keys(config.emission_category_mapping ?? {}).length === 0) return next;
  const resolved = resolveEmissionCategory(config, next);
  return resolved ? { ...next, emission_category: resolved } : next;
}

/** Field keys in form order: configured columns first, then anything else stored. */
export function editableKeys(config: ColumnConfig | undefined, activity: Activity): string[] {
  const skip = (k: string) => META_KEYS.has(k) || k === "emission_category";
  const configured = (config?.columns ?? []).map((c) => c.column_name).filter((k) => !skip(k));
  const stored = Object.keys(activity).filter((k) => !skip(k) && !configured.some((c) => lower(c) === lower(k)));
  return [...configured, ...stored];
}

export function isNumberField(config: ColumnConfig | undefined, column: string, value: unknown): boolean {
  const col = config ? byName(config, column) : undefined;
  if (col) return col.column_type === "number";
  return value !== "" && value !== null && value !== undefined && !Number.isNaN(Number(value));
}

const stripMeta = (activity: Activity) => Object.fromEntries(Object.entries(activity).filter(([k]) => !META_KEYS.has(k)));

/** Same values, ignoring key order, bookkeeping keys and number vs string ("9.17" = 9.17). */
export function sameActivity(a: Activity, b: Activity): boolean {
  const norm = (x: Activity) =>
    Object.entries(stripMeta(x))
      .map(([k, v]) => [k, v === null || v === undefined ? "" : String(v)] as const)
      .filter(([, v]) => v !== "")
      .sort(([k1], [k2]) => (k1 < k2 ? -1 : k1 > k2 ? 1 : 0));
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}

export type EditStart = { activity: Activity; date: string; unit: string };

/**
 * The body for PUT /user/emissions/manager-edit/:id: only what the manager
 * changed. Sending unchanged activity_data makes the backend recalculate it,
 * which zeroes a row stored without a category or unit, so a date-only fix
 * sends just the date. A unit change carries the values too, so a factor
 * resolved from the options is saved with it.
 */
export function editPayload(activity: Activity, date: string, unit: string, reason: string, start?: EditStart) {
  const unitChanged = !start || (unit || "") !== (start.unit || "");
  const activityChanged = !start || unitChanged || !sameActivity(activity, start.activity);
  return {
    activity_data: activityChanged ? stripMeta(activity) : undefined,
    date_of_reporting: !start || date !== start.date ? date : undefined,
    activity_data_unit: unitChanged ? unit || undefined : undefined,
    reason: reason.trim(),
  };
}

export const EDIT_REASON_MIN = 5;

type EditErrors = { reason?: string; category?: string; unit?: string; amount?: string };

export const AMOUNT_ERROR = "Enter an amount greater than 0";

/**
 * Number fields that stop the save, with their message: 0 or a negative is never
 * an amount (the server would skip it and use another field's number), and at
 * least one must be filled in, so the edit isn't refused for having no amount. `start` decides which fields are
 * numbers, so a cleared field still counts.
 */
export function amountErrors(config: ColumnConfig | undefined, activity: Activity, start: Activity): Record<string, string> {
  const keys = editableKeys(config, activity).filter((k) => !fieldOptions(config, k, activity) && isNumberField(config, k, start[k] ?? activity[k]));
  const num = (k: string) => {
    const raw = String(activity[k] ?? "").trim();
    return raw === "" ? null : Number(raw);
  };
  const errors: Record<string, string> = {};
  const anyPositive = keys.some((k) => (num(k) ?? 0) > 0);
  for (const k of keys) {
    const v = num(k);
    if ((v !== null && !(v > 0)) || (v === null && !anyPositive)) errors[k] = AMOUNT_ERROR;
  }
  return errors;
}

/**
 * `category` is the resolved emission factor. Saving without one keeps the old
 * total while the entered values change, so it is required. So is `unit`: the
 * backend can't apply a factor without one and saves the total as 0.
 * `unitChoices` is false when no units are set up to pick from.
 */
export function editErrors(reason: string, category = "x", mapped = true, unit = "x", unitChoices = true): EditErrors {
  const errors: EditErrors = {};
  if (reason.trim().length < EDIT_REASON_MIN) errors.reason = `Say why this changes (at least ${EDIT_REASON_MIN} characters)`;
  if (!category.trim()) errors.category = mapped ? "Choose every option until the emission factor is set" : "Choose an emission factor";
  if (!unit.trim())
    errors.unit = unitChoices
      ? "Choose a unit, without one the total would be 0"
      : "This entry has no unit and none are set up for its category, so its values can't be recalculated";
  return errors;
}

/**
 * #183: a unit the emission factor doesn't offer stops the save, unless it is the entry's own
 * unit kept as it was (shown as "(no longer offered)"), so saving unchanged values works as before.
 */
export function unitOfferError(unit: string, category: string, offered: string[] | null, stored: string): string | undefined {
  if (!offered || !unit.trim() || sameUnit(unit, stored) || offered.some((u) => sameUnit(u, unit))) return undefined;
  return unitNotOfferedMessage(unit, category, offered);
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** One line next to the Save button saying why nothing was saved. */
export function blockedMessage(errors: EditErrors): string | null {
  const missing = [
    errors.category && lowerFirst(errors.category),
    errors.unit && lowerFirst(errors.unit),
    errors.amount && lowerFirst(errors.amount),
    errors.reason && `add a reason for the change (at least ${EDIT_REASON_MIN} characters)`,
  ].filter(Boolean);
  return missing.length ? `Not saved yet: ${missing.join(", and ")}.` : null;
}

export const parentPrompt = (config: ColumnConfig | undefined, column: string) => {
  const parent = config ? parentOf(config, column) : undefined;
  return parent ? `Select ${humanize(parent).toLowerCase()} first` : undefined;
};
