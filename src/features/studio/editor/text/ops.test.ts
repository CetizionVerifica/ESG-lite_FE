// DS-7 · pure text and flow ops, the chip hover card words, picker items and
// overflow lines.
import { describe, expect, it } from "vitest";
import type { DataGroup, DataToken, Element, FlowSection, FreeformPage, ReportDoc, TextDoc } from "../../../../lib/studio/contracts";
import { chipCard, withMeasure } from "./chipData";
import { linesOver } from "./overflow";
import { footnoteBaseOf, growBox, hasMarkAll, markAll, markReviewed, setElementText, setFlowContent, setFlowOptions, shrinkText, splitText, toggleCategory } from "./ops";
import { chipFor, pickerItems } from "./picker";
import { presetFigure, textPresets } from "./presets";

const para = (text: string, note?: string) => ({ type: "paragraph" as const, content: [{ type: "text" as const, text, ...(note ? { marks: [{ type: "footnote" as const, attrs: { note } }] } : {}) }] });
const tdoc = (...content: ReturnType<typeof para>[]): TextDoc => ({ type: "doc", content });
const textEl = (id: string, y: number, doc: TextDoc, extra: Partial<Element> = {}): Element => ({ id, type: "text", frame: { x: 20, y, w: 100, h: 20, rotation: 0 }, z: 1, source: "user", props: { style: "body", align: "left", doc }, ...extra }) as Element;
const docOf = (elements: Element[], flow?: FlowSection): ReportDoc =>
  ({
    schemaVersion: 2,
    kind: "ghg",
    purpose: "report",
    format: "a4",
    meta: { title: "T", year: 2025, yearType: "FY", sites: "all", frameworks: ["GHGP"], language: "en" },
    design: { templateId: "t", templateVersion: 1, theme: {} },
    pages: [{ id: "p", kind: "freeform", name: "P", background: {}, elements } as FreeformPage, ...(flow ? [flow] : [])],
    assets: [],
  }) as ReportDoc;
const els = (d: ReportDoc) => (d.pages[0] as FreeformPage).elements;

describe("text ops", () => {
  it("setElementText changes only that element; human edits mark AI text reviewed", () => {
    const a = textEl("a", 10, tdoc(para("A")), { source: "ai" });
    const b = textEl("b", 40, tdoc(para("B")));
    const d = docOf([a, b]);
    const n = setElementText(d, "p", "a", tdoc(para("A2")));
    expect(els(n)[1]).toBe(b);
    expect(els(n)[0]).toMatchObject({ reviewed: true, props: { doc: tdoc(para("A2")) } });
    expect(markReviewed(docOf([textEl("c", 0, tdoc(para("c")), { source: "ai" })]), "p", ["c"]).pages[0]).toMatchObject({ elements: [{ reviewed: true }] });
  });

  it("markAll adds and removes a mark on every text node", () => {
    const d = tdoc(para("one"), para("two"));
    const bold = markAll(d, { type: "bold" }, true);
    expect(hasMarkAll(bold, "bold")).toBe(true);
    expect(hasMarkAll(markAll(bold, { type: "bold" }, false), "bold")).toBe(false);
    expect(markAll(bold, { type: "bold" }, false)).toEqual(d);
    expect(hasMarkAll(markAll(d, { type: "footnote", attrs: { note: "n" } }, true), "footnote")).toBe(true);
  });

  it("footnoteBaseOf counts footnotes of the elements above (reading order)", () => {
    const p = { id: "p", kind: "freeform", name: "P", background: {}, elements: [textEl("low", 100, tdoc(para("x", "n3"))), textEl("top", 10, tdoc(para("a", "n1"), para("b", "n2"))), textEl("mid", 50, tdoc(para("plain")))] } as FreeformPage;
    expect(footnoteBaseOf(p, "top")).toBe(1);
    expect(footnoteBaseOf(p, "mid")).toBe(3);
    expect(footnoteBaseOf(p, "low")).toBe(3);
  });

  it("overflow fixes: shrink one style step, grow to the limit, split the rest below", () => {
    const d = docOf([textEl("t", 200, tdoc(para("1"), para("2"), para("3")))]);
    expect((els(shrinkText(d, "p", "t"))[0] as Extract<Element, { type: "text" }>).props.style).toBe("caption");
    const caption = shrinkText(d, "p", "t");
    expect(shrinkText(caption, "p", "t")).toBe(caption);
    expect(els(growBox(d, "p", "t", 10, 287))[0].frame.h).toBe(30);
    expect(els(growBox(d, "p", "t", 200, 287))[0].frame.h).toBe(87);
    const full = docOf([textEl("t", 267, tdoc(para("x")))]);
    expect(growBox(full, "p", "t", 5, 287), "no room below: unchanged").toBe(full);
    const r = splitText(d, "p", "t", 1, "t2", { hMm: 297, safeMm: 10 });
    expect(r.id).toBe("t2");
    const [keep, rest] = els(r.doc) as Extract<Element, { type: "text" }>[];
    expect(keep.props.doc.content).toHaveLength(1);
    expect(rest.props.doc.content.map((c) => (c as { content: { text: string }[] }).content[0].text)).toEqual(["2", "3"]);
    expect(rest.frame.y).toBe(224);
    expect(rest.z).toBeGreaterThan(keep.z);
    expect(splitText(d, "p", "t", 0, "x", { hMm: 297, safeMm: 10 }).id).toBeNull();
  });
});

