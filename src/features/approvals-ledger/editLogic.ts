/**
 * Manager edit of one entry, ported from the old Manager EmissionsTable edit
 * modal: which options a field offers (dependent selects), what a change
 * clears, and how the emission category follows the selects when the form
 * has a category mapping.
 */
import { type ColumnConfig, META_KEYS, humanize } from "./logic";

type Option = { id: string | number; label: string };
export type Activity = Record<string, unknown>;

const lower = (v: unknown) => String(v).toLowerCase();
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
  const find = (key: string) => ecm[key] ?? Object.entries(ecm).find(([k]) => lower(k) === lower(key))?.[1] ?? null;
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
    const hit = opts.find((o) => lower(o.label) === lower(label));
    if (hit) next[col] = String(hit.id);
  });
  return next;
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

/** The body for PUT /user/emissions/manager-edit/:id (bookkeeping keys stripped). */
export function editPayload(activity: Activity, date: string, unit: string, reason: string) {
  const clean = Object.fromEntries(Object.entries(activity).filter(([k]) => !META_KEYS.has(k)));
  return { activity_data: clean, date_of_reporting: date, activity_data_unit: unit || undefined, reason: reason.trim() };
}

export const EDIT_REASON_MIN = 5;

/**
 * `category` is the resolved emission factor. Saving without one keeps the old
 * total while the entered values change, so it is required.
 */
export function editErrors(reason: string, category = "x"): { reason?: string; category?: string } {
  const errors: { reason?: string; category?: string } = {};
  if (reason.trim().length < EDIT_REASON_MIN) errors.reason = `Say why this changes (at least ${EDIT_REASON_MIN} characters)`;
  if (!category.trim()) errors.category = "Choose every option until the emission factor is set";
  return errors;
}

export const parentPrompt = (config: ColumnConfig | undefined, column: string) => {
  const parent = config ? parentOf(config, column) : undefined;
  return parent ? `Select ${humanize(parent).toLowerCase()} first` : undefined;
};
