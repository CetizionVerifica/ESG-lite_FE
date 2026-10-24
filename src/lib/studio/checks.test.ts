// DS-12 · the checks panel's pure side: groups and words, the final's reason,
// page labels, fix labels and links, and the fixes as doc edits (a typed
// number becomes a chip at the server's offsets; a frame moves inside the
// margin; the add-fixes' elements; exclusions).
import { describe, expect, it } from "vitest";
import type { Check, DataToken, Element, ReportDoc, TextDoc } from "./contracts";
import {
  applyReplaceWithToken,
  checkLink,
  counterLabel,
  countsLine,
  exclusionWhat,
  factorSection,
  factorSectionIndex,
  finalBlock,
  findExclusion,
  fixElement,
  fixLabel,
  groupChecks,
  moveInside,
  pageLabel,
  plainText,
  replaceTypedNumber,
  targetPage,
  warningIds,
  withExclusion,
} from "./checks";

const c = (id: Check["id"], severity: Check["severity"], extra: Partial<Check> = {}): Check => ({ id, severity, message: `${id} message`, ...extra });
const chip: DataToken = { type: "data", attrs: { binding: { source: "ghg", metric: "scope1", years: { last: 1 }, sites: "all" }, measure: "value" } } as DataToken;
const doc = (pages: ReportDoc["pages"]): ReportDoc =>
  ({ schemaVersion: 2, kind: "ghg", purpose: "report", format: "a4", meta: { title: "T", year: 2025, yearType: "CY", sites: "all", frameworks: ["GHGP"], language: "en" }, design: { templateId: "t", templateVersion: 1, theme: {} }, pages, assets: [] }) as ReportDoc;
const textEl = (id: string, text: TextDoc, frame = { x: 20, y: 20, w: 60, h: 20, rotation: 0 }): Element => ({ id, type: "text", frame, z: 1, source: "user", props: { doc: text, style: "body", align: "left" } }) as Element;

describe("groups and words", () => {
  const list = [c("TEXT_OVERFLOW", "error"), c("SCOPE2_MARKET_MISSING", "warning"), c("UNLINKED_DATA", "info"), c("MISSING_ALT", "warning"), c("UNLINKED_DATA", "info")];
  it("groups Must fix / Review / For info and counts them", () => {
    const g = groupChecks(list);
    expect([g.must.length, g.review.length, g.info.length]).toEqual([1, 2, 2]);
    expect(countsLine(list)).toBe("1 must fix · 2 to review · 2 for info");
    expect(countsLine([])).toBe("Nothing to fix");
  });
  it("the counter counts errors and warnings, not info", () => {
    expect(counterLabel(list)).toBe("3 checks");
    expect(counterLabel([c("MISSING_ALT", "warning")])).toBe("1 check");
    expect(counterLabel([c("UNLINKED_DATA", "info")])).toBe("No checks");
    expect(counterLabel(undefined)).toBe("Checks");
  });
  it("the final's reason: role, then pending entries in 05-ux words, then the error count", () => {
    expect(finalBlock(list, { canFinal: false })).toBe("Only a Manager can make the final.");
    expect(finalBlock(list, { canFinal: true })).toBe("Fix 1 check to generate the final.");
    const pending = c("GHG_PENDING_ENTRIES", "error", { message: "Pending entries: 4. Approve them in Review before the final." });
    expect(finalBlock([pending], { canFinal: true })).toBe("Pending entries: 4. Approve them in Review before the final.");
    expect(finalBlock([pending, c("CONSOLIDATION_MISSING", "error")], { canFinal: true })).toBe("Fix 2 checks to generate the final.");
    expect(finalBlock([c("MISSING_ALT", "warning")], { canFinal: true })).toBeNull();
    expect(warningIds(list)).toEqual(["SCOPE2_MARKET_MISSING", "MISSING_ALT"]);
  });
  it("page labels count printed pages only", () => {
    const d = doc([
      { id: "a", kind: "freeform", name: "A", background: {}, elements: [] },
      { id: "h", kind: "freeform", name: "H", background: {}, elements: [], hidden: true },
      { id: "f", kind: "flow", name: "F", flowType: "toc", options: {} },
    ] as ReportDoc["pages"]);
    expect(pageLabel(d, "f")).toBe("page 2");
    expect(pageLabel(d, "h")).toBeNull();
    expect(pageLabel(d, undefined)).toBeNull();
  });
  it("fix labels, with links named by where they go", () => {
    expect(fixLabel(c("SCOPE3_CATEGORY_UNADDRESSED", "error", { fix: "mark_excluded" }))).toBe("Mark as excluded…");
    expect(fixLabel(c("GHG_PENDING_ENTRIES", "error", { fix: "open_pending" }))).toBe("Open Review");
    expect(fixLabel(c("GHG_SITES_MISSING", "warning", { fix: "open_link", details: { link: "/data/ledger?site=2" } }))).toBe("Open site data");
    expect(fixLabel(c("GAS_BREAKDOWN_MISSING", "warning", { fix: "add_gas_chart" }))).toBe("Add per-gas chart");
    expect(fixLabel(c("SCOPE2_MARKET_MISSING", "warning", { fix: "add_market_note" }))).toBe("Add market-based note");
    expect(fixLabel(c("UNLINKED_DATA", "info"))).toBeNull();
    expect(checkLink(c("GHG_SITES_MISSING", "warning", { details: { link: "https://evil.example" } }))).toBeNull();
  });
});

