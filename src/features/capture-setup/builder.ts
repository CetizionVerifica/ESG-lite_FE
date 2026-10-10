/**
 * P24 form builder: the editable copy of one ColumnConfig and the pure edits
 * the builder tabs make to it. Choices are keyed by field name while editing
 * (renames move them along) and by column id on save, as the backend stores them.
 */
import { normalizeUnitKey } from "../../lib/emissions/emissionCalc";
import type {
  CalculationSpec,
  ColumnConfig,
  ColumnEntity,
  DropdownOptionValue,
  ExtraFieldDefinition,
  MethodCalculation,
} from "../../lib/emissions/types";

export type { CalculationSpec, ColumnEntity, DropdownOptionValue, ExtraFieldDefinition, MethodCalculation };

export type SourceConfig = ColumnConfig & {
  site?: { site_id: number; name: string } | null;
  category?: { category_id: number; category_name: string } | null;
};

export type BuilderDraft = {
  name: string;
  fields: ColumnEntity[];
  /** Field name → choices (this form's override of the library defaults). */
  options: Record<string, DropdownOptionValue[]>;
  /** Child field → parent field. */
  dependencies: Record<string, string>;
  /** Child field → parent choice label (or "grandparent|parent") → choices. */
  dependentOptions: Record<string, Record<string, DropdownOptionValue[]>>;
  mapping: Record<string, string>;
  extraFields: ExtraFieldDefinition[];
  calculation: CalculationSpec | null;
  /** Column id → name it had when the builder opened. */
  originalNames: Record<number, string>;
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v ?? null)) as T;

export function draftFromConfig(config: SourceConfig): BuilderDraft {
  const fields = clone(config.columns ?? []);
  const options: Record<string, DropdownOptionValue[]> = {};
  for (const [key, list] of Object.entries(config.column_options ?? {})) {
    // Stored by column id; very old configs used the name.
    const col = fields.find((c) => String(c.pk_id) === key) ?? fields.find((c) => c.column_name === key);
    if (col) options[col.column_name] = clone(list);
  }
  return {
    name: config.config_name,
    fields,
    options,
    dependencies: clone(config.column_dependencies ?? {}),
    dependentOptions: clone(config.dependent_options ?? {}),
    mapping: clone(config.emission_category_mapping ?? {}),
    extraFields: clone(config.extra_fields ?? []),
    calculation: config.calculation ? clone(config.calculation) : null,
    originalNames: Object.fromEntries(fields.map((c) => [c.pk_id, c.column_name])),
  };
}

export const isSelect = (f: ColumnEntity) => f.column_type === "select";
export const isNumber = (f: ColumnEntity) => f.column_type === "number";

/** "fuel_type" → "Fuel type": field names are stored snake_case. */
export function fieldTitle(name: string): string {
  const s = name.replace(/_/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** "PO number" → "po_number": the key of a new field or extra detail. */
export function keyFromLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// ─── Fields ──────────────────────────────────────────────────────────────────

const renameKeys = <T>(obj: Record<string, T>, from: string, to: string): Record<string, T> =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [k === from ? to : k, v]));

/** Adds a library column; a Select brings its default choices as this form's list. */
export function addField(d: BuilderDraft, col: ColumnEntity): BuilderDraft {
  if (d.fields.some((f) => f.pk_id === col.pk_id)) return d;
  const options = isSelect(col) && col.dropdown_options?.length && !d.options[col.column_name] ? { ...d.options, [col.column_name]: clone(col.dropdown_options) } : d.options;
  return { ...d, fields: [...d.fields, clone(col)], options };
}

