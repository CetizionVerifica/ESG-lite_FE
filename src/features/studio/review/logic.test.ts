import { describe, expect, it } from "vitest";
import type { ApprovalsResponse, ReportApproval, ReportComment, ReportDoc, ReportVersion, StudioPerson } from "../../../lib/studio/contracts";
import ghgDoc from "../../../test/fixtures/studio/ghg-doc.json";
import {
  approvalBlock,
  approvalLine,
  approvalRole,
  canUnlockTemplate,
  insertMention,
  markChecked,
  mentionParts,
  mentionQuery,
  mentionedIds,
  openDrift,
  openThreadCount,
  pinsFor,
  searchPeople,
  threadsOf,
  unlockTemplate,
  versionGroups,
} from "./logic";

const PEOPLE: StudioPerson[] = [
  { id: 4, name: "Asha Rao", role: "Manager", canApprove: true },
  { id: 2, name: "Maya Manager", role: "Manager", canApprove: true },
  { id: 3, name: "Sam Admin", role: "Admin", canApprove: false },
];

const comment = (over: Partial<ReportComment>): ReportComment => ({
  id: 1,
  docId: 1,
  pageId: "p-summary",
  elementId: null,
  x: 10,
  y: 20,
  parentId: null,
  body: "Hi",
  authorId: 2,
  authorName: "Maya Manager",
  mentions: [],
  mentionNames: [],
  taskAssigneeId: null,
  taskAssigneeName: null,
  taskDoneAt: null,
  resolvedAt: null,
  resolvedByName: null,
  createdAt: "2026-10-20T09:00:00.000Z",
  updatedAt: "2026-10-20T09:00:00.000Z",
  ...over,
});

const approval = (over: Partial<ReportApproval>): ReportApproval => ({
  id: 1,
  docId: 1,
  rev: 5,
  requestedBy: 3,
  requestedByName: "Sam Admin",
  reviewerId: 4,
  reviewerName: "Asha Rao",
  dueAt: null,
  state: "requested",
  note: null,
  decisionNote: null,
  decidedAt: null,
  createdAt: "2026-10-20T09:00:00.000Z",
  ...over,
});

describe("@mentions", () => {
  it("finds the query being typed after an @ that starts a word", () => {
    expect(mentionQuery("Hi @As", 6)).toEqual({ start: 3, query: "As" });
    expect(mentionQuery("@", 1)).toEqual({ start: 0, query: "" });
    expect(mentionQuery("mail me@example", 15)).toBeNull();
    expect(mentionQuery("Hi @Asha\nnext", 13)).toBeNull();
    expect(mentionQuery("no at here", 5)).toBeNull();
    expect(mentionQuery("Hi @Asha Rao ", 13)).toBeNull();
    expect(mentionQuery("Hi @Asha R", 10)).toEqual({ start: 3, query: "Asha R" });
  });

  it("ranks people: name starts, then a word starts, then contains", () => {
    expect(searchPeople(PEOPLE, "ma").map((p) => p.id)).toEqual([2]);
    expect(searchPeople(PEOPLE, "ra").map((p) => p.id)).toEqual([4]);
    expect(searchPeople(PEOPLE, "a").map((p) => p.id)).toEqual([4, 3, 2]);
    expect(searchPeople(PEOPLE, "")).toHaveLength(3);
    expect(searchPeople(PEOPLE, "zz")).toEqual([]);
  });

  it("inserts @Name and keeps only names still in the text", () => {
    const r = insertMention("Hi @As please", 3, 6, PEOPLE[0]);
    expect(r.text).toBe("Hi @Asha Rao please");
    expect(r.caret).toBe("Hi @Asha Rao ".length);
    expect(mentionedIds("Hi @Asha Rao and @Sam Admin", PEOPLE)).toEqual([4, 3]);
    expect(mentionedIds("Hi Asha", PEOPLE)).toEqual([]);
  });

  it("splits a body into text and mention runs (longest names first)", () => {
    expect(mentionParts("Ask @Asha Rao now", ["Asha Rao"])).toEqual([
      { text: "Ask ", mention: false },
      { text: "@Asha Rao", mention: true },
      { text: " now", mention: false },
    ]);
    expect(mentionParts("Plain", [])).toEqual([{ text: "Plain", mention: false }]);
  });
});

describe("threads and pins", () => {
  const list = [comment({ id: 1, pageId: "p-scope3" }), comment({ id: 2 }), comment({ id: 3, parentId: 2 }), comment({ id: 4, parentId: 2 }), comment({ id: 5, parentId: 99 })];
  it("groups replies under roots in page order; an orphan reply stands alone", () => {
    const t = threadsOf(list, ["p-summary", "p-scope3"]);
    expect(t.map((x) => [x.root.id, x.replies.map((r) => r.id)])).toEqual([
      [2, [3, 4]],
      [5, []],
      [1, []],
    ]);
  });
  it("counts open threads and pins open roots with a spot or an element", () => {
    expect(openThreadCount([...list, comment({ id: 6, resolvedAt: "x" })])).toBe(2);
    const pins = pinsFor([comment({ id: 7, x: null, y: null }), comment({ id: 8, x: null, y: null, elementId: "e" }), comment({ id: 9, resolvedAt: "x" }), comment({ id: 10 })], "p-summary");
    expect(pins.map((c) => c.id)).toEqual([8, 10]);
  });
});

