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
});