/** Removes a field and everything that referred to it. */
export function removeField(d: BuilderDraft, pkId: number): BuilderDraft {
  const field = d.fields.find((f) => f.pk_id === pkId);
  if (!field) return d;
  const name = field.column_name;
  const options = { ...d.options };
  delete options[name];
  const dependentOptions = { ...d.dependentOptions };
  delete dependentOptions[name];
  const dependencies = Object.fromEntries(Object.entries(d.dependencies).filter(([c, p]) => c !== name && p !== name));
  let calculation = d.calculation;
  if (calculation) {
    calculation = clone(calculation);
    if (calculation.method_column === name) {
      calculation.method_column = undefined;
      calculation.methods = {};
    }
    for (const m of Object.values(calculation.methods)) {
      m.multiply = m.multiply.filter((f) => f !== name);
      if (m.percent) m.percent = m.percent.filter((f) => f !== name);
    }
    if (calculation.identity_columns) calculation.identity_columns = calculation.identity_columns.filter((f) => f !== name);
  }
  return { ...d, fields: d.fields.filter((f) => f.pk_id !== pkId), options, dependentOptions, dependencies, calculation };
}

export function moveField(d: BuilderDraft, index: number, to: number): BuilderDraft {
  if (to < 0 || to >= d.fields.length || index === to) return d;
  const fields = [...d.fields];
  const [item] = fields.splice(index, 1);
  fields.splice(to, 0, item);
  return { ...d, fields };
}

/** Renames a field's key everywhere in the draft (choices, dependencies, calculation). */
export function renameField(d: BuilderDraft, pkId: number, next: string): BuilderDraft {
  const field = d.fields.find((f) => f.pk_id === pkId);
  if (!field || field.column_name === next) return d;
  const from = field.column_name;
  const swap = (n: string) => (n === from ? next : n);
  let calculation = d.calculation;
  if (calculation) {
    calculation = clone(calculation);
    if (calculation.method_column) calculation.method_column = swap(calculation.method_column);
    if (calculation.legacy_field) calculation.legacy_field = swap(calculation.legacy_field);
    for (const m of Object.values(calculation.methods)) {
      m.multiply = m.multiply.map(swap);
      if (m.percent) m.percent = m.percent.map(swap);
    }
    if (calculation.identity_columns) calculation.identity_columns = calculation.identity_columns.map(swap);
  }
  return {
    ...d,
    fields: d.fields.map((f) => (f.pk_id === pkId ? { ...f, column_name: next } : f)),
    options: renameKeys(d.options, from, next),
    dependentOptions: renameKeys(d.dependentOptions, from, next),
    dependencies: Object.fromEntries(Object.entries(d.dependencies).map(([c, p]) => [swap(c), swap(p)])),
    calculation,
  };
}

/** Original name → new name for every renamed field (the backend migrates saved entries). */
export function renameMap(d: BuilderDraft): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of d.fields) {
    const was = d.originalNames[f.pk_id];
    if (was && was !== f.column_name) out[was] = f.column_name;
  }
  return out;
}

export type LibraryName = { pk_id: number; column_name: string };

/**
 * A field key must be unique in the form. A changed key also can't take a
 * name the form's fields had when the builder opened (swaps and chains break
 * the backend's entry migration) or another library column's name.
 */
export function fieldNameError(d: BuilderDraft, pkId: number, name: string, library: LibraryName[] = []): string | null {
  const n = name.trim();
  if (!n) return "Enter a key.";
  if (!/^[A-Za-z0-9_ ]+$/.test(n)) return "Use letters, numbers, spaces or _.";
  const same = (other: string) => other.toLowerCase() === n.toLowerCase();
  if (d.fields.some((f) => f.pk_id !== pkId && same(f.column_name))) return "Another field has this key.";
  const was = d.originalNames[pkId];
  if (was !== undefined && same(was)) return null;
  if (Object.entries(d.originalNames).some(([id, other]) => Number(id) !== pkId && same(other)))
    return "Another field of this form used this key. Save once, then rename.";
  if (library.some((c) => c.pk_id !== pkId && same(c.column_name))) return "Another library column has this name.";
  return null;
}

export type SavedRemovals = {
  fields: string[];
  choices: { field: string; labels: string[] }[];
  /** Saved extra details whose key changed or that were removed. */
  extras: string[];
  extraChoices: { detail: string; choices: string[] }[];
};

/**
 * What a save drops that saved entries may still use: fields taken off the
 * form, choices (plain or dependent) that existed when the builder opened,
 * dependent choices a changed parent hides, and saved extra-detail keys or choices.
 */
