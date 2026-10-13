// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { toFormModel } from "../../../lib/emissions/form";
import { useEntryRows } from "./useEntryRows";

const config = { pk_id: 1, config_name: "Fuel", columns: [{ pk_id: 1, column_name: "quantity", column_type: "number" }] };
const model = toFormModel(config);
type Model = typeof model;

const SEP = "add-data:4:9:2025-09";
const OCT = "add-data:4:9:2025-10";
const stored = (key: string) => JSON.parse(sessionStorage.getItem(key) ?? "null") as { quantity: string }[] | null;

afterEach(() => sessionStorage.clear());

describe("useEntryRows", () => {
  it("drops bill rows read for a context that is no longer open", () => {
    const { result, rerender } = renderHook(({ key }) => useEntryRows(model, key), { initialProps: { key: SEP } });
    act(() => result.current.dispatch({ type: "append", rows: [{ id: 1, quantity: "5" }], draftKey: SEP }));
    expect(result.current.rows).toHaveLength(2);

    rerender({ key: OCT });
    act(() => result.current.dispatch({ type: "append", rows: [{ id: 1, quantity: "7" }], draftKey: SEP }));
    expect(result.current.rows.map((r) => r.quantity)).toEqual([""]);
  });

  it("keeps the stored draft while the form is loading and restores it when the form arrives", () => {
    sessionStorage.setItem(SEP, JSON.stringify([{ id: 1, quantity: "1600" }]));
    // A reload: the context is known at once, the form definition a moment later.
    const { result, rerender } = renderHook(({ m }) => useEntryRows(m, SEP), { initialProps: { m: null as Model | null } });
    expect(stored(SEP)).not.toBeNull();

    rerender({ m: model });
    expect(result.current.rows.map((r) => r.quantity)).toEqual(["1600"]);
    expect(stored(SEP)).toEqual([{ id: 1, quantity: "1600" }]);
  });

  it("switching context while the new form loads keeps each context's rows to itself", () => {
    const { result, rerender } = renderHook(({ m, key }) => useEntryRows(m, key), { initialProps: { m: model as Model | null, key: SEP } });
    act(() => result.current.dispatch({ type: "change", model, id: 1, column: "quantity", value: "5" }));
    expect(stored(SEP)).toEqual([expect.objectContaining({ quantity: "5" })]);

    // October's form is still loading: no rows are handed out and nothing is filed under October.
    rerender({ m: null, key: OCT });
    expect(result.current.rows).toEqual([]);
    expect(stored(OCT)).toBeNull();
    expect(stored(SEP)).toEqual([expect.objectContaining({ quantity: "5" })]);

    rerender({ m: model, key: OCT });
    expect(result.current.rows.map((r) => r.quantity)).toEqual([""]);
    // Back to September: its draft comes back.
    rerender({ m: model, key: SEP });
    expect(result.current.rows.map((r) => r.quantity)).toEqual(["5"]);
  });

  it("rows already sent don't come back as a draft when the same context is opened again", () => {
    const { result, rerender } = renderHook(({ m, key }) => useEntryRows(m, key), {
      initialProps: { m: model as Model | null, key: SEP as string | null },
    });
    act(() => result.current.dispatch({ type: "change", model, id: 1, column: "quantity", value: "5" }));
    // Sent, then "Add another category": the draft is cleared and the category closed.
    act(() => result.current.clearDraft());
    rerender({ m: null, key: null });
    // The same category again, its form loading, then arriving.
    rerender({ m: null, key: SEP });
    expect(result.current.rows).toEqual([]);
    expect(stored(SEP)).toBeNull();
    rerender({ m: model, key: SEP });
    expect(result.current.rows.map((r) => r.quantity)).toEqual([""]);
    expect(stored(SEP)).toBeNull();
  });

  it("a refetched form for the same context keeps the typed rows", () => {
    const { result, rerender } = renderHook(({ m }) => useEntryRows(m, SEP), { initialProps: { m: model } });
    act(() => result.current.dispatch({ type: "change", model, id: 1, column: "quantity", value: "5" }));
    rerender({ m: toFormModel({ ...config }) });
    expect(result.current.rows.map((r) => r.quantity)).toEqual(["5"]);
  });
});
