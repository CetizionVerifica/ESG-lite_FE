// DS-9 · pure AI panel logic: applying a suggestion (the only doc change),
// the word diff, quick chips, the "About" line, sources and the budget meter.
import { describe, expect, it } from "vitest";
import ghg from "../../../test/fixtures/studio/ghg-doc.json";
import type { DataToken, FreeformPage, ReportDoc, Suggestion, TextDoc } from "../../../lib/studio/contracts";
import { aboutLabel, aiErrorText, applySuggestion, budgetState, currentOf, quickChips, selectionKindOf, sourcesLine, textOf, tokensOf, wordDiff } from "./logic";

const doc = () => JSON.parse(JSON.stringify(ghg)) as ReportDoc;
const page = (d: ReportDoc, id: string) => d.pages.find((p) => p.id === id) as FreeformPage;
const NEW_TEXT: TextDoc = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Total emissions were " }, { type: "data", attrs: { binding: { source: "ghg", metric: "total", years: { last: 1 }, sites: "all" }, measure: "value" } }, { type: "text", text: " tCO₂e." }] }],
};
const sug = (over: Partial<Suggestion> = {}): Suggestion => ({ id: "s1", action: "ghg_exec_summary", model: "m", createdAt: "2026-10-20T00:00:00.000Z", kind: "text", payload: { text: NEW_TEXT }, sources: [{ source: "ghg", metric: "total", year: 2025 }], ...over });

describe("applySuggestion", () => {
  it("replaces the target text box's text, marks it AI-written and unreviewed, and leaves other pages alone", () => {
    const d = doc();
    const r = applySuggestion(d, sug(), { pageId: "p-summary", elementId: "p-summary.body" }, "p-summary")!;
    const el = page(r.doc, "p-summary").elements.find((e) => e.id === "p-summary.body")!;
    expect(el.source).toBe("ai");
    expect(el.reviewed).toBe(false);
    expect(el.type === "text" && el.props.doc).toEqual(NEW_TEXT);
    expect(el.type === "text" && el.props.align).toBe("justify");
    expect(r.ids).toEqual(["p-summary.body"]);
    expect(r.pageId).toBe("p-summary");
    expect(r.doc.pages[0]).toBe(d.pages[0]);
    expect(page(d, "p-summary").elements[1].source).toBe("ai"); // the input doc is untouched (its fixture value)
    expect(page(d, "p-summary").elements[1].reviewed).toBe(true);
  });

  it("server elements replace theirs by id; a new one lands on the target page on top", () => {
    const d = doc();
    const body = page(d, "p-summary").elements[1];
    const edited = { ...body, props: { ...(body.props as object), doc: NEW_TEXT } } as typeof body;
    const r1 = applySuggestion(d, sug({ payload: { text: NEW_TEXT, elements: [edited] } }), null, "p-cover")!;
    expect(r1.pageId).toBe("p-summary");
    const fresh = { ...edited, id: "ai-1234", z: 0 };
    const r2 = applySuggestion(d, sug({ payload: { text: NEW_TEXT, elements: [fresh] } }), { pageId: "p-scope3" }, "p-cover")!;
    const els = page(r2.doc, "p-scope3").elements;
    const added = els[els.length - 1];
    expect(added.id).toBe("ai-1234");
    expect(added.z).toBeGreaterThan(Math.max(...page(d, "p-scope3").elements.map((e) => e.z)));
    expect(r2.pageId).toBe("p-scope3");
  });

  it("findings and text without a target apply nothing", () => {
    expect(applySuggestion(doc(), sug({ kind: "findings", payload: { findings: [{ message: "x", severity: "warning" }] } }), { pageId: "p-summary" }, "p-summary")).toBeNull();
    expect(applySuggestion(doc(), sug(), { pageId: "p-summary" }, "p-summary")).toBeNull();
    expect(applySuggestion(doc(), sug(), { pageId: "p-summary", elementId: "p-summary.split" }, null)).toBeNull();
  });

  it("currentOf finds the element a suggestion changes", () => {
    expect(currentOf(doc(), sug(), { pageId: "p-summary", elementId: "p-summary.body" })?.id).toBe("p-summary.body");
    expect(currentOf(doc(), sug(), null)).toBeNull();
  });
});

