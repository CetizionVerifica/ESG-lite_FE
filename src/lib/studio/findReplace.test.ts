import { describe, expect, it } from "vitest";
import type { Element, FindQuery, ReportDoc, TextDoc } from "./contracts";
import { applyFindReplace, findInDoc, findPattern, pagesWithMatches, replaceBlocked } from "./findReplace";

const chip = { type: "data", attrs: { binding: { source: "ghg", metric: "scope1", years: { last: 1 }, sites: "all" }, measure: "value" } };
const para = (...content: unknown[]) => ({ type: "paragraph", content });
const t = (text: string, marks?: unknown[]) => ({ type: "text", text, ...(marks ? { marks } : {}) });
const tdoc = (...blocks: unknown[]) => ({ type: "doc", content: blocks }) as unknown as TextDoc;
const box = (id: string, doc: TextDoc, extra: Partial<Element> = {}, y = 10): Element =>
  ({ id, type: "text", frame: { x: 10, y, w: 100, h: 20, rotation: 0 }, z: 1, source: "user", props: { style: "body", align: "left", doc }, ...extra }) as unknown as Element;

const report = (): ReportDoc =>
  ({
    v: 2,
    kind: "ghg",
    format: "a4",
    meta: { title: "R", year: 2025, yearType: "CY", sites: "all", frameworks: [] },
    design: { theme: {} },
    assets: [],
    pages: [
      {
        id: "p1",
        kind: "freeform",
        name: "One",
        background: {},
        elements: [
          box("b2", tdoc(para(t("Net zero by 2040. Our net impact."))), {}, 50),
          box("b1", tdoc(para(t("We report "), chip, t(" for net emissions"))), {}, 10),
          box("lock", tdoc(para(t("net locked"))), { locked: true }, 80),
          box("tpl", tdoc(para(t("net template"))), { templateLocked: true }, 90),
          { id: "s", type: "shape", frame: { x: 0, y: 0, w: 5, h: 5, rotation: 0 }, z: 0, source: "user", props: { shape: "rect" } } as unknown as Element,
        ],
      },
      { id: "p2", kind: "freeform", name: "Hidden", hidden: true, background: {}, elements: [box("h", tdoc(para(t("net hidden"))))] },
      { id: "f1", kind: "flow", name: "Method", flowType: "narrative", options: {}, content: tdoc(para(t("Net"), t(" zero", [{ type: "bold" }]), t(" path"))) },
    ],
  }) as unknown as ReportDoc;

const q = (find: string, extra: Partial<FindQuery> = {}): FindQuery => ({ find, matchCase: false, wholeWords: false, scope: "doc", ...extra });

describe("find and replace (PE-2)", () => {
  it("finds in text boxes (reading order) and flow sections, never in chips, and counts locked and hidden matches as skipped", () => {
    const r = findInDoc(report(), q("net"));
    expect(r.matches.map((m) => [m.pageId, m.elementId])).toEqual([
      ["p1", "b1"],
      ["p1", "b2"],
      ["p1", "b2"],
      ["f1", null],
    ]);
    expect(r.skipped).toBe(3); // locked, template-locked, hidden page
    expect(pagesWithMatches(r)).toBe(2);
    expect(r.matches[1].excerpt).toContain("Net zero by 2040");
  });

  it("match case and whole words", () => {
    expect(findInDoc(report(), q("Net", { matchCase: true })).matches).toHaveLength(2);
    expect(findInDoc(report(), q("ne", { wholeWords: true })).matches).toHaveLength(0);
    expect(findInDoc(report(), q("net", { wholeWords: true })).matches).toHaveLength(4);
    expect(findPattern(q("a.b"))!.test("axb")).toBe(false);
    expect(findPattern(q(""))).toBeNull();
  });

  it("replace all is one new doc: chips, locked boxes and hidden pages stay untouched", () => {
    const before = report();
    const { doc, replaced } = applyFindReplace(before, { type: "find_replace", query: q("net"), replace: "gross" });
    expect(replaced).toBe(4);
    const p1 = doc.pages[0] as Extract<ReportDoc["pages"][number], { kind: "freeform" }>;
    const text = (id: string) => JSON.stringify((p1.elements.find((e) => e.id === id) as { props: { doc: TextDoc } }).props.doc);
    expect(text("b2")).toContain("gross zero by 2040. Our gross impact.");
    expect(text("b1")).toContain('"type":"data"');
    expect(text("b1")).toContain(" for gross emissions");
    expect(text("lock")).toContain("net locked");
    expect(text("tpl")).toContain("net template");
    expect(JSON.stringify(doc.pages[1])).toContain("net hidden");
    expect(p1.elements.find((e) => e.id === "s")).toBe((before.pages[0] as { elements: Element[] }).elements[4]);
    // The chip node is the very same object (never rewritten).
    const chipBefore = ((before.pages[0] as { elements: Element[] }).elements[1] as unknown as { props: { doc: { content: { content: unknown[] }[] } } }).props.doc.content[0].content[1];
    const chipAfter = (p1.elements.find((e) => e.id === "b1") as unknown as { props: { doc: { content: { content: unknown[] }[] } } }).props.doc.content[0].content[1];
    expect(chipAfter).toEqual(chipBefore);
  });

  it("a phrase across formatting matches and keeps the first node's marks", () => {
    const { doc } = applyFindReplace(report(), { type: "find_replace", query: q("net zero path"), replace: "route to net zero" });
    const flow = doc.pages[2] as { content: TextDoc };
    expect(flow.content.content[0].content).toEqual([{ type: "text", text: "route to net zero" }]);
  });

  it("replaces only the chosen matches, and several in one text node", () => {
    const r = findInDoc(report(), q("net"));
    const { doc, replaced } = applyFindReplace(report(), { type: "find_replace", query: q("net"), replace: "N", matchIds: [r.matches[2].id] });
    expect(replaced).toBe(1);
    expect(JSON.stringify(doc.pages[0])).toContain("Net zero by 2040. Our N impact.");
    const both = applyFindReplace(report(), { type: "find_replace", query: q("net"), replace: "N", matchIds: [r.matches[1].id, r.matches[2].id] }).doc;
    expect(JSON.stringify(both.pages[0])).toContain("N zero by 2040. Our N impact.");
  });

  it("never types or changes a number: digits in the search or the replacement are refused", () => {
    expect(replaceBlocked("2040", "2045")).toMatch(/data value/);
    expect(replaceBlocked("net", "net 2")).toMatch(/data value/);
    expect(replaceBlocked("net", "gross")).toBeNull();
    const before = report();
    const out = applyFindReplace(before, { type: "find_replace", query: q("2040"), replace: "soon" });
    expect(out.replaced).toBe(0);
    expect(out.doc).toBe(before);
  });

  it("page scope", () => {
    expect(findInDoc(report(), q("net", { scope: "page", pageId: "f1" })).matches).toHaveLength(1);
  });
});