export function savedRemovals(initial: BuilderDraft, d: BuilderDraft): SavedRemovals {
  const nameNow = new Map(d.fields.map((f) => [f.pk_id, f.column_name]));
  const pkThen = new Map(initial.fields.map((f) => [f.column_name, f.pk_id]));
  const pkNow = new Map(d.fields.map((f) => [f.column_name, f.pk_id]));
  const fields = initial.fields.filter((f) => !nameNow.has(f.pk_id)).map((f) => fieldTitle(f.column_name));
  const choices: SavedRemovals["choices"] = [];
  const missing = (before: DropdownOptionValue[] | undefined, after: DropdownOptionValue[] | undefined) => {
    const kept = new Set((after ?? []).map((o) => String(o.id)));
    return (before ?? []).filter((o) => !kept.has(String(o.id)));
  };
  for (const f of initial.fields) {
    const now = nameNow.get(f.pk_id);
    if (now === undefined) continue;
    const gone = [...missing(initial.options[f.column_name], d.options[now])];
    const parentThen = initial.dependencies[f.column_name];
    const parentNow = d.dependencies[now];
    const sameParent = (parentThen ? pkThen.get(parentThen) : undefined) === (parentNow ? pkNow.get(parentNow) : undefined);
    for (const [branch, list] of Object.entries(initial.dependentOptions[f.column_name] ?? {})) {
      // A new or removed parent hides every saved branch.
      gone.push(...(sameParent ? missing(list, d.dependentOptions[now]?.[branch]) : list));
    }
    const labels = [...new Set(gone.map((o) => o.label))];
    if (labels.length) choices.push({ field: fieldTitle(now), labels });
  }
  const extrasNow = new Map(d.extraFields.map((x) => [x.key.trim(), x]));
  const extras: string[] = [];
  const extraChoices: SavedRemovals["extraChoices"] = [];
  for (const x of initial.extraFields) {
    const now = extrasNow.get(x.key);
    if (!now) {
      extras.push(x.label || x.key);
      continue;
    }
    const kept = new Set(now.type === "select" ? (now.options ?? []).map((o) => o.trim()) : []);
    const lost = x.type === "select" ? (x.options ?? []).filter((o) => o.trim() && !kept.has(o.trim())) : [];
    if (lost.length) extraChoices.push({ detail: now.label || x.label, choices: lost });
  }
  return { fields, choices, extras, extraChoices };
}

/** True when a save removes something saved entries may use. */
export const hasRemovals = (r: SavedRemovals) => r.fields.length + r.choices.length + r.extras.length + r.extraChoices.length > 0;

// ─── Choices and dependencies ────────────────────────────────────────────────

export const setOptions = (d: BuilderDraft, field: string, list: DropdownOptionValue[]): BuilderDraft => ({ ...d, options: { ...d.options, [field]: list } });

/** Fields `child` may depend on: other selects that don't (indirectly) depend on it. */
export function parentCandidates(d: BuilderDraft, child: string): ColumnEntity[] {
  const dependsOnChild = (name: string): boolean => {
    let cur: string | undefined = name;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      if (cur === child) return true;
      seen.add(cur);
      cur = d.dependencies[cur];
    }
    return false;
  };
  return d.fields.filter((f) => isSelect(f) && f.column_name !== child && !dependsOnChild(f.column_name));
}

export function setParent(d: BuilderDraft, child: string, parent: string | null): BuilderDraft {
  const dependencies = { ...d.dependencies };
  if (parent) dependencies[child] = parent;
  else delete dependencies[child];
  return { ...d, dependencies };
}

/** Choices of `field` for one parent key (or its own list when it has no parent). */
export function choicesUnder(d: BuilderDraft, field: string, parentKey?: string): DropdownOptionValue[] {
  if (parentKey === undefined || !d.dependencies[field]) return d.options[field] ?? [];
  return d.dependentOptions[field]?.[parentKey] ?? [];
}

