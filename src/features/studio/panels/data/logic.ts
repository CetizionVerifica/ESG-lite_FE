// DS-2 · pure helpers for the Data drawer and Report details (no React).
// The FE never formats a reported number: values arrive as `display` strings
// from /studio/resolve and /studio/data. These helpers only word the labels
// around them (approval dates, unavailable reasons, input sources).
import {
  inputKeysFor,
  type DataGroup,
  type InputPrefill,
  type InputsPatch,
  type InputSource,
  type ReportInputKey,
  type ReportInputs,
  type ReportKind,
  type UnavailableReason,
} from "../../../../lib/studio/contracts";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "12 Apr 2026" from an ISO date-time (the UTC day); null for none. */
export function approvalDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** The data mark under a figure (05-ux): "Approved 12 Apr 2026", or why it has no value. */
export function dataNote(item: { approvedAt?: string | null; unavailable?: { reason: UnavailableReason; detail?: string } }): string {
  if (item.unavailable) return UNAVAILABLE_TEXT[item.unavailable.reason] ?? "Not reported";
  const day = approvalDay(item.approvedAt);
  return day ? `Approved ${day}` : "No approved data yet";
}

export const UNAVAILABLE_TEXT: Record<UnavailableReason, string> = {
  NOT_RECORDED: "Not recorded in ESGLite",
  NOT_TRACKED: "Not tracked on the entries",
  NO_DATA: "No approved data for this year",
  NO_BASE_YEAR: "No base year set",
  NO_INPUT: "Needs a report detail",
  NO_TARGET: "No target set",
  KPI_TRACKING_OFF: "KPI tracking is off",
  EXCLUDED: "Excluded in report details",
  DIVIDE_BY_ZERO: "Can't be calculated (zero)",
};

/** Items whose label or value text match the search (case-insensitive); empty groups drop out. */
export function filterGroups(groups: DataGroup[], query: string): DataGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => `${g.label} ${i.label} ${i.id}`.toLowerCase().includes(q)) }))
    .filter((g) => g.items.length > 0);
}

/** The newest approval among the items (the "last approval" line under the totals). */
export function lastApproval(groups: DataGroup[]): string | null {
  const all = groups.flatMap((g) => g.items.map((i) => i.resolved.approvedAt)).filter((v): v is string => !!v);
  return all.length ? approvalDay(all.sort()[all.length - 1]) : null;
}

// ---------------------------------------------------------------------------
// Report details (01-contracts §2.1)
// ---------------------------------------------------------------------------

export const INPUT_LABELS: Record<ReportInputKey, string> = {
  consolidation_approach: "Consolidation approach",
  responsible_person: "Person responsible for the report",
  reporting_period: "Reporting period",
  base_year: "Base year",
  recalculation_policy: "Base-year recalculation policy",
  significance_threshold_pct: "Significance threshold",
  gwp_set: "GWP values",
  exclusions: "Excluded sources and categories",
  scope2_instruments: "Scope 2 contractual instruments",
  uncertainty_statement: "Uncertainty",
  verification: "Verification",
  conformance: "Conforms to",
  revenue: "Revenue",
  revenue_ppp_rate: "Revenue PPP conversion rate",
  output_units: "Units of output",
  employees: "Employees",
  leadership_message: "Leadership message",
  about_company: "About the company",
};

export const SOURCE_LABELS: Record<InputSource, string> = {
  company: "From company settings",
  kpi: "From KPI values",
  typed: "Typed",
};

/** Typed numbers the checks treat with care (01-contracts §2.1 "typed (flagged)"). */
export const FLAGGED_WHEN_TYPED: ReadonlySet<ReportInputKey> = new Set(["revenue", "revenue_ppp_rate", "output_units", "employees"]);

/** What a key shows in the form: the stored entry, else the prefill, else empty. */
export function effectiveInput(key: ReportInputKey, stored: ReportInputs, prefill: InputPrefill): { value: unknown; source: InputSource | null; stored: boolean; note?: string } {
  const s = stored[key];
  if (s) return { value: s.value, source: s.source, stored: true };
  const p = prefill[key];
  if (p) return { value: p.value, source: p.source, stored: false, note: p.note };
  return { value: null, source: null, stored: false };
}

const isEmpty = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

/** Inputs of the kind with nothing stored or prefilled: "We'll flag these in checks". */
export function missingInputs(kind: ReportKind, stored: ReportInputs, prefill: InputPrefill): ReportInputKey[] {
  return inputKeysFor(kind).filter((k) => isEmpty(effectiveInput(k, stored, prefill).value));
}

/** The changed keys between two stored-input sets, as a PATCH body (null = removed). */
export function inputsPatch(before: ReportInputs, after: ReportInputs): InputsPatch {
  const out: Record<string, { value: unknown; source?: InputSource } | null> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    const a = (before as Record<string, { value: unknown; source: InputSource } | undefined>)[k];
    const b = (after as Record<string, { value: unknown; source: InputSource } | undefined>)[k];
    if (!b) {
      if (a) out[k] = null;
    } else if (!a || JSON.stringify(a.value) !== JSON.stringify(b.value) || a.source !== b.source) {
      out[k] = { value: b.value, source: b.source };
    }
  }
  return out as InputsPatch;
}
