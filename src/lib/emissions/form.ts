// The entry form a ColumnConfig describes, as pure functions: which columns are
// selects, their (dependent) options and labels, the emission category a row's
// selections map to, and how a row changes when a field is edited.
//
// Moved from pages/UserDataEntry/index.tsx (getColumnDropdownOptions,
// getOptionLabel, getAutoEmissionCategory, handleModalRowChange …) with the
// same lookup order, so a row resolves to the same emission category here as
// on the legacy page.
import { resolveSpecMethod, specNumericColumns } from "./emissionCalc";
import type {
  CalculationSpec,
  ColumnConfig,
  ColumnDependencies,
  ColumnEntity,
  ColumnOptionsMap,
  DependentOptionsMap,
  DropdownOptionValue,
  EmissionCategoryMapping,
  ExtraFieldDefinition,
  ModalRow,
} from "./types";

export interface FormModel {
  columns: ColumnEntity[];
  columnOptions: ColumnOptionsMap;
  dependencies: ColumnDependencies;
  dependentOptions: DependentOptionsMap;
  mapping: EmissionCategoryMapping;
  extraFields: ExtraFieldDefinition[];
  spec: CalculationSpec | null;
}

export const toFormModel = (config: ColumnConfig | null | undefined): FormModel => ({
  columns: config?.columns ?? [],
  columnOptions: config?.column_options ?? {},
  dependencies: config?.column_dependencies ?? {},
  dependentOptions: config?.dependent_options ?? {},
  mapping: config?.emission_category_mapping ?? {},
  extraFields: config?.extra_fields ?? [],
  spec: config?.calculation ?? null,
});

const lower = (s: string) => s.toLowerCase();

/** Value of `key` in an object, matching the key case-insensitively when there's no exact hit. */
function getCI<T>(obj: Record<string, T>, key: string): T | undefined {
  if (key in obj) return obj[key];
  const k = lower(key);
  for (const [name, value] of Object.entries(obj)) if (lower(name) === k) return value;
  return undefined;
}

export const rowValue = (row: ModalRow, key: string): string | undefined => getCI(row, key) as string | undefined;

export const isParentColumn = (m: FormModel, name: string) =>
  Object.values(m.dependencies).some((parent) => lower(parent) === lower(name));

export const isDependentColumn = (m: FormModel, name: string) =>
  Object.keys(m.dependencies).some((child) => lower(child) === lower(name));

export const parentColumnOf = (m: FormModel, name: string): string | null => getCI(m.dependencies, name) ?? null;

const columnByName = (m: FormModel, name: string) => m.columns.find((c) => lower(c.column_name) === lower(name));

const optionFor = (options: DropdownOptionValue[] | undefined, stored: string) =>
  options?.find((o) => String(o.id) === stored) ??
  options?.find((o) => lower(String(o.id)) === lower(stored) || lower(o.label) === lower(stored));

/** A select column: configured as one, has options, or takes part in a dependency. */
export const isSelectColumn = (m: FormModel, col: ColumnEntity) =>
  col.column_type === "select" ||
  (m.columnOptions[String(col.pk_id)]?.length ?? 0) > 0 ||
  isParentColumn(m, col.column_name) ||
  isDependentColumn(m, col.column_name);

/** Columns shown in a row: every column except emission_category, which the row derives. */
export const formColumns = (m: FormModel) => m.columns.filter((c) => lower(c.column_name) !== "emission_category");

/** The label of a parent's stored value, looked up the way the legacy page does. */
function parentLabelOf(m: FormModel, columnName: string, parentValue: string): string {
  const parentCol = parentColumnOf(m, columnName);
  if (!parentCol) return parentValue;
  let label = parentValue;
  // A parent that is itself dependent: its label lives in dependentOptions.
  if (parentColumnOf(m, parentCol) && isDependentColumn(m, parentCol)) {
    for (const options of Object.values(m.dependentOptions[parentCol] ?? {})) {
      const hit = options.find((o) => String(o.id) === parentValue);
      if (hit) {
        label = hit.label;
        break;
      }
    }
  }
  if (label === parentValue) {
    const entity = columnByName(m, parentCol);
    const hit = entity ? optionFor(m.columnOptions[String(entity.pk_id)], parentValue) : undefined;
    if (hit) label = hit.label;
  }
  return label;
}