describe("text and diff", () => {
  const chip = (a: DataToken["attrs"]) => `[${(a.binding as { metric?: string }).metric}]`;
  it("textOf shows chips by the server's display; tokensOf lists them", () => {
    const body = page(doc(), "p-summary").elements[1];
    expect(body.type === "text" && textOf(body.props.doc, chip)).toBe("Scope 1 emissions were [scope1] tCO₂e, [total] versus 2024.");
    expect(tokensOf(NEW_TEXT)).toHaveLength(1);
    expect(textOf({ type: "doc", content: [{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }] }] }] }, chip)).toBe("• a");
  });

  it("wordDiff marks removed and added words and keeps the rest", () => {
    expect(wordDiff("Our emissions fell this year.", "Our emissions rose this year.")).toEqual([
      { op: "same", text: "Our emissions " },
      { op: "del", text: "fell" },
      { op: "add", text: "rose" },
      { op: "same", text: " this year." },
    ]);
    expect(wordDiff("", "New text")).toEqual([{ op: "add", text: "New text" }]);
    const joined = (parts: ReturnType<typeof wordDiff>, keep: "del" | "add") => parts.filter((p) => p.op !== keep).map((p) => p.text).join("");
    const a = "Scope 1 was [12,480.000] tCO₂e and the total moved [−4.1%].";
    const b = "Our own operations emitted [12,480.000] tCO₂e; the total moved [−4.1%] on 2024.";
    const parts = wordDiff(a, b);
    expect(joined(parts, "add")).toBe(a);
    expect(joined(parts, "del")).toBe(b);
  });
});

describe("panel words", () => {
  it("quick chips follow the kind and the selection", () => {
    expect(quickChips("ghg", "none")).toEqual(["Write the executive summary", "Explain the change in Scope 2", "Draft exclusion reasons", "Suggest a layout for this page", "Check for missing disclosures"]);
    expect(quickChips("ghg", "text")).toContain("Make it more concise");
    expect(quickChips("sustainability", "none")[0]).toBe("Draft the leadership message");
  });

  it("the About line names the selection and its page", () => {
    const d = doc();
    const p = page(d, "p-summary");
    expect(aboutLabel(d, p, p.elements.find((e) => e.id === "p-summary.split"))).toBe("Emissions by scope chart (page 2)");
    // #209: a chip shows the server's 3-decimal tCO₂e display; the line keeps 31 characters then "…".
    expect(aboutLabel(d, p, p.elements[1], () => "12,480.000")).toBe("“Scope 1 emissions were 12,480.0…” (page 2)");
    expect(aboutLabel(d, p, null)).toBeNull();
    expect(selectionKindOf(p.elements[1])).toBe("text");
    expect(selectionKindOf(p.elements.find((e) => e.id === "p-summary.split"))).toBe("chart");
    expect(selectionKindOf(null)).toBe("none");
  });

  it("sources, budget and errors", () => {
    expect(sourcesLine([{ source: "ghg", metric: "total", year: 2025 }, { source: "ghg", metric: "scope3_category", scope3Category: 4, year: 2024 }, { source: "input", key: "consolidation_approach" }])).toBe("Based on: Total emissions 2025 · Scope 3 Category 4 2024 · Consolidation approach");
    expect(sourcesLine([])).toBeNull();
    expect(budgetState({ todayUsd: 1.2, budgetUsd: 5, calls: 10, callBudget: 200, monthUsd: 3, monthBudgetUsd: 50 })).toEqual({ label: "$1.20 of $5 today", pct: 24, paused: false });
    expect(budgetState({ todayUsd: 0.1, budgetUsd: 5, calls: 200, callBudget: 200, monthUsd: 3, monthBudgetUsd: 50 })?.paused).toBe(true);
    expect(budgetState(undefined)).toBeNull();
    expect(aiErrorText("DS_AI_BUDGET_EXCEEDED")).toMatch(/Your report is unchanged/);
    expect(aiErrorText("DS_AI_OUTPUT_INVALID")).toMatch(/typed a number/);
  });
});
