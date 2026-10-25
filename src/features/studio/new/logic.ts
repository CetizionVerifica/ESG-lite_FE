// DS-5 · new design (05-ux S2): the pure parts. The flow's state starts from
// the URL (`/studio/new?kind=&template=&format=&purpose=&year=&yearType=&compareYear=&siteIds=`),
// which the home cards and the GHG report's "Design this report" fill.
import {
  BLANK_TEMPLATE,
  FRAMEWORKS_BY_KIND,
  type CreateDocBody,
  type DocPurpose,
  type FrameworkCode,
  type PageFormat,
  type ReportInputs,
  type ReportKind,
  type ReportTemplate,
  type YearType,
} from "../../../lib/studio/contracts";
import { inputsPatch } from "../panels/data/logic";
import { latestClosedYear } from "../home/logic";

export type FormatFilter = "all" | "report" | "deck" | "summary" | "social";

export interface NewDesignState {
  kind: ReportKind;
  templateId: number | typeof BLANK_TEMPLATE | null;
  formatFilter: FormatFilter;
  /** Blank designs only. */
  blankFormat: PageFormat;
  year: number;
  yearType: YearType;
  compareYear: number | null;
  sites: "all" | number[];
  frameworks: FrameworkCode[];
  inputs: ReportInputs;
  ai: boolean;
  title: string;
}

const PURPOSE_FILTER: Record<DocPurpose, FormatFilter> = { report: "report", deck: "deck", summary: "summary", social: "social" };

const intOrNull = (v: string | null): number | null => {
  const n = Number(v);
  return v !== null && v !== "" && Number.isInteger(n) ? n : null;
};

/** The flow's first state from the URL; unknown values fall back to defaults. */
export function initialState(params: URLSearchParams, now: Date = new Date()): NewDesignState {
  const kind: ReportKind = params.get("kind") === "sustainability" ? "sustainability" : "ghg";
  const yearType: YearType = params.get("yearType") === "CY" ? "CY" : params.get("yearType") === "FY" ? "FY" : "FY";
  const year = intOrNull(params.get("year")) ?? latestClosedYear(yearType, now);
  const compareYear = intOrNull(params.get("compareYear"));
  const siteIds = (params.get("siteIds") ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  const purpose = params.get("purpose") as DocPurpose | null;
  const format = params.get("format") as PageFormat | null;
  const template = params.get("template");
  const formatFilter: FormatFilter = purpose && PURPOSE_FILTER[purpose] ? PURPOSE_FILTER[purpose] : format === "slide_16_9" ? "deck" : format === "square" || format === "social_191" ? "social" : "all";
  return {
    kind,
    templateId: template === BLANK_TEMPLATE ? BLANK_TEMPLATE : intOrNull(template),
    formatFilter,
    blankFormat: format ?? "a4",
    year,
    yearType,
    compareYear: compareYear !== null && compareYear < year ? compareYear : null,
    sites: siteIds.length ? siteIds : "all",
    frameworks: [FRAMEWORKS_BY_KIND[kind][0]],
    inputs: {},
    ai: true,
    title: "",
  };
}

/** Templates for a format filter: reports, decks (16:9), one-page summaries, social cards. */
export function filterTemplates(templates: ReportTemplate[], filter: FormatFilter): ReportTemplate[] {
  if (filter === "all") return templates;
  return templates.filter((t) => {
    if (filter === "deck") return t.purpose === "deck" || t.format === "slide_16_9";
    if (filter === "social") return t.purpose === "social" || t.format === "square" || t.format === "social_191";
    return t.purpose === filter;
  });
}

/** The blank design's format for a format filter. */
export const blankFormatFor = (filter: FormatFilter, fallback: PageFormat): PageFormat => (filter === "deck" ? "slide_16_9" : filter === "social" ? "square" : fallback === "slide_16_9" || fallback === "square" ? "a4" : fallback);

/** Years offered in the scope step: the latest closed year and the five before it, plus the current one. */
export function yearOptions(yearType: YearType, now: Date = new Date()): number[] {
  const latest = latestClosedYear(yearType, now);
  return Array.from({ length: 7 }, (_, i) => latest + 1 - i);
}

export type ScopeSite = { site_id: number; name: string; company?: { company_id?: number | null } | null };

/** The session's sites in the company being worked in (M6's choice is the session's `company`); a site with no company on it stays. */
export function companySites<T extends ScopeSite>(sites: T[], companyId: number | null | undefined): T[] {
  if (!companyId) return sites;
  return sites.filter((s) => !s.company?.company_id || s.company.company_id === companyId);
}

/** Ticks or unticks a site. Nothing left means all sites, unless the person can't report company-wide: then nothing is picked. */
export function toggleScopeSite(current: "all" | number[], id: number, allAllowed: boolean): "all" | number[] {
  const picked = current === "all" ? [] : current;
  const next = picked.includes(id) ? picked.filter((s) => s !== id) : [...picked, id];
  return next.length || !allAllowed ? next : "all";
}

export const SITES_SCOPE_MESSAGE = "A company-wide report needs access to every site. Pick your sites instead.";

/** What to say when the server refuses the picked sites (DS_SITES_SCOPE, or DS_DOC_NOT_FOUND naming sites); null for any other answer. */
export function scopeRefusal(error: unknown, sites: ScopeSite[]): string | null {
  const data = (error as { response?: { data?: { code?: unknown; details?: { sites?: unknown } } } } | null)?.response?.data;
  if (data?.code === "DS_SITES_SCOPE") return SITES_SCOPE_MESSAGE;
  const ids = data?.code === "DS_DOC_NOT_FOUND" && Array.isArray(data.details?.sites) ? (data.details.sites as unknown[]).map(Number) : [];
  if (!ids.length) return null;
  const names = ids.map((id) => sites.find((s) => s.site_id === id)?.name).filter((n): n is string => !!n);
  if (names.length === ids.length) return `You can't report on ${names.join(", ")} in this company. Untick ${ids.length === 1 ? "it" : "them"}.`;
  return `You can't report on ${ids.length === 1 ? "one of these sites" : "some of these sites"} in this company. Pick your own sites.`;
}

/** POST /docs body from the flow's state. */
export function createBody(s: NewDesignState): CreateDocBody {
  if (s.templateId === null) throw new Error("Pick a template first");
  const body: CreateDocBody = {
    kind: s.kind,
    templateId: s.templateId,
    year: s.year,
    yearType: s.yearType,
    sites: s.sites,
    frameworks: s.frameworks.filter((f) => FRAMEWORKS_BY_KIND[s.kind].includes(f)),
    inputs: inputsPatch({}, s.inputs),
    ai: s.ai,
  };
  if (s.compareYear !== null) body.compareYear = s.compareYear;
  if (s.title.trim()) body.title = s.title.trim();
  if (s.templateId === BLANK_TEMPLATE) body.format = s.blankFormat;
  return body;
}

export const FRAMEWORK_LABELS: Record<FrameworkCode, string> = {
  GHGP: "GHG Protocol",
  ISO14064: "ISO 14064-1",
  BRSR_P6: "BRSR Principle 6",
  ESRS_E1: "ESRS E1",
  GRI: "GRI",
  BRSR: "BRSR",
  ESRS: "ESRS",
};
