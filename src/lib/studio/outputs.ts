// DS-11 · pure helpers for Page view, Present, downloads and view links:
// the postMessage bridge of preview.html, slide stepping and speaker notes,
// job and link wording (05-ux S7 copy), PNG page ranges and the expiry choices.
import type { DsErrorCode, FreeformPage, JobKind, ReportDoc, ReportJob, ReportShare, ReportVersion } from "./contracts";

// ---------------------------------------------------------------------------
// The preview bridge (ESG-lite src/studio/jobs/preview.ts BRIDGE_JS)
// ---------------------------------------------------------------------------

export type BridgeMessage =
  | { type: "ready"; pageCount: number; error: string | null }
  | { type: "select"; pageId: string | null; elId: string | null }
  | { type: "slide"; index: number; count: number; pageId: string | null }
  | { type: "key"; key: string };

const str = (v: unknown): string | null => (typeof v === "string" && v.length <= 200 ? v : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 100_000 ? v : null);

/** A message from a preview frame, checked field by field (the frame runs report content, so trust nothing). */
export function parseBridgeMessage(data: unknown): BridgeMessage | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.source !== "ds-preview") return null;
  switch (d.type) {
    case "ready":
      return { type: "ready", pageCount: int(d.pageCount) ?? 0, error: str(d.error) };
    case "select":
      return { type: "select", pageId: str(d.pageId), elId: str(d.elId) };
    case "slide": {
      const index = int(d.index);
      const count = int(d.count);
      return index === null || count === null ? null : { type: "slide", index, count, pageId: str(d.pageId) };
    }
    case "key": {
      const key = str(d.key);
      return key ? { type: "key", key } : null;
    }
    default:
      return null;
  }
}

/** The message the host sends to jump to a slide. */
export const goMessage = (index: number) => ({ source: "ds-host", type: "go", index });

/** The next slide index for a key, or null when the key isn't a slide key. */
export function slideForKey(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(key)) return Math.min(count - 1, index + 1);
  if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(key)) return Math.max(0, index - 1);
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/** The speaker notes of a page (free-form pages carry `notes`; flow sections have none). */
export function notesFor(doc: ReportDoc | undefined, pageId: string | null): { name: string; notes: string } | null {
  if (!doc || !pageId) return null;
  const page = doc.pages.find((p) => p.id === pageId);
  if (!page) return null;
  const notes = page.kind === "freeform" ? ((page as FreeformPage).notes ?? "") : "";
  return { name: page.name, notes };
}

/** The editor link that selects what was clicked in Page view. */
export function editorLink(docId: number, pageId: string | null, elId: string | null): string {
  const q = new URLSearchParams();
  if (pageId) q.set("page", pageId);
  if (elId) q.set("el", elId);
  const s = q.toString();
  return `/studio/${docId}${s ? `?${s}` : ""}`;
}

// ---------------------------------------------------------------------------
// Jobs and downloads (05-ux S7)
// ---------------------------------------------------------------------------

export const JOB_TITLE: Record<JobKind, string> = {
  proof: "PDF for screens",
  print: "PDF for print",
  png: "PNG pages",
  final: "Final PDF",
  thumbnail: "Thumbnail",
};

export const JOB_POLL_MS = 1000;
export const jobFinished = (job: Pick<ReportJob, "status"> | null | undefined) => !!job && (job.status === "done" || job.status === "failed");

const REASON_TEXT: Record<string, string> = {
  timeout: "it took too long",
  chromium: "the PDF engine stopped",
  font: "a font couldn't load",
  measure: "a page couldn't be laid out",
  storage: "it couldn't be stored",
  data: "the design or its data changed",
  checks: "a page failed its layout checks (see Checks)", // DS-12: the worker's layout gate
};

/** "Making your PDF for print…" / "PDF for print is ready." / "The PDF for print couldn't be made: it took too long. Try again." */
export function jobStatusText(job: Pick<ReportJob, "kind" | "status" | "errorReason" | "versionN">): string {
  const what = job.kind === "final" ? "final PDF" : JOB_TITLE[job.kind];
  if (job.status === "queued") return `Waiting to make your ${what}…`;
  if (job.status === "running") return `Making your ${what}…`;
  if (job.status === "done") return job.kind === "final" && job.versionN ? `Final v${job.versionN} is ready.` : `${JOB_TITLE[job.kind]} is ready.`;
  const why = job.errorReason ? REASON_TEXT[job.errorReason] ?? "something went wrong" : "something went wrong";
  return `The ${what} couldn't be made: ${why}. Try again.`;
}

export type PageRange = { all: true } | { all: false; from: number; to: number };

