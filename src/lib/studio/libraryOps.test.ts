import { describe, expect, it } from "vitest";
import ghgFixture from "../../test/fixtures/studio/ghg-doc.json";
import sustainabilityFixture from "../../test/fixtures/studio/sustainability-doc.json";
import type { Element, ElementGroupPayload, FreeformPage, ReportDoc, ReportLayout, ReportTemplateDetail, StudioAsset } from "./contracts";
import { ELEMENT_DRAG_TYPE, addLayoutPage, applyTemplate, bindingForDoc, dropElement, elementDragData, fillPlaceholders, insertElement, placeAsset, readElementDrag } from "./libraryOps";

const GHG = ghgFixture as unknown as ReportDoc;
const SUS = sustainabilityFixture as unknown as ReportDoc;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const ids = () => {
  let n = 0;
  return (p: string) => `${p}-${++n}`;
};
const free = (doc: ReportDoc, id: string) => doc.pages.find((p): p is FreeformPage => p.id === id && p.kind === "freeform")!;
const textOf = (e: Element | undefined) => (e && e.type === "text" ? JSON.stringify(e.props.doc) : null);

const rect: Element = { id: "el", type: "shape", frame: { x: 0, y: 0, w: 40, h: 20, rotation: 0 }, z: 1, source: "user", props: { shape: "rect" } };
const bigNumber: Element = {
  id: "el",
  type: "big_number",
  frame: { x: 0, y: 0, w: 70, h: 30, rotation: 0 },
  z: 1,
  source: "user",
  props: { binding: { source: "ghg", metric: "total", years: { last: 1 }, sites: "all", compare: "prior" }, label: "tCO₂e", showDelta: true },
};
const group: ElementGroupPayload = {
  type: "group",
  w: 100,
  h: 40,
  elements: [
    { id: "a", type: "shape", frame: { x: 0, y: 0, w: 40, h: 40, rotation: 0 }, z: 1, source: "user", props: { shape: "ellipse" } },
    { id: "b", type: "line", frame: { x: 50, y: 18, w: 50, h: 4, rotation: 0 }, z: 2, source: "user", props: { x1: 0, y1: 2, x2: 50, y2: 2, strokeWidth: 0.8, dash: "solid", endArrow: true } },
  ],
};

