// PE-2 · find and replace across the report's text (PRO-0 contracts: FindQuery,
// FindMatch, FindReplaceOp, FindResult). Pure: the dialog commits the result
// as one undo step.
//
// Searched: text and callout boxes on visible free-form pages (reading order:
// top to bottom, then left to right) and the text of flow sections. A match
// lies inside one run of text: consecutive text nodes of one block, so a
// phrase that changes formatting half-way still matches; a run stops at a data
// chip, a line break or the end of the block. So:
//   - data chips are never searched, changed or removed;
//   - locked and template-locked boxes, hidden boxes and hidden pages are
//     counted as `skipped` and never changed;
//   - figures stay chips: a search or a replacement that contains a digit is
//     refused for replacing (`replaceBlocked`): numbers come from the data.
// A replaced run keeps the marks of the node the match starts in.
import type { Element, FindMatch, FindQuery, FindReplaceOp, FindResult, ReportDoc, TextDoc, TextNode } from "./contracts";

type Node = TextNode | { type: "data"; attrs: unknown };
interface RunPart {
  /** Index of the text node in its block's content. */
  index: number;
  start: number;
  text: string;
}
interface Run {
  /** Path of the block from the TextDoc root (child indexes). */
  block: number[];
  parts: RunPart[];
  text: string;
}

const isText = (n: Node | undefined): n is TextNode & { type: "text" } => !!n && n.type === "text";

