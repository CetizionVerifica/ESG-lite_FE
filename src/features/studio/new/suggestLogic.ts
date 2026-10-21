// AT-1 · "Help me choose" on /studio/new step 1: the pure parts. The brief's
// defaults from the flow's state, the POST /studio/templates/suggest body, the
// readiness badge tones, the page names of pagesToDrop, and the template doc
// set to the flow's period and sites for "Preview with my data".
import {
  BRIEF_NOTE_MAX,
  FRAMEWORKS_BY_KIND,
  type BriefAudience,
  type BriefLength,
  type BriefPurpose,
  type BriefTone,
  type FreeformPage,
  type ReadinessBadge,
  type ReportDoc,
  type ReportKind,
  type TemplateBrief,
  type TemplateReadiness,
  type TemplateSuggestBody,
} from "../../../lib/studio/contracts";
import { docVars, fillPlaceholders } from "../../../lib/studio/libraryOps";
import type { BadgeTone } from "../../../ui";
import type { NewDesignState } from "./logic";

export type ChooseMode = "browse" | "choose";

export const PURPOSE_LABELS: Record<BriefPurpose, string> = {
  sustainability_report: "Sustainability report",
  ghg_inventory: "GHG inventory",
  board_brief: "Board brief",
  site_fact_sheet: "Site fact sheet",
};
/** The purposes offered for a kind (the kind control above picks GHG or sustainability). */
export const PURPOSES_BY_KIND: Record<ReportKind, BriefPurpose[]> = {
  ghg: ["ghg_inventory", "board_brief", "site_fact_sheet"],
  sustainability: ["sustainability_report", "board_brief", "site_fact_sheet"],
};
export const AUDIENCE_LABELS: Record<BriefAudience, string> = { verifier: "Verifier and regulator", board: "Board", investors: "Investors", public: "Public" };
export const LENGTH_LABELS: Record<BriefLength, string> = { medium: "About 20 pages", short: "About 2 pages", long: "About 40 pages" };
export const TONE_LABELS: Record<BriefTone, string> = { formal: "Formal", plain: "Plain", engaging: "Engaging" };

/** The brief's first answers: the kind's main purpose, the flow's frameworks. */
export function defaultBrief(state: Pick<NewDesignState, "kind" | "frameworks">): TemplateBrief {
  return {
    purpose: state.kind === "ghg" ? "ghg_inventory" : "sustainability_report",
    frameworks: state.frameworks.filter((f) => FRAMEWORKS_BY_KIND[state.kind].includes(f)),
    audience: state.kind === "ghg" ? "verifier" : "investors",
    length: "medium",
    tone: "formal",
  };
}

/** POST /studio/templates/suggest from the flow and the brief (an empty note is left out). */
export function suggestBody(state: Pick<NewDesignState, "kind" | "year" | "yearType" | "sites">, brief: TemplateBrief): TemplateSuggestBody {
  const note = brief.note?.trim().slice(0, BRIEF_NOTE_MAX);
  const frameworks = brief.frameworks.filter((f) => FRAMEWORKS_BY_KIND[state.kind].includes(f));
  const purpose = PURPOSES_BY_KIND[state.kind].includes(brief.purpose) ? brief.purpose : PURPOSES_BY_KIND[state.kind][0];
  return {
    kind: state.kind,
    year: state.year,
    yearType: state.yearType,
    sites: state.sites,
    brief: { purpose, frameworks, audience: brief.audience, length: brief.length, ...(brief.tone ? { tone: brief.tone } : {}), ...(note ? { note } : {}) },
  };
}

export const BADGE_TONE: Record<ReadinessBadge["status"], BadgeTone> = { ok: "good", partial: "warn", missing: "bad" };
export const LEVEL_TEXT: Record<TemplateReadiness["level"], { label: string; tone: BadgeTone }> = {
  ready: { label: "Data ready", tone: "good" },
  partial: { label: "Some data missing", tone: "warn" },
  low: { label: "Little data yet", tone: "bad" },
};

/** "GHG templates" / "sustainability templates". */
export const kindNoun = (kind: ReportKind) => (kind === "ghg" ? "GHG" : "sustainability");

/** Names of the pages the AI suggests leaving out (unknown ids are skipped). */
export function pageNames(doc: Pick<ReportDoc, "pages"> | null | undefined, ids: string[]): string[] {
  if (!doc) return [];
  const byId = new Map(doc.pages.map((p) => [p.id, p.name]));
  return ids.map((id) => byId.get(id)).filter((n): n is string => !!n);
}

/** A layout slug as a name: "ghg-inventory/targets" → "Targets". */
export const layoutName = (slug: string) => {
  const role = slug.slice(slug.lastIndexOf("/") + 1).replace(/[_-]+/g, " ").trim();
  return role ? role[0].toUpperCase() + role.slice(1) : slug;
};

/**
 * The template's doc in the flow's scope (year, year type, sites, frameworks),
 * with {{company}}, {{year}}, {{period}} and {{title}} filled, for the paged
 * preview with /studio/resolve values. Nothing is saved.
 */
export function previewTemplateDoc(templateDoc: ReportDoc, state: Pick<NewDesignState, "year" | "yearType" | "sites" | "frameworks" | "kind">, company?: string): ReportDoc {
  const doc = JSON.parse(JSON.stringify(templateDoc)) as ReportDoc;
  const frameworks = state.frameworks.filter((f) => FRAMEWORKS_BY_KIND[state.kind].includes(f));
  doc.meta = { ...doc.meta, year: state.year, yearType: state.yearType, sites: state.sites, ...(frameworks.length ? { frameworks } : {}) };
  return fillPlaceholders(doc, docVars(doc, company));
}

/** The pages the preview pages through: free-form pages (flow sections are laid out when the design is built). */
export const previewPages = (doc: ReportDoc | null | undefined): FreeformPage[] => (doc ? doc.pages.filter((p): p is FreeformPage => p.kind === "freeform") : []);