describe("approval", () => {
  it("says who acts: the reviewer (or a Superadmin), the requester, or nobody", () => {
    expect(approvalRole(approval({}), 4, "Manager")).toBe("reviewer");
    expect(approvalRole(approval({}), 3, "Admin")).toBe("requester");
    expect(approvalRole(approval({}), 2, "Manager")).toBe("other");
    expect(approvalRole(approval({}), 5, "Superadmin")).toBe("reviewer");
  });

  it("words the bar: requested with a due date, approved, an earlier version, changes", () => {
    expect(approvalLine({ current: approval({ dueAt: "2026-10-28" }), stale: false })).toEqual({ tone: "info", text: "Approval requested from Asha Rao · due 28 Oct" });
    expect(approvalLine({ current: approval({ state: "approved" }), stale: false })).toEqual({ tone: "good", text: "Approved by Asha Rao" });
    expect(approvalLine({ current: approval({ state: "approved" }), stale: true })?.text).toMatch(/approved an earlier version/);
    expect(approvalLine({ current: approval({ state: "changes_requested", decisionNote: "Fix page 3" }), stale: false })?.text).toBe("Asha Rao requested changes: Fix page 3");
    expect(approvalLine({ current: null, stale: false })).toBeNull();
  });

  it("blocks a final only when review is required and the current rev isn't approved", () => {
    const r = (over: Partial<ApprovalsResponse>): ApprovalsResponse => ({ approvals: [], current: null, stale: false, rev: 5, requireReview: true, ...over });
    expect(approvalBlock(r({ requireReview: false }))).toBeNull();
    expect(approvalBlock(r({}))).toMatch(/Request approval first/);
    expect(approvalBlock(r({ current: approval({}) }))).toBe("Waiting for approval from Asha Rao.");
    expect(approvalBlock(r({ current: approval({ state: "approved" }) }))).toBeNull();
    expect(approvalBlock(r({ current: approval({ state: "approved" }), stale: true }))).toMatch(/changed since it was approved/);
    expect(approvalBlock(r({ current: approval({ state: "changes_requested" }) }))).toMatch(/requested changes/);
  });
});

describe("version history", () => {
  const v = (n: number, kind: ReportVersion["kind"], createdAt: string): ReportVersion => ({ id: n, n, kind, rev: n, note: null, createdAt, createdBy: "Maya Manager", pageCount: 3, pdfUrl: null, pdfSha256: null, dataHash: null, rendererHash: null, superseded: false });
  it("pins named versions and finals, then groups autosaves by day, newest first", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    const g = versionGroups([v(1, "autosave", "2026-10-18T09:00:00Z"), v(2, "final", "2026-10-19T09:00:00Z"), v(3, "autosave", "2026-10-19T10:00:00Z"), v(4, "snapshot", "2026-10-20T08:00:00Z"), v(5, "autosave", "2026-10-20T09:00:00Z"), v(6, "autosave", "2026-10-20T11:00:00Z")], now);
    expect(g.pinned.map((x) => x.n)).toEqual([4, 2]);
    expect(g.days.map((d) => [d.label, d.versions.map((x) => x.n)])).toEqual([
      ["Today", [6, 5]],
      ["Yesterday", [3]],
      ["Sun, 18 Oct 2026", [1]],
    ]);
  });
});

describe("drift and template locks", () => {
  const doc = ghgDoc as unknown as ReportDoc;
  it("marks texts as checked with the current hash, and hides checked ones", () => {
    const next = markChecked(doc, ["p-summary.body"], "sha256:now");
    const el = next.pages.flatMap((p) => (p.kind === "freeform" ? p.elements : [])).find((e) => e.id === "p-summary.body");
    expect(el?.basedOnHash).toBe("sha256:now");
    expect(markChecked(next, ["p-summary.body"], "sha256:now")).toBe(next);
    const drift = { dataHash: "sha256:now", changed: [{ elementId: "p-summary.body", pageId: "p-summary", pageName: "", text: "", basedOnHash: "sha256:abc", before: null, after: "", figures: [] }] };
    expect(openDrift(doc, drift)).toHaveLength(1);
    expect(openDrift(next, drift)).toHaveLength(0);
    expect(openDrift(doc, null)).toEqual([]);
  });

  it("unlocks a template element for Managers; Admins only without brand controls", () => {
    expect(canUnlockTemplate("Manager", true)).toBe(true);
    expect(canUnlockTemplate("Superadmin", true)).toBe(true);
    expect(canUnlockTemplate("Admin", false)).toBe(true);
    expect(canUnlockTemplate("Admin", true)).toBe(false);
    expect(canUnlockTemplate("User", false)).toBe(false);
    const next = unlockTemplate(doc, "p-cover", ["p-cover.bg"]);
    const bg = next.pages.flatMap((p) => (p.kind === "freeform" ? p.elements : [])).find((e) => e.id === "p-cover.bg");
    expect(bg?.templateLocked).toBeUndefined();
  });
});