/** Every run of text in a TextDoc, in document order. */
function runsOf(doc: TextDoc | undefined): Run[] {
  const out: Run[] = [];
  const walk = (nodes: Node[] | undefined, path: number[]) => {
    if (!nodes?.length) return;
    let cur: Run | null = null;
    const flush = () => {
      if (cur && cur.text) out.push(cur);
      cur = null;
    };
    nodes.forEach((n, i) => {
      if (isText(n)) {
        if (!cur) cur = { block: path, parts: [], text: "" };
        cur.parts.push({ index: i, start: cur.text.length, text: n.text ?? "" });
        cur.text += n.text ?? "";
        return;
      }
      flush();
      if (n.type !== "data") walk((n as TextNode).content as Node[] | undefined, [...path, i]);
    });
    flush();
  };
  walk(doc?.content as Node[] | undefined, []);
  return out;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The search as a RegExp (global, unicode), or null for an empty search. */
export function findPattern(q: Pick<FindQuery, "find" | "matchCase" | "wholeWords">): RegExp | null {
  if (!q.find) return null;
  const body = escapeRe(q.find);
  const src = q.wholeWords ? `(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])` : body;
  return new RegExp(src, q.matchCase ? "gu" : "giu");
}

/** Why "Replace" is refused for this search and replacement, or null. */
export function replaceBlocked(find: string, replace: string): string | null {
  if (/\p{Nd}/u.test(find) || /\p{Nd}/u.test(replace)) return "Figures come from your data: insert a data value instead of typing or changing a number.";
  return null;
}

interface Box {
  pageId: string;
  elementId: string | null;
  text: TextDoc | undefined;
  /** Never changed (counted as skipped). */
  frozen: boolean;
}

const isTextBox = (e: Element): e is Extract<Element, { type: "text" | "callout" }> => e.type === "text" || e.type === "callout";

/** The searchable boxes in report order. */
function boxesOf(doc: ReportDoc, q: Pick<FindQuery, "scope" | "pageId">): Box[] {
  const out: Box[] = [];
  for (const p of doc.pages) {
    if (q.scope === "page" && q.pageId && p.id !== q.pageId) continue;
    if (p.kind === "flow") {
      out.push({ pageId: p.id, elementId: null, text: p.content, frozen: !!p.hidden });
      continue;
    }
    const els = p.elements.filter(isTextBox).sort((a, b) => a.frame.y - b.frame.y || a.frame.x - b.frame.x || a.z - b.z);
    for (const e of els) out.push({ pageId: p.id, elementId: e.id, text: e.props.doc, frozen: !!p.hidden || !!e.hidden || !!e.locked || !!e.templateLocked });
  }
  return out;
}

const excerptOf = (text: string, from: number, to: number): string => {
  const a = Math.max(0, from - 24);
  const b = Math.min(text.length, to + 24);
  return `${a > 0 ? "…" : ""}${text.slice(a, b)}${b < text.length ? "…" : ""}`;
};

interface Located extends FindMatch {
  run: Run;
}

function locate(doc: ReportDoc, q: FindQuery): { matches: Located[]; skipped: number } {
  const re = findPattern(q);
  const matches: Located[] = [];
  let skipped = 0;
  if (!re) return { matches, skipped };
  for (const box of boxesOf(doc, q)) {
    let n = 0;
    for (const run of runsOf(box.text)) {
      re.lastIndex = 0;
      for (let m = re.exec(run.text); m; m = re.exec(run.text)) {
        if (!m[0].length) {
          re.lastIndex++;
          continue;
        }
        if (box.frozen) {
          skipped++;
          continue;
        }
        const from = m.index;
        const to = m.index + m[0].length;
        const first = run.parts.find((p) => from < p.start + p.text.length) ?? run.parts[0];
        matches.push({ id: `${box.pageId}:${box.elementId ?? "flow"}:${n++}`, pageId: box.pageId, elementId: box.elementId, path: [...run.block, first.index], from, to, excerpt: excerptOf(run.text, from, to), run });
      }
    }
  }
  return { matches, skipped };
}

/** Every match of the search (and how many were in boxes that are never changed). */
export function findInDoc(doc: ReportDoc, q: FindQuery): FindResult {
  const { matches, skipped } = locate(doc, q);
  return { matches: matches.map(({ run: _run, ...m }) => m), skipped };
}

/** How many pages the matches are on. */
export const pagesWithMatches = (r: FindResult): number => new Set(r.matches.map((m) => m.pageId)).size;

/** Replaces [from, to) of a run (offsets in the run's text) in a block's content. */
function replaceInRun(content: Node[], run: Run, from: number, to: number, replacement: string): Node[] {
  const next = [...content];
  const touched = run.parts.filter((p) => p.start < to && p.start + p.text.length > from);
  if (!touched.length) return next;
  const first = touched[0];
  const last = touched[touched.length - 1];
  // Current node text: a later match in the same node was already replaced (after `to`).
  const textAt = (p: RunPart) => ((next[p.index] as TextNode).text ?? "");
  const head = textAt(first).slice(0, from - first.start);
  const tail = textAt(last).slice(to - last.start);
  const remove = new Set<number>();
  touched.forEach((p, i) => {
    const node = next[p.index] as TextNode;
    if (i === 0) {
      next[p.index] = { ...node, text: head + replacement + (touched.length === 1 ? tail : "") };
    } else if (p === last) {
      next[p.index] = { ...node, text: tail };
    } else remove.add(p.index);
  });
  return next.filter((n, i) => !remove.has(i) && !(isText(n) && (n.text ?? "") === ""));
}

/** A TextDoc with the given run matches replaced (last first, so offsets hold). */
function replaceInText(text: TextDoc, ms: Located[], replacement: string): TextDoc {
  const byBlock = new Map<string, Located[]>();
  for (const m of ms) {
    const k = JSON.stringify(m.run.block);
    byBlock.set(k, [...(byBlock.get(k) ?? []), m]);
  }
  let root: TextDoc = text;
  for (const [k, list] of byBlock) {
    const block = JSON.parse(k) as number[];
    // Runs of one block are disjoint; replace from the end so earlier offsets stay valid.
    const sorted = [...list].sort((a, b) => b.run.parts[0].index - a.run.parts[0].index || b.from - a.from);
    const update = (nodes: Node[], depth: number): Node[] => {
      if (depth === block.length) {
        let out = nodes;
        for (const m of sorted) out = replaceInRun(out, m.run, m.from, m.to, replacement);
        return out;
      }
      return nodes.map((n, i) => (i === block[depth] ? ({ ...(n as TextNode), content: update(((n as TextNode).content ?? []) as Node[], depth + 1) } as Node) : n));
    };
    root = { ...root, content: update(root.content as Node[], 0) as TextNode[] };
  }
  return root;
}

/**
 * Applies a find and replace op: every match, or only `matchIds`. Returns the
 * new doc (the same object when nothing changed) and how many were replaced.
 * Refused (count 0) while `replaceBlocked` has a reason.
 */
export function applyFindReplace(doc: ReportDoc, op: FindReplaceOp): { doc: ReportDoc; replaced: number } {
  if (replaceBlocked(op.query.find, op.replace)) return { doc, replaced: 0 };
  const want = op.matchIds ? new Set(op.matchIds) : null;
  const { matches } = locate(doc, op.query);
  const chosen = matches.filter((m) => !want || want.has(m.id));
  if (!chosen.length) return { doc, replaced: 0 };
  const byBox = new Map<string, Located[]>();
  for (const m of chosen) byBox.set(`${m.pageId}\u0000${m.elementId ?? ""}`, [...(byBox.get(`${m.pageId}\u0000${m.elementId ?? ""}`) ?? []), m]);
  const pages = doc.pages.map((p) => {
    if (p.kind === "flow") {
      const ms = byBox.get(`${p.id}\u0000`);
      return ms && p.content ? { ...p, content: replaceInText(p.content, ms, op.replace) } : p;
    }
    let changed = false;
    const elements = p.elements.map((e) => {
      const ms = byBox.get(`${p.id}\u0000${e.id}`);
      if (!ms || !isTextBox(e)) return e;
      changed = true;
      return { ...e, props: { ...e.props, doc: replaceInText(e.props.doc, ms, op.replace) } } as Element;
    });
    return changed ? { ...p, elements } : p;
  });
  return { doc: { ...doc, pages }, replaced: chosen.length };
}