/**
 * Options for a select column; a dependent column's options follow its parent's value.
 * Three levels down, pass the grandparent's value too: Road › Van and Rail › Van can
 * have different lists, and only the row knows which one it is in.
 */
export function columnOptionsFor(m: FormModel, col: ColumnEntity, parentValue?: string, grandparentValue?: string): DropdownOptionValue[] {
  const name = col.column_name;
  const childDeps = isDependentColumn(m, name) && parentValue ? getCI(m.dependentOptions, name) : undefined;
  if (childDeps && parentValue) {
    const parentCol = parentColumnOf(m, name);
    const parentLabel = parentLabelOf(m, name, parentValue);
    let found: DropdownOptionValue[] | undefined;
    // 0. "grandparent|parent" composite key (3-level configs: Road|Van → fuels).
    const gpCol = parentCol ? parentColumnOf(m, parentCol) : null;
    if (parentCol && gpCol && isDependentColumn(m, parentCol) && grandparentValue) {
      // The row's own grandparent: its key, and never another grandparent's list.
      const key = `${parentLabelOf(m, parentCol, grandparentValue)}|${parentLabel}`;
      found = childDeps[key];
      if (!found?.length) found = getCI(childDeps, key);
    } else if (parentCol && gpCol && isDependentColumn(m, parentCol)) {
      // Grandparent unknown: the first grandparent with a list for this parent.
      const gpEntity = columnByName(m, gpCol);
      for (const gp of (gpEntity && m.columnOptions[String(gpEntity.pk_id)]) || []) {
        const matched = childDeps[`${gp.label}|${parentLabel}`];
        if (matched?.length) {
          found = matched;
          break;
        }
      }
    }
    // 1–4. By label, then by raw value, exact then case-insensitive.
    for (const key of [parentLabel, parentValue]) {
      if (found?.length) break;
      found = childDeps[key];
      if (!found?.length) found = getCI(childDeps, key);
    }
    if (found?.length) return found;
  }
  return m.columnOptions[String(col.pk_id)] ?? [];
}

/** Display label of a stored select value (falls back to the value itself). */
export function optionLabel(m: FormModel, col: ColumnEntity, stored: string, parentValue?: string): string {
  const name = col.column_name;
  if (isDependentColumn(m, name)) {
    const byParent = getCI(m.dependentOptions, name);
    if (byParent) {
      if (parentValue) {
        const hit = optionFor(getCI(byParent, parentValue), stored);
        if (hit) return hit.label;
      }
      for (const options of Object.values(byParent)) {
        const hit = optionFor(options, stored);
        if (hit) return hit.label;
      }
    }
  }
  return optionFor(m.columnOptions[String(col.pk_id)], stored)?.label ?? stored;
}

function findMapping(mapping: EmissionCategoryMapping, key: string) {
  if (mapping[key]) return { key, category: mapping[key] };
  for (const [k, category] of Object.entries(mapping)) if (lower(k) === lower(key)) return { key: k, category };
  return null;
}

/**
 * The emission category a row's selections map to: the dependency chain's
 * labels joined with "|" (root to leaf), case-insensitively, then dropping
 * leading dimensions. Without dependencies, the first select whose label is a
 * mapping key. `key` is the company's name for it, `category` the global one.
 */
