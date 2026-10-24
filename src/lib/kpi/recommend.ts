/**
 * KPI-3 · The recommendation rule (mirror of ESG-lite `src/kpi/setup/recommend.ts`).
 * A KPI is recommended ("required") when it answers a disclosure of an
 * enabled framework version whose requirement is `required` or `core`, or an
 * `if_material` ESRS datapoint whose topic is material. Calculated KPIs pull
 * in their inputs (`GHG_INTENSITY_REVENUE` adds `REVENUE`). The server's
 * `recommended` list wins when it sends one; the wizard uses this while the
 * Admin changes frameworks and topics before saving.
 */
import type { EsrsTopic, FrameworkCode, KpiCatalogue } from "./contracts";
import type { FrameworkUse } from "./badges";
import { formulaCodes } from "./formula";

export interface Recommendation {
  ids: Set<number>;
  /** Per KPI, the disclosures that make it required (for badges and the reason prompt). */
  requiredBy: Map<number, FrameworkUse[]>;
  /** Per input KPI, the names of the calculated KPIs that need it. */
  neededFor: Map<number, string[]>;
}

/** Undecided ESRS topics count as material, so nothing is dropped before the Admin decides. */
export const isMaterial = (topics: ReadonlyMap<EsrsTopic, boolean>, topic: EsrsTopic | null): boolean => (topic ? (topics.get(topic) ?? true) : true);

export function recommendKpis(catalogue: Pick<KpiCatalogue, "frameworks" | "disclosures" | "definitions" | "mappings">, enabledFrameworkIds: Iterable<number>, materialTopics: ReadonlyMap<EsrsTopic, boolean>): Recommendation {
  const enabled = new Set(enabledFrameworkIds);
  const fwCode = new Map(catalogue.frameworks.map((f) => [f.id, f.code as FrameworkCode]));
  const requiredBy = new Map<number, FrameworkUse[]>();
  const disclosures = new Map(catalogue.disclosures.map((d) => [d.id, d]));
  for (const m of catalogue.mappings) {
    const d = disclosures.get(m.disclosure_id);
    if (!d || !enabled.has(d.framework_id)) continue;
    const required = d.requirement === "required" || d.requirement === "core" || (d.requirement === "if_material" && isMaterial(materialTopics, d.esrs_topic));
    if (!required) continue;
    const framework = fwCode.get(d.framework_id);
    if (!framework) continue;
    const list = requiredBy.get(m.kpi_definition_id) ?? [];
    list.push({ framework, code: d.code, ...(d.requirement === "core" ? { core: true } : {}) });
    requiredBy.set(m.kpi_definition_id, list);
  }
  const ids = new Set(requiredBy.keys());
  // Formula inputs, transitively.
  const byCode = new Map(catalogue.definitions.map((d) => [d.code, d]));
  const byId = new Map(catalogue.definitions.map((d) => [d.id, d]));
  const neededFor = new Map<number, string[]>();
  const queue = [...ids];
  while (queue.length) {
    const def = byId.get(queue.pop() as number);
    if (!def?.formula) continue;
    for (const code of formulaCodes(def.formula)) {
      const input = byCode.get(code);
      if (input) neededFor.set(input.id, [...new Set([...(neededFor.get(input.id) ?? []), def.name])]);
      if (input && !ids.has(input.id)) {
        ids.add(input.id);
        queue.push(input.id);
      }
    }
  }
  return { ids, requiredBy, neededFor };
}