describe("replace a typed number with a chip", () => {
  const text: TextDoc = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Summary" }] },
      { type: "paragraph", content: [{ type: "text", text: "Up " }, chip as never, { type: "text", text: " to 3,400 tCO₂e", marks: [{ type: "bold" }] }, { type: "hardBreak" }, { type: "text", text: "done." }] },
    ],
  } as TextDoc;
  // Paragraph 1 (the heading is 0): "Up " + chip + " to 3,400 tCO₂e" → the number is [8, 19).
  it("cuts the number out at the server's offsets, keeps the marks of the rest", () => {
    const next = replaceTypedNumber(text, 1, 8, 19, chip, "3,400 tCO₂e")!;
    const p = next.content[1].content!;
    expect(p.map((n) => n.type)).toEqual(["text", "data", "text", "data", "hardBreak", "text"]);
    expect((p[2] as { text: string; marks: unknown[] }).text).toBe(" to ");
    expect((p[2] as { marks: unknown[] }).marks).toEqual([{ type: "bold" }]);
    expect(next.content[0]).toBe(text.content[0]);
  });
  it("refuses when the text there isn't what was checked", () => {
    expect(replaceTypedNumber(text, 1, 8, 19, chip, "3,500 tCO₂e")).toBeNull();
    expect(replaceTypedNumber(text, 5, 0, 2, chip)).toBeNull();
  });
  it("applies a NUMBER_MISMATCH check to the doc", () => {
    const d = doc([{ id: "p", kind: "freeform", name: "P", background: {}, elements: [textEl("p.t", text)] }] as ReportDoc["pages"]);
    const check = c("NUMBER_MISMATCH", "error", { pageId: "p", elementId: "p.t", fix: "replace_with_token", details: { paragraph: 1, start: 8, end: 19, typed: "3,400 tCO₂e", chip: { binding: chip.attrs.binding, measure: "value" } } });
    const next = applyReplaceWithToken(d, check)!;
    const el = (next.pages[0] as { elements: Element[] }).elements[0];
    expect(JSON.stringify(el)).not.toContain("3,400");
    expect(applyReplaceWithToken(d, { ...check, details: { ...(check.details as object), chip: undefined } })).toBeNull();
  });
});

describe("other fixes", () => {
  it("moves a frame inside the safe margin, shrinking only what can't fit", () => {
    const d = doc([{ id: "p", kind: "freeform", name: "P", background: {}, elements: [textEl("e", { type: "doc", content: [] }, { x: 3, y: 290, w: 50, h: 20, rotation: 0 }), textEl("big", { type: "doc", content: [] }, { x: 0, y: 0, w: 210, h: 30, rotation: 0 })] }] as ReportDoc["pages"]);
    const a = moveInside(d, "p", "e", 10);
    expect((a.pages[0] as { elements: Element[] }).elements[0].frame).toMatchObject({ x: 10, y: 267, w: 50, h: 20 });
    const b = moveInside(d, "p", "big", 10);
    expect((b.pages[0] as { elements: Element[] }).elements[1].frame).toMatchObject({ x: 10, y: 10, w: 190, h: 30 });
  });
  it("the add-fixes' elements bind the right figures", () => {
    expect(fixElement("add_market_note", "x")).toMatchObject({ type: "kpi_tile", props: { binding: { source: "ghg", metric: "scope2_market" } } });
    expect(fixElement("add_gas_chart", "x")).toMatchObject({ type: "chart", props: { kind: "gas_split", binding: { metric: "total", breakdown: "gas" } } });
    expect(fixElement("add_biogenic", "x")).toMatchObject({ type: "big_number", props: { binding: { metric: "biogenic_co2" } } });
    expect(factorSection("f")).toMatchObject({ kind: "flow", flowType: "ghg_factor_table" });
  });
  it("finds the page for an add-fix and the place for the factors section", () => {
    const pages = [
      { id: "a", kind: "freeform", name: "A", background: {}, elements: [] },
      { id: "s2", kind: "freeform", name: "S2", background: {}, elements: [{ id: "s2.t", type: "kpi_tile", frame: { x: 0, y: 0, w: 1, h: 1, rotation: 0 }, z: 1, source: "user", props: { binding: { source: "ghg", metric: "scope2_location", years: { last: 1 }, sites: "all" }, showDelta: false, showSparkline: false, variant: "plain" } }] },
      { id: "f", kind: "flow", name: "F", flowType: "glossary", options: {} },
      { id: "z", kind: "freeform", name: "Z", background: {}, elements: [] },
    ] as ReportDoc["pages"];
    const d = doc(pages);
    expect(targetPage(d, c("SCOPE2_MARKET_MISSING", "warning"), ["scope2_location"], "a")).toBe("s2");
    expect(targetPage(d, c("GAS_BREAKDOWN_MISSING", "warning"), ["scope1"], "z")).toBe("z");
    expect(factorSectionIndex(d)).toBe(3);
  });
  it("exclusions: the same category is replaced, a new one added; AI text to plain text", () => {
    const list = [{ what: "Category 9 · Downstream transportation and distribution", reason: "" }];
    expect(findExclusion(list, "Category 9")).toBe(0);
    expect(withExclusion(list, "Category 9", "No sold goods are shipped by us.")).toEqual([{ what: list[0].what, reason: "No sold goods are shipped by us." }]);
    expect(withExclusion(list, "Category 10", "x")).toHaveLength(2);
    expect(exclusionWhat(c("SCOPE3_CATEGORY_UNADDRESSED", "error", { details: { category: 9, name: "Downstream transportation and distribution" } }))).toBe("Category 9 · Downstream transportation and distribution");
    expect(plainText({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Not relevant." }] }] } as TextDoc)).toBe("Not relevant.");
  });
});
