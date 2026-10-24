import { describe, expect, it } from "vitest";
import ghgFixture from "../../test/fixtures/studio/ghg-doc.json";
import type { Element, FreeformPage, ReportDoc } from "./contracts";
import {
  addElement,
  addGuide,
  alignElements,
  blankPage,
  chaptersOf,
  copyStyle,
  deletePages,
  distributeElements,
  duplicateElements,
  duplicatePage,
  expandSelection,
  fillFrame,
  groupElements,
  insertPage,
  moveElements,
  moveGuide,
  moveLayer,
  movePages,
  movePagesToChapter,
  pasteStyle,
  removeElements,
  removeGuide,
  renamePage,
  reorderZ,
  resetToLayout,
  setBackground,
  setCrop,
  setLocked,
  setNotes,
  setOpacity,
  setPagesHidden,
  tidyElements,
  ungroupElements,
  updateFrame,
  updateProps,
} from "./docOps";
import { gapsAlong } from "./geometry";

const fresh = () => JSON.parse(JSON.stringify(ghgFixture)) as ReportDoc;
const pg = (d: ReportDoc, id: string) => d.pages.find((p) => p.id === id) as FreeformPage;
const elOf = (d: ReportDoc, pageId: string, id: string) => pg(d, pageId).elements.find((e) => e.id === id) as Element;
const counter = () => {
  let n = 0;
  return (p = "el") => `${p}-${++n}`;
};
const deepFreeze = <T,>(o: T): T => {
  if (o && typeof o === "object") {
    Object.freeze(o);
    Object.values(o as object).forEach(deepFreeze);
  }
  return o;
};
const RECT: Element = { id: "tpl", type: "shape", frame: { x: 0, y: 0, w: 40, h: 30, rotation: 0 }, z: 0, source: "user", props: { shape: "rect", fill: "#0f5132" } };

