// DS-10 · the Resize dialog's pure side (05-ux S6): which targets a design can
// become, what each copy would hold (the same engine the server runs,
// src/lib/studio/resize.ts), the chapter picker and the copy titles.
import { PAGE_FORMAT_SIZES, type ReportDoc } from "../../../lib/studio/contracts";
import { RESIZE_TARGETS, resizeChapters, resizeDocument, type ChapterChoice, type ResizeReport, type ResizeTarget } from "../../../lib/studio/resize";

export type TargetId = ResizeTarget["id"];

export interface TargetPlan {
  target: ResizeTarget;
  ok: boolean;
  /** Why the target can't be made from this design. */
  reason: string | null;
  pageCount: number;
  doc: ReportDoc | null;
  report: ResizeReport | null;
}

/** Short names for titles and tabs. */
export const TARGET_NAMES: Record<TargetId, string> = {
  deck: "Board deck",
  summary: "One-page summary",
  social_square: "Social card 1:1",
  social_wide: "Social card 1.91:1",
  booklet: "Booklet A5",
};

const UNSUPPORTED: Record<string, string> = {
  booklet: "Keeps the page shape, so only A4-shaped designs",
  social: "Needs a page with numbers or a chart",
  summary: "Needs a page with numbers or a chart",
};

/** What each target would make from `doc` (pages to include: `pageIds`, or the defaults). */
export function planTargets(doc: ReportDoc, pageIds?: string[]): TargetPlan[] {
  return RESIZE_TARGETS.map((target) => {
    const r = resizeDocument(doc as unknown as Record<string, unknown>, {
      purpose: target.purpose,
      format: target.format,
      ...(pageIds ? { pageIds } : {}),
      title: copyTitle(doc.meta.title, target.id),
      sizes: PAGE_FORMAT_SIZES,
      link: { docId: 1, rev: 0, dataHash: "preview" },
    });
    if (!r.ok) {
      const reason = r.error === "UNSUPPORTED" ? (UNSUPPORTED[target.profile] ?? UNSUPPORTED[target.purpose] ?? "Can't be made from this design") : "Can't be made from this design";
      return { target, ok: false, reason, pageCount: 0, doc: null, report: null };
    }
    return { target, ok: true, reason: null, pageCount: r.doc.pages.length, doc: r.doc as unknown as ReportDoc, report: r.report };
  });
}

/** "Board deck 16:9" → "9 slides"; summaries "1 page"; social "1 card". */
export function countText(target: ResizeTarget, n: number): string {
  if (target.profile === "deck") return `${n} slide${n === 1 ? "" : "s"}`;
  if (target.profile === "social") return "1 card";
  return `${n} page${n === 1 ? "" : "s"}`;
}

export const copyTitle = (title: string, id: TargetId): string => `${title} · ${TARGET_NAMES[id]}`.slice(0, 200);

/** The chapters of the picker and which are on when the dialog opens. */
export function chaptersOf(doc: ReportDoc): ChapterChoice[] {
  return resizeChapters(doc as unknown as Record<string, unknown>, PAGE_FORMAT_SIZES);
}

export const defaultChapterIds = (chapters: ChapterChoice[]): Set<string> => new Set(chapters.filter((c) => c.defaultOn).map((c) => c.id));

/**
 * The `pageIds` to send: undefined while the picker is as it opened (each
 * target then uses its own defaults: a deck its key pages, a summary every page),
 * else the pages of the chapters ticked.
 */
export function pageIdsFor(chapters: ChapterChoice[], on: Set<string>): string[] | undefined {
  const defaults = defaultChapterIds(chapters);
  if (defaults.size === on.size && [...defaults].every((id) => on.has(id))) return undefined;
  return chapters.filter((c) => on.has(c.id)).flatMap((c) => c.pageIds);
}

/** The line under the preview: what is shown and what was left out. */
export function previewNote(plan: TargetPlan, shown: number): string {
  if (!plan.ok || !plan.report) return plan.reason ?? "";
  const unit = plan.target.profile === "deck" ? "slides" : "pages";
  const parts: string[] = [];
  if (plan.pageCount > shown) parts.push(`Showing ${shown} of ${plan.pageCount} ${unit}.`);
  if (plan.report.pages.some((p) => p.layout === "full_report")) parts.push("Sections left out become one “See the full report” slide.");
  if (plan.report.dropped.length) parts.push(`${plan.report.dropped.length} linked element${plan.report.dropped.length === 1 ? "" : "s"} don't fit and are left out.`);
  if (plan.report.truncated.length) parts.push(`${plan.report.truncated.length} text${plan.report.truncated.length === 1 ? " is" : "s are"} shortened to fit.`);
  return parts.join(" ");
}
