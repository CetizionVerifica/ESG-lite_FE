// DS-13 · pure review logic (no React): @mention search and extraction,
// threads and filters, the approval bar's words, the final's approval block,
// and version history grouped by day with named versions and finals pinned.
import type { ApprovalsResponse, DriftItem, DriftResponse, ReportApproval, ReportComment, ReportDoc, ReportVersion, StudioPerson } from "../../../lib/studio/contracts";

// ---------------------------------------------------------------------------
// @mentions
// ---------------------------------------------------------------------------

/** The "@query" being typed at `caret`, or null (an @ starts a word; the query has no line break). */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/\s|\(/.test(before[at - 1])) return null;
  const query = before.slice(at + 1);
  if (/[\n@]/.test(query) || query.length > 40) return null;
  // A space right after a name ends the mention ("@Asha Rao " is done; "@Asha R" is still typing).
  if (/\s$/.test(query)) return null;
  // At most two words ("Asha Ra").
  if (query.split(" ").length > 3) return null;
  return { start: at, query };
}

/** People matching a query (name starts, then any word starts, then contains), at most `limit`. */
export function searchPeople(people: StudioPerson[], query: string, limit = 6): StudioPerson[] {
  const q = query.trim().toLowerCase();
  if (!q) return people.slice(0, limit);
  const score = (p: StudioPerson) => {
    const n = p.name.toLowerCase();
    if (n.startsWith(q)) return 0;
    if (n.split(/\s+/).some((w) => w.startsWith(q))) return 1;
    return n.includes(q) ? 2 : 3;
  };
  return people
    .map((p) => ({ p, s: score(p) }))
    .filter((x) => x.s < 3)
    .sort((a, b) => a.s - b.s || a.p.name.localeCompare(b.p.name))
    .slice(0, limit)
    .map((x) => x.p);
}

/** Replaces the "@query" at `start` with "@Name " and returns the new text and caret. */
export function insertMention(text: string, start: number, caret: number, person: StudioPerson): { text: string; caret: number } {
  const token = `@${person.name} `;
  const next = text.slice(0, start) + token + text.slice(caret).replace(/^ /, "");
  return { text: next, caret: start + token.length };
}

/** Ids of the people still named "@Name" in the text (picked people whose mention was deleted are dropped). */
export function mentionedIds(text: string, picked: StudioPerson[]): number[] {
  const out: number[] = [];
  for (const p of picked) if (text.includes(`@${p.name}`) && !out.includes(p.id)) out.push(p.id);
  return out;
}

/** Splits a comment body into text and "@Name" runs for the mentioned names (for highlighting). */
export function mentionParts(body: string, names: string[]): Array<{ text: string; mention: boolean }> {
  const list = [...new Set(names)].filter(Boolean).sort((a, b) => b.length - a.length);
  if (!list.length) return [{ text: body, mention: false }];
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`@(?:${list.map(esc).join("|")})`, "g");
  const out: Array<{ text: string; mention: boolean }> = [];
  let last = 0;
  for (const m of body.matchAll(re)) {
    if (m.index! > last) out.push({ text: body.slice(last, m.index), mention: false });
    out.push({ text: m[0], mention: true });
    last = m.index! + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last), mention: false });
  return out;
}

// ---------------------------------------------------------------------------
// Threads
// ---------------------------------------------------------------------------

export interface Thread {
  root: ReportComment;
  replies: ReportComment[];
}