describe("docOps", () => {
  it("never mutates its input and keeps untouched pages by identity", () => {
    const d = deepFreeze(fresh());
    const n = updateFrame(d, "p-scope3", "p-scope3.cat4", { x: 30 });
    expect(n).not.toBe(d);
    expect(n.pages[0]).toBe(d.pages[0]);
    expect(elOf(n, "p-scope3", "p-scope3.table")).toBe(elOf(d, "p-scope3", "p-scope3.table"));
    expect(elOf(n, "p-scope3", "p-scope3.cat4").frame.x).toBe(30);
    // A no-op returns the same doc.
    expect(updateFrame(n, "p-scope3", "p-scope3.cat4", { x: 30 })).toBe(n);
  });

  it("adds an element at the centre or at a drop point, on top, inside the page", () => {
    const d = fresh();
    const { doc, id } = addElement(d, "p-scope3", RECT, { newId: counter() });
    const el = elOf(doc, "p-scope3", id);
    expect(el.frame).toEqual({ x: 85, y: 133.5, w: 40, h: 30, rotation: 0 });
    expect(el.z).toBe(Math.max(...pg(d, "p-scope3").elements.map((e) => e.z)) + 1);
    const dropped = addElement(d, "p-scope3", RECT, { at: { x: 205, y: 5 }, id: "x" });
    expect(elOf(dropped.doc, "p-scope3", "x").frame).toMatchObject({ x: 170, y: 0 });
    expect(addElement(d, "p-categories", RECT).doc).toBe(d); // flow sections take no elements
  });

  it("moves, but never a locked element", () => {
    let d = setLocked(fresh(), "p-scope3", ["p-scope3.cat4"], true);
    d = moveElements(d, "p-scope3", ["p-scope3.cat4", "p-scope3.table"], 5, 5);
    expect(elOf(d, "p-scope3", "p-scope3.cat4").frame.x).toBe(20);
    expect(elOf(d, "p-scope3", "p-scope3.table").frame.x).toBe(25);
  });

  it("updates props, opacity, deletes and duplicates", () => {
    let d = updateProps(fresh(), "p-scope3", ["p-scope3.table"], "table", { style: "zebra" });
    expect((elOf(d, "p-scope3", "p-scope3.table").props as { style: string }).style).toBe("zebra");
    d = setOpacity(d, "p-scope3", ["p-scope3.table"], 0.5);
    expect(elOf(d, "p-scope3", "p-scope3.table").opacity).toBe(0.5);
    expect("opacity" in elOf(setOpacity(d, "p-scope3", ["p-scope3.table"], 1), "p-scope3", "p-scope3.table")).toBe(false);
    const dup = duplicateElements(d, "p-scope3", ["p-scope3.table"], { newId: counter() });
    expect(dup.ids).toEqual(["el-1"]);
    expect(elOf(dup.doc, "p-scope3", "el-1").frame.x).toBe(25);
    const gone = removeElements(dup.doc, "p-scope3", ["el-1"]);
    expect(pg(gone, "p-scope3").elements).toHaveLength(pg(d, "p-scope3").elements.length);
  });

  it("groups: a click selects the group, double-click enters it; ungroup", () => {
    const ids = counter();
    const { doc, groupId } = groupElements(fresh(), "p-scope3", ["p-scope3.cat4", "p-scope3.consolidation"], { newId: ids });
    expect(groupId).toBe("grp-1");
    expect(expandSelection(pg(doc, "p-scope3"), ["p-scope3.cat4"])).toEqual(["p-scope3.cat4", "p-scope3.consolidation"]);
    expect(expandSelection(pg(doc, "p-scope3"), ["p-scope3.cat4"], { enteredGroup: "grp-1" })).toEqual(["p-scope3.cat4"]);
    const dup = duplicateElements(doc, "p-scope3", ["p-scope3.cat4", "p-scope3.consolidation"], { newId: ids });
    const copies = dup.ids.map((id) => elOf(dup.doc, "p-scope3", id));
    expect(new Set(copies.map((c) => c.groupId)).size).toBe(1);
    expect(copies[0].groupId).not.toBe("grp-1");
    const un = ungroupElements(doc, "p-scope3", ["p-scope3.cat4"]);
    expect(elOf(un, "p-scope3", "p-scope3.consolidation").groupId).toBeUndefined();
  });

  it("template-locked elements are selectable only from Layers and can't be deleted", () => {
    const d = fresh();
    (pg(d, "p-scope3").elements[0] as Element).templateLocked = true;
    expect(expandSelection(pg(d, "p-scope3"), ["p-scope3.bars"])).toEqual([]);
    expect(expandSelection(pg(d, "p-scope3"), ["p-scope3.bars"], { fromLayers: true })).toEqual(["p-scope3.bars"]);
    expect(removeElements(d, "p-scope3", ["p-scope3.bars"])).toBe(d);
  });

  it("reorders layers: forward, back, to front, and drag in Layers", () => {
    const d = fresh();
    const top = (x: ReportDoc) => [...pg(x, "p-scope3").elements].sort((a, b) => b.z - a.z).map((e) => e.id);
    const f = reorderZ(d, "p-scope3", ["p-scope3.bars"], "front");
    expect(top(f)[0]).toBe("p-scope3.bars");
    expect(pg(f, "p-scope3").elements.map((e) => e.z)).toEqual([0, 1, 2, 3, 4, 5]);
    const b = reorderZ(f, "p-scope3", ["p-scope3.bars"], "backward");
    expect(top(b)[1]).toBe("p-scope3.bars");
    const back = reorderZ(d, "p-scope3", ["p-scope3.table"], "back");
    expect(top(back)[5]).toBe("p-scope3.table");
    const moved = moveLayer(d, "p-scope3", "p-scope3.photos", 0);
    expect(top(moved)[0]).toBe("p-scope3.photos");
  });

  it("aligns to the page (one element) and to the selection", () => {
    const one = alignElements(fresh(), "p-scope3", ["p-scope3.cat4"], "center", "page");
    expect(elOf(one, "p-scope3", "p-scope3.cat4").frame.x).toBe(75);
    const two = alignElements(fresh(), "p-scope3", ["p-scope3.cat4", "p-scope3.consolidation"], "right");
    expect(elOf(two, "p-scope3", "p-scope3.cat4").frame.x).toBe(130);
  });

  it("tidy up three tiles and distribute", () => {
    let d = fresh();
    for (const [i, x] of [20, 70, 130].entries()) d = addElement(d, "p-scope3", RECT, { id: `t${i}`, at: { x: x + 20, y: 150 + i } }).doc;
    const t = tidyElements(d, "p-scope3", ["t0", "t1", "t2"]);
    const frames = ["t0", "t1", "t2"].map((id) => elOf(t, "p-scope3", id).frame);
    const gaps = gapsAlong(frames, "x");
    expect(gaps[0]).toBe(gaps[1]);
    expect(new Set(frames.map((f) => f.y)).size).toBe(1);
    const dist = distributeElements(d, "p-scope3", ["t0", "t1", "t2"], "x");
    const g2 = gapsAlong(["t0", "t1", "t2"].map((id) => elOf(dist, "p-scope3", id).frame), "x");
    expect(g2[0]).toBe(g2[1]);
  });

  it("copy style and paste style (same type: all style props; other types: the colour)", () => {
    let d = addElement(fresh(), "p-scope3", RECT, { id: "r1" }).doc;
    d = addElement(d, "p-scope3", { ...RECT, props: { shape: "ellipse", fill: "#111111", stroke: "#222222" } }, { id: "r2" }).doc;
    d = setOpacity(d, "p-scope3", ["r1"], 0.4);
    const clip = copyStyle(elOf(d, "p-scope3", "r1"));
    const pasted = pasteStyle(d, "p-scope3", ["r2", "p-scope3.consolidation"], clip);
    const r2 = elOf(pasted, "p-scope3", "r2");
    expect(r2.props).toMatchObject({ shape: "ellipse", fill: "#0f5132" });
    expect((r2.props as { stroke?: string }).stroke).toBeUndefined();
    expect(r2.opacity).toBe(0.4);
    expect((elOf(pasted, "p-scope3", "p-scope3.consolidation").props as { color?: string }).color).toBe("#0f5132");
  });

  it("drops an image on a frame (cover crop) and crops it", () => {
    let d = addElement(fresh(), "p-scope3", { id: "f", type: "frame", frame: { x: 0, y: 0, w: 40, h: 40, rotation: 0 }, z: 0, source: "user", props: { mask: "circle", fit: "cover", alt: "" } }, { id: "f1" }).doc;
    d = fillFrame(d, "p-scope3", "f1", { id: "a-plant", w: 2400, h: 1600, alt: "The plant" });
    const f = elOf(d, "p-scope3", "f1");
    expect(f.props).toMatchObject({ assetId: "a-plant", alt: "The plant", crop: { x: -10, y: 0, w: 60, h: 40 } });
    expect(d.assets.some((a) => a.id === "a-plant")).toBe(true);
    d = setCrop(d, "p-scope3", "f1", { x: -20, y: 0, w: 60, h: 40 });
    expect((elOf(d, "p-scope3", "f1").props as { crop: { x: number } }).crop.x).toBe(-20);
    // Grid: the first empty cell, or the one given.
    const g = fillFrame(d, "p-scope3", "p-scope3.photos", { id: "a-plant", w: 2400, h: 1600 }, 1);
    expect((elOf(g, "p-scope3", "p-scope3.photos").props as { cells: { assetId?: string }[] }).cells[1].assetId).toBe("a-plant");
  });

  it("page ops: insert, duplicate, hide, delete (never the last), move, rename, notes, background", () => {
    let d = insertPage(fresh(), blankPage("pg-new"), 1);
    expect(d.pages[1].id).toBe("pg-new");
    const dup = duplicatePage(d, "p-scope3", { newId: counter() });
    expect(dup.doc.pages[dup.doc.pages.findIndex((p) => p.id === "p-scope3") + 1].id).toBe("pg-1");
    expect(pg(dup.doc, "pg-1").elements[0].id).toBe("pg-1.bars");
    expect(pg(dup.doc, "pg-1").name).toBe("Scope 3 (copy)");
    d = setPagesHidden(d, ["pg-new"], true);
    expect(d.pages[1].hidden).toBe(true);
    expect("hidden" in setPagesHidden(d, ["pg-new"], false).pages[1]).toBe(false);
    d = movePages(d, ["p-factors", "pg-new"], 0);
    expect(d.pages.slice(0, 2).map((p) => p.id)).toEqual(["pg-new", "p-factors"]);
    d = renamePage(d, "pg-new", "  Intro ");
    expect(d.pages[0].name).toBe("Intro");
    expect(renamePage(d, "pg-new", "   ")).toBe(d);
    d = setNotes(d, "pg-new", "Say hello");
    expect((d.pages[0] as FreeformPage).notes).toBe("Say hello");
    d = setBackground(d, "pg-new", { color: "#ffeecc" });
    expect((d.pages[0] as FreeformPage).background.color).toBe("#ffeecc");
    const one = { ...d, pages: [d.pages[0]] };
    expect(deletePages(one, ["pg-new"])).toBe(one);
    expect(deletePages(d, ["pg-new"]).pages).toHaveLength(d.pages.length - 1);
  });

  it("reset to layout keeps the page's id, name and guides", () => {
    let d = addGuide(fresh(), "p-scope3", "y", 50);
    const layout: FreeformPage = { id: "L", kind: "freeform", name: "Layout", background: { color: "#000000" }, elements: [{ ...RECT, id: "L.box" }] };
    d = resetToLayout(d, "p-scope3", layout, "lay-9");
    const p = pg(d, "p-scope3");
    expect(p.elements.map((e) => e.id)).toEqual(["p-scope3.box"]);
    expect(p.name).toBe("Scope 3");
    expect(p.layoutId).toBe("lay-9");
    expect(p.guides).toEqual([{ axis: "y", mm: 50 }]);
  });

  it("ruler guides: add, move, remove", () => {
    let d = addGuide(fresh(), "p-scope3", "x", 105.04);
    expect(pg(d, "p-scope3").guides).toEqual([{ axis: "x", mm: 105 }]);
    d = moveGuide(d, "p-scope3", 0, 120);
    expect(pg(d, "p-scope3").guides?.[0].mm).toBe(120);
    d = removeGuide(d, "p-scope3", 0);
    expect(pg(d, "p-scope3").guides).toBeUndefined();
  });

  it("chapters from bookmarks; move pages to a chapter", () => {
    const d = fresh();
    expect(chaptersOf(d)).toEqual([{ id: null, name: "All pages", pageIds: d.pages.map((p) => p.id) }]);
    const b = { ...d, pages: d.pages.map((p) => (p.id === "p-scope3" ? { ...p, bookmark: "Results" } : p)) };
    const ch = chaptersOf(b);
    expect(ch.map((c) => c.name)).toEqual(["Opening", "Results"]);
    const moved = movePagesToChapter(b, ["p-cover"], ch[1]);
    expect(moved.pages[moved.pages.length - 1].id).toBe("p-cover");
  });
});