describe("flow ops", () => {
  const s3: FlowSection = { id: "s3", kind: "flow", name: "Scope 3", flowType: "scope3_categories", options: {} };
  it("toggles categories (all 15 is the default), sets and clears options and text", () => {
    expect(toggleCategory(s3, 4)).toEqual([1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(toggleCategory({ ...s3, options: { categories: [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] } }, 4)).toBeUndefined();
    const d = docOf([], s3);
    const n = setFlowOptions(d, "s3", { showDq: false, categories: [1] });
    expect(n.pages[1]).toMatchObject({ options: { showDq: false, categories: [1] } });
    expect(setFlowOptions(n, "s3", { showDq: undefined }).pages[1]).toEqual({ ...s3, options: { categories: [1] } });
    expect(setFlowOptions(d, "s3", {})).toBe(d);
    expect(setFlowContent(d, "s3", tdoc(para("x"))).pages[1]).toMatchObject({ content: tdoc(para("x")) });
  });
});

describe("chips", () => {
  const ghg: DataToken["attrs"] = { binding: { source: "ghg", metric: "scope1", years: { last: 1 }, sites: "all" }, measure: "value" };
  const kpi: DataToken["attrs"] = { binding: { source: "kpi", kpis: ["ENERGY_TOTAL"], years: { last: 1 }, sites: [1] }, measure: "value" };
  const scope = { kind: "ghg" as const, year: 2025, yearType: "FY" as const, sites: "all" as const };

  it("the hover card shows source, period, sites, approval, and approved entries (GHG) or evidence (KPI)", () => {
    const c = chipCard(ghg, { display: "12,480.000", value: 12480, unit: "tCO₂e", approvedAt: "2026-04-12T08:00:00.000Z", approvedEntries: 318 }, scope);
    expect(c).toEqual({
      title: "Scope 1",
      value: "12,480.000 tCO₂e", // #209: the server's display, tCO₂e with 3 decimals
      lines: ["Source: approved emission entries", "Period: FY 2025", "Sites: All sites", "Linked to approved data · 12 Apr 2026", "Approved entries: 318"],
    });
    const k = chipCard(kpi, { display: "4,100", value: 4100, unit: "GJ", approvedAt: null, evidenceCount: 2 }, { ...scope, kind: "sustainability", yearType: "CY" }, "Total energy");
    expect(k.lines).toEqual(["Source: approved KPI values", "Period: CY 2025", "Sites: 1 site", "No approved data yet", "Evidence files: 2"]);
    expect(chipCard({ ...ghg, binding: { ...ghg.binding, metric: "scope2_market" } as DataToken["attrs"]["binding"] }, { display: "Not reported", value: null, unit: "tCO₂e", unavailable: { reason: "NOT_RECORDED" } }, scope).value).toBe("Not reported");
  });

  it("a change measure compares with the prior year; back to value drops the comparison", () => {
    const pct = withMeasure(ghg, "change_pct");
    expect(pct).toEqual({ ...ghg, measure: "change_pct", binding: { ...ghg.binding, compare: "prior" } });
    expect(withMeasure(pct, "value")).toEqual(ghg);
  });

  it("the picker keeps single values only; chipFor makes a value chip", () => {
    const groups: DataGroup[] = [
      {
        id: "scopes",
        label: "Scopes",
        items: [
          { id: "scope1", label: "Scope 1", binding: ghg.binding as never, resolved: { display: "1", value: 1, unit: null } },
          { id: "by_site", label: "Total by site", binding: { source: "ghg", metric: "total", years: { last: 1 }, sites: "all", breakdown: "site" }, resolved: { display: "", value: null, unit: null } },
        ],
      },
    ];
    expect(pickerItems(groups, "").map((p) => p.item.id)).toEqual(["scope1"]);
    expect(pickerItems(groups, "nothing")).toEqual([]);
    expect(chipFor(groups[0].items[0])).toEqual({ binding: ghg.binding, measure: "value" });
    expect(presetFigure(groups[0].items)?.id).toBe("scope1");
    expect(textPresets(null).map((p) => p.payload.elements.length)).toEqual([2, 2, 2, 4]);
    expect(JSON.stringify(textPresets(groups[0].items[0])[1].payload)).toContain('"type":"data"');
  });

  it("overflow lines follow the style's line height", () => {
    // body: 10 pt × 1.45 ≈ 5.1 mm a line on A4
    expect(linesOver(5, "body", "a4")).toBe(1);
    expect(linesOver(11, "body", "a4")).toBe(3);
    expect(linesOver(11, "body", "slide_16_9")).toBe(2);
  });
});