export type ParentBranch = {
  /** Key in dependent_options: the parent's choice label, or "grandparent|parent". */
  key: string;
  /** Plain-words path, e.g. ["Road", "Van"]. */
  path: string[];
  /** False for a stored branch no current parent choice leads to. */
  reachable: boolean;
};

/** Every label path from the root field down to `field` (exclusive), root first. */
function pathsTo(d: BuilderDraft, field: string, seen = new Set<string>()): string[][] {
  const parent = d.dependencies[field];
  if (!parent || seen.has(parent)) return [[]];
  seen.add(parent);
  const grand = d.dependencies[parent];
  if (!grand) return (d.options[parent] ?? []).map((o) => [o.label]);
  const out: string[][] = [];
  for (const upper of pathsTo(d, parent, seen)) {
    const key = branchKey(d, parent, upper);
    for (const o of d.dependentOptions[parent]?.[key] ?? []) out.push([...upper, o.label]);
  }
  return out;
}

/** The dependent_options key for a path: the parent's label, or "grandparent|parent" three levels down. */
function branchKey(d: BuilderDraft, field: string, path: string[]): string {
  const parent = d.dependencies[field];
  if (!parent) return "";
  const grand = d.dependencies[parent];
  const last = path[path.length - 1] ?? "";
  if (!grand) return last;
  // Three levels: prefer the composite key when it is stored or the parent's
  // own list is keyed that way; otherwise the plain label.
  const composite = `${path[path.length - 2] ?? ""}|${last}`;
  const stored = d.dependentOptions[field] ?? {};
  return composite in stored || !(last in stored) ? composite : last;
}

/** The parent branches a dependent field needs choices for, plus stored ones nothing leads to. */
export function parentBranches(d: BuilderDraft, field: string): ParentBranch[] {
  if (!d.dependencies[field]) return [];
  const branches: ParentBranch[] = [];
  const seen = new Set<string>();
  for (const path of pathsTo(d, field)) {
    const key = branchKey(d, field, path);
    if (seen.has(key)) continue;
    seen.add(key);
    branches.push({ key, path: d.dependencies[d.dependencies[field]] ? path.slice(-2) : path.slice(-1), reachable: true });
  }
  for (const key of Object.keys(d.dependentOptions[field] ?? {})) {
    if (!seen.has(key)) branches.push({ key, path: key.split("|"), reachable: false });
  }
  return branches;
}

export function setBranchChoices(d: BuilderDraft, field: string, key: string, list: DropdownOptionValue[]): BuilderDraft {
  return { ...d, dependentOptions: { ...d.dependentOptions, [field]: { ...(d.dependentOptions[field] ?? {}), [key]: list } } };
}

export function removeBranch(d: BuilderDraft, field: string, key: string): BuilderDraft {
  const branches = { ...(d.dependentOptions[field] ?? {}) };
  delete branches[key];
  return { ...d, dependentOptions: { ...d.dependentOptions, [field]: branches } };
}

/** Root-first field chain of the dependency tree, e.g. ["mode", "vehicle", "fuel"]. */
export function dependencyChains(d: BuilderDraft): string[][] {
  const children = new Set(Object.keys(d.dependencies));
  const roots = [...new Set(Object.values(d.dependencies))].filter((p) => !children.has(p));
  const chains: string[][] = [];
  const walk = (name: string, chain: string[]) => {
    const kids = Object.entries(d.dependencies).filter(([, p]) => p === name).map(([c]) => c);
    if (!kids.length || chain.includes(name)) chains.push([...chain, name]);
    for (const k of kids) if (!chain.includes(k)) walk(k, [...chain, name]);
  };
  roots.forEach((r) => walk(r, []));
  return chains;
}

// ─── Factor match ────────────────────────────────────────────────────────────

/** "Paper|Recycled" → "Paper › Recycled". */
export const plainPath = (key: string) => key.split("|").join(" › ");

/**
 * Every full choice path through the dependency tree (labels, root to leaf).
 * Without dependencies, each choice of every select on its own.
 */
