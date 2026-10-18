// KPI-2 · Superadmin KPI library: pure logic (rows, filters, coverage, the
// formula check). No React here. Counts are of library rows, not reported
// figures, so the FE may work them out.
import type { FrameworkCode, KpiDefinition, KpiDisclosure, KpiDisclosureMap, KpiFramework, KpiSource, KpiTopic, MappingFit } from "../../../lib/kpi/contracts";
import type { KpiPillar } from "../../../lib/kpi/contracts";
import { FRAMEWORK_CODES, KPI_TOPICS } from "../../../lib/kpi/contracts";
import { pillarOf, pillarRank } from "../../../lib/kpi/pillars";

export interface Library {
  frameworks: KpiFramework[];
  definitions: KpiDefinition[];
  disclosures: KpiDisclosure[];
  mappings: KpiDisclosureMap[];
}

/** Where a KPI is used: one disclosure of one framework version. */
export interface UsedIn {
  framework: FrameworkCode;
  version: string;
  code: string;
  title: string;
  section: string;
  core: boolean;
  fit: MappingFit;
  display_unit: string | null;
  note: string | null;
  mapping_id: number;
}

export interface LibraryRow {
  def: KpiDefinition;
  usedIn: UsedIn[];
  frameworks: FrameworkCode[];
}

/** Disclosure codes sort as people read them: "2-7" < "2-25" < "302-1", "E1-5" < "E1-6", "S1-9" < "S1-13". */
export const compareCodes = (a: string, b: string): number => a.localeCompare(b, "en", { numeric: true });

/** One row per library KPI with the disclosures it answers, frameworks in GRI, BRSR, ESRS order. */
export function libraryRows(lib: Library): LibraryRow[] {
  const fwById = new Map(lib.frameworks.map((f) => [f.id, f]));
  const discById = new Map(lib.disclosures.map((d) => [d.id, d]));
  const byKpi = new Map<number, UsedIn[]>();
  for (const m of lib.mappings) {
    const d = discById.get(m.disclosure_id);
    const fw = d ? fwById.get(d.framework_id) : undefined;
    if (!d || !fw) continue;
    const list = byKpi.get(m.kpi_definition_id) ?? [];
    list.push({ framework: fw.code, version: fw.version, code: d.code, title: d.title, section: d.section, core: d.requirement === "core", fit: m.fit, display_unit: m.display_unit, note: m.note, mapping_id: m.id });
    byKpi.set(m.kpi_definition_id, list);
  }
  const order = (f: FrameworkCode) => FRAMEWORK_CODES.indexOf(f);
  // D19: rows sit under their pillar (E, S, G), then in the library's topic order.
  return lib.definitions
    .filter((d) => d.company_id === null)
    .sort((a, b) => pillarRank(pillarOf(a)) - pillarRank(pillarOf(b)) || KPI_TOPICS.indexOf(a.topic) - KPI_TOPICS.indexOf(b.topic))
    .map((def) => {
      const usedIn = (byKpi.get(def.id) ?? []).sort((a, b) => order(a.framework) - order(b.framework) || compareCodes(a.code, b.code));
      return { def, usedIn, frameworks: [...new Set(usedIn.map((u) => u.framework))] };
    });
}

export interface LibraryFilter {
  q: string;
  framework: string[];
  topic: string[];
  source: string[];
  /** D19: one pillar, or every pillar. */
  pillar?: KpiPillar | null;
}

/**
 * Search matches the name, code, question or a disclosure code ("303-3");
 * each filter keeps rows matching any of its picks; filters combine with AND.
 */
export function filterLibrary(rows: LibraryRow[], f: LibraryFilter): LibraryRow[] {
  const q = f.q.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.framework.length && !r.frameworks.some((fw) => f.framework.includes(fw))) return false;
    if (f.topic.length && !f.topic.includes(r.def.topic)) return false;
    if (f.source.length && !f.source.includes(r.def.source)) return false;
    if (f.pillar && pillarOf(r.def) !== f.pillar) return false;
    if (!q) return true;
    const hay = [r.def.name, r.def.code, r.def.question, ...r.usedIn.map((u) => u.code)].join(" ").toLowerCase();
    return hay.includes(q);
  });
}

/** Counts per source, for the summary line ("32 KPIs · 8 auto · 4 calculated"). */
export function countBySource(rows: LibraryRow[]): Record<KpiSource, number> {
  const out: Record<KpiSource, number> = { manual: 0, auto: 0, formula: 0 };
  for (const r of rows) out[r.def.source] += 1;
  return out;
}