describe("insertElement", () => {
  it("adds an element at the page centre, on top, with a new id; the input doc is unchanged", () => {
    const before = JSON.stringify(GHG);
    const { doc, ids: added } = insertElement(GHG, "p-summary", rect, { newId: ids() });
    expect(JSON.stringify(GHG)).toBe(before);
    expect(added).toEqual(["el-1"]);
    const el = free(doc, "p-summary").elements.find((e) => e.id === "el-1")!;
    expect(el.frame).toEqual({ x: 85, y: 138.5, w: 40, h: 20, rotation: 0 });
    expect(el.z).toBe(Math.max(...free(GHG, "p-summary").elements.map((e) => e.z)) + 1);
    expect(el.source).toBe("user");
  });

  it("centres on a drop point but keeps the element on the page", () => {
    const at = insertElement(GHG, "p-summary", rect, { at: { x: 50, y: 60 }, newId: ids() });
    expect(free(at.doc, "p-summary").elements.slice(-1)[0].frame).toMatchObject({ x: 30, y: 50 });
    const corner = insertElement(GHG, "p-summary", rect, { at: { x: 205, y: 295 }, newId: ids() });
    expect(free(corner.doc, "p-summary").elements.slice(-1)[0].frame).toMatchObject({ x: 170, y: 277 });
  });

  it("scales an element too big for the page and lets a bleed shape reach the bleed only", () => {
    const wide: Element = { ...rect, frame: { ...rect.frame, w: 420, h: 20 } };
    const scaled = free(insertElement(GHG, "p-summary", wide, { newId: ids() }).doc, "p-summary").elements.slice(-1)[0];
    expect(scaled.frame.w).toBeLessThanOrEqual(210);
    expect(scaled.frame.x).toBeGreaterThanOrEqual(0);
    const band: Element = { ...rect, frame: { ...rect.frame, w: 216, h: 40 }, props: { shape: "rect", bleed: true } };
    const placed = free(insertElement(GHG, "p-summary", band, { newId: ids() }).doc, "p-summary").elements.slice(-1)[0];
    expect(placed.frame).toMatchObject({ x: -3, w: 216 });
  });

  it("inserts an editable group: children share a groupId, keep their order and scale their line points", () => {
    const { doc, ids: added } = insertElement(GHG, "p-summary", group, { at: { x: 105, y: 100 }, newId: ids() });
    expect(added).toHaveLength(2);
    const els = free(doc, "p-summary").elements.filter((e) => added.includes(e.id));
    expect(new Set(els.map((e) => e.groupId)).size).toBe(1);
    expect(els[0].groupId).toBe("group-1");
    expect(els[0].frame).toMatchObject({ x: 55, y: 80, w: 40, h: 40 });
    expect(els[1].z).toBeGreaterThan(els[0].z);
  });

  it("fits data bindings to the doc: the doc's sites, and a KPI binding in a sustainability design", () => {
    const sites = { ...GHG, meta: { ...GHG.meta, sites: [1, 2] } };
    const g = free(insertElement(sites, "p-summary", bigNumber, { newId: ids() }).doc, "p-summary").elements.slice(-1)[0];
    expect(g.type === "big_number" && g.props.binding).toMatchObject({ source: "ghg", sites: [1, 2] });
    const susPage = SUS.pages.find((p) => p.kind === "freeform")!.id;
    const k = free(insertElement(SUS, susPage, bigNumber, { newId: ids() }).doc, susPage).elements.slice(-1)[0];
    expect(k.type === "big_number" && k.props.binding).toMatchObject({ source: "kpi", kpis: ["GHG_SCOPE1_2"], compare: "prior" });
    expect(bindingForDoc({ source: "input", key: "revenue" }, SUS)).toEqual({ source: "input", key: "revenue" });
  });

  it("does nothing on a flow section or an unknown page", () => {
    const flowId = GHG.pages.find((p) => p.kind === "flow")!.id;
    expect(insertElement(GHG, flowId, rect).doc).toBe(GHG);
    expect(insertElement(GHG, "nope", rect).ids).toEqual([]);
  });
});

describe("drag and drop", () => {
  it("round-trips an element through dataTransfer and drops it at the point, adding the asset once", () => {
    const store = new Map<string, string>();
    const dt = { getData: (t: string) => store.get(t) ?? "", setData: (t: string, v: string) => void store.set(t, v) };
    dt.setData(ELEMENT_DRAG_TYPE, elementDragData({ payload: rect, asset: { id: "a-new", kind: "image", w: 10, h: 10, alt: "x" } }));
    const drag = readElementDrag(dt)!;
    expect(drag.payload.type).toBe("shape");
    const { doc } = dropElement(GHG, "p-summary", drag, { x: 50, y: 50 }, ids());
    expect(doc.assets.filter((a) => a.id === "a-new")).toHaveLength(1);
    expect(readElementDrag({ getData: () => "not json" })).toBeNull();
    expect(readElementDrag({ getData: () => "" })).toBeNull();
  });
});

describe("placeAsset", () => {
  const asset: StudioAsset = { id: "up-1", kind: "image", w: 1600, h: 800, alt: "A site", folder: null, url: "/x.png", bytes: 10, mime: "image/png" };
  it("adds an image element with the asset's ratio and the AssetRef once", () => {
    const { doc, ids: added } = placeAsset(GHG, "p-summary", asset, { newId: ids() });
    const el = free(doc, "p-summary").elements.find((e) => e.id === added[0])!;
    expect(el.type).toBe("image");
    expect(el.frame.w / el.frame.h).toBeCloseTo(2, 1);
    expect(doc.assets.filter((a) => a.id === "up-1")).toEqual([{ id: "up-1", kind: "image", w: 1600, h: 800, alt: "A site" }]);
    const twice = placeAsset(doc, "p-summary", asset, { newId: ids() }).doc;
    expect(twice.assets.filter((a) => a.id === "up-1")).toHaveLength(1);
  });
  it("fills the one selected frame instead", () => {
    const { doc, ids: added } = placeAsset(GHG, "p-cover", asset, { selection: ["p-cover.bg"] });
    expect(added).toEqual(["p-cover.bg"]);
    const frame = free(doc, "p-cover").elements.find((e) => e.id === "p-cover.bg")!;
    expect(frame.type === "frame" && frame.props.assetId).toBe("up-1");
    expect(free(doc, "p-cover").elements).toHaveLength(free(GHG, "p-cover").elements.length);
  });
});