/** Root comments with their replies, in the doc's page order, then oldest first. Orphan replies stand alone. */
export function threadsOf(comments: ReportComment[], pageOrder: string[] = []): Thread[] {
  const roots = comments.filter((c) => c.parentId === null || !comments.some((r) => r.id === c.parentId));
  const rank = (pageId: string) => {
    const i = pageOrder.indexOf(pageId);
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  return roots
    .map((root) => ({ root, replies: comments.filter((c) => c.parentId === root.id && c.id !== root.id).sort((a, b) => a.id - b.id) }))
    .sort((a, b) => rank(a.root.pageId) - rank(b.root.pageId) || a.root.id - b.root.id);
}

export type CommentFilter = "all" | "mine";

export const isOpenTask = (c: ReportComment) => c.taskAssigneeId !== null && !c.taskDoneAt;

/** The comments button's count: open threads. */
export const openThreadCount = (comments: ReportComment[]) => comments.filter((c) => c.parentId === null && !c.resolvedAt).length;

/** Pins on a page: open root comments with a spot (or an element) on it. */
export function pinsFor(comments: ReportComment[], pageId: string): ReportComment[] {
  return comments.filter((c) => c.parentId === null && !c.resolvedAt && c.pageId === pageId && (c.x !== null || c.elementId !== null));
}

// ---------------------------------------------------------------------------
// Approval
// ---------------------------------------------------------------------------

const dayMonth = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** Who the bar is for: the reviewer acts, the requester can withdraw, anyone else reads. */
export type ApprovalRole = "reviewer" | "requester" | "other";
export function approvalRole(a: ReportApproval, me: number | null, role: string | null): ApprovalRole {
  if (me !== null && a.reviewerId === me) return "reviewer";
  if (role === "Superadmin") return "reviewer";
  if (me !== null && a.requestedBy === me) return "requester";
  return "other";
}

/** The approval bar's line (05-ux S9), or null when there's nothing to show. */
export function approvalLine(r: Pick<ApprovalsResponse, "current" | "stale"> | null | undefined): { tone: "info" | "good" | "warn"; text: string } | null {
  const a = r?.current;
  if (!a) return null;
  if (a.state === "requested") return { tone: "info", text: `Approval requested from ${a.reviewerName}${a.dueAt ? ` · due ${dayMonth(a.dueAt)}` : ""}` };
  if (a.state === "approved") return r!.stale ? { tone: "warn", text: `${a.reviewerName} approved an earlier version. Ask again to approve the changes.` } : { tone: "good", text: `Approved by ${a.reviewerName}` };
  if (a.state === "changes_requested") return { tone: "warn", text: `${a.reviewerName} requested changes${a.decisionNote ? `: ${a.decisionNote}` : ""}` };
  return null;
}

/** Why a final can't be made yet because of review (null = review doesn't block it). */
export function approvalBlock(r: ApprovalsResponse | null | undefined): string | null {
  if (!r?.requireReview) return null;
  const a = r.current;
  if (!a) return "This company needs an approval before a final. Request approval first.";
  if (a.state === "requested") return `Waiting for approval from ${a.reviewerName}.`;
  if (a.state === "changes_requested") return `${a.reviewerName} requested changes. Request approval again when they're done.`;
  if (r.stale) return "The design changed since it was approved. Request approval again.";
  return null;
}

// ---------------------------------------------------------------------------
// Version history (D16)
// ---------------------------------------------------------------------------

export const VERSION_KIND_LABEL: Record<ReportVersion["kind"], string> = { autosave: "Autosave", snapshot: "Named version", review: "Review", final: "Final" };

/** Finals and named versions pinned at the top, then the rest grouped by day (newest first). */
export function versionGroups(versions: ReportVersion[], now: Date = new Date()): { pinned: ReportVersion[]; days: Array<{ label: string; key: string; versions: ReportVersion[] }> } {
  const sorted = [...versions].sort((a, b) => b.n - a.n);
  const pinned = sorted.filter((v) => v.kind === "final" || v.kind === "snapshot");
  const rest = sorted.filter((v) => v.kind !== "final" && v.kind !== "snapshot");
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const today = key(now);
  const y = new Date(now);
  y.setUTCDate(y.getUTCDate() - 1);
  const yesterday = key(y);
  const days: Array<{ label: string; key: string; versions: ReportVersion[] }> = [];
  for (const v of rest) {
    const k = v.createdAt.slice(0, 10);
    let g = days.find((d) => d.key === k);
    if (!g) {
      const label = k === today ? "Today" : k === yesterday ? "Yesterday" : new Date(`${k}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
      g = { label, key: k, versions: [] };
      days.push(g);
    }
    g.versions.push(v);
  }
  return { pinned, days };
}

/** "14:05 · Maya Manager" for a version row. */
export const versionMeta = (v: ReportVersion) => `${new Date(v.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}${v.createdBy ? ` · ${v.createdBy}` : ""}`;

// ---------------------------------------------------------------------------
// Drift (RS-10 §5)
// ---------------------------------------------------------------------------

/** "Mark as checked": the text was read against today's data, so it carries the current hash. */
export function markChecked(doc: ReportDoc, elementIds: string[], hash: string): ReportDoc {
  const ids = new Set(elementIds);
  let changed = false;
  const pages = doc.pages.map((p) => {
    if (p.kind !== "freeform" || !p.elements.some((e) => ids.has(e.id))) return p;
    return {
      ...p,
      elements: p.elements.map((e) => {
        if (!ids.has(e.id) || e.basedOnHash === hash) return e;
        changed = true;
        return { ...e, basedOnHash: hash };
      }),
    };
  });
  return changed ? { ...doc, pages } : doc;
}

/** Drift items not yet checked in the editor (their element doesn't carry the current hash yet). */
export function openDrift(doc: ReportDoc, drift: DriftResponse | null | undefined): DriftItem[] {
  if (!drift) return [];
  const stamped = new Set<string>();
  for (const p of doc.pages) if (p.kind === "freeform") for (const e of p.elements) if (e.basedOnHash === drift.dataHash) stamped.add(e.id);
  return drift.changed.filter((d) => !stamped.has(d.elementId));
}

// ---------------------------------------------------------------------------
// Template locks (DS-13 §5)
// ---------------------------------------------------------------------------

/** Who may unlock a template-locked element: Managers and the Superadmin; Admins only without brand controls. */
export const canUnlockTemplate = (role: string | null, brandControls: boolean): boolean => role === "Manager" || role === "Superadmin" || (role === "Admin" && !brandControls);

/** Removes the template lock from elements (an explicit Unlock by someone allowed to). */
export function unlockTemplate(doc: ReportDoc, pageId: string, elementIds: string[]): ReportDoc {
  const ids = new Set(elementIds);
  return {
    ...doc,
    pages: doc.pages.map((p) =>
      p.id !== pageId || p.kind !== "freeform"
        ? p
        : {
            ...p,
            elements: p.elements.map((e) => {
              if (!ids.has(e.id) || !e.templateLocked) return e;
              const next = { ...e };
              delete next.templateLocked;
              return next;
            }),
          },
    ),
  };
}