export const topicsIn = (rows: LibraryRow[]): KpiTopic[] => [...new Set(rows.map((r) => r.def.topic))];

/** D19: KPIs per pillar, for the chips ("E 17"). */
export function countByPillar(rows: LibraryRow[]): Record<KpiPillar, number> {
  const out: Record<KpiPillar, number> = { environment: 0, social: 0, governance: 0 };
  for (const r of rows) out[pillarOf(r.def)] += 1;
  return out;
}

export interface CoverageDisclosure {
  disclosure: KpiDisclosure;
  kpis: KpiDefinition[];
}

export interface SectionCoverage {
  section: string;
  total: number;
  mapped: number;
  disclosures: CoverageDisclosure[];
}

export interface FrameworkCoverage {
  framework: KpiFramework;
  total: number;
  mapped: number;
  sections: SectionCoverage[];
}

/**
 * Coverage of one framework version: how many of its disclosures at least one
 * KPI answers ("E1 · 2 of 4 mapped"), per section in the framework's order.
 */
export function frameworkCoverage(framework: KpiFramework, lib: Pick<Library, "definitions" | "disclosures" | "mappings">): FrameworkCoverage {
  const defs = new Map(lib.definitions.map((d) => [d.id, d]));
  const disclosures = lib.disclosures.filter((d) => d.framework_id === framework.id).sort((a, b) => a.sort_key - b.sort_key || compareCodes(a.code, b.code));
  const sections: SectionCoverage[] = [];
  for (const disclosure of disclosures) {
    const kpis = lib.mappings
      .filter((m) => m.disclosure_id === disclosure.id)
      .map((m) => defs.get(m.kpi_definition_id))
      .filter((d): d is KpiDefinition => !!d);
    let section = sections.find((s) => s.section === disclosure.section);
    if (!section) {
      section = { section: disclosure.section, total: 0, mapped: 0, disclosures: [] };
      sections.push(section);
    }
    section.total += 1;
    if (kpis.length) section.mapped += 1;
    section.disclosures.push({ disclosure, kpis });
  }
  return { framework, total: disclosures.length, mapped: sections.reduce((n, s) => n + s.mapped, 0), sections };
}

/** "14 of 18 mapped". */
export const coverageText = (c: { mapped: number; total: number }) => `${c.mapped} of ${c.total} mapped`;

/** A framework version's label: "GRI 2021+", or "ESRS 2023". */
export const versionLabel = (f: KpiFramework) => f.version;

export interface FormulaCheck {
  /** KPI codes the formula reads, in order, each once. */
  codes: string[];
  unknown: string[];
  selfReference: boolean;
  /** Characters other than codes, numbers, spaces and + - * / ( ) . */
  badCharacters: string[];
  balanced: boolean;
  ok: boolean;
}

/**
 * A light check of a formula as the library stores it (KPI-6 owns the real
 * parser): every code exists, it doesn't use itself, and the brackets close.
 */
export function checkFormula(formula: string, ownCode: string, known: Iterable<string>): FormulaCheck {
  const knownSet = new Set(known);
  const codes = [...new Set(formula.match(/[A-Z][A-Z0-9_]*/g) ?? [])];
  const unknown = codes.filter((c) => !knownSet.has(c));
  const selfReference = codes.includes(ownCode);
  const badCharacters = [...new Set(formula.replace(/[A-Z][A-Z0-9_]*/g, "").replace(/[\d\s+\-*/().]/g, "").split(""))];
  let depth = 0;
  let balanced = true;
  for (const ch of formula) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (depth < 0) balanced = false;
  }
  balanced = balanced && depth === 0;
  return { codes, unknown, selfReference, badCharacters, balanced, ok: codes.length > 0 && !unknown.length && !selfReference && !badCharacters.length && balanced };
}

/** The check in one plain sentence. */
export function formulaCheckText(c: FormulaCheck): string {
  if (c.ok) return `Formula checks out: uses ${c.codes.length} KPI${c.codes.length === 1 ? "" : "s"}, all in the library.`;
  if (!c.codes.length) return "The formula doesn't use any KPI.";
  if (c.unknown.length) return `Not in the library: ${c.unknown.join(", ")}.`;
  if (c.selfReference) return "The formula uses the KPI itself.";
  if (c.badCharacters.length) return `The formula has characters it can't use: ${c.badCharacters.join(" ")}.`;
  return "The brackets don't match.";
}