/** The `pages` option for a PNG job, or an error message for the range fields. */
export function pngPages(range: PageRange, pageCount: number | null): { pages?: [number, number]; error?: string } {
  if (range.all) return {};
  const { from, to } = range;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < 1) return { error: "Enter page numbers from 1." };
  if (from > to) return { error: "The first page must come before the last." };
  if (pageCount && to > pageCount) return { error: `This design has ${pageCount} pages.` };
  return { pages: [from, to] };
}

/** Why "Final PDF" can't be made (null when it can be asked for; the server still runs the gate). */
export function finalBlockedReason(opts: { canFinal: boolean; readOnly?: boolean }): string | null {
  if (!opts.canFinal) return "Only a Manager can make the final.";
  return null;
}

/** The plain-words reasons of a refused final (DS_CHECKS_BLOCKING details, DS_YEAR_NOT_LOCKED, …). */
// DS-13: DS_APPROVAL_PENDING reasons, in words.
const APPROVAL_REASON: Record<string, string> = {
  none: "This company needs an approval before a final. Request approval first.",
  requested: "Waiting for approval. The final can be made once it's approved.",
  changes_requested: "Changes were requested. Request approval again when they're done.",
  stale: "The design changed since it was approved. Request approval again.",
};

export function finalRefusal(code: DsErrorCode | string | undefined, details: unknown, message?: string): string[] {
  if (code === "DS_CHECKS_BLOCKING") {
    const checks = (details as { checks?: Array<{ message?: unknown }> } | undefined)?.checks;
    const lines = Array.isArray(checks) ? checks.map((c) => (typeof c.message === "string" ? c.message : "")).filter(Boolean) : [];
    return lines.length ? lines : ["Fix the errors (and acknowledge the warnings) before making a final."];
  }
  if (code === "DS_YEAR_NOT_LOCKED") return ["Lock the year's KPI values before making a final."];
  if (code === "DS_JOB_RUNNING") return ["A final is already being made for this design."];
  // DS-13: the gate says why (details.reason: none | requested | changes_requested | stale).
  if (code === "DS_APPROVAL_PENDING") return [APPROVAL_REASON[String((details as { reason?: unknown } | undefined)?.reason ?? "")] ?? "This design is waiting for approval."];
  if (code === "DS_ROLE") return ["Only a Manager can make the final."];
  return [message || "The final couldn't be started. Try again."];
}

// ---------------------------------------------------------------------------
// View links (D15)
// ---------------------------------------------------------------------------

export const EXPIRY_DAYS = [7, 14, 30, 60, 90] as const;

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** "Final v2 · expires 3 Nov 2026 · 4 views" (05-ux S7). */
export function shareLine(s: Pick<ReportShare, "label" | "expiresAt" | "views" | "state" | "revokedAt">): string {
  const views = `${s.views} ${s.views === 1 ? "view" : "views"}`;
  if (s.state === "revoked") return `${s.label} · turned off ${s.revokedAt ? day(s.revokedAt) : ""} · ${views}`.replace(/ {2}/g, " ");
  if (s.state === "expired") return `${s.label} · expired ${day(s.expiresAt)} · ${views}`;
  return `${s.label} · expires ${day(s.expiresAt)} · ${views}`;
}

export interface ShareTarget {
  key: string;
  label: string;
  body: { versionId: number } | { jobId: number };
}

/** What a view link can point at: finals (newest first), then unexpired PDF proofs. */
export function shareTargets(versions: ReportVersion[], jobs: ReportJob[], now = Date.now()): ShareTarget[] {
  const finals = versions
    .filter((v) => v.kind === "final" && v.pdfUrl)
    .sort((a, b) => b.n - a.n)
    .map((v) => ({ key: `v${v.id}`, label: `Final v${v.n} · ${day(v.createdAt)}${v.superseded ? " (superseded)" : ""}`, body: { versionId: v.id } }));
  const proofs = jobs
    .filter((j) => j.kind === "proof" && j.status === "done" && (!j.expiresAt || Date.parse(j.expiresAt) > now))
    .map((j) => ({ key: `j${j.id}`, label: `PDF proof · ${day(j.finishedAt ?? j.createdAt)}${j.pageCount ? ` · ${j.pageCount} pages` : ""}`, body: { jobId: j.id } }));
  return [...finals, ...proofs];
}

/** "esglite.app/s/••••••••3f9a": a link shown after creation, shortened for lists. */
export function maskedLink(url: string): string {
  try {
    const u = new URL(url);
    const token = u.pathname.split("/").pop() ?? "";
    return `${u.host}/s/••••••••${token.slice(-4)}`;
  } catch {
    return "••••••••";
  }
}
