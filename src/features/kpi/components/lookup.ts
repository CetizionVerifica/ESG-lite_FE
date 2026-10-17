import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FrameworkUse } from "../../../lib/kpi/badges";
import { FRAMEWORK_CODES, type FrameworkCode, type KpiCatalogue, type KpiDefinition, type KpiSetup, type KpiValue, type YearType } from "../../../lib/kpi/contracts";
import { formatWithUnit } from "../../../lib/kpi/units";
import { useKpiCompanyId } from "../../../lib/kpi/switch";
import { getKpiCatalogue, getKpiSetup } from "../../../services/kpiService";

/**
 * KPI names, framework uses, site and people names for the wave C pages
 * (review, targets, dashboard, reports): `GET /kpi/catalogue` and `GET /kpi/setup`
 * (with `sites` and `people`), cached under the setup wizard's keys.
 */
export const lookupKeys = {
  setup: (companyId: number | null) => ["kpi", "setup", companyId] as const,
  catalogue: (companyId: number | null) => ["kpi", "catalogue", companyId] as const,
};

export interface KpiLookup {
  definition: (id: number) => KpiDefinition | null;
  /** "GRI 303-3 · BRSR P6-E3 · ESRS E3-4" badges of a KPI. */
  usesOf: (id: number) => FrameworkUse[];
  frameworksOf: (id: number) => FrameworkCode[];
  siteName: (id: number | null) => string;
  personName: (id: number | null | undefined) => string | null;
  sites: { site_id: number; name: string }[];
  /** Frameworks the company reports, in GRI, BRSR, ESRS order. */
  frameworks: FrameworkCode[];
  /** KPIs the company tracks. */
  selected: KpiDefinition[];
  yearType: YearType;
  /** ESRS topics marked not material, with their reason. */
  setup: KpiSetup | null;
}

/** Pure: the lookup over a catalogue and a setup (tests call it directly). */
export function buildLookup(catalogue: KpiCatalogue | undefined, setup: KpiSetup | undefined): KpiLookup {
  const defs = new Map((catalogue?.definitions ?? []).map((d) => [d.id, d]));
  const disclosures = new Map((catalogue?.disclosures ?? []).map((d) => [d.id, d]));
  const fwById = new Map((catalogue?.frameworks ?? []).map((f) => [f.id, f.code]));
  const enabledIds = new Set((setup?.frameworks ?? []).map((f) => f.framework_id));
  const uses = new Map<number, FrameworkUse[]>();
  for (const m of catalogue?.mappings ?? []) {
    const d = disclosures.get(m.disclosure_id);
    const fw = d ? fwById.get(d.framework_id) : undefined;
    if (!d || !fw || (enabledIds.size && !enabledIds.has(d.framework_id))) continue;
    uses.set(m.kpi_definition_id, [...(uses.get(m.kpi_definition_id) ?? []), { framework: fw, code: d.code, ...(d.requirement === "core" ? { core: true } : {}) }]);
  }
  const sites = (setup?.sites ?? []).map((s) => ({ site_id: s.site_id, name: s.name }));
  const people = new Map((setup?.people ?? []).map((p) => [p.user_id, p.name]));
  const enabledCodes = new Set((catalogue?.frameworks ?? []).filter((f) => !enabledIds.size || enabledIds.has(f.id)).map((f) => f.code));
  const selectedIds = new Set((setup?.kpis ?? []).filter((k) => k.selected).map((k) => k.kpi_definition_id));
  return {
    definition: (id) => defs.get(id) ?? null,
    usesOf: (id) => uses.get(id) ?? [],
    frameworksOf: (id) => FRAMEWORK_CODES.filter((f) => (uses.get(id) ?? []).some((u) => u.framework === f)),
    siteName: (id) => (id === null ? "Company" : (sites.find((s) => s.site_id === id)?.name ?? `Site ${id}`)),
    personName: (id) => (id ? (people.get(id) ?? null) : null),
    sites,
    frameworks: FRAMEWORK_CODES.filter((f) => enabledCodes.has(f)),
    selected: [...defs.values()].filter((d) => (selectedIds.size ? selectedIds.has(d.id) : true)).sort((a, b) => a.name.localeCompare(b.name)),
    yearType: setup?.settings?.year_type ?? "CY",
    setup: setup ?? null,
  };
}

/** The lookup for the signed-in person's company (a Superadmin's selected client). */
export function useKpiLookup() {
  const companyId = useKpiCompanyId();
  const catalogue = useQuery({ queryKey: lookupKeys.catalogue(companyId), queryFn: () => getKpiCatalogue(companyId), staleTime: 5 * 60_000 });
  const setup = useQuery({ queryKey: lookupKeys.setup(companyId), queryFn: () => getKpiSetup(companyId), staleTime: 60_000 });
  const lookup = useMemo(() => buildLookup(catalogue.data, setup.data), [catalogue.data, setup.data]);
  return { lookup, isLoading: catalogue.isPending || setup.isPending, error: catalogue.error ?? setup.error ?? null, refetch: () => Promise.all([catalogue.refetch(), setup.refetch()]) };
}

/** "1,200 m³", "Yes", or the text answer: a value as entered. */
export function valueText(v: Pick<KpiValue, "value_numeric" | "value_text" | "unit" | "value_canonical" | "canonical_unit">, def: Pick<KpiDefinition, "decimals" | "canonical_unit"> | null): string {
  if (v.value_numeric !== null && v.value_numeric !== undefined) return formatWithUnit(v.value_numeric, v.unit ?? def?.canonical_unit ?? v.canonical_unit ?? null);
  if (v.value_text === "yes") return "Yes";
  if (v.value_text === "no") return "No";
  return v.value_text?.trim() || "—";
}