const layout: ReportLayout = {
  id: 7,
  companyId: null,
  kind: "ghg",
  format: "a4",
  pageKind: "data_page",
  name: "Scope 1",
  thumbnailUrl: null,
  slug: "ghg-inventory/scope1",
  family: "ghg-inventory",
  role: "scope1",
  sort: 8,
  page: {
    id: "scope1",
    kind: "freeform",
    name: "Scope 1",
    background: {},
    elements: [
      { id: "scope1.heading", type: "text", frame: { x: 18, y: 26, w: 174, h: 14, rotation: 0 }, z: 1, source: "layout", props: { doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Scope 1 at {{company}}, {{period}}" }] }] }, style: "heading", align: "left" } },
      { ...bigNumber, id: "scope1.total", source: "layout", z: 2 },
    ],
  },
};

describe("addLayoutPage", () => {
  it("adds the layout after the current page with fresh ids, its layoutId and the placeholders filled", () => {
    const { doc, pageId } = addLayoutPage(GHG, layout, { afterPageId: "p-cover", vars: { company: "ACME" }, newId: ids() });
    expect(pageId).toBe("p-scope1-1");
    expect(doc.pages[1].id).toBe(pageId);
    const page = free(doc, pageId);
    expect(page.layoutId).toBe("ghg-inventory/scope1");
    expect(page.elements.map((e) => e.id)).toEqual([`${pageId}.heading`, `${pageId}.total`]);
    expect(textOf(page.elements[0])).toContain("Scope 1 at ACME, 2025");
    expect(doc.pages).toHaveLength(GHG.pages.length + 1);
  });
  it("goes last without a current page and never reuses a page id", () => {
    let doc = GHG;
    const gen = ids();
    for (let i = 0; i < 2; i++) doc = addLayoutPage(doc, layout, { newId: gen }).doc;
    expect(new Set(doc.pages.map((p) => p.id)).size).toBe(doc.pages.length);
    expect(free(doc, doc.pages.slice(-1)[0].id).layoutId).toBe("ghg-inventory/scope1");
  });
});

/** A template doc with a cover, a Scope 1 page and a flow section, built like the backend's composeTemplateDoc. */
function template(): ReportTemplateDetail {
  const doc = clone(GHG);
  const cover: FreeformPage = {
    id: "p01-cover",
    kind: "freeform",
    name: "Cover",
    layoutId: "ghg-board/cover",
    background: {},
    elements: [
      { id: "p01-cover.title", type: "text", frame: { x: 18, y: 174, w: 174, h: 32, rotation: 0 }, z: 1, source: "layout", props: { doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "{{company}}" }] }] }, style: "title", align: "left" } },
      { id: "p01-cover.kicker", type: "text", frame: { x: 18, y: 166, w: 174, h: 6, rotation: 0 }, z: 2, source: "layout", props: { doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "New kicker" }] }] }, style: "kicker", align: "left" } },
    ],
  };
  const scope1: FreeformPage = { ...clone(layout.page), id: "p02-scope1", layoutId: "ghg-board/scope1", elements: layout.page.elements.map((e) => ({ ...clone(e), id: e.id.replace("scope1.", "p02-scope1.") })) };
  return {
    id: 3,
    companyId: null,
    kind: "ghg",
    purpose: "report",
    format: "a4",
    name: "Board",
    tags: [],
    version: 2,
    thumbnailUrl: null,
    pageCount: 3,
    slug: "ghg-board-night",
    doc: { ...doc, design: { templateId: "ghg-board-night", templateVersion: 2, theme: { look: "night" } }, pages: [cover, scope1, { id: "p03-glossary", kind: "flow", name: "Glossary", flowType: "glossary", options: {} }] },
  };
}

