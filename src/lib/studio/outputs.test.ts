import { describe, expect, it } from "vitest";
import type { ReportDoc, ReportJob, ReportVersion } from "./contracts";
import { editorLink, finalBlockedReason, finalRefusal, goMessage, jobFinished, jobStatusText, maskedLink, notesFor, parseBridgeMessage, pngPages, shareLine, shareTargets, slideForKey } from "./outputs";

const job = (over: Partial<ReportJob> = {}): ReportJob => ({
  id: 1,
  docId: 1,
  versionId: null,
  versionN: null,
  kind: "proof",
  status: "done",
  errorCode: null,
  errorReason: null,
  requestedBy: 2,
  rev: 3,
  createdAt: "2026-10-20T10:00:00Z",
  startedAt: null,
  finishedAt: "2026-10-20T10:00:05Z",
  downloadUrl: "/studio/jobs/1/file",
  fileName: "x.pdf",
  bytes: 1,
  pageCount: 22,
  expiresAt: "2026-10-27T10:00:05Z",
  ...over,
});
const version = (over: Partial<ReportVersion> = {}): ReportVersion => ({
  id: 10,
  n: 2,
  kind: "final",
  rev: 3,
  note: null,
  createdAt: "2026-10-19T10:00:00Z",
  createdBy: "Maya",
  pageCount: 22,
  pdfUrl: "/studio/docs/1/versions/2/pdf",
  pdfSha256: null,
  dataHash: null,
  rendererHash: null,
  superseded: false,
  ...over,
});

describe("the preview bridge", () => {
  it("accepts only well-formed messages from the preview", () => {
    expect(parseBridgeMessage({ source: "ds-preview", type: "ready", pageCount: 22, error: null })).toEqual({ type: "ready", pageCount: 22, error: null });
    expect(parseBridgeMessage({ source: "ds-preview", type: "slide", index: 2, count: 9, pageId: "p-1" })).toEqual({ type: "slide", index: 2, count: 9, pageId: "p-1" });
    expect(parseBridgeMessage({ source: "ds-preview", type: "select", pageId: "p", elId: "e" })).toEqual({ type: "select", pageId: "p", elId: "e" });
    expect(parseBridgeMessage({ source: "ds-preview", type: "key", key: "Escape" })).toEqual({ type: "key", key: "Escape" });
    expect(parseBridgeMessage({ source: "other", type: "ready" })).toBeNull();
    expect(parseBridgeMessage({ source: "ds-preview", type: "slide", index: -1, count: 2 })).toBeNull();
    expect(parseBridgeMessage({ source: "ds-preview", type: "select", pageId: { evil: 1 }, elId: "x".repeat(500) })).toEqual({ type: "select", pageId: null, elId: null });
    expect(parseBridgeMessage({ source: "ds-preview", type: "eval" })).toBeNull();
    expect(parseBridgeMessage("ready")).toBeNull();
    expect(goMessage(3)).toEqual({ source: "ds-host", type: "go", index: 3 });
  });

  it("steps slides with the keys Present uses, inside the deck", () => {
    expect(slideForKey("ArrowRight", 0, 3)).toBe(1);
    expect(slideForKey(" ", 2, 3)).toBe(2);
    expect(slideForKey("PageUp", 0, 3)).toBe(0);
    expect(slideForKey("ArrowLeft", 2, 3)).toBe(1);
    expect(slideForKey("Home", 2, 3)).toBe(0);
    expect(slideForKey("End", 0, 3)).toBe(2);
    expect(slideForKey("x", 0, 3)).toBeNull();
    expect(slideForKey("ArrowRight", 0, 0)).toBeNull();
  });

  it("finds speaker notes and builds the editor link for a click in Page view", () => {
    const doc = { pages: [{ id: "a", kind: "freeform", name: "Cover", notes: "Say hello", elements: [] }, { id: "b", kind: "flow", name: "Tables" }] } as unknown as ReportDoc;
    expect(notesFor(doc, "a")).toEqual({ name: "Cover", notes: "Say hello" });
    expect(notesFor(doc, "b")).toEqual({ name: "Tables", notes: "" });
    expect(notesFor(doc, "zz")).toBeNull();
    expect(notesFor(undefined, "a")).toBeNull();
    expect(editorLink(4, "p-1", "p-1.title")).toBe("/studio/4?page=p-1&el=p-1.title");
    expect(editorLink(4, null, null)).toBe("/studio/4");
  });
});

