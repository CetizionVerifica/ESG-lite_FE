// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAutosave } from "./useAutosave";

/** A save whose promise the test settles by hand. */
function controlledSave() {
  const calls: { value: unknown; resolve: () => void; reject: (e: unknown) => void }[] = [];
  const save = vi.fn(
    (value: unknown) =>
      new Promise<void>((resolve, reject) => {
        calls.push({ value, resolve, reject });
      }),
  );
  return { save, calls };
}

describe("useAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = (save: (v: string) => Promise<unknown>) =>
    renderHook(({ value }) => useAutosave(value, "a", save, 100), { initialProps: { value: "a" } });

  const settle = () =>
    act(async () => {
      vi.advanceTimersByTime(100);
    });

  it("doesn't save what was just loaded", async () => {
    const { save } = controlledSave();
    const hook = setup(save);
    await settle();
    expect(save).not.toHaveBeenCalled();
    expect(hook.result.current.state).toBe("saved");
    expect(hook.result.current.dirty).toBe(false);
  });

  it("saves an edit once it stops changing", async () => {
    const { save, calls } = controlledSave();
    const hook = setup(save);
    hook.rerender({ value: "b" });
    expect(hook.result.current.state).toBe("pending");
    await settle();
    expect(save).toHaveBeenCalledWith("b");
    expect(hook.result.current.state).toBe("saving");
    await act(async () => calls[0].resolve());
    expect(hook.result.current.state).toBe("saved");
    expect(hook.result.current.dirty).toBe(false);
  });

  it("sends an edit made during a save right after it", async () => {
    const { save, calls } = controlledSave();
    const hook = setup(save);
    hook.rerender({ value: "b" });
    await settle();
    hook.rerender({ value: "c" });
    await settle();
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => calls[0].resolve());
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("c");
    await act(async () => calls[1].resolve());
    expect(hook.result.current.state).toBe("saved");
  });

  it("keeps a failed value until Retry and then saves it", async () => {
    const { save, calls } = controlledSave();
    const hook = setup(save);
    hook.rerender({ value: "b" });
    await settle();
    const err = new Error("offline");
    await act(async () => calls[0].reject(err));
    expect(hook.result.current.state).toBe("error");
    expect(hook.result.current.error).toBe(err);
    expect(hook.result.current.dirty).toBe(true);
    await settle();
    expect(save).toHaveBeenCalledTimes(1);

    act(() => hook.result.current.retry());
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith("b");
    await act(async () => calls[1].resolve());
    expect(hook.result.current.state).toBe("saved");
    expect(hook.result.current.error).toBeNull();
  });

  it("saves a new edit made after a failure", async () => {
    const { save, calls } = controlledSave();
    const hook = setup(save);
    hook.rerender({ value: "b" });
    await settle();
    await act(async () => calls[0].reject(new Error("offline")));
    hook.rerender({ value: "c" });
    expect(hook.result.current.state).toBe("pending");
    await settle();
    expect(save).toHaveBeenLastCalledWith("c");
    await act(async () => calls[1].resolve());
    expect(hook.result.current.state).toBe("saved");
  });
});
