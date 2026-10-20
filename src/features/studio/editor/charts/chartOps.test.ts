// DS-8 · pure chart ops: kind validity per binding, defaults, rebinding,
// options, top n, figure choices, TSV paste and the typed-data rules.
import { describe, expect, it } from "vitest";
import type { Element, FreeformPage, GhgBinding, ReportDoc } from "../../../../lib/studio/contracts";
import { findElement } from "../../../../lib/studio/docOps";
import {
  bindingSummary,
  customToGrid,
  elementForFigure,
  ghgChartFor,
  gridToCustom,
  kindCheck,
  kindsFor,
  nonNumericCells,
  parseCellNumber,
  parseTsv,
  pasteInto,
  rebind,
  reservedLabels,
  rsChartFor,
  setOptions,
  setTop,
  takesTop,
  withBreakdown,
  withMetric,
} from "./chartOps";

const g = (metric: GhgBinding["metric"], extra: Partial<GhgBinding> = {}): GhgBinding => ({ source: "ghg", metric, years: { last: 1 }, sites: "all", ...extra });

const docWith = (els: Element[]): ReportDoc =>
  ({
    schemaVersion: 2,
    kind: "ghg",
    purpose: "report",
    format: "a4",
    meta: { title: "T", year: 2025, yearType: "CY", sites: "all", frameworks: ["GHGP"], language: "en" },
    design: { templateId: "t", templateVersion: 1, theme: {} },
    pages: [{ id: "p", kind: "freeform", name: "P", background: {}, elements: els } as FreeformPage],
    assets: [],
  }) as ReportDoc;

const chart = (id: string, kind: string, binding: unknown): Element => ({ id, type: "chart", frame: { x: 0, y: 0, w: 10, h: 10, rotation: 0 }, z: 0, source: "user", props: { binding: binding as GhgBinding, kind: kind as "bar", options: {} } });

