// DS-6 · pure doc edits. Every function returns a new ReportDoc and never
// mutates its input; pages and elements it doesn't touch keep their identity
// (history and the sheets' memo rely on it). An op that changes nothing
// returns the same doc, so history ignores it.
//
// Element ops work on one free-form page (`pageId`). Page ops work on the
// doc's page list. New ids come from `newId` unless the caller passes its own
// (tests pass a counter).
//
// DS-3's Styles and Brand edits live in styleOps / brandOps and are
// re-exported here, so the editor runs every edit through one module.
import { PAGE_FORMAT_SIZES, type Crop, type Element, type ElementType, type FreeformPage, type Frame, type Page, type ReportDoc } from "./contracts";
import { alignFrames, boundsOf, clampIntoPage, coverCrop, distributeFrames, frameAt, moveFrame, round, tidyUp, type AlignEdge, type Axis, type Box, type Point } from "./geometry";

export { applyStyle, shuffleStyle } from "./styleOps"; // DS-3
export { applyFonts, colourSelection, insertLogo } from "./brandOps"; // DS-3

let seq = 0;
/** A short unique id ("el-…", "pg-…"). */
export const newId = (prefix = "el"): string => {
  seq += 1;
  const rnd = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rnd}${seq.toString(36)}`;
};
export type IdFn = (prefix?: string) => string;

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export const pageSize = (doc: Pick<ReportDoc, "format">) => PAGE_FORMAT_SIZES[doc.format] ?? PAGE_FORMAT_SIZES.a4;

export const findPage = (doc: ReportDoc, pageId: string | null | undefined): Page | undefined => (pageId ? doc.pages.find((p) => p.id === pageId) : undefined);

export const freeformPage = (doc: ReportDoc, pageId: string | null | undefined): FreeformPage | undefined => {
  const p = findPage(doc, pageId);
  return p?.kind === "freeform" ? p : undefined;
};

export const findElement = (doc: ReportDoc, pageId: string | null | undefined, id: string): Element | undefined => freeformPage(doc, pageId)?.elements.find((e) => e.id === id);

/** Elements by ids, in page order. */
export const elementsOf = (page: FreeformPage | undefined, ids: Iterable<string>): Element[] => {
  if (!page) return [];
  const set = new Set(ids);
  return page.elements.filter((e) => set.has(e.id));
};

/** The page that holds an element id (search across pages). */
export const pageOfElement = (doc: ReportDoc, id: string): FreeformPage | undefined => doc.pages.find((p): p is FreeformPage => p.kind === "freeform" && p.elements.some((e) => e.id === id));

/**
 * What a click selects: a grouped element brings its whole group, unless the
 * user has entered the group (double-click). Template-locked elements are
 * selectable only from Layers (`fromLayers`).
 */
export function expandSelection(page: FreeformPage | undefined, ids: string[], opts: { enteredGroup?: string | null; fromLayers?: boolean } = {}): string[] {
  if (!page) return [];
  const out = new Set<string>();
  for (const id of ids) {
    const el = page.elements.find((e) => e.id === id);
    if (!el) continue;
    if (el.templateLocked && !opts.fromLayers) continue;
    if (el.groupId && el.groupId !== opts.enteredGroup) page.elements.filter((e) => e.groupId === el.groupId && (!e.templateLocked || opts.fromLayers)).forEach((e) => out.add(e.id));
    else out.add(el.id);
  }
  return page.elements.filter((e) => out.has(e.id)).map((e) => e.id);
}

/** The top element at a point (hit test runs in the editor with geometry.hitTest). */
export const topZ = (page: FreeformPage): number => page.elements.reduce((m, e) => Math.max(m, e.z), -1);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function mapPage(doc: ReportDoc, pageId: string, fn: (p: FreeformPage) => FreeformPage): ReportDoc {
  let changed = false;
  const pages = doc.pages.map((p) => {
    if (p.id !== pageId || p.kind !== "freeform") return p;
    const n = fn(p);
    if (n !== p) changed = true;
    return n;
  });
  return changed ? { ...doc, pages } : doc;
}

function mapElements(doc: ReportDoc, pageId: string, ids: Iterable<string>, fn: (e: Element) => Element): ReportDoc {
  const set = new Set(ids);
  if (!set.size) return doc;
  return mapPage(doc, pageId, (p) => {
    let changed = false;
    const elements = p.elements.map((e) => {
      if (!set.has(e.id)) return e;
      const n = fn(e);
      if (n !== e) changed = true;
      return n;
    });
    return changed ? { ...p, elements } : p;
  });
}

const sameFrame = (a: Frame, b: Frame) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && a.rotation === b.rotation;

/** Locked elements never move or resize (they can still be selected). */
const movable = (e: Element) => !e.locked && !e.templateLocked;

// ---------------------------------------------------------------------------
// Element ops
// ---------------------------------------------------------------------------

/**
 * Adds an element on top. Without `at` it lands at the page centre; with `at`
 * (a drop point, mm) it is centred there. Kept inside the page.
 */
export function addElement(doc: ReportDoc, pageId: string, template: Element, opts: { at?: Point; id?: string; newId?: IdFn } = {}): { doc: ReportDoc; id: string } {
  const page = freeformPage(doc, pageId);
  if (!page) return { doc, id: "" };
  const size = pageSize(doc);
  const id = opts.id ?? (opts.newId ?? newId)("el");
  const at = opts.at ?? { x: size.wMm / 2, y: size.hMm / 2 };
  const frame = clampIntoPage({ ...frameAt(template.frame.w, template.frame.h, at), rotation: template.frame.rotation ?? 0 }, size);
  const el = { ...template, id, frame, z: topZ(page) + 1, source: "user", locked: undefined, templateLocked: undefined, groupId: undefined } as Element;
  delete (el as Partial<Element>).locked;
  delete (el as Partial<Element>).templateLocked;
  delete (el as Partial<Element>).groupId;
  return { doc: mapPage(doc, pageId, (p) => ({ ...p, elements: [...p.elements, el] })), id };
}

/** Sets frames by id (a drag commit, the Position fields). Locked elements are skipped. */
export function updateFrames(doc: ReportDoc, pageId: string, frames: Record<string, Frame>): ReportDoc {
  return mapElements(doc, pageId, Object.keys(frames), (e) => {
    const f = frames[e.id];
    if (!f || !movable(e) || sameFrame(e.frame, f)) return e;
    return { ...e, frame: { x: round(f.x, 2), y: round(f.y, 2), w: round(Math.max(0.5, f.w), 2), h: round(Math.max(0.5, f.h), 2), rotation: round(f.rotation, 2) } };
  });
}

export const updateFrame = (doc: ReportDoc, pageId: string, id: string, patch: Partial<Frame>): ReportDoc => {
  const el = findElement(doc, pageId, id);
  return el ? updateFrames(doc, pageId, { [id]: { ...el.frame, ...patch } }) : doc;
};

/** Moves elements by a delta (nudge, drag). */
export function moveElements(doc: ReportDoc, pageId: string, ids: string[], dx: number, dy: number): ReportDoc {
  const page = freeformPage(doc, pageId);
  const frames: Record<string, Frame> = {};
  for (const e of elementsOf(page, ids)) if (movable(e)) frames[e.id] = moveFrame(e.frame, dx, dy);
  return updateFrames(doc, pageId, frames);
}

/** Merges props of one element type. */
export function updateProps<T extends ElementType>(doc: ReportDoc, pageId: string, ids: string[], type: T, patch: Partial<Extract<Element, { type: T }>["props"]>): ReportDoc {
  return mapElements(doc, pageId, ids, (e) => {
    if (e.type !== type) return e;
    const props = e.props as unknown as Record<string, unknown>;
    const changed = Object.entries(patch).some(([k, v]) => props[k] !== v);
    return changed ? ({ ...e, props: { ...props, ...patch } } as unknown as Element) : e;
  });
}

type BaseFields = Pick<Element, "opacity" | "locked" | "hidden">;

/** Sets base fields (transparency, lock, hide) on elements. `undefined` removes the field. */
export function updateBase(doc: ReportDoc, pageId: string, ids: string[], patch: Partial<BaseFields>): ReportDoc {
  return mapElements(doc, pageId, ids, (e) => {
    const next = { ...e } as Element & Record<string, unknown>;
    let changed = false;
    for (const [k, v] of Object.entries(patch)) {
      const cur = (e as unknown as Record<string, unknown>)[k];
      const val = k === "opacity" && v !== undefined ? Math.max(0, Math.min(1, round(v as number, 2))) : v;
      const clean = (k === "opacity" && val === 1) || val === false ? undefined : val;
      if (cur === clean) continue;
      changed = true;
      if (clean === undefined) delete next[k];
      else next[k] = clean;
    }
    return changed ? next : e;
  });
}

export const setLocked = (doc: ReportDoc, pageId: string, ids: string[], locked: boolean) => updateBase(doc, pageId, ids, { locked });
export const setHidden = (doc: ReportDoc, pageId: string, ids: string[], hidden: boolean) => updateBase(doc, pageId, ids, { hidden });
export const setOpacity = (doc: ReportDoc, pageId: string, ids: string[], opacity: number) => updateBase(doc, pageId, ids, { opacity });

/** Deletes elements (template-locked ones stay). */
export function removeElements(doc: ReportDoc, pageId: string, ids: string[]): ReportDoc {
  const set = new Set(ids);
  return mapPage(doc, pageId, (p) => {
    const elements = p.elements.filter((e) => !set.has(e.id) || e.templateLocked);
    return elements.length === p.elements.length ? p : { ...p, elements };
  });
}

/** Copies elements 5 mm down-right, on top, with new ids; groups get a new group id. Returns the new ids. */
export function duplicateElements(doc: ReportDoc, pageId: string, ids: string[], opts: { newId?: IdFn; offset?: number } = {}): { doc: ReportDoc; ids: string[] } {
  const page = freeformPage(doc, pageId);
  const src = elementsOf(page, ids);
  if (!page || !src.length) return { doc, ids: [] };
  const make = opts.newId ?? newId;
  const off = opts.offset ?? 5;
  const groups = new Map<string, string>();
  let z = topZ(page);
  const copies = [...src]
    .sort((a, b) => a.z - b.z)
    .map((e) => {
      const groupId = e.groupId ? (groups.get(e.groupId) ?? groups.set(e.groupId, make("grp")).get(e.groupId)) : undefined;
      const c = { ...structuredCopy(e), id: make("el"), frame: moveFrame(e.frame, off, off), z: (z += 1), source: "user" } as Element;
      delete (c as Partial<Element>).templateLocked;
      delete (c as Partial<Element>).locked;
      if (groupId) c.groupId = groupId;
      else delete (c as Partial<Element>).groupId;
      return c;
    });
  return { doc: mapPage(doc, pageId, (p) => ({ ...p, elements: [...p.elements, ...copies] })), ids: copies.map((c) => c.id) };
}

const structuredCopy = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Groups ≥ 2 elements under one new group id. */
export function groupElements(doc: ReportDoc, pageId: string, ids: string[], opts: { newId?: IdFn } = {}): { doc: ReportDoc; groupId: string | null } {
  const page = freeformPage(doc, pageId);
  if (elementsOf(page, ids).length < 2) return { doc, groupId: null };
  const groupId = (opts.newId ?? newId)("grp");
  return { doc: mapElements(doc, pageId, ids, (e) => ({ ...e, groupId })), groupId };
}

/** Removes the group of every given element. */
export function ungroupElements(doc: ReportDoc, pageId: string, ids: string[]): ReportDoc {
  const page = freeformPage(doc, pageId);
  const groups = new Set(elementsOf(page, ids).map((e) => e.groupId).filter(Boolean));
  if (!page || !groups.size) return doc;
  const all = page.elements.filter((e) => e.groupId && groups.has(e.groupId)).map((e) => e.id);
  return mapElements(doc, pageId, all, (e) => {
    const n = { ...e };
    delete n.groupId;
    return n;
  });
}

export type ZMove = "forward" | "backward" | "front" | "back";

/**
 * Changes stacking. z values are renumbered 0…n-1 in the new order, and the
 * elements array follows (array order = layer order = reading order, R17).
 */
export function reorderZ(doc: ReportDoc, pageId: string, ids: string[], move: ZMove): ReportDoc {
  const page = freeformPage(doc, pageId);
  if (!page) return doc;
  const set = new Set(ids);
  const order = [...page.elements].sort((a, b) => a.z - b.z);
  let next: Element[];
  if (move === "front") next = [...order.filter((e) => !set.has(e.id)), ...order.filter((e) => set.has(e.id))];
  else if (move === "back") next = [...order.filter((e) => set.has(e.id)), ...order.filter((e) => !set.has(e.id))];
  else {
    next = [...order];
    if (move === "forward") {
      for (let i = next.length - 2; i >= 0; i--) if (set.has(next[i].id) && !set.has(next[i + 1].id)) [next[i], next[i + 1]] = [next[i + 1], next[i]];
    } else {
      for (let i = 1; i < next.length; i++) if (set.has(next[i].id) && !set.has(next[i - 1].id)) [next[i], next[i - 1]] = [next[i - 1], next[i]];
    }
  }
  return setLayerOrder(doc, pageId, next.map((e) => e.id).reverse());
}

/** Layers panel: `topFirst` is the list as shown (top layer first). */
export function setLayerOrder(doc: ReportDoc, pageId: string, topFirst: string[]): ReportDoc {
  return mapPage(doc, pageId, (p) => {
    const byId = new Map(p.elements.map((e) => [e.id, e]));
    const listed = topFirst.filter((id) => byId.has(id));
    const rest = [...p.elements].sort((a, b) => b.z - a.z).filter((e) => !listed.includes(e.id)).map((e) => e.id);
    const bottomFirst = [...listed, ...rest].reverse();
    const elements = bottomFirst.map((id, z) => {
      const e = byId.get(id) as Element;
      return e.z === z ? e : { ...e, z };
    });
    const same = elements.length === p.elements.length && elements.every((e, i) => e === p.elements[i]);
    return same ? p : { ...p, elements };
  });
}

/** Moves one layer to a list index (top-first), for drag-and-drop in Layers. */
export function moveLayer(doc: ReportDoc, pageId: string, id: string, toIndex: number): ReportDoc {
  const page = freeformPage(doc, pageId);
  if (!page) return doc;
  const list = [...page.elements].sort((a, b) => b.z - a.z).map((e) => e.id);
  const from = list.indexOf(id);
  if (from < 0) return doc;
  list.splice(from, 1);
  list.splice(Math.max(0, Math.min(list.length, toIndex)), 0, id);
  return setLayerOrder(doc, pageId, list);
}

/**
 * Aligns the elements: to the page when `to` is "page" (or only one is
 * selected), else to the selection's bounds.
 */
export function alignElements(doc: ReportDoc, pageId: string, ids: string[], edge: AlignEdge, to: "page" | "selection" = "selection"): ReportDoc {
  const page = freeformPage(doc, pageId);
  const els = elementsOf(page, ids).filter(movable);
  if (!els.length) return doc;
  const size = pageSize(doc);
  const target: Box | null = to === "page" || els.length === 1 ? { x: 0, y: 0, w: size.wMm, h: size.hMm } : boundsOf(els.map((e) => e.frame));
  if (!target) return doc;
  const next = alignFrames(
    els.map((e) => e.frame),
    edge,
    target,
  );
  return updateFrames(doc, pageId, Object.fromEntries(els.map((e, i) => [e.id, next[i]])));
}

export function distributeElements(doc: ReportDoc, pageId: string, ids: string[], axis: Axis): ReportDoc {
  const els = elementsOf(freeformPage(doc, pageId), ids).filter(movable);
  if (els.length < 3) return doc;
  const next = distributeFrames(
    els.map((e) => e.frame),
    axis,
  );
  return updateFrames(doc, pageId, Object.fromEntries(els.map((e, i) => [e.id, next[i]])));
}

/** Tidy up (geometry.tidyUp) for ≥ 2 movable elements. */
export function tidyElements(doc: ReportDoc, pageId: string, ids: string[]): ReportDoc {
  const els = elementsOf(freeformPage(doc, pageId), ids).filter(movable);
  if (els.length < 2) return doc;
  const next = tidyUp(els.map((e) => e.frame));
  return updateFrames(doc, pageId, Object.fromEntries(els.map((e, i) => [e.id, next[i]])));
}

// ---------------------------------------------------------------------------
// Copy style / paste style (⌥⌘C / ⌥⌘V)
// ---------------------------------------------------------------------------

/** Style props per element type: what Copy style takes. */
const STYLE_KEYS: Partial<Record<ElementType, string[]>> = {
  text: ["style", "align", "color", "valign"],
  shape: ["fill", "stroke", "strokeWidth", "radius", "opacity"],
  icon: ["color"],
  divider: ["color", "strokeWidth", "style"],
  page_number: ["color", "align", "format"],
  line: ["stroke", "strokeWidth", "dash"],
  callout: ["tone", "color", "icon"],
  chart: ["options"],
  table: ["style", "totalRow"],
  image: ["radius", "fit"],
  frame: ["mask", "fit"],
  grid: ["mask", "gap"],
  kpi_tile: ["variant", "showDelta", "showSparkline"],
  big_number: ["format", "showDelta"],
  progress: ["variant", "color"],
  qr: ["color"],
};

/** The prop that holds an element's main colour (paste across types). */
const MAIN_COLOUR: Partial<Record<ElementType, string>> = { text: "color", shape: "fill", icon: "color", divider: "color", page_number: "color", line: "stroke", progress: "color", callout: "color", qr: "color" };

export interface StyleClip {
  type: ElementType;
  props: Record<string, unknown>;
  opacity?: number;
  colour?: string;
}

/** Copy style from one element. */
export function copyStyle(el: Element): StyleClip {
  const props = el.props as unknown as Record<string, unknown>;
  const keys = STYLE_KEYS[el.type] ?? [];
  const picked = Object.fromEntries(keys.filter((k) => props[k] !== undefined).map((k) => [k, structuredCopy(props[k])]));
  const ck = MAIN_COLOUR[el.type];
  const colour = ck && typeof props[ck] === "string" ? (props[ck] as string) : undefined;
  return { type: el.type, props: picked, opacity: el.opacity, colour };
}

/**
 * Paste style: the same type takes every style prop; another type takes the
 * main colour (when it has one) and the transparency. Locked elements are skipped.
 */
export function pasteStyle(doc: ReportDoc, pageId: string, ids: string[], clip: StyleClip): ReportDoc {
  return mapElements(doc, pageId, ids, (e) => {
    if (e.locked || e.templateLocked) return e;
    const props = { ...(e.props as unknown as Record<string, unknown>) };
    let changed = false;
    if (e.type === clip.type) {
      for (const k of STYLE_KEYS[e.type] ?? []) {
        if (k in clip.props) {
          if (JSON.stringify(props[k]) !== JSON.stringify(clip.props[k])) changed = true;
          props[k] = structuredCopy(clip.props[k]);
        } else if (props[k] !== undefined && k !== "style" && k !== "align") {
          delete props[k];
          changed = true;
        }
      }
    } else {
      const ck = MAIN_COLOUR[e.type];
      if (ck && clip.colour && props[ck] !== clip.colour) {
        props[ck] = clip.colour;
        changed = true;
      }
    }
    const next = { ...e, props } as Element;
    if ((e.opacity ?? 1) !== (clip.opacity ?? 1)) {
      changed = true;
      if (clip.opacity === undefined || clip.opacity === 1) delete next.opacity;
      else next.opacity = clip.opacity;
    }
    return changed ? next : e;
  });
}

// ---------------------------------------------------------------------------
// Frames, grids and images: fill, crop
// ---------------------------------------------------------------------------

export interface AssetSize {
  w: number;
  h: number;
}

/**
 * Drops an image on a frame (or grid cell, or replaces an image's picture):
 * the asset fills it ("cover"), centred, with a crop set from the natural size
 * when known. Registers the asset on the doc if new.
 */
export function fillFrame(doc: ReportDoc, pageId: string, id: string, asset: { id: string; w?: number; h?: number; alt?: string; kind?: "image" | "logo" | "ai_image" }, cell?: number): ReportDoc {
  const el = findElement(doc, pageId, id);
  if (!el || el.locked || el.templateLocked) return doc;
  const known = !!(asset.w && asset.h);
  const assets = doc.assets.some((a) => a.id === asset.id) ? doc.assets : [...doc.assets, { id: asset.id, kind: asset.kind ?? "image", w: asset.w ?? 0, h: asset.h ?? 0, alt: asset.alt ?? "" }];
  let next: Element | null = null;
  if (el.type === "frame") {
    const crop = known ? coverCrop(el.frame.w, el.frame.h, asset.w as number, asset.h as number) : undefined;
    next = { ...el, props: { ...el.props, assetId: asset.id, fit: "cover", alt: el.props.alt || asset.alt || "", crop } };
    if (!crop) delete (next.props as { crop?: Crop }).crop;
  } else if (el.type === "image") {
    const crop = known ? coverCrop(el.frame.w, el.frame.h, asset.w as number, asset.h as number) : undefined;
    next = { ...el, props: { ...el.props, assetId: asset.id, alt: el.props.alt || asset.alt || "", crop } };
    if (!crop) delete (next.props as { crop?: Crop }).crop;
  } else if (el.type === "grid") {
    const idx = cell ?? el.props.cells.findIndex((c) => !c.assetId);
    const at = idx >= 0 && idx < el.props.cells.length ? idx : 0;
    const cells = el.props.cells.map((c, i) => (i === at ? { assetId: asset.id, alt: c.alt || asset.alt || "" } : c));
    next = { ...el, props: { ...el.props, cells } };
  }
  if (!next) return doc;
  const done = mapElements(doc, pageId, [id], () => next as Element);
  return done === doc ? doc : { ...done, assets };
}

/** Sets (or clears) the crop of a frame, image or grid cell. */
export function setCrop(doc: ReportDoc, pageId: string, id: string, crop: Crop | null, cell?: number): ReportDoc {
  return mapElements(doc, pageId, [id], (e) => {
    if (e.locked || e.templateLocked) return e;
    const c = crop ? { x: round(crop.x, 2), y: round(crop.y, 2), w: round(crop.w, 2), h: round(crop.h, 2) } : undefined;
    if (e.type === "frame" || e.type === "image") {
      const props = { ...e.props } as typeof e.props & { crop?: Crop };
      if (c) props.crop = c;
      else delete props.crop;
      return { ...e, props } as Element;
    }
    if (e.type === "grid" && cell !== undefined) {
      const cells = e.props.cells.map((x, i) => {
        if (i !== cell) return x;
        const n = { ...x };
        if (c) n.crop = c;
        else delete n.crop;
        return n;
      });
      return { ...e, props: { ...e.props, cells } };
    }
    return e;
  });
}

/** True when the element takes a dropped picture. */
export const takesImage = (e: Element): boolean => (e.type === "frame" || e.type === "image" || e.type === "grid") && !e.locked && !e.templateLocked;

// ---------------------------------------------------------------------------
// Page ops
// ---------------------------------------------------------------------------

/** A blank free-form page. */
export const blankPage = (id: string, name = "Blank page"): FreeformPage => ({ id, kind: "freeform", name, background: {}, elements: [] });

/** Inserts a page at `index` (end when omitted). */
export function insertPage(doc: ReportDoc, page: Page, index?: number): ReportDoc {
  const pages = [...doc.pages];
  pages.splice(index === undefined ? pages.length : Math.max(0, Math.min(pages.length, index)), 0, page);
  return { ...doc, pages };
}

/** Copies a layout page in as a new page: new page id, elements renamed `<pageId>.<slot>`. */
export function pageFromLayout(layout: FreeformPage, pageId: string, layoutId?: string, name?: string): FreeformPage {
  const copy = structuredCopy(layout);
  return {
    ...copy,
    id: pageId,
    name: name ?? copy.name,
    layoutId: layoutId ?? copy.layoutId,
    elements: copy.elements.map((e) => ({ ...e, id: `${pageId}.${slotOf(e.id)}` })),
    guides: copy.guides,
  };
}

const slotOf = (id: string) => (id.includes(".") ? id.slice(id.indexOf(".") + 1) : id);

export function duplicatePage(doc: ReportDoc, pageId: string, opts: { newId?: IdFn } = {}): { doc: ReportDoc; id: string } {
  const i = doc.pages.findIndex((p) => p.id === pageId);
  if (i < 0) return { doc, id: "" };
  const src = doc.pages[i];
  const id = (opts.newId ?? newId)("pg");
  const copy: Page = src.kind === "freeform" ? { ...pageFromLayout(src, id, src.layoutId, `${src.name} (copy)`), lockedByTemplate: undefined } : { ...structuredCopy(src), id, name: `${src.name} (copy)` };
  if (copy.kind === "freeform") delete copy.lockedByTemplate;
  if (copy.bookmark) delete copy.bookmark;
  return { doc: insertPage(doc, copy, i + 1), id };
}

export function duplicatePages(doc: ReportDoc, ids: string[], opts: { newId?: IdFn } = {}): { doc: ReportDoc; ids: string[] } {
  let d = doc;
  const out: string[] = [];
  // In page order, each copy right after its source.
  for (const p of doc.pages.filter((x) => ids.includes(x.id))) {
    const r = duplicatePage(d, p.id, opts);
    d = r.doc;
    out.push(r.id);
  }
  return { doc: d, ids: out };
}

export function setPagesHidden(doc: ReportDoc, ids: string[], hidden: boolean): ReportDoc {
  let changed = false;
  const pages = doc.pages.map((p) => {
    if (!ids.includes(p.id) || !!p.hidden === hidden) return p;
    changed = true;
    const n = { ...p };
    if (hidden) n.hidden = true;
    else delete n.hidden;
    return n;
  });
  return changed ? { ...doc, pages } : doc;
}

/** Deletes pages; the last page always stays. */
export function deletePages(doc: ReportDoc, ids: string[]): ReportDoc {
  const pages = doc.pages.filter((p) => !ids.includes(p.id));
  if (!pages.length || pages.length === doc.pages.length) return doc;
  return { ...doc, pages };
}

/**
 * Moves pages (kept in their relative order) so the first lands at `toIndex`
 * of the list without them.
 */
export function movePages(doc: ReportDoc, ids: string[], toIndex: number): ReportDoc {
  const moving = doc.pages.filter((p) => ids.includes(p.id));
  if (!moving.length) return doc;
  const rest = doc.pages.filter((p) => !ids.includes(p.id));
  const at = Math.max(0, Math.min(rest.length, toIndex));
  const pages = [...rest.slice(0, at), ...moving, ...rest.slice(at)];
  return pages.every((p, i) => p === doc.pages[i]) ? doc : { ...doc, pages };
}

export function renamePage(doc: ReportDoc, pageId: string, name: string): ReportDoc {
  const clean = name.trim().slice(0, 120);
  if (!clean) return doc;
  let changed = false;
  const pages = doc.pages.map((p) => {
    if (p.id !== pageId || p.name === clean) return p;
    changed = true;
    return { ...p, name: clean };
  });
  return changed ? { ...doc, pages } : doc;
}

export function setBackground(doc: ReportDoc, pageId: string, background: FreeformPage["background"]): ReportDoc {
  return mapPage(doc, pageId, (p) => (JSON.stringify(p.background) === JSON.stringify(background) ? p : { ...p, background }));
}

export function setNotes(doc: ReportDoc, pageId: string, notes: string): ReportDoc {
  return mapPage(doc, pageId, (p) => {
    if ((p.notes ?? "") === notes) return p;
    const n: FreeformPage = { ...p, notes };
    if (!notes) delete n.notes;
    return n;
  });
}

/**
 * Reset to layout: the page takes the layout's elements and background again
 * (its id, name and notes stay; ruler guides stay).
 */
export function resetToLayout(doc: ReportDoc, pageId: string, layout: FreeformPage, layoutId?: string): ReportDoc {
  return mapPage(doc, pageId, (p) => {
    const fresh = pageFromLayout(layout, p.id, layoutId ?? p.layoutId, p.name);
    return { ...p, layoutId: fresh.layoutId, background: fresh.background, elements: fresh.elements };
  });
}

// ---------------------------------------------------------------------------
// Ruler guides (page.guides, never printed)
// ---------------------------------------------------------------------------

export function addGuide(doc: ReportDoc, pageId: string, axis: Axis, mm: number): ReportDoc {
  return mapPage(doc, pageId, (p) => ({ ...p, guides: [...(p.guides ?? []), { axis, mm: round(mm, 1) }] }));
}

export function moveGuide(doc: ReportDoc, pageId: string, index: number, mm: number): ReportDoc {
  return mapPage(doc, pageId, (p) => {
    const g = p.guides?.[index];
    if (!g || g.mm === round(mm, 1)) return p;
    return { ...p, guides: (p.guides ?? []).map((x, i) => (i === index ? { ...x, mm: round(mm, 1) } : x)) };
  });
}

export function removeGuide(doc: ReportDoc, pageId: string, index: number): ReportDoc {
  return mapPage(doc, pageId, (p) => {
    if (!p.guides?.[index]) return p;
    const guides = p.guides.filter((_, i) => i !== index);
    const n: FreeformPage = { ...p, guides };
    if (!guides.length) delete n.guides;
    return n;
  });
}

export function clearGuides(doc: ReportDoc, pageId: string): ReportDoc {
  return mapPage(doc, pageId, (p) => {
    if (!p.guides?.length) return p;
    const n = { ...p };
    delete n.guides;
    return n;
  });
}

// ---------------------------------------------------------------------------
// Chapters (grid view groups)
// ---------------------------------------------------------------------------

export interface Chapter {
  /** The page that opens it (null for the pages before the first chapter). */
  id: string | null;
  name: string;
  pageIds: string[];
}

/**
 * Chapters for grid view: a page with a bookmark (a TOC entry) opens a
 * chapter named by it; pages before the first bookmark are "Opening". A doc
 * without bookmarks is one group, "All pages".
 */
export function chaptersOf(doc: ReportDoc): Chapter[] {
  const out: Chapter[] = [];
  for (const p of doc.pages) {
    if (p.bookmark) out.push({ id: p.id, name: p.bookmark, pageIds: [p.id] });
    else if (!out.length) out.push({ id: null, name: doc.pages.some((x) => x.bookmark) ? "Opening" : "All pages", pageIds: [p.id] });
    else out[out.length - 1].pageIds.push(p.id);
  }
  return out;
}

/** Moves pages to the end of a chapter. */
export function movePagesToChapter(doc: ReportDoc, ids: string[], chapter: Chapter): ReportDoc {
  const rest = doc.pages.filter((p) => !ids.includes(p.id));
  const remaining = chapter.pageIds.filter((id) => !ids.includes(id));
  const last = remaining[remaining.length - 1];
  const at = last ? rest.findIndex((p) => p.id === last) + 1 : chapter.id === null ? 0 : rest.length;
  return movePages(doc, ids, at);
}
