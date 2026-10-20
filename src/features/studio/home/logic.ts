// DS-5 · Studio home (05-ux S1): the pure parts.
import type { DocPurpose, PageFormat, ReportKind, ReportStatus, StudioDocSummary, YearType } from "../../../lib/studio/contracts";
import { timeAgo } from "../../../ui";

/** The latest reporting year that has ended by `now`: last calendar year, or the FY that ended in March (FY 2026 = Apr 2025 – Mar 2026). */
export function latestClosedYear(yearType: YearType, now: Date = new Date()): number {
  if (yearType === "CY") return now.getFullYear() - 1;
  return now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
}

export interface StartOption {
  id: "ghg" | "sustainability" | "deck" | "summary" | "social";
  title: string;
  /** Format and what it is for, e.g. "A4 · Scope 1, 2 and 3 inventory". */
  subtitle: string;
  kind: ReportKind;
  format: PageFormat;
  purpose: DocPurpose;
}

/** "What will you design?" (05-ux S1): each opens the new-design flow preselected. */
export const START_OPTIONS: StartOption[] = [
  { id: "ghg", title: "GHG report", subtitle: "A4 · Scope 1, 2 and 3 inventory", kind: "ghg", format: "a4", purpose: "report" },
  { id: "sustainability", title: "Sustainability report", subtitle: "A4 · GRI, BRSR, ESRS", kind: "sustainability", format: "a4", purpose: "report" },
  { id: "deck", title: "Board deck", subtitle: "16:9 · 8–10 slides", kind: "ghg", format: "slide_16_9", purpose: "deck" },
  { id: "summary", title: "One-page summary", subtitle: "A4 · for suppliers and customers", kind: "ghg", format: "a4", purpose: "summary" },
  { id: "social", title: "Social card", subtitle: "1:1 or 1.91:1", kind: "ghg", format: "square", purpose: "social" },
];

export const startLink = (o: StartOption): string => `/studio/new?${new URLSearchParams({ kind: o.kind, format: o.format, purpose: o.purpose }).toString()}`;

export const KIND_LABEL: Record<ReportKind, string> = { ghg: "GHG", sustainability: "Sustainability" };

export const FORMAT_LABEL: Record<PageFormat, string> = {
  a4: "A4",
  a4_landscape: "A4 landscape",
  letter: "Letter",
  a5: "A5",
  slide_16_9: "16:9",
  square: "Square",
  social_191: "1.91:1",
};

/** "A4 · 22 pages", "16:9 · 9 slides". */
export function formatLine(format: PageFormat, pageCount: number): string {
  const unit = format === "slide_16_9" ? "slide" : "page";
  return `${FORMAT_LABEL[format]} · ${pageCount} ${unit}${pageCount === 1 ? "" : "s"}`;
}

const STATUS_LABEL: Record<ReportStatus, string> = { draft: "Draft", in_review: "In review", approved: "Approved", final: "Final" };

/** Draft / In review / Approved / Final vN; "Building…" or "Build failed" while a build runs or after it failed. */
export function statusLabel(d: Pick<StudioDocSummary, "status" | "finalVersion" | "buildState">): { label: string; tone: "neutral" | "info" | "good" | "brand" | "bad" } {
  if (d.buildState === "running") return { label: "Building…", tone: "info" };
  if (d.buildState === "failed") return { label: "Build failed", tone: "bad" };
  if (d.finalVersion) return { label: `Final v${d.finalVersion}`, tone: "brand" };
  if (d.status === "approved") return { label: STATUS_LABEL.approved, tone: "good" };
  if (d.status === "in_review") return { label: STATUS_LABEL.in_review, tone: "info" };
  return { label: STATUS_LABEL[d.status] ?? "Draft", tone: "neutral" };
}

/** "Edited 2h ago by Maya Manager". */
export function editedLine(d: Pick<StudioDocSummary, "updatedAt" | "updatedBy">, now: number = Date.now()): string {
  const when = timeAgo(d.updatedAt, now);
  return `Edited ${when}${d.updatedBy ? ` by ${d.updatedBy}` : ""}`;
}

/** Page aspect ratio (w / h) of a format, for thumbnails. */
export const FORMAT_ASPECT: Record<PageFormat, number> = {
  a4: 210 / 297,
  a4_landscape: 297 / 210,
  letter: 215.9 / 279.4,
  a5: 148 / 210,
  slide_16_9: 16 / 9,
  square: 1,
  social_191: 1.91,
};
