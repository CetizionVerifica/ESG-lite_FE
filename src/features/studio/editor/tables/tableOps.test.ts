// DS-8 · pure table ops: cells, rows and columns with merges kept in step,
// widths, merging (static only), heights, and moving a bound table to a flow section.
import { describe, expect, it } from "vitest";
import type { FreeformPage, ReportDoc } from "../../../../lib/studio/contracts";
import { addColumn, addRow, boundShape, boundTableTemplate, flowFor, mergeAt, mergeCells, moveTableToFlow, normalizeWidths, overflows, removeColumn, removeRow, setCell, setColumnWidth, staticTableTemplate, tableHeightMm, unmergeAt, type TableProps } from "./tableOps";

const base = (): TableProps => ({ style: "lined", columns: ["A", "B", "C"], rows: [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"]] });

describe("static table edits", () => {
  it("sets cells and headings", () => {
    expect(setCell(base(), -1, 1, "Bee").columns).toEqual(["A", "Bee", "C"]);
    expect(setCell(base(), 2, 0, "x").rows?.[2]).toEqual(["x", "8", "9"]);
  });

  it("adds and removes rows and columns, keeping merges and widths in step", () => {
    let p = mergeCells(base(), { r0: 0, c0: 0, r1: 1, c1: 1 });
    expect(p.merges).toEqual([{ r: 0, c: 0, rs: 2, cs: 2 }]);
    expect(mergeAt(p, 1, 1)).toEqual({ r: 0, c: 0, rs: 2, cs: 2 });
    p = addRow(p, 1);
    expect(p.rows).toHaveLength(4);
    expect(p.merges).toEqual([{ r: 0, c: 0, rs: 3, cs: 2 }]);
    p = addRow(p, 0);
    expect(p.merges).toEqual([{ r: 1, c: 0, rs: 3, cs: 2 }]);
    p = removeRow(p, 0);
    p = removeRow(p, 1);
    expect(p.merges).toEqual([{ r: 0, c: 0, rs: 2, cs: 2 }]);
    p = { ...p, colWidths: [50, 25, 25] };
    p = addColumn(p, 3);
    expect(p.columns).toEqual(["A", "B", "C", "Column 4"]);
    expect(p.colWidths?.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0);
    p = removeColumn(p, 1);
    expect(p.merges).toEqual([{ r: 0, c: 0, rs: 2, cs: 1 }]); // the 2×2 block lost a column
    expect(p.columns).toEqual(["A", "C", "Column 4"]);
  });

  it("merges replace overlapping merges; unmerge splits; bound tables never merge", () => {
    let p = mergeCells(base(), { r0: 0, c0: 0, r1: 0, c1: 1 });
    p = mergeCells(p, { r0: 0, c0: 1, r1: 1, c1: 2 });
    expect(p.merges).toEqual([{ r: 0, c: 1, rs: 2, cs: 2 }]);
    expect(unmergeAt(p, 1, 2).merges).toBeUndefined();
    expect(mergeCells(base(), { r0: 1, c0: 1, r1: 1, c1: 1 }).merges).toBeUndefined();
    const bound: TableProps = { style: "lined", binding: { source: "ghg", metric: "total", breakdown: "scope", years: { last: 3 }, sites: "all" } };
    expect(mergeCells(bound, { r0: 0, c0: 0, r1: 1, c1: 0 })).toBe(bound);
  });

  it("widths add up to 100", () => {
    expect(normalizeWidths([2, 1, 1])).toEqual([50, 25, 25]);
    const p = setColumnWidth(base(), 3, 0, 60);
    expect(p.colWidths?.[0]).toBe(60);
    expect(p.colWidths?.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0);
  });
});

describe("bound tables", () => {
  it("reads columns and rows from the resolved value as the renderer does", () => {
    expect(boundShape({ series: [{ label: "2024", values: [{ key: "Scope 1" }, { key: "Scope 2" }] }, { label: "2025", values: [{ key: "Scope 1" }, { key: "Scope 3" }] }] })).toEqual({ columns: ["", "Scope 1", "Scope 2", "Scope 3"], rows: 2 });
    expect(boundShape({ table: { columns: ["a", "b"], rows: [[], [], []] } })).toEqual({ columns: ["a", "b"], rows: 3 });
    expect(boundShape(undefined)).toEqual({ columns: [], rows: 0 });
  });

  it("knows when a table is taller than its frame", () => {
    expect(tableHeightMm(3)).toBeCloseTo(24, 0);
    expect(overflows({ frame: { x: 0, y: 0, w: 10, h: 30, rotation: 0 } }, 3)).toBe(false);
    expect(overflows({ frame: { x: 0, y: 0, w: 10, h: 30, rotation: 0 } }, 12)).toBe(true);
  });

  it("moves into a flow section after its page: Scope 3 categories, or data tables with the KPIs", () => {
    expect(flowFor({ source: "ghg", metric: "scope3", breakdown: "scope3_category", years: { last: 1 }, sites: "all" }, "Data", "f").flowType).toBe("scope3_categories");
    expect(flowFor({ source: "kpi", kpis: ["WATER"], years: { last: 3 }, sites: "all" }, "Data", "f")).toMatchObject({ flowType: "data_tables", options: { years: { last: 3 }, kpis: ["WATER"] } });
    const t = { ...boundTableTemplate({ source: "ghg", metric: "total", breakdown: "site", years: [2022, 2025], sites: "all" }), id: "t" };
    const doc = {
      schemaVersion: 2,
      kind: "ghg",
      format: "a4",
      pages: [{ id: "p1", kind: "freeform", name: "One", background: {}, elements: [t, { ...staticTableTemplate(), id: "s" }] } as FreeformPage, { id: "p2", kind: "freeform", name: "Two", background: {}, elements: [] } as FreeformPage],
    } as unknown as ReportDoc;
    const r = moveTableToFlow(doc, "p1", "t", () => "f1");
    expect(r?.pageId).toBe("f1");
    expect(r?.doc.pages.map((p) => p.id)).toEqual(["p1", "f1", "p2"]);
    expect((r?.doc.pages[0] as FreeformPage).elements.map((e) => e.id)).toEqual(["s"]);
    expect(r?.doc.pages[1]).toMatchObject({ kind: "flow", flowType: "data_tables", options: { years: { last: 2 } } });
    expect(moveTableToFlow(doc, "p1", "s", () => "x")).toBeNull();
  });
});
