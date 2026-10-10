/**
 * P24 auto-generate: turn the backend's proposal (factor names grouped by
 * unit, e.g. "Road - Van - Diesel") into fields, choices, dependencies and
 * factor rules for the chosen depth of each unit group. Ported from the
 * legacy AutoGenerateColumnConfigModal; dependent choices are keyed by the
 * parent's choice, as that modal stored them.
 */
import type {
  ColumnConfigProposal,
  ColumnDependencies,
  ColumnOptionsMap,
  DependentOptionsMap,
  EmissionCategoryMapping,
  ProposedColumn,
  ProposedConfigGroup,
  ProposedUnit,
} from "../../services/columnConfigService";

export type { ColumnConfigProposal, ProposedConfigGroup, ProposedUnit };

export const MAX_DEPTH = 3;

export type Generated = {
  columns: ProposedColumn[];
  options: ColumnOptionsMap;
  deps: ColumnDependencies;
  depOpts: DependentOptionsMap;
  mappings: EmissionCategoryMapping;
};

/** The depth the backend detected for a group. */
export const detectedDepth = (g: ProposedConfigGroup) => (g.pattern === "THREE_DIM" ? 3 : g.pattern === "TWO_DIM" ? 2 : 1);

/** Depths a group can be built at: the ones the backend named columns for, else the detected one. */
export function depthsFor(g: ProposedConfigGroup): number[] {
  const named = Object.keys(g.column_names_by_dim ?? {})
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= MAX_DEPTH);
  return named.length ? [...new Set(named)].sort((a, b) => a - b) : [detectedDepth(g)];
}

/** "Road - Van - Diesel" at depth 3 → ["Road", "Van", "Diesel"]; shorter names are padded in front with "Unknown". */
export function splitName(name: string, depth: number): string[] {
  const parts = name.split(" - ").map((s) => s.trim());
  while (parts.length < depth) parts.unshift("Unknown");
  return parts.map((p) => (p === "-" || p === "" ? "Unknown" : p)).slice(0, depth);
}

const opt = (v: string) => ({ id: v, label: v });
const sorted = (values: Iterable<string>) => [...new Set(values)].sort();

/** One unit group at one depth. */
export function buildGroup(g: ProposedConfigGroup, depth: number): Generated {
  const d = Math.min(Math.max(depth, 1), MAX_DEPTH);
  const byDim = g.column_names_by_dim?.[d];
  const base = byDim?.columns ?? g.columns ?? [];
  const names = byDim?.ef_names ?? g.ef_names.filter((n) => n.split(" - ").length === d);
  const entries = g.ef_name_pairs?.length
    ? g.ef_name_pairs.map((p) => ({ target: p.lookup_name, parts: splitName(p.display_name, d) }))
    : names.map((n) => ({ target: n, parts: splitName(n, d) }));

  const selects = base.filter((c) => c.column_type === "select");
  const number = base.find((c) => c.column_type === "number");
  const columns: ProposedColumn[] = Array.from({ length: d }, (_, i) => selects[i] ?? { existing_id: null, column_name: `Dimension ${i + 1}`, column_type: "select" as const, is_new: true });
  columns.push(number ?? { existing_id: null, column_name: "Activity Data", column_type: "number", is_new: true });

  const options: ColumnOptionsMap = {};
  const deps: ColumnDependencies = {};
  const depOpts: DependentOptionsMap = {};
  const mappings: EmissionCategoryMapping = {};
  for (let i = 0; i < d; i++) {
    const col = columns[i].column_name;
    options[col] = sorted(entries.map((e) => e.parts[i])).map(opt);
    if (i === 0) continue;
    deps[col] = columns[i - 1].column_name;
    const under = new Map<string, Set<string>>();
    for (const e of entries) {
      const set = under.get(e.parts[i - 1]) ?? new Set<string>();
      set.add(e.parts[i]);
      under.set(e.parts[i - 1], set);
    }
    depOpts[col] = Object.fromEntries([...under].map(([parent, kids]) => [parent, sorted(kids).map(opt)]));
  }
  for (const e of entries) mappings[e.parts.join("|")] = e.target;
  return { columns, options, deps, depOpts, mappings };
}

const unionById = <T extends { id: string | number }>(a: T[] = [], b: T[] = []) => {
  const seen = new Set(a.map((o) => o.id));
  return [...a, ...b.filter((o) => !seen.has(o.id))];
};

/** Several unit groups combined into one form: fields by name, choices and rules merged. */
export function combine(parts: Generated[]): Generated {
  const out: Generated = { columns: [], options: {}, deps: {}, depOpts: {}, mappings: {} };
  for (const p of parts) {
    for (const c of p.columns) if (!out.columns.some((x) => x.column_name === c.column_name)) out.columns.push(c);
    for (const [col, list] of Object.entries(p.options)) out.options[col] = unionById(out.options[col], list);
    Object.assign(out.deps, p.deps);
    for (const [col, byParent] of Object.entries(p.depOpts)) {
      const into = (out.depOpts[col] ??= {});
      for (const [parent, list] of Object.entries(byParent)) into[parent] = unionById(into[parent], list);
    }
    Object.assign(out.mappings, p.mappings);
  }
  return out;
}

/** Group index → chosen depth; groups not in the map are left out. */
export type Selection = Map<number, number>;

export const defaultSelection = (p: ColumnConfigProposal): Selection => new Map(p.configs.map((g, i) => [i, detectedDepth(g)]));

export const buildSelection = (p: ColumnConfigProposal, sel: Selection): Generated =>
  combine([...sel].sort(([a], [b]) => a - b).flatMap(([i, depth]) => (p.configs[i] ? [buildGroup(p.configs[i], depth)] : [])));

/** "Business travel - km + tonne.km": the legacy name, with the chosen unit groups. */
export function defaultFormName(p: ColumnConfigProposal, sel: Selection): string {
  const units = [...sel.keys()].sort((a, b) => a - b).map((i) => p.configs[i]?.denominator_unit).filter(Boolean);
  return units.length ? `${p.config_name} - ${units.join(" + ")}` : p.config_name;
}

export const missingUnits = (p: ColumnConfigProposal) => p.proposed_units.filter((u) => !u.already_exists);

/** Choice paths in plain words for the review step: "Road › Van › Diesel". */
export const rulePaths = (g: Generated) => Object.keys(g.mappings).sort().map((k) => k.split("|").join(" › "));
