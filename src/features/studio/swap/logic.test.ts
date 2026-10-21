// AT-2 · pure helpers for layout ideas and template swaps.
import { describe, expect, it } from "vitest";
import type { Element, FreeformPage, ReportDoc } from "../../../lib/studio/contracts";
import { applyLayoutOption, canon, changedIds, keptInPlace, layoutOptionIssues, pageSummary, swapKeepsContent, swapSummary, swapSummaryText } from "./logic";

const frame = (x: number, y: number, w = 50, h = 20) => ({ x, y, w, h, rotation: 0 });
const text = (id: string, chips = 0): Element =>
  ({
    id,
    type: "text",
    frame: frame(10, 10),
    z: 1,
    props: { doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Total " }, ...Array.from({ length: chips }, () => ({ type: "data", attrs: { metric: "TOTAL", year: 2025 } }))] }] }, style: "body", align: "left" },
  }) as unknown as Element;
const chart = (id: string): Element => ({ id, type: "chart", frame: frame(10, 50), z: 2, props: { kind: "bar", metric: "SCOPE1" } }) as unknown as Element;
const shape = (id: string): Element => ({ id, type: "shape", frame: frame(0, 0, 210, 10), z: 0, props: { shape: "rect", fill: "#000" } }) as unknown as Element;

const page = (elements: Element[]): FreeformPage => ({ id: "p1", kind: "freeform", name: "Scope 1 by source", background: {}, elements });
const docOf = (p: FreeformPage): ReportDoc => ({ kind: "ghg", format: "A4P", design: { templateId: "1", templateVersion: 1, theme: {} }, pages: [p] }) as unknown as ReportDoc;
const move = (p: FreeformPage, id: string, dx: number): FreeformPage => ({ ...p, elements: p.elements.map((e) => (e.id === id ? { ...e, frame: { ...e.frame, x: e.frame.x + dx } } : e)) });

describe("AT-2 swap logic", () => {
  const base = page([text("p1.body", 3), chart("p1.chart"), shape("p1.band")]);

  it("summarises what a page holds", () => {
    expect(pageSummary(base)).toBe("uses the page's own text, 1 chart and 3 data chips");
    expect(pageSummary(page([]))).toBe("uses the page's own elements");
  });

  it("accepts an option that only moves elements and keeps every id", () => {
    const opt = move(base, "p1.chart", 30);
    expect(layoutOptionIssues(base, opt)).toEqual([]);
    expect(changedIds(base, opt)).toEqual(["p1.chart"]);
    expect(keptInPlace(base, opt)).toBe(1);
    const next = applyLayoutOption(docOf(base), opt)!;
    expect(next.pages[0]).toBe(opt);
  });

  it("rejects an option that drops, edits or adds content", () => {
    const dropped = { ...base, elements: base.elements.filter((e) => e.id !== "p1.chart") };
    expect(layoutOptionIssues(base, dropped)).toEqual(["p1.chart is missing"]);
    const edited = { ...base, elements: base.elements.map((e) => (e.id === "p1.body" ? text("p1.body", 2) : e)) };
    expect(layoutOptionIssues(base, edited)).toEqual(["p1.body changed"]);
    const added = { ...base, elements: [...base.elements, text("p1.new")] };
    expect(layoutOptionIssues(base, added)).toEqual(["p1.new is new"]);
    expect(applyLayoutOption(docOf(base), dropped)).toBeNull();
  });

  it("lets old layout decoration go and new decoration come", () => {
    const opt = { ...base, elements: [...base.elements.filter((e) => e.id !== "p1.band"), shape("lay.rule")] };
    expect(layoutOptionIssues(base, opt)).toEqual([]);
  });

  it("refuses to move a locked element", () => {
    const locked = page([{ ...chart("p1.chart"), locked: true } as Element]);
    expect(layoutOptionIssues(locked, move(locked, "p1.chart", 5))).toEqual(["p1.chart is locked"]);
  });

  it("checks a swap keeps text, chips and charts (style may change)", () => {
    const after = docOf({ ...base, elements: base.elements.map((e) => (e.type === "text" ? ({ ...e, frame: frame(20, 20), props: { ...e.props, style: "lead" } } as Element) : e)) });
    expect(swapKeepsContent(docOf(base), after)).toBe(true);
    const lost = docOf({ ...base, elements: [text("p1.body", 2), chart("p1.chart")] });
    expect(swapKeepsContent(docOf(base), lost)).toBe(false);
  });

  it("writes the swap summary", () => {
    const s = swapSummary({
      pages: [
        { pageId: "a", fromLayoutId: "x", toLayoutId: "y", status: "mapped" },
        { pageId: "b", fromLayoutId: null, toLayoutId: null, status: "kept" },
      ],
      unplaced: [{ pageId: "a", elementId: "a.x", reason: "no_slot" }],
    } as never);
    expect(swapSummaryText(s)).toBe("1 page takes the new layouts; 1 page keeps its own. 1 item stays where it was.");
  });

  it("canon ignores key order", () => {
    expect(canon({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(canon({ a: [{ c: 3, d: 2 }], b: 1 }));
  });
});