export function choicePaths(d: BuilderDraft): string[][] {
  const chains = dependencyChains(d);
  if (!chains.length) {
    return d.fields.filter(isSelect).flatMap((f) => (d.options[f.column_name] ?? []).map((o) => [o.label]));
  }
  const out: string[][] = [];
  for (const chain of chains) {
    const leaf = chain[chain.length - 1];
    for (const upper of pathsTo(d, leaf)) {
      const key = branchKey(d, leaf, upper);
      for (const o of d.dependentOptions[leaf]?.[key] ?? []) out.push([...upper, o.label]);
    }
  }
  return out;
}

/** Adds a rule for every choice path that has none; the target starts as the path in words. */
export function generateMappings(d: BuilderDraft): { draft: BuilderDraft; added: number } {
  const mapping = { ...d.mapping };
  const lower = new Set(Object.keys(mapping).map((k) => k.toLowerCase()));
  let added = 0;
  for (const path of choicePaths(d)) {
    const key = path.join("|");
    if (lower.has(key.toLowerCase())) continue;
    mapping[key] = path.join(" - ");
    lower.add(key.toLowerCase());
    added++;
  }
  return { draft: { ...d, mapping }, added };
}

export type MappingRow = { key: string; path: string; target: string; issue: "unknown-target" | "no-path" | null };

/**
 * Rules in plain words. `targets` is the list of emission categories with a
 * factor (null while it loads): a target outside it is flagged, as is a rule
 * no choice path reaches any more.
 */
export function mappingRows(d: BuilderDraft, targets: string[] | null): MappingRow[] {
  const known = targets ? new Set(targets.map((t) => t.toLowerCase())) : null;
  const paths = new Set(choicePaths(d).flatMap((p) => p.map((_, i) => p.slice(i).join("|").toLowerCase())));
  const hasChoices = paths.size > 0;
  return Object.entries(d.mapping).map(([key, target]) => ({
    key,
    path: plainPath(key),
    target,
    issue: known && target && !known.has(target.toLowerCase()) ? "unknown-target" : hasChoices && !paths.has(key.toLowerCase()) ? "no-path" : null,
  }));
}

export function setMapping(d: BuilderDraft, key: string, target: string): BuilderDraft {
  return { ...d, mapping: { ...d.mapping, [key]: target } };
}

export function removeMapping(d: BuilderDraft, key: string): BuilderDraft {
  const mapping = { ...d.mapping };
  delete mapping[key];
  return { ...d, mapping };
}

// ─── Extra details ───────────────────────────────────────────────────────────

export const EXTRA_TYPES: { value: ExtraFieldDefinition["type"]; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "select", label: "Select" },
  { value: "textarea", label: "Long text" },
];

export function extraFieldErrors(fields: ExtraFieldDefinition[]): Record<number, string> {
  const out: Record<number, string> = {};
  const seen = new Set<string>();
  fields.forEach((f, i) => {
    if (!f.label.trim()) out[i] = "Enter a label.";
    else if (!f.key.trim()) out[i] = "Enter a key.";
    else if (seen.has(f.key)) out[i] = `Key "${f.key}" is used twice.`;
    else if (f.type === "select" && !(f.options ?? []).some((o) => o.trim())) out[i] = "Add at least one choice.";
    seen.add(f.key);
  });
  return out;
}

// ─── Calculation ─────────────────────────────────────────────────────────────

export type CalcMode = "none" | "per_method" | "per_unit";

export const calcMode = (d: BuilderDraft): CalcMode => d.calculation?.mode ?? "none";

export function setCalcMode(d: BuilderDraft, mode: CalcMode): BuilderDraft {
  if (mode === "none") return { ...d, calculation: null };
  if (d.calculation?.mode === mode) return d;
  const calc: CalculationSpec = { mode, methods: {}, identity_columns: d.calculation?.identity_columns ?? [] };
  if (mode === "per_method") {
    const first = d.fields.find(isSelect)?.column_name;
    if (first) return setMethodField({ ...d, calculation: calc }, first);
  }
  return { ...d, calculation: calc };
}

