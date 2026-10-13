// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { toFormModel } from "../../../lib/emissions/form";
import { useEntryRows } from "./useEntryRows";

const model = toFormModel({ pk_id: 1, config_name: "Fuel", columns: [{ pk_id: 1, column_name: "quantity", column_type: "number" }] });

describe("useEntryRows", () => {
  it("drops bill rows read for a context that is no longer open", () => {
    const { result, rerender } = renderHook(({ key }) => useEntryRows(model, key), { initialProps: { key: "add-data:4:9:2025-09" } });
    act(() => result.current.dispatch({ type: "append", rows: [{ id: 1, quantity: "5" }], draftKey: "add-data:4:9:2025-09" }));
    expect(result.current.rows).toHaveLength(2);

    rerender({ key: "add-data:4:9:2025-10" });
    act(() => result.current.dispatch({ type: "append", rows: [{ id: 1, quantity: "7" }], draftKey: "add-data:4:9:2025-09" }));
    expect(result.current.rows.map((r) => r.quantity)).toEqual([""]);
    sessionStorage.clear();
  });

  it("keeps the stored draft while the form is loading and restores it when the form arrives", () => {
    const key = "add-data:4:9:2025-09";
    sessionStorage.setItem(key, JSON.stringify([{ id: 1, quantity: "1600" }]));
    // A reload: the context is known at once, the form definition a moment later.
    const { result, rerender } = renderHook(({ m }) => useEntryRows(m, key), { initialProps: { m: null as typeof model | null } });
    expect(sessionStorage.getItem(key)).not.toBeNull();

    rerender({ m: model });
    expect(result.current.rows.map((r) => r.quantity)).toEqual(["1600"]);
    expect(JSON.parse(sessionStorage.getItem(key) ?? "[]")).toEqual([{ id: 1, quantity: "1600" }]);
    sessionStorage.clear();
  });

  it("doesn't file one context's rows under another context's draft", () => {
    const { result, rerender } = renderHook(({ key }) => useEntryRows(model, key), { initialProps: { key: "add-data:4:9:2025-09" } });
    act(() => result.current.dispatch({ type: "change", model, id: 1, column: "quantity", value: "5" }));
    expect(sessionStorage.getItem("add-data:4:9:2025-09")).not.toBeNull();

    rerender({ key: "add-data:4:9:2025-10" });
    expect(result.current.rows.map((r) => r.quantity)).toEqual([""]);
    expect(sessionStorage.getItem("add-data:4:9:2025-10")).toBeNull();
    // Going back finds the first month's draft untouched.
    rerender({ key: "add-data:4:9:2025-09" });
    expect(result.current.rows.map((r) => r.quantity)).toEqual(["5"]);
    sessionStorage.clear();
  });
});
