/**
 * A KPI value as the review list and the record drawer show it (KPI-8, also
 * read-only from framework reports, KPI-11): names, the filled-in question,
 * the value as entered, the change on last year and its review checks.
 */
import type { FrameworkUse } from "../../../lib/kpi/badges";
import { type KpiCheckId, type KpiDefinition, type KpiValue, KPI_CHECK_IDS } from "../../../lib/kpi/contracts";
import { compareToLast, fillQuestion, lastPeriodText, periodText } from "../../../lib/kpi/entry";
import { CHECK_LABEL } from "../../../lib/kpi/labels";
import { type KpiLookup, valueText } from "./lookup";

export const lastYearStart = (start: string) => `${Number(start.slice(0, 4)) - 1}${start.slice(4)}`;

/** Checks that only inform the reviewer: they don't hold a value back (01-contracts §5). */
export const INFO_CHECKS: ReadonlySet<string> = new Set<KpiCheckId>(["KPI_UNIT_CONVERTED"]);

export interface ValueCheck {
  id: string;
  /** Plain words: the server's detail ("3× last September") or the check's label. */
  label: string;
  info: boolean;
}

/**
 * `kpi_value.checks` as the server may send it: a list of `{id, detail}`
 * (the KPI-0 shape) or `{ready, held: [...]}` (the KPI-8 spec words), with
 * held entries as ids or objects.
 */
export function readChecks(raw: unknown): { ready: boolean | null; held: ValueCheck[] } {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" && Array.isArray((raw as { held?: unknown }).held) ? (raw as { held: unknown[] }).held : [];
  const ready = raw && typeof raw === "object" && !Array.isArray(raw) && typeof (raw as { ready?: unknown }).ready === "boolean" ? (raw as { ready: boolean }).ready : null;
  const held = list
    .map((c) => (typeof c === "string" ? { id: c, detail: null } : c && typeof c === "object" ? (c as { id?: unknown; detail?: unknown }) : null))
    .filter((c): c is { id: string; detail: unknown } => !!c && typeof c.id === "string")
    .map((c) => ({
      id: c.id,
      label: typeof c.detail === "string" && c.detail.trim() ? c.detail : (KPI_CHECK_IDS as readonly string[]).includes(c.id) ? CHECK_LABEL[c.id as KpiCheckId] : "Needs a look",
      info: INFO_CHECKS.has(c.id),
    }));
  return { ready, held };
}

export interface KpiValueItem {
  id: number;
  value: KpiValue;
  def: KpiDefinition | null;
  kpiName: string;
  siteName: string;
  /** "September 2026", "Q3 2026", "2026". */
  periodLabel: string;
  question: string;
  valueText: string;
  /** "+14 %", or null without last year's figure. */
  change: string | null;
  lastLabel: string;
  checks: ValueCheck[];
  ready: boolean;
  usedIn: FrameworkUse[];
  enteredBy: string | null;
}

/** One item per value (the review list: pending values); `lastYear` holds approved values of the year before, matched by KPI, site and period. */
export function valueItems(values: KpiValue[], lookup: KpiLookup, lastYear: KpiValue[] = []): KpiValueItem[] {
  const last = new Map(lastYear.map((v) => [`${v.kpi_definition_id}:${v.site_id ?? "c"}:${v.period_start}`, v]));
  return values
    .map((v) => {
      const def = lookup.definition(v.kpi_definition_id);
      const kpiName = v.kpi_name ?? def?.name ?? v.kpi_code ?? `KPI ${v.kpi_definition_id}`;
      const siteName = v.site_name ?? lookup.siteName(v.site_id);
      const periodLabel = periodText(v.period_start, v.frequency, v.year_type ?? lookup.yearType);
      const before = v.last_value ?? last.get(`${v.kpi_definition_id}:${v.site_id ?? "c"}:${lastYearStart(v.period_start)}`) ?? null;
      const lastLabel = lastPeriodText(v.period_start, v.frequency);
      let change: string | null = null;
      if (typeof v.change_pct === "number") change = `${v.change_pct >= 0 ? "+" : "−"}${Math.abs(Math.round(v.change_pct))} %`;
      else if (before) {
        const b = "value_numeric" in before ? { value: before.value_numeric, unit: before.unit } : { value: before.value, unit: before.unit };
        change = compareToLast({ value: v.value_numeric, unit: v.unit }, b, def?.canonical_unit ?? v.canonical_unit ?? null, lastLabel).changeText;
      }
      // The server also sends `check_items: [{id, held, detail}]`, which carries the reason text.
      const items = (v as { check_items?: unknown }).check_items;
      const { ready, held } = Array.isArray(items)
        ? { ready: readChecks(v.checks).ready, held: readChecks(items.filter((c) => (c as { held?: unknown })?.held !== false)).held }
        : readChecks(v.checks);
      return {
        id: v.id,
        value: v,
        def,
        kpiName,
        siteName,
        periodLabel,
        question: def ? fillQuestion(def.question, v.site_id === null ? null : siteName, periodLabel) : kpiName,
        valueText: valueText(v, def),
        change,
        lastLabel,
        checks: held,
        ready: ready ?? held.every((c) => c.info),
        usedIn: lookup.usesOf(v.kpi_definition_id),
        enteredBy: v.entered_by_name ?? lookup.personName(v.entered_by),
      };
    })
    .sort((a, b) => a.value.period_start.localeCompare(b.value.period_start) || a.siteName.localeCompare(b.siteName) || a.kpiName.localeCompare(b.kpiName));
}