/** Per method: the select whose choice decides the formula; one method per choice. */
export function setMethodField(d: BuilderDraft, field: string): BuilderDraft {
  if (!d.calculation) return d;
  const methods: Record<string, MethodCalculation> = {};
  for (const o of d.options[field] ?? []) methods[String(o.id)] = d.calculation.methods[String(o.id)] ?? { multiply: [] };
  return { ...d, calculation: { ...d.calculation, method_column: field, methods } };
}

export function updateMethod(d: BuilderDraft, key: string, patch: Partial<MethodCalculation>): BuilderDraft {
  if (!d.calculation) return d;
  const current = d.calculation.methods[key] ?? { multiply: [] };
  const next = { ...current, ...patch };
  next.percent = (next.percent ?? []).filter((f) => next.multiply.includes(f));
  if (!next.percent.length) delete next.percent;
  if (!next.activity_unit) delete next.activity_unit;
  return { ...d, calculation: { ...d.calculation, methods: { ...d.calculation.methods, [key]: next } } };
}

export function toggleIn(list: string[] | undefined, item: string): string[] {
  const l = list ?? [];
  return l.includes(item) ? l.filter((x) => x !== item) : [...l, item];
}

/** Per unit: a unit key ("tonne.km") with its own multiply list. */
export function addUnitMethod(d: BuilderDraft, unit: string): BuilderDraft {
  // Same normalisation the calculation uses to find the row's method.
  const key = normalizeUnitKey(unit);
  if (!d.calculation || !key || d.calculation.methods[key]) return d;
  return { ...d, calculation: { ...d.calculation, methods: { ...d.calculation.methods, [key]: { multiply: [], activity_unit: key } } } };
}

export function removeMethod(d: BuilderDraft, key: string): BuilderDraft {
  if (!d.calculation) return d;
  const methods = { ...d.calculation.methods };
  delete methods[key];
  return { ...d, calculation: { ...d.calculation, methods } };
}

export function setIdentity(d: BuilderDraft, fields: string[]): BuilderDraft {
  if (!d.calculation) return d;
  return { ...d, calculation: { ...d.calculation, identity_columns: fields } };
}

/** "When Method is 'Fuel-based', multiply Fuel used × Share (%)." */
export function describeMethod(d: BuilderDraft, key: string): string {
  const calc = d.calculation;
  const m = calc?.methods[key];
  if (!calc || !m) return "";
  const parts = m.multiply.map((f) => `${fieldTitle(f)}${m.percent?.includes(f) ? " (%)" : ""}`);
  const what = parts.length ? `multiply ${parts.join(" × ")}` : "nothing is multiplied yet";
  const unit = m.activity_unit ? `, in ${m.activity_unit}` : "";
  if (calc.mode === "per_unit") return `When the unit is ${key}, ${what}${unit}.`;
  const label = (d.options[calc.method_column ?? ""] ?? []).find((o) => String(o.id) === key)?.label ?? key;
  return `When ${fieldTitle(calc.method_column ?? "")} is "${label}", ${what}${unit}.`;
}

// ─── Validation, save, preview ───────────────────────────────────────────────

export type BuilderTab = "fields" | "choices" | "match" | "extra" | "calculation" | "test";
export type BuilderIssue = { tab: BuilderTab; message: string };

