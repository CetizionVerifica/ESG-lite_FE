// DS-7 · pure doc edits for text and flow sections (no React). Untouched
// pages and elements keep their identity (DS-6 docOps rule), so sheets that
// didn't change don't re-render.
import type { Element, FlowSection, FreeformPage, ReportDoc, TextDoc, TextMark, TextNode, TextStyleId } from "../../../../lib/studio/contracts";
import { footnoteNotes, readingOrder } from "../../../../lib/studio/render";
import { cleanMark } from "./convert";

type TextEl = Extract<Element, { type: "text" | "callout" }>;
export const isTextElement = (e: Element | undefined): e is TextEl => !!e && (e.type === "text" || e.type === "callout");

function mapEl(doc: ReportDoc, pageId: string, ids: string[], fn: (e: Element) => Element): ReportDoc {
  const want = new Set(ids);
  let touched = false;
  const pages = doc.pages.map((p) => {
    if (p.id !== pageId || p.kind !== "freeform") return p;
    let pageTouched = false;
    const elements = p.elements.map((e) => {
      if (!want.has(e.id)) return e;
      const n = fn(e);
      if (n !== e) pageTouched = true;
      return n;
    });
    if (!pageTouched) return p;
    touched = true;
    return { ...p, elements };
  });
  return touched ? { ...doc, pages } : doc;
}

/** Sets a text or callout element's TextDoc. A human edit marks AI text as reviewed (RS-7 §6). */
export function setElementText(doc: ReportDoc, pageId: string, id: string, text: TextDoc): ReportDoc {
  return mapEl(doc, pageId, [id], (e) => (isTextElement(e) ? ({ ...e, props: { ...e.props, doc: text }, ...(e.source === "ai" ? { reviewed: true } : {}) } as Element) : e));
}

/** "Mark as reviewed" on AI-written elements. */
export const markReviewed = (doc: ReportDoc, pageId: string, ids: string[]): ReportDoc => mapEl(doc, pageId, ids, (e) => (e.source === "ai" && e.reviewed !== true ? ({ ...e, reviewed: true } as Element) : e));

/** True when every text node of the doc carries the mark type. */
export function hasMarkAll(text: TextDoc | undefined, type: TextMark["type"]): boolean {
  let any = false;
  let all = true;
  const walk = (n: TextNode) => {
    if (n.type === "text") {
      any = true;
      if (!n.marks?.some((m) => m.type === type)) all = false;
    }
    for (const c of n.content ?? []) if (c.type !== "data") walk(c as TextNode);
  };
  for (const n of text?.content ?? []) walk(n);
  return any && all;
}

/** Adds (or removes) a mark on every text node: the toolbar on a selected, not-edited text box. */
export function markAll(text: TextDoc, mark: TextMark, on: boolean): TextDoc {
  const clean = cleanMark(mark);
  const walk = (n: TextNode): TextNode => {
    if (n.type === "text") {
      const rest = (n.marks ?? []).filter((m) => m.type !== mark.type);
      const marks = on && clean ? [...rest, clean] : rest;
      const base: TextNode = { ...n };
      delete base.marks;
      return marks.length ? { ...base, marks } : base;
    }
    return n.content ? { ...n, content: n.content.map((c) => (c.type === "data" ? c : walk(c as TextNode))) } : n;
  };
  return { ...text, content: text.content.map(walk) };
}