describe("jobs and downloads", () => {
  it("words a job's state plainly", () => {
    expect(jobStatusText(job({ status: "queued" }))).toBe("Waiting to make your PDF for screens…");
    expect(jobStatusText(job({ kind: "print", status: "running" }))).toBe("Making your PDF for print…");
    expect(jobStatusText(job({ kind: "png" }))).toBe("PNG pages is ready.");
    expect(jobStatusText(job({ kind: "final", versionN: 3 }))).toBe("Final v3 is ready.");
    expect(jobStatusText(job({ status: "failed", errorReason: "timeout" }))).toBe("The PDF for screens couldn't be made: it took too long. Try again.");
    expect(jobStatusText(job({ kind: "final", status: "failed", errorReason: null }))).toBe("The final PDF couldn't be made: something went wrong. Try again.");
    expect(jobFinished(job({ status: "running" }))).toBe(false);
    expect(jobFinished(job({ status: "failed" }))).toBe(true);
    expect(jobFinished(null)).toBe(false);
  });

  it("checks a PNG page range", () => {
    expect(pngPages({ all: true }, 10)).toEqual({});
    expect(pngPages({ all: false, from: 2, to: 4 }, 10)).toEqual({ pages: [2, 4] });
    expect(pngPages({ all: false, from: 4, to: 2 }, 10).error).toBe("The first page must come before the last.");
    expect(pngPages({ all: false, from: 0, to: 2 }, 10).error).toBe("Enter page numbers from 1.");
    expect(pngPages({ all: false, from: 2, to: 12 }, 10).error).toBe("This design has 10 pages.");
    expect(pngPages({ all: false, from: 2, to: 12 }, null)).toEqual({ pages: [2, 12] });
  });

  it("explains why a final can't be made", () => {
    expect(finalBlockedReason({ canFinal: false })).toBe("Only a Manager can make the final.");
    expect(finalBlockedReason({ canFinal: true })).toBeNull();
    expect(finalRefusal("DS_CHECKS_BLOCKING", { checks: [{ message: "Pending entries: 4. Approve them in Review before the final." }] })).toEqual(["Pending entries: 4. Approve them in Review before the final."]);
    expect(finalRefusal("DS_CHECKS_BLOCKING", {})).toEqual(["Fix the errors (and acknowledge the warnings) before making a final."]);
    expect(finalRefusal("DS_YEAR_NOT_LOCKED", undefined)).toEqual(["Lock the year's KPI values before making a final."]);
    expect(finalRefusal("DS_VALIDATION", undefined, "Say what changed")).toEqual(["Say what changed"]);
  });
});

describe("view links", () => {
  it("lists finals first, then unexpired PDF proofs", () => {
    const now = Date.parse("2026-10-21T00:00:00Z");
    const t = shareTargets(
      [version({ id: 11, n: 3 }), version({ id: 10, n: 2, superseded: true }), version({ id: 9, n: 1, kind: "autosave", pdfUrl: null })],
      [job({ id: 5 }), job({ id: 6, expiresAt: "2026-10-20T00:00:00Z" }), job({ id: 7, kind: "png" }), job({ id: 8, status: "running" })],
      now,
    );
    expect(t.map((x) => x.key)).toEqual(["v11", "v10", "j5"]);
    expect(t[0]).toEqual({ key: "v11", label: "Final v3 · 19 Oct 2026", body: { versionId: 11 } });
    expect(t[1].label).toContain("(superseded)");
    expect(t[2]).toEqual({ key: "j5", label: "PDF proof · 20 Oct 2026 · 22 pages", body: { jobId: 5 } });
  });

  it("words a link's state, views and expiry", () => {
    expect(shareLine({ label: "Final v2", expiresAt: "2026-11-03T00:00:00Z", views: 4, state: "active", revokedAt: null })).toBe("Final v2 · expires 3 Nov 2026 · 4 views");
    expect(shareLine({ label: "Final v2", expiresAt: "2026-11-03T00:00:00Z", views: 1, state: "expired", revokedAt: null })).toBe("Final v2 · expired 3 Nov 2026 · 1 view");
    expect(shareLine({ label: "Proof · 20 Oct 2026", expiresAt: "2026-11-03T00:00:00Z", views: 0, state: "revoked", revokedAt: "2026-10-22T09:00:00Z" })).toBe("Proof · 20 Oct 2026 · turned off 22 Oct 2026 · 0 views");
    expect(maskedLink("https://esglite.app/s/abcdefghijklmnopqrstuvwxyz0123456789ABCD3f9a")).toBe("esglite.app/s/••••••••3f9a");
    expect(maskedLink("not a url")).toBe("••••••••");
  });
});