export function validateBuilder(d: BuilderDraft, library: LibraryName[] = []): BuilderIssue[] {
  const issues: BuilderIssue[] = [];
  if (!d.name.trim()) issues.push({ tab: "fields", message: "Enter a form name." });
  for (const f of d.fields) {
    const err = fieldNameError(d, f.pk_id, f.column_name, library);
    if (err) issues.push({ tab: "fields", message: `${fieldTitle(f.column_name) || "A field"}: ${err}` });
  }
  for (const f of d.fields.filter(isSelect)) {
    const lists = d.dependencies[f.column_name]
      ? Object.entries(d.dependentOptions[f.column_name] ?? {}).map(([key, list]) => ({ where: ` under ${plainPath(key)}`, list }))
      : [{ where: "", list: d.options[f.column_name] ?? [] }];
    for (const { where, list } of lists) {
      const issue = choiceListIssue(list);
      if (issue) {
        issues.push({ tab: "choices", message: `${fieldTitle(f.column_name)}${where}: ${issue}` });
        break;
      }
    }
  }
  const extra = extraFieldErrors(d.extraFields);
  if (Object.keys(extra).length) issues.push({ tab: "extra", message: `Extra details: ${Object.values(extra)[0]}` });
  const calc = d.calculation;
  if (calc) {
    if (calc.mode === "per_method" && !calc.method_column) issues.push({ tab: "calculation", message: "Calculation: choose the field that decides the formula." });
    const keys = Object.keys(calc.methods);
    if (!keys.length) issues.push({ tab: "calculation", message: calc.mode === "per_unit" ? "Calculation: add at least one unit." : "Calculation: the method field has no choices." });
    for (const k of keys) {
      if (!(calc.methods[k]?.multiply ?? []).length) {
        issues.push({ tab: "calculation", message: `Calculation: ${describeKey(d, k)} has no fields to multiply.` });
        break;
      }
    }
  }
  return issues;
}

function choiceListIssue(list: DropdownOptionValue[]): string | null {
  const ids = new Set<string>();
  for (const o of list) {
    if (!String(o.id).trim() || !o.label.trim()) return "every choice needs a label and a stored value.";
    if (ids.has(String(o.id))) return `stored value "${o.id}" is used twice.`;
    ids.add(String(o.id));
  }
  return null;
}

function describeKey(d: BuilderDraft, key: string): string {
  const calc = d.calculation;
  if (calc?.mode !== "per_method") return `"${key}"`;
  const label = (d.options[calc.method_column ?? ""] ?? []).find((o) => String(o.id) === key)?.label ?? key;
  return `"${label}"`;
}

export type UpdatePayload = {
  config_name: string;
  column_ids: number[];
  column_options: Record<string, DropdownOptionValue[]>;
  column_dependencies: Record<string, string>;
  dependent_options: Record<string, Record<string, DropdownOptionValue[]>>;
  emission_category_mapping: Record<string, string>;
  extra_fields: ExtraFieldDefinition[];
  calculation: CalculationSpec | null;
  rename_map?: Record<string, string>;
};

/** What PUT /admin/column-configs/:id gets: choices by column id, plus the renames. */
export function toUpdatePayload(d: BuilderDraft): UpdatePayload {
  const column_options: Record<string, DropdownOptionValue[]> = {};
  for (const f of d.fields) {
    const list = d.options[f.column_name];
    if (list) column_options[String(f.pk_id)] = list.map((o) => ({ id: o.id, label: o.label }));
  }
  const renames = renameMap(d);
  return {
    config_name: d.name.trim(),
    column_ids: d.fields.map((f) => f.pk_id),
    column_options,
    column_dependencies: d.dependencies,
    dependent_options: d.dependentOptions,
    emission_category_mapping: d.mapping,
    extra_fields: d.extraFields.map((f) => ({
      ...f,
      label: f.label.trim(),
      key: f.key.trim(),
      options: f.type === "select" ? (f.options ?? []).map((o) => o.trim()).filter(Boolean) : undefined,
      show_for: f.show_for?.length ? f.show_for : undefined,
    })),
    calculation: d.calculation,
    ...(Object.keys(renames).length ? { rename_map: renames } : {}),
  };
}

/** The draft as the ColumnConfig Add data reads, for the live preview. */
export function toPreviewConfig(d: BuilderDraft, id: number): ColumnConfig {
  const p = toUpdatePayload(d);
  return {
    pk_id: id,
    config_name: p.config_name,
    columns: d.fields,
    column_options: p.column_options,
    column_dependencies: p.column_dependencies,
    dependent_options: p.dependent_options,
    emission_category_mapping: p.emission_category_mapping,
    extra_fields: p.extra_fields,
    calculation: p.calculation,
  };
}

export const isDirty = (a: BuilderDraft, b: BuilderDraft) => JSON.stringify(toUpdatePayload(a)) !== JSON.stringify(toUpdatePayload(b));
