// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { readContext, useContextParams, writeContext, type ContextPatch } from "./useContextParams";

describe("context URL params", () => {
  it("reads period, sites, category and scope", () => {
    const ctx = readContext(new URLSearchParams("period=2025-Q3&site=3,1,1,x&category=12&scope=2"));
    expect(ctx).toEqual({ period: { kind: "quarter", year: 2025, quarter: 3 }, siteIds: [3, 1], categoryId: 12, scope: 2 });
  });

  it("ignores bad values", () => {
    expect(readContext(new URLSearchParams("period=soon&site=-1&category=abc&scope=4"))).toEqual({
      period: null,
      siteIds: [],
      categoryId: null,
      scope: null,
    });
  });

  it("writes a patch, keeps unrelated keys and writes cleared values as all", () => {
    const next = writeContext(new URLSearchParams("tab=history&site=4&scope=1"), {
      period: { kind: "fy", startYear: 2025 },
      siteIds: [5, 2],
      scope: null,
    });
    expect(next.toString()).toBe("tab=history&site=2%2C5&scope=all&period=FY2025");
    expect(writeContext(new URLSearchParams(), { siteIds: [], categoryId: null }).toString()).toBe("site=all&category=all");
  });

  it("reads all as an empty selection", () => {
    expect(readContext(new URLSearchParams("period=all&site=all&category=all&scope=all"))).toEqual({
      period: null,
      siteIds: [],
      categoryId: null,
      scope: null,
    });
  });
});

describe("useContextParams", () => {
  const setup = (url: string, defaults: ContextPatch) => {
    const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
    return renderHook(
      () => {
        const [values, update] = useContextParams(defaults);
        return { values, update, search: useLocation().search };
      },
      { wrapper },
    );
  };
  const defaults: ContextPatch = { siteIds: [4], categoryId: 7, scope: 1, period: { kind: "cy", year: 2025 } };

  it("falls back to defaults only for keys the URL doesn't carry", () => {
    const { result } = setup("/overview?site=2", defaults);
    expect(result.current.values.siteIds).toEqual([2]);
    expect(result.current.values.categoryId).toBe(7);
    expect(result.current.values.scope).toBe(1);
  });

  it("keeps a cleared selector cleared instead of returning to the default", () => {
    const { result } = setup("/overview", defaults);
    act(() => result.current.update({ siteIds: [], categoryId: null, scope: null, period: null }));
    expect(result.current.search).toBe("?period=all&site=all&category=all&scope=all");
    expect(result.current.values).toEqual({ period: null, siteIds: [], categoryId: null, scope: null });
  });

  it("still uses the default when the URL value is unreadable", () => {
    const { result } = setup("/overview?site=x&scope=9", defaults);
    expect(result.current.values.siteIds).toEqual([4]);
    expect(result.current.values.scope).toBe(1);
  });
});