export function autoEmissionCategory(m: FormModel, row: ModalRow): { key: string; category: string } | null {
  if (Object.keys(m.mapping).length === 0) return null;

  const children = new Set(Object.keys(m.dependencies));
  const roots = [...new Set(Object.values(m.dependencies))].filter((c) => !children.has(c));

  if (roots.length === 0) {
    for (const col of m.columns.filter((c) => c.column_type === "select")) {
      const value = rowValue(row, col.column_name);
      if (!value) continue;
      const hit = findMapping(m.mapping, optionLabel(m, col, String(value)));
      if (hit) return hit;
    }
    return null;
  }

  const parts: string[] = [];
  const walk = (colName: string): boolean => {
    const value = rowValue(row, colName);
    if (!value) return false;
    const entity = columnByName(m, colName);
    parts.push(entity ? optionLabel(m, entity, String(value), parts[parts.length - 1]) : String(value));
    for (const [child, parent] of Object.entries(m.dependencies)) {
      if (parent === colName && !walk(child)) return false;
    }
    return true;
  };
  for (const root of roots) if (!walk(root)) return null;

  for (let start = 0; start < parts.length; start++) {
    const hit = findMapping(m.mapping, parts.slice(start).join("|"));
    if (hit) return hit;
  }
  return null;
}

/**
 * Whether a column shows in this row. Spec categories hide numeric fields the
 * chosen method doesn't multiply (all of them until a method is chosen;
 * per_unit shows every one a unit could use until the unit is chosen).
 */
export function isColumnVisible(m: FormModel, col: ColumnEntity, row: ModalRow): boolean {
  if (!m.spec || col.column_type !== "number" || isSelectColumn(m, col)) return true;
  const resolved = resolveSpecMethod(m.spec, row);
  if (!resolved) return m.spec.mode === "per_unit" ? specNumericColumns(m.spec).has(col.column_name) : false;
  return resolved.method.multiply.includes(col.column_name);
}

/** Extra fields that apply to the row's emission category. */
export const visibleExtraFields = (m: FormModel, row: ModalRow) =>
  m.extraFields.filter(
    (f) => !f.show_for?.length || f.show_for.some((s) => lower(row.emission_category ?? "").includes(lower(s))),
  );

export function newRow(m: FormModel, id: number): ModalRow {
  const row: ModalRow = { id };
  m.columns.forEach((c) => {
    row[c.column_name] = "";
  });
  row._extra_data = Object.fromEntries(m.extraFields.map((f) => [f.key, ""]));
  return row;
}

/**
 * A row after one field changes: dependants of a changed parent are cleared;
 * a new spec method clears the numbers it doesn't use, prefills its percent
 * fields with 100 and preselects its unit; the emission category is re-derived
 * from the selections (cleared when a mapped column no longer maps).
 */
export function applyChange(m: FormModel, row: ModalRow, column: string, value: string): ModalRow {
  const next: ModalRow = { ...row, [column]: value };

  if (isParentColumn(m, column)) {
    for (const [child, parent] of Object.entries(m.dependencies)) {
      if (lower(parent) !== lower(column)) continue;
      const key = Object.keys(next).find((k) => lower(k) === lower(child));
      if (key) next[key] = "";
    }
  }

  if (m.spec && column === m.spec.method_column) {
    const method = m.spec.methods[String(value)];
    const applicable = new Set(method?.multiply ?? []);
    m.columns.forEach((c) => {
      if (c.column_type === "number" && !applicable.has(c.column_name) && next[c.column_name] !== undefined) {
        next[c.column_name] = "";
      }
    });
    method?.percent?.forEach((f) => {
      if (!next[f]) next[f] = "100";
    });
    if (method?.activity_unit) next.activity_data_unit = method.activity_unit;
  }

  const auto = autoEmissionCategory(m, next);
  if (auto) {
    next.emission_category = auto.category;
    next._ecmKey = auto.key;
  } else if (isParentColumn(m, column) || isDependentColumn(m, column)) {
    next.emission_category = "";
    next._ecmKey = "";
  }
  return next;
}

export const setExtraField = (row: ModalRow, key: string, value: string): ModalRow => ({
  ...row,
  _extra_data: { ...(row._extra_data ?? {}), [key]: value },
});

/** "fuel_type" → "Fuel Type" (column names are stored snake_case). */
export const columnTitle = (name: string) => name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