describe("kind validity per binding", () => {
  it("offers the GHG kinds the data can feed, first", () => {
    expect(kindsFor(g("scope3", { breakdown: "scope3_category" }))).toEqual(["category_bars", "treemap", "bar", "stacked_bar", "line", "donut", "share_bar"]);
    expect(kindsFor(g("total", { breakdown: "scope" }))[0]).toBe("scope_split");
    expect(kindsFor(g("total", { breakdown: "month" }))).toContain("monthly_stack");
    expect(kindsFor(g("intensity_revenue", { years: { last: 5 } }))).toContain("intensity_line");
    expect(kindsFor(g("total"))).toEqual([]);
    expect(kindsFor({ source: "custom", columns: ["a", "b"], rows: [["x", 1]] })).toEqual(["bar", "stacked_bar", "line", "donut", "share_bar"]);
  });

  it("says why a kind can't draw the data", () => {
    const r = kindCheck("gas_split", g("total", { breakdown: "site" }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/by gas/);
    expect(kindCheck("treemap", { source: "custom", columns: ["a", "b"], rows: [] }).ok).toBe(false);
  });

  it("each GHG default is valid; category bars start at Scope 3, this year, top 8", () => {
    const doc = docWith([]);
    const el = ghgChartFor("category_bars", doc);
    expect(el.type === "chart" && el.props.binding).toEqual({ source: "ghg", metric: "scope3", breakdown: "scope3_category", years: { last: 1 }, sites: "all", top: 8 });
    const w = ghgChartFor("base_year_waterfall", doc, 2021);
    expect(w.type === "chart" && (w.props.binding as GhgBinding).years).toEqual([2021, 2025]);
    expect(rsChartFor("donut", doc)?.type).toBe("chart");
    expect(rsChartFor("bar", { kind: "sustainability" })).toBeNull();
    expect(rsChartFor("line", { kind: "sustainability" }, { source: "kpi", kpis: ["WATER"], years: { last: 1 }, sites: "all" })?.type).toBe("chart");
  });
});

describe("rebinding and options", () => {
  it("a chart keeps its kind when it can draw the new data, else takes the first valid one", () => {
    const doc = docWith([chart("c", "treemap", g("scope3", { breakdown: "scope3_category" })), { id: "n", type: "big_number", frame: { x: 0, y: 0, w: 1, h: 1, rotation: 0 }, z: 1, source: "user", props: { binding: g("total"), showDelta: true } }]);
    let next = rebind(doc, "p", "c", g("scope1", { breakdown: "source_category" }));
    expect(findElement(next, "p", "c")).toMatchObject({ props: { kind: "treemap", binding: { metric: "scope1" } } });
    next = rebind(next, "p", "c", g("total", { breakdown: "scope" }));
    expect(findElement(next, "p", "c")).toMatchObject({ props: { kind: "scope_split" } });
    // A big number takes a figure but never typed data.
    expect(rebind(doc, "p", "n", { source: "custom", columns: ["a"], rows: [] })).toBe(doc);
    expect(findElement(rebind(doc, "p", "n", g("scope2_location")), "p", "n")).toMatchObject({ props: { binding: { metric: "scope2_location" } } });
  });

  it("top n folds a breakdown; options merge and drop undefined", () => {
    const doc = docWith([chart("c", "category_bars", g("scope3", { breakdown: "scope3_category", top: 8 }))]);
    expect(takesTop(g("scope3", { breakdown: "scope3_category" }))).toBe(true);
    expect(takesTop(g("total", { breakdown: "month" }))).toBe(false);
    let next = setTop(doc, "p", "c", 5);
    expect((findElement(next, "p", "c")?.props as { binding: GhgBinding }).binding.top).toBe(5);
    next = setTop(next, "p", "c", undefined);
    expect("top" in (findElement(next, "p", "c")?.props as { binding: GhgBinding }).binding).toBe(false);
    next = setOptions(next, "p", "c", { greyPrior: false, colors: "brand" });
    next = setOptions(next, "p", "c", { colors: undefined });
    expect((findElement(next, "p", "c")?.props as { options: object }).options).toEqual({ greyPrior: false });
  });

  it("metric and split changes keep the binding valid for DS-2", () => {
    expect(withMetric(g("total", { breakdown: "scope" }), "scope1").breakdown).toBeUndefined();
    expect(withMetric(g("total", { breakdown: "site", top: 3 }), "scope1")).toMatchObject({ breakdown: "site", top: 3 });
    expect(withMetric(g("total"), "scope3_category").breakdown).toBe("scope3_category");
    expect(withBreakdown(g("scope3", { breakdown: "scope3_category", top: 8 }), "month").top).toBeUndefined();
    expect(bindingSummary(g("scope3", { breakdown: "scope3_category", top: 8 }))).toBe("Scope 3 · by scope 3 category · this year · top 8");
  });

  it("a dropped figure becomes a big number, a tile or the first chart that fits", () => {
    expect(elementForFigure("big_number", g("total"), "Total").type).toBe("big_number");
    expect(elementForFigure("kpi_tile", g("total"), "Total")).toMatchObject({ type: "kpi_tile", props: { label: "Total", variant: "card" } });
    expect(elementForFigure("chart", g("scope3", { breakdown: "scope3_category" }), "S3")).toMatchObject({ type: "chart", props: { kind: "category_bars", title: "S3" } });
    expect(elementForFigure("chart", g("scope1"), "Scope 1")).toMatchObject({ type: "chart", props: { kind: "bar", binding: { years: { last: 5 } } } });
  });
});

describe("typed data", () => {
  it("parses spreadsheet numbers and TSV", () => {
    expect(parseCellNumber("1,234.5")).toBe(1234.5);
    expect(parseCellNumber("(40)")).toBe(-40);
    expect(parseCellNumber("12%")).toBe(12);
    expect(parseCellNumber("−3")).toBe(-3);
    expect(parseCellNumber("abc")).toBeNull();
    expect(parseTsv('Item\tSaved\r\nLED\t120\n"Solar, PPA"\t"8""60"\n\n')).toEqual([["Item", "Saved"], ["LED", "120"], ["Solar, PPA", '8"60']]);
  });

  it("pastes at a cell, grows the grid and caps it at 200 × 20", () => {
    const r = pasteInto([["A", "B"], ["x", "1"]], { r: 1, c: 1 }, [["5", "6"], ["7", "8"]]);
    expect(r.grid).toEqual([["A", "B", ""], ["x", "5", "6"], ["", "7", "8"]]);
    expect(r.clipped).toBe(false);
    const big = pasteInto([["A"]], { r: 0, c: 0 }, Array.from({ length: 205 }, () => Array.from({ length: 25 }, () => "1")));
    expect(big.clipped).toBe(true);
    expect(big.grid).toHaveLength(201);
    expect(big.grid[0]).toHaveLength(20);
  });

  it("turns the grid into custom data: numbers in value columns, blank rows dropped", () => {
    const d = gridToCustom([["Initiative", "Saved"], ["LED", "1,200"], ["", ""], ["Solar", "n/a"]]);
    expect(d).toEqual({ source: "custom", columns: ["Initiative", "Saved"], rows: [["LED", 1200], ["Solar", "n/a"]] });
    expect(nonNumericCells(d)).toBe(1);
    expect(customToGrid(d)).toEqual([["Initiative", "Saved"], ["LED", "1200"], ["Solar", "n/a"]]);
  });

  it("refuses GHG and KPI names as labels", () => {
    expect(reservedLabels([["Item", "Scope 1"], ["tCO2e saved", "1"], ["LED", "2"]])).toEqual(["Scope 1", "tCO2e saved"]);
    expect(reservedLabels([["Item", "Value"], ["Water withdrawal", "1"]], ["Water withdrawal"])).toEqual(["Water withdrawal"]);
    expect(reservedLabels([["Initiative", "Saved"], ["LED", "1"]])).toEqual([]);
  });
});
