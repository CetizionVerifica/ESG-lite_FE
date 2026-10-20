// DS-4 · library edits (pure, like styleOps and brandOps): add an element from
// the Elements drawer, add a page from a layout, apply a whole template, and
// place an uploaded image. DS-6 runs them through history (one undo step
// each) and re-exports them from docOps. The input doc is never mutated.
//
//   insertElement(doc, pageId, payload, opts)   an element (or an editable group) at the page
//                                               centre, or centred on a drop point; kept on the page
//   addLayoutPage(doc, layout, opts)            a layout as a new page after `afterPageId`
//   applyTemplate(doc, template, opts)          "Replace all pages": the template's pages, mapped
//                                               to the old ones by layout role; text edited on a
//                                               matched page is kept, and so is every element
//                                               the user added
//   placeAsset(doc, pageId, asset, opts)        an uploaded image as an image element, or into the
//                                               selected empty frame
//   fillPlaceholders(node, vars)                {{company}}, {{period}}, {{year}}, {{title}}
import {
  PAGE_FORMAT_SIZES,
  type AssetRef,
  type Element,
  type ElementGroupPayload,
  type FreeformPage,
  type GhgBinding,
  type KpiBinding,
  type Page,
  type ReportDoc,
  type ReportLayout,
  type ReportTemplateDetail,
  type StudioAsset,
  type YearType,
} from "./contracts";

type Json = Record<string, unknown>;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const r1 = (v: number) => Math.round(v * 10) / 10;