describe("applyTemplate", () => {
  /** The fixture with layout ids, an edited cover title and a user element on the cover. */
  const current = (): ReportDoc => {
    const doc = clone(GHG);
    const cover = free(doc, "p-cover");
    cover.layoutId = "ghg-inventory/cover";
    cover.notes = "Say hello";
    cover.elements = [
      ...cover.elements.map((e) => (e.id === "p-cover.title" ? ({ ...e, source: "layout" } as Element) : e)),
      { id: "user-star", type: "icon", frame: { x: 10, y: 10, w: 10, h: 10, rotation: 0 }, z: 9, source: "user", props: { name: "lucide:star" } },
    ];
    const s3 = free(doc, "p-scope3");
    s3.layoutId = "ghg-inventory/scope3";
    return doc;
  };

  it("replaces the pages, keeps edited text on pages with the same layout role, and carries user elements", () => {
    const before = current();
    const editedTitle = textOf(free(before, "p-cover").elements.find((e) => e.id === "p-cover.title"));
    const r = applyTemplate(before, template(), { vars: { company: "ACME" }, newId: ids() });
    expect(r.matched).toBe(1);
    const cover = free(r.doc, "p01-cover");
    expect(textOf(cover.elements.find((e) => e.id === "p01-cover.title"))).toBe(editedTitle);
    expect(textOf(cover.elements.find((e) => e.id === "p01-cover.kicker"))).toContain("New kicker");
    expect(cover.elements.find((e) => e.id === "user-star")).toBeTruthy();
    expect(cover.notes).toBe("Say hello");
    // The star plus the fixture's own user element on the cover (its QR code).
    expect(r.keptElements).toBe(2);
    expect(cover.elements.find((e) => e.id === "p-cover.qr")).toBeTruthy();
    expect(textOf(free(r.doc, "p02-scope1").elements[0])).toContain("Scope 1 at ACME, 2025");
    expect(r.doc.design).toMatchObject({ templateId: "ghg-board-night", templateVersion: 2, theme: { look: "night", colors: GHG.design.theme.colors, fonts: GHG.design.theme.fonts } });
    expect(r.doc.meta).toEqual(before.meta);
    expect(r.doc.assets).toEqual(before.assets);
  });

  it("keeps old pages that hold user elements and match nothing, after the template's pages", () => {
    const before = current();
    const s3 = free(before, "p-scope3");
    s3.elements = [...s3.elements, { ...rect, id: "mine", source: "user" }];
    const r = applyTemplate(before, template(), { newId: ids() });
    // p-summary and p-scope3 hold user elements and match no template page; the cover matched.
    expect(r.keptPages).toBe(2);
    expect(r.doc.pages.slice(-2).map((p) => p.id)).toEqual(["p-summary", "p-scope3"]);
    expect(free(r.doc, "p-scope3").elements.find((e) => e.id === "mine")).toBeTruthy();
    expect(r.doc.pages.slice(0, 3).map((p) => p.id)).toEqual(["p01-cover", "p02-scope1", "p03-glossary"]);
    expect(new Set(r.doc.pages.map((p) => p.id)).size).toBe(r.doc.pages.length);
  });

  it("refuses a template of another kind or format", () => {
    expect(() => applyTemplate(GHG, { ...template(), kind: "sustainability" })).toThrow(/sustainability template/);
    expect(() => applyTemplate(GHG, { ...template(), format: "slide_16_9" })).toThrow(/Resize/);
  });
});

describe("fillPlaceholders", () => {
  it("fills known placeholders in nested strings and leaves the rest", () => {
    expect(fillPlaceholders({ a: ["{{company}} {{period}}", { b: "{{unknown}}" }] }, { company: "X", period: "FY 2025" })).toEqual({ a: ["X FY 2025", { b: "{{unknown}}" }] });
  });
});