/** The number of an element's first footnote on its page (reading order, render/footnotes.ts). */
export function footnoteBaseOf(page: FreeformPage, id: string): number {
  let n = 1;
  for (const e of readingOrder(page.elements as never) as unknown as Element[]) {
    if (e.id === id) return n;
    if (isTextElement(e)) n += footnoteNotes(e.props.doc as never).length;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Overflow fixes (RS-7 §4)
// ---------------------------------------------------------------------------

/** Smaller styles, in order, down to the design minimum for running text (caption). */
const SHRINK: Partial<Record<TextStyleId, TextStyleId>> = { title: "heading", big_number: "heading", heading: "subheading", quote: "subheading", subheading: "body", body: "caption" };
export const smallerStyle = (s: TextStyleId): TextStyleId | null => SHRINK[s] ?? null;

/** "Shrink text to fit": one style step down (the contract keeps sizes in the design's styles). */
export function shrinkText(doc: ReportDoc, pageId: string, id: string): ReportDoc {
  return mapEl(doc, pageId, [id], (e) => {
    if (e.type !== "text") return e;
    const next = smallerStyle(e.props.style);
    return next ? ({ ...e, props: { ...e.props, style: next } } as Element) : e;
  });
}

/** "Grow box": the frame grows by the overflow, up to the safe area's bottom. Returns the doc unchanged when there is no room. */
export function growBox(doc: ReportDoc, pageId: string, id: string, byMm: number, limitMm: number): ReportDoc {
  return mapEl(doc, pageId, [id], (e) => {
    const h = Math.min(e.frame.h + byMm, limitMm - e.frame.y);
    return h > e.frame.h + 0.01 ? ({ ...e, frame: { ...e.frame, h: Math.round(h * 10) / 10 } } as Element) : e;
  });
}

/**
 * "Move rest to a new text box": blocks from `fromBlock` on go to a new text
 * element of the same style under the box (or beside it when there is no room
 * below), never auto-flowing between frames.
 */
export function splitText(doc: ReportDoc, pageId: string, id: string, fromBlock: number, newId: string, page: { hMm: number; safeMm: number }): { doc: ReportDoc; id: string | null } {
  const pg = doc.pages.find((p): p is FreeformPage => p.id === pageId && p.kind === "freeform");
  const el = pg?.elements.find((e) => e.id === id);
  if (!pg || !el || el.type !== "text" || fromBlock <= 0 || fromBlock >= el.props.doc.content.length) return { doc, id: null };
  const keep: TextDoc = { ...el.props.doc, content: el.props.doc.content.slice(0, fromBlock) };
  const rest: TextDoc = { ...el.props.doc, content: el.props.doc.content.slice(fromBlock) };
  const gap = 4;
  const below = el.frame.y + el.frame.h + gap;
  const room = page.hMm - page.safeMm - below;
  const frame = room >= Math.min(20, el.frame.h) ? { ...el.frame, y: Math.round(below * 10) / 10, h: Math.round(Math.min(el.frame.h, room) * 10) / 10 } : { ...el.frame, x: Math.round((el.frame.x + 6) * 10) / 10, y: Math.round((el.frame.y + 6) * 10) / 10 };
  const z = pg.elements.reduce((m, e) => Math.max(m, e.z), -1) + 1;
  const added = { ...el, id: newId, frame, z, source: "user", props: { ...el.props, doc: rest } } as Element & Record<string, unknown>;
  for (const k of ["groupId", "locked", "templateLocked", "reviewed"]) delete added[k];
  const pages = doc.pages.map((p) => (p === pg ? { ...pg, elements: [...pg.elements.map((e) => (e.id === id ? ({ ...e, props: { ...el.props, doc: keep } } as Element) : e)), added] } : p));
  return { doc: { ...doc, pages }, id: newId };
}

// ---------------------------------------------------------------------------
// Flow sections
// ---------------------------------------------------------------------------

export const flowSection = (doc: ReportDoc, id: string | null | undefined): FlowSection | undefined => doc.pages.find((p): p is FlowSection => p.id === id && p.kind === "flow");

/** Sets flow options; `undefined` removes a key. */
export function setFlowOptions(doc: ReportDoc, id: string, patch: Partial<FlowSection["options"]>): ReportDoc {
  const s = flowSection(doc, id);
  if (!s) return doc;
  const options = { ...s.options } as Record<string, unknown>;
  let changed = false;
  for (const [k, v] of Object.entries(patch)) {
    if (JSON.stringify(options[k]) === JSON.stringify(v)) continue;
    changed = true;
    if (v === undefined) delete options[k];
    else options[k] = v;
  }
  return changed ? { ...doc, pages: doc.pages.map((p) => (p === s ? { ...s, options: options as FlowSection["options"] } : p)) } : doc;
}

export function setFlowContent(doc: ReportDoc, id: string, content: TextDoc | undefined): ReportDoc {
  const s = flowSection(doc, id);
  if (!s) return doc;
  const next = { ...s } as FlowSection;
  if (content) next.content = content;
  else delete next.content;
  return { ...doc, pages: doc.pages.map((p) => (p === s ? next : p)) };
}

/** Scope 3 categories a section shows (all 15 when none are picked). */
export const shownCategories = (s: FlowSection): number[] => (s.options.categories?.length ? [...s.options.categories].sort((a, b) => a - b) : Array.from({ length: 15 }, (_, i) => i + 1));

/** Toggles a category; picking all 15 stores none (the default). */
export function toggleCategory(s: FlowSection, n: number): number[] | undefined {
  const cur = new Set(shownCategories(s));
  // data-loss-reviewed: removes an entry from an in-memory Set/Map, no record is deleted.
  if (cur.has(n)) cur.delete(n);
  else cur.add(n);
  const list = [...cur].sort((a, b) => a - b);
  return list.length === 15 ? undefined : list;
}