let seq = 0;
/** A short unique id (base36 time + a counter). Tests pass their own `newId`. */
export const libraryId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(++seq).toString(36)}`;

// ---------------------------------------------------------------------------
// Placeholders
// ---------------------------------------------------------------------------

export interface PlaceholderVars {
  company?: string;
  period?: string;
  year?: string;
  title?: string;
}

/** "2025" for a calendar year, "FY 2025" for a financial year (as the backend's instantiateTemplate). */
export const periodLabel = (yearType: YearType, year: number) => (yearType === "FY" ? `FY ${year}` : String(year));

/** The placeholder values a doc can supply; `company` comes from the caller (brand kit name). */
export const docVars = (doc: ReportDoc, company?: string): PlaceholderVars => ({
  period: periodLabel(doc.meta.yearType, doc.meta.year),
  year: String(doc.meta.year),
  title: doc.meta.title,
  ...(company ? { company } : {}),
});

/** Replaces known placeholders in every string of a JSON tree; unknown ones stay. */
export function fillPlaceholders<T>(node: T, vars: PlaceholderVars): T {
  const walk = (n: unknown): unknown => {
    if (typeof n === "string") return n.replace(/\{\{(\w+)\}\}/g, (m, k: string) => (vars as Record<string, string | undefined>)[k] ?? m);
    if (Array.isArray(n)) return n.map(walk);
    if (!isObj(n)) return n;
    return Object.fromEntries(Object.entries(n).map(([k, v]) => [k, walk(v)]));
  };
  return walk(node) as T;
}

// ---------------------------------------------------------------------------
// Bindings for the doc's kind
// ---------------------------------------------------------------------------

/** Element templates carry GHG bindings; a sustainability doc gets the matching ESG headline KPI. */
const KPI_FOR_GHG: Record<string, string> = {
  total: "GHG_SCOPE1_2",
  scope1: "GHG_SCOPE1_2",
  scope2_location: "GHG_SCOPE1_2",
  scope3: "GHG_SCOPE3",
  primary_data_pct: "ENERGY_RENEWABLE_SHARE",
};

/** A binding fitted to the doc: kind (GHG → KPI for sustainability) and the doc's sites. */
export function bindingForDoc(b: unknown, doc: Pick<ReportDoc, "kind" | "meta">): unknown {
  if (!isObj(b)) return b;
  const sites = doc.meta.sites;
  if (b.source === "ghg" && doc.kind === "sustainability") {
    const g = b as unknown as GhgBinding;
    const kpi: KpiBinding = { source: "kpi", kpis: [KPI_FOR_GHG[g.metric] ?? "GHG_SCOPE1_2"], years: g.years, sites };
    if (g.compare) kpi.compare = g.compare;
    return kpi;
  }
  if ((b.source === "ghg" || b.source === "kpi") && b.sites === "all" && sites !== "all") return { ...b, sites };
  return b;
}

const fitBindings = (el: Element, doc: ReportDoc): Element => {
  const props = el.props as Json;
  return "binding" in props ? ({ ...el, props: { ...props, binding: bindingForDoc(props.binding, doc) } } as Element) : el;
};

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------

const isGroup = (p: Element | ElementGroupPayload): p is ElementGroupPayload => (p as ElementGroupPayload).type === "group";
const mayBleed = (e: Element) => (e.type === "image" || e.type === "frame" || e.type === "shape") && (e.props as { bleed?: boolean }).bleed === true;

/** The x, y that keep a w × h box on the page (in the bleed only when it may bleed), centred on `at` or the page. */
function place(doc: ReportDoc, w: number, h: number, at: { x: number; y: number } | undefined, bleed: boolean): { x: number; y: number; w: number; h: number } {
  const page = PAGE_FORMAT_SIZES[doc.format];
  const b = bleed ? page.bleedMm : 0;
  // Too big for the page: scale down, keeping the aspect ratio.
  const k = Math.min(1, (page.wMm + 2 * b) / w, (page.hMm + 2 * b) / h);
  const W = r1(w * k);
  const H = r1(h * k);
  const cx = at?.x ?? page.wMm / 2;
  const cy = at?.y ?? page.hMm / 2;
  const x = Math.min(Math.max(cx - W / 2, -b), page.wMm + b - W);
  const y = Math.min(Math.max(cy - H / 2, -b), page.hMm + b - H);
  return { x: r1(x), y: r1(y), w: W, h: H };
}

const topZ = (p: FreeformPage) => p.elements.reduce((m, e) => Math.max(m, e.z), 0);

export interface InsertOptions {
  /** Centre the element on this point (mm on the page); else the page centre. */
  at?: { x: number; y: number };
  newId?: (prefix: string) => string;
}

/** Adds an element template to a free-form page. Returns the doc and the new ids (to select them). */
export function insertElement(doc: ReportDoc, pageId: string, payload: Element | ElementGroupPayload, opts: InsertOptions = {}): { doc: ReportDoc; ids: string[] } {
  const newId = opts.newId ?? libraryId;
  const page = doc.pages.find((p): p is FreeformPage => p.id === pageId && p.kind === "freeform");
  if (!page) return { doc, ids: [] };
  let z = topZ(page);
  let added: Element[];
  if (isGroup(payload)) {
    const box = place(doc, payload.w, payload.h, opts.at, false);
    const k = box.w / payload.w;
    const groupId = newId("group");
    added = [...payload.elements]
      .sort((a, b) => a.z - b.z)
      .map((child) => {
        const c = clone(child);
        const frame = { x: r1(box.x + c.frame.x * k), y: r1(box.y + c.frame.y * k), w: r1(c.frame.w * k), h: r1(c.frame.h * k), rotation: c.frame.rotation };
        if (c.type === "line") Object.assign(c.props, { x1: r1(c.props.x1 * k), y1: r1(c.props.y1 * k), x2: r1(c.props.x2 * k), y2: r1(c.props.y2 * k) });
        return fitBindings({ ...c, id: newId("el"), frame, z: ++z, groupId, source: "user" } as Element, doc);
      });
  } else {
    const c = clone(payload);
    const frame = { ...place(doc, c.frame.w, c.frame.h, opts.at, mayBleed(c)), rotation: c.frame.rotation };
    if (c.type === "line" && frame.w !== c.frame.w) {
      const k = frame.w / c.frame.w;
      Object.assign(c.props, { x1: r1(c.props.x1 * k), y1: r1(c.props.y1 * k), x2: r1(c.props.x2 * k), y2: r1(c.props.y2 * k) });
    }
    added = [fitBindings({ ...c, id: newId("el"), frame, z: ++z, source: "user" } as Element, doc)];
  }
  const pages = doc.pages.map((p) => (p.id === pageId && p.kind === "freeform" ? { ...p, elements: [...p.elements, ...added] } : p));
  return { doc: { ...doc, pages }, ids: added.map((e) => e.id) };
}

// ---------------------------------------------------------------------------
// Drag and drop (the canvas, DS-6, reads it on drop)
// ---------------------------------------------------------------------------

/** dataTransfer type of an element dragged from a drawer. */
export const ELEMENT_DRAG_TYPE = "application/x-esglite-studio-element";

export interface ElementDrag {
  payload: Element | ElementGroupPayload;
  /** An uploaded image also needs its AssetRef in doc.assets. */
  asset?: AssetRef;
}

export const elementDragData = (drag: ElementDrag): string => JSON.stringify(drag);

/** The dragged element, or null for anything else. */
export function readElementDrag(dt: Pick<DataTransfer, "getData"> | null): ElementDrag | null {
  if (!dt) return null;
  try {
    const raw = dt.getData(ELEMENT_DRAG_TYPE);
    if (!raw) return null;
    const v = JSON.parse(raw) as ElementDrag;
    return isObj(v) && isObj(v.payload) && typeof (v.payload as { type?: unknown }).type === "string" ? v : null;
  } catch {
    return null;
  }
}

/** Drops a dragged element (or image) at a point on a page. */
export function dropElement(doc: ReportDoc, pageId: string, drag: ElementDrag, at: { x: number; y: number }, newId?: (p: string) => string): { doc: ReportDoc; ids: string[] } {
  const withAsset = drag.asset && !doc.assets.some((a) => a.id === drag.asset!.id) ? { ...doc, assets: [...doc.assets, drag.asset] } : doc;
  return insertElement(withAsset, pageId, drag.payload, { at, newId });
}

// ---------------------------------------------------------------------------
// Uploaded images
// ---------------------------------------------------------------------------

export const assetRef = (a: StudioAsset): AssetRef => ({ id: a.id, kind: a.kind, w: Math.max(1, Math.round(a.w)), h: Math.max(1, Math.round(a.h)), alt: a.alt ?? "" });

/** An image element template for an asset: up to 60 % of the page width, its own aspect ratio. */
export function imagePayload(doc: ReportDoc, a: StudioAsset): Element {
  const page = PAGE_FORMAT_SIZES[doc.format];
  const ratio = a.w > 0 && a.h > 0 ? a.w / a.h : 1.5;
  let w = page.wMm * 0.6;
  let h = w / ratio;
  if (h > page.hMm * 0.6) {
    h = page.hMm * 0.6;
    w = h * ratio;
  }
  return { id: "el", type: "image", frame: { x: 0, y: 0, w: r1(w), h: r1(h), rotation: 0 }, z: 0, source: "user", props: { assetId: a.id, fit: "cover", alt: a.alt ?? "" } };
}

/**
 * Places an uploaded image: into the selected frame (or grid cell-less frame)
 * when exactly one frame is selected, else as a new image element at the
 * centre. The asset joins doc.assets once.
 */
export function placeAsset(doc: ReportDoc, pageId: string, a: StudioAsset, opts: { selection?: string[]; newId?: (p: string) => string } = {}): { doc: ReportDoc; ids: string[] } {
  const withAsset = doc.assets.some((x) => x.id === a.id) ? doc : { ...doc, assets: [...doc.assets, assetRef(a)] };
  const page = withAsset.pages.find((p): p is FreeformPage => p.id === pageId && p.kind === "freeform");
  if (!page) return { doc, ids: [] };
  const sel = opts.selection ?? [];
  const target = sel.length === 1 ? page.elements.find((e) => e.id === sel[0] && (e.type === "frame" || e.type === "image") && !e.locked) : undefined;
  if (target) {
    const pages = withAsset.pages.map((p) =>
      p.id === pageId && p.kind === "freeform"
        ? { ...p, elements: p.elements.map((e) => (e.id === target.id ? ({ ...e, props: { ...e.props, assetId: a.id, alt: a.alt || (e.props as { alt?: string }).alt || "" } } as Element) : e)) }
        : p,
    );
    return { doc: { ...withAsset, pages }, ids: [target.id] };
  }
  return insertElement(withAsset, pageId, imagePayload(withAsset, a), { newId: opts.newId });
}

// ---------------------------------------------------------------------------
// Pages from layouts
// ---------------------------------------------------------------------------

/** The role of a layout id (`ghg-inventory/scope1` → `scope1`). */
export const layoutRole = (layoutId: string | undefined): string | undefined => (layoutId ? layoutId.slice(layoutId.lastIndexOf("/") + 1) : undefined);

/** A layout's page with `pageId`: element ids `<pageId>.<slot>`, layoutId set, placeholders filled, bindings fitted. */
export function pageFromLayout(layout: Pick<ReportLayout, "page" | "name" | "slug">, pageId: string, doc: ReportDoc, vars: PlaceholderVars = {}): FreeformPage {
  const src = clone(layout.page);
  const prefix = `${src.id}.`;
  const elements = src.elements.map((e) => fitBindings({ ...e, id: `${pageId}.${e.id.startsWith(prefix) ? e.id.slice(prefix.length) : e.id}` } as Element, doc));
  const page: FreeformPage = { ...src, id: pageId, name: layout.name, elements, ...(layout.slug ? { layoutId: layout.slug } : {}) };
  return fillPlaceholders(page, { ...docVars(doc), ...vars });
}

const uniquePageId = (doc: ReportDoc, base: string, newId: (p: string) => string) => {
  const ids = new Set(doc.pages.map((p) => p.id));
  if (!ids.has(base)) return base;
  let id = newId(base);
  while (ids.has(id)) id = newId(base);
  return id;
};

/** Adds a layout as a new page after `afterPageId` (else at the end). */
export function addLayoutPage(doc: ReportDoc, layout: Pick<ReportLayout, "page" | "name" | "slug" | "role">, opts: { afterPageId?: string | null; vars?: PlaceholderVars; newId?: (p: string) => string } = {}): { doc: ReportDoc; pageId: string } {
  const newId = opts.newId ?? libraryId;
  const pageId = uniquePageId(doc, newId(`p-${layout.role ?? layout.page.id}`), newId);
  const page = pageFromLayout(layout, pageId, doc, opts.vars);
  const at = opts.afterPageId ? doc.pages.findIndex((p) => p.id === opts.afterPageId) : -1;
  const pages = [...doc.pages];
  pages.splice(at >= 0 ? at + 1 : pages.length, 0, page);
  return { doc: { ...doc, pages }, pageId };
}

// ---------------------------------------------------------------------------
// Whole templates
// ---------------------------------------------------------------------------

export interface ApplyResult {
  doc: ReportDoc;
  /** Template pages that took text from an old page with the same layout. */
  matched: number;
  /** Elements the user added that moved onto the new pages. */
  keptElements: number;
  /** Old pages with user elements and no match, kept after the template's pages. */
  keptPages: number;
}

const slotOf = (pageId: string, elId: string) => (elId.startsWith(`${pageId}.`) ? elId.slice(pageId.length + 1) : null);

/**
 * "Replace all pages? Your text edits on pages with the same layout are kept."
 * The template's pages replace the doc's. Each new page is matched to an old
 * page with the same layout role (`cover`, `scope1`…), in order. On a match,
 * every text slot keeps the old page's text, and the elements the user added
 * (source user or ai) move across. Old pages with user elements and no match
 * stay, after the template's pages. Meta, inputs, assets and the brand's
 * colour and font overrides are the doc's; the look and template id are the
 * template's. The template must be of the doc's kind and format.
 */
export function applyTemplate(doc: ReportDoc, template: Pick<ReportTemplateDetail, "doc" | "kind" | "format">, opts: { vars?: PlaceholderVars; newId?: (p: string) => string } = {}): ApplyResult {
  if (template.kind !== doc.kind) throw new Error(`A ${template.kind} template can't be applied to a ${doc.kind} design`);
  if (template.format !== doc.format) throw new Error(`A ${template.format} template can't be applied to a ${doc.format} design (use Resize)`);
  const newId = opts.newId ?? libraryId;
  const tdoc = template.doc;
  const vars = { ...docVars(doc), ...opts.vars };
  const fresh = fillPlaceholders(clone(tdoc.pages), vars).map((p) => (p.kind === "freeform" ? { ...p, elements: p.elements.map((e) => fitBindings(e, doc)) } : p));

  const oldFree = doc.pages.filter((p): p is FreeformPage => p.kind === "freeform");
  const used = new Set<string>();
  let matched = 0;
  let keptElements = 0;
  const isUserEl = (e: Element) => e.source === "user" || e.source === "ai";

  const pages: Page[] = fresh.map((np) => {
    if (np.kind !== "freeform") return np;
    const role = layoutRole(np.layoutId);
    const old = role ? oldFree.find((p) => !used.has(p.id) && layoutRole(p.layoutId) === role) : undefined;
    if (!old) return np;
    used.add(old.id);
    matched++;
    const oldBySlot = new Map(old.elements.flatMap((e) => (e.source === "layout" || e.source === "auto" ? [[slotOf(old.id, e.id), e] as const] : [])));
    const elements = np.elements.map((e) => {
      const before = oldBySlot.get(slotOf(np.id, e.id));
      return before && before.type === "text" && e.type === "text" ? ({ ...e, props: { ...e.props, doc: before.props.doc } } as Element) : e;
    });
    let z = topZ({ ...np, elements });
    const carried = old.elements.filter(isUserEl).map((e) => ({ ...e, z: ++z }));
    keptElements += carried.length;
    return { ...np, elements: [...elements, ...carried], ...(old.notes ? { notes: old.notes } : {}), ...(old.guides ? { guides: old.guides } : {}) };
  });

  const taken = new Set(pages.map((p) => p.id));
  const leftovers = oldFree
    .filter((p) => !used.has(p.id) && p.elements.some(isUserEl))
    .map((p) => {
      if (!taken.has(p.id)) return p;
      const id = uniquePageId({ ...doc, pages }, newId(p.id), newId);
      return { ...p, id, elements: p.elements.map((e) => (e.id.startsWith(`${p.id}.`) ? { ...e, id: `${id}.${e.id.slice(p.id.length + 1)}` } : e)) };
    });

  const next: ReportDoc = {
    ...doc,
    design: {
      ...doc.design,
      templateId: tdoc.design.templateId,
      templateVersion: tdoc.design.templateVersion,
      theme: { ...doc.design.theme, ...(tdoc.design.theme.look ? { look: tdoc.design.theme.look } : {}) },
    },
    pages: [...pages, ...leftovers],
  };
  return { doc: next, matched, keptElements, keptPages: leftovers.length };
}
