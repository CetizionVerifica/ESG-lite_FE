// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUndoableApprove } from "./useUndoableApprove";

describe("useUndoableApprove", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(commit = vi.fn().mockResolvedValue({})) {
    const onCommitted = vi.fn();
    const onFailed = vi.fn();
    const hook = renderHook(() => useUndoableApprove({ commit, onCommitted, onFailed, delay: 8000 }));
    return { hook, commit, onCommitted, onFailed };
  }

  it("shows the approval at once and sends it after the undo window", async () => {
    const { hook, commit, onCommitted } = setup();
    act(() => hook.result.current.approve(7));
    expect(hook.result.current.optimistic.get(7)).toBe("approved");
    expect(commit).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(8000);
    });
    expect(commit).toHaveBeenCalledWith(7);
    expect(onCommitted).toHaveBeenCalled();
  });

  it("undo sends nothing and restores the status", async () => {
    const { hook, commit } = setup();
    act(() => hook.result.current.approve(7));
    act(() => {
      expect(hook.result.current.undo(7)).toBe(true);
    });
    expect(hook.result.current.optimistic.has(7)).toBe(false);
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });
    expect(commit).not.toHaveBeenCalled();
  });

  it("sends what is still waiting when the page goes away", () => {
    const { hook, commit } = setup();
    act(() => hook.result.current.approve(1));
    act(() => hook.result.current.approve(2));
    hook.unmount();
    expect(commit.mock.calls.map((c) => c[0])).toEqual([1, 2]);
  });

  it("puts the row back when the request fails", async () => {
    const { hook, onFailed } = setup(vi.fn().mockRejectedValue(new Error("nope")));
    act(() => hook.result.current.approve(3));
    await act(async () => {
      vi.advanceTimersByTime(8000);
    });
    expect(onFailed).toHaveBeenCalledWith(3, expect.any(Error));
    expect(hook.result.current.optimistic.has(3)).toBe(false);
  });

  it("settles optimistic rows once the server agrees, but not while waiting", async () => {
    const { hook } = setup();
    act(() => hook.result.current.approve(1));
    act(() => hook.result.current.settle(() => "approved"));
    expect(hook.result.current.optimistic.has(1)).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(8000);
    });
    act(() => hook.result.current.settle(() => "pending"));
    expect(hook.result.current.optimistic.has(1)).toBe(true);
    act(() => hook.result.current.settle(() => undefined));
    expect(hook.result.current.optimistic.has(1)).toBe(false);
  });
});
