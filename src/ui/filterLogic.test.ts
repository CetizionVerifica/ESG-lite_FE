// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  activeCount,
  clearFilter,
  EMPTY_FILTERS,
  loadViews,
  readFilterParams,
  sameFilters,
  storeViews,
  toggleOption,
  upsertView,
  writeFilterParams,
} from "./filterLogic";

describe("filterLogic", () => {
  it("toggles multi and single choice options", () => {
    let v = toggleOption(EMPTY_FILTERS, "status", "pending");
    v = toggleOption(v, "status", "approved");
    expect(v.filters.status).toEqual(["pending", "approved"]);
    v = toggleOption(v, "status", "pending");
    expect(v.filters.status).toEqual(["approved"]);
    v = toggleOption(v, "source", "manual", false);
    v = toggleOption(v, "source", "bill", false);
    expect(v.filters.source).toEqual(["bill"]);
    expect(clearFilter(v, "source").filters.source).toEqual([]);
  });

  it("counts active filters and search text", () => {
    expect(activeCount(EMPTY_FILTERS)).toBe(0);
    expect(activeCount({ q: "  ", filters: { a: [] } })).toBe(0);
    expect(activeCount({ q: "diesel", filters: { a: ["x"], b: [] } })).toBe(2);
  });

  it("compares values ignoring order and empty filters", () => {
    expect(sameFilters({ q: "x ", filters: { a: ["1", "2"] } }, { q: "x", filters: { a: ["2", "1"], b: [] } })).toBe(true);
    expect(sameFilters({ q: "", filters: { a: ["1"] } }, { q: "", filters: { a: ["2"] } })).toBe(false);
  });

  it("round-trips through the URL and keeps other params", () => {
    const params = new URLSearchParams("period=2025-09&status=old");
    const next = writeFilterParams(params, { q: "coal", filters: { status: ["pending", "approved"], source: [] } }, ["status", "source"]);
    expect(next.get("period")).toBe("2025-09");
    expect(next.get("status")).toBe("pending,approved");
    expect(next.has("source")).toBe(false);
    expect(readFilterParams(next, ["status", "source"])).toEqual({ q: "coal", filters: { status: ["pending", "approved"], source: [] } });
    expect(writeFilterParams(next, EMPTY_FILTERS, ["status"]).toString()).toBe("period=2025-09");
  });

  describe("saved views", () => {
    beforeEach(() => localStorage.clear());

    it("stores, replaces by name and ignores broken storage", () => {
      const views = upsertView([], { name: " Pending ", value: { q: "", filters: { status: ["pending"] } } });
      const replaced = upsertView(views, { name: "Pending", value: { q: "x", filters: {} } });
      expect(replaced).toHaveLength(1);
      expect(replaced[0].value.q).toBe("x");
      storeViews("t", replaced);
      expect(loadViews("t")).toEqual(replaced);
      localStorage.setItem("fb:bad", "{not json");
      expect(loadViews("bad")).toEqual([]);
      localStorage.setItem("fb:shape", JSON.stringify([{ name: 1 }, { name: "ok", value: { q: "", filters: {} } }]));
      expect(loadViews("shape").map((v) => v.name)).toEqual(["ok"]);
    });
  });
});
