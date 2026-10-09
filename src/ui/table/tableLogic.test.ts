import { describe, expect, it } from "vitest";
import { nextSort, pageCount, paginate, retainSelectedRows, sortRows, toCsv, toMatrix } from "./tableLogic";
import type { Column } from "./types";

type Row = { site: string; t: number | null };
const rows: Row[] = [
  { site: "Sitra", t: 12 },
  { site: "askar", t: null },
  { site: "Hidd 10", t: 300 },
  { site: "Hidd 9", t: 12 },
];
const cols: Column<Row>[] = [
  { id: "site", header: "Site", value: (r) => r.site },
  { id: "t", header: "Emissions (tCO₂e)", value: (r) => r.t, numeric: true },
];

describe("sortRows", () => {
  it("sorts text naturally and case-insensitively", () => {
    expect(sortRows(rows, cols, { id: "site", dir: "asc" }).map((r) => r.site)).toEqual(["askar", "Hidd 9", "Hidd 10", "Sitra"]);
  });
  it("sorts numbers, keeps ties stable and empty values last in both directions", () => {
    expect(sortRows(rows, cols, { id: "t", dir: "asc" }).map((r) => r.site)).toEqual(["Sitra", "Hidd 9", "Hidd 10", "askar"]);
    expect(sortRows(rows, cols, { id: "t", dir: "desc" }).map((r) => r.site)).toEqual(["Hidd 10", "Sitra", "Hidd 9", "askar"]);
  });
  it("leaves rows alone without a sort", () => {
    expect(sortRows(rows, cols, null)).toBe(rows);
  });
});

describe("nextSort", () => {
  it("cycles asc → desc → off, and restarts on a new column", () => {
    expect(nextSort(null, "t")).toEqual({ id: "t", dir: "asc" });
    expect(nextSort({ id: "t", dir: "asc" }, "t")).toEqual({ id: "t", dir: "desc" });
    expect(nextSort({ id: "t", dir: "desc" }, "t")).toBeNull();
    expect(nextSort({ id: "t", dir: "desc" }, "site")).toEqual({ id: "site", dir: "asc" });
  });
});

describe("pagination", () => {
  it("slices pages and counts at least one page", () => {
    expect(paginate([1, 2, 3, 4, 5], 1, 2)).toEqual([3, 4]);
    expect(pageCount(0, 25)).toBe(1);
    expect(pageCount(51, 25)).toBe(3);
  });
});

describe("CSV export", () => {
  it("quotes commas, quotes and newlines, and neutralises formulas", () => {
    const csv = toCsv([
      ["Name", "Note"],
      ["Hidd, Bahrain", 'say "hi"'],
      ["=HYPERLINK(1)", "-5"],
      ["line\nbreak", -5],
    ]);
    expect(csv).toBe('Name,Note\r\n"Hidd, Bahrain","say ""hi"""\r\n\'=HYPERLINK(1),\'-5\r\n"line\nbreak",-5');
  });
  it("builds a header row and blanks for missing values", () => {
    expect(toMatrix(rows.slice(0, 2), cols)).toEqual([
      ["Site", "Emissions (tCO₂e)"],
      ["Sitra", 12],
      ["askar", ""],
    ]);
  });
});

describe("retainSelectedRows", () => {
  type R = { id: number; v: string };
  const id = (r: R) => r.id;
  it("keeps rows from other pages, prefers loaded rows and drops unselected ones", () => {
    const page1 = [{ id: 1, v: "a" }, { id: 2, v: "b" }];
    const kept = retainSelectedRows([1, 2], page1, id, new Map());
    const page2 = [{ id: 3, v: "c" }, { id: 1, v: "a2" }];
    const next = retainSelectedRows([2, 3, 1], page2, id, kept);
    expect([...next.values()]).toEqual([{ id: 2, v: "b" }, { id: 3, v: "c" }, { id: 1, v: "a2" }]);
    expect([...retainSelectedRows([3], [], id, next).keys()]).toEqual([3]);
    expect(retainSelectedRows([], page2, id, next).size).toBe(0);
  });

  it("returns the same map when nothing changed and skips ids never seen", () => {
    const rowsA = [{ id: 1, v: "a" }];
    const kept = retainSelectedRows([1, 9], rowsA, id, new Map());
    expect([...kept.keys()]).toEqual([1]);
    expect(retainSelectedRows([1, 9], rowsA, id, kept)).toBe(kept);
  });
});
