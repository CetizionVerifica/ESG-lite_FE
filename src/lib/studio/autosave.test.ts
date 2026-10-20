import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { conflictRev, createAutosaver, type AutosaveState } from "./autosave";

const conflict = (rev: number) => Object.assign(new Error("409"), { response: { status: 409, data: { code: "DS_VERSION_CONFLICT", details: { rev } } } });

describe("createAutosaver", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves 1 s after the last change, with the rev, newest change wins", async () => {
    const save = vi.fn(async (rev: number) => rev + 1);
    const states: AutosaveState["status"][] = [];
    const s = createAutosaver<{ title: string }>({ rev: 3, save, onChange: (st) => states.push(st.status) });
    s.queue({ title: "a" });
    await vi.advanceTimersByTimeAsync(500);
    s.queue({ title: "b" });
    await vi.advanceTimersByTimeAsync(999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(3, { title: "b" });
    expect(s.state().rev).toBe(4);
    expect(s.state().status).toBe("saved");
    expect(states).toContain("pending");
    expect(states).toContain("saving");
  });

  it("a change made while saving goes next, on the new rev; merge combines queued changes", async () => {
    let release: (v: number) => void = () => undefined;
    const save = vi.fn((rev: number) => (rev === 1 ? new Promise<number>((r) => (release = r)) : Promise.resolve(rev + 1)));
    const s = createAutosaver<Record<string, string>>({ rev: 1, save, merge: (a, b) => ({ ...a, ...b }) });
    s.queue({ title: "one" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    s.queue({ doc: "x" });
    s.queue({ title: "two" });
    release(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]).toEqual([2, { doc: "x", title: "two" }]);
    expect(s.state()).toMatchObject({ rev: 3, status: "saved" });
  });

  it("a 409 stops saving and keeps the server rev; other errors keep the change for retry", async () => {
    const save = vi.fn(async () => {
      throw conflict(9);
    });
    const s = createAutosaver<{ title: string }>({ rev: 1, save });
    s.queue({ title: "a" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.state()).toMatchObject({ status: "conflict", serverRev: 9, rev: 1 });
    s.queue({ title: "b" });
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1);

    let fail = true;
    const save2 = vi.fn(async (rev: number) => {
      if (fail) throw new Error("network");
      return rev + 1;
    });
    const t = createAutosaver<{ title: string }>({ rev: 5, save: save2 });
    t.queue({ title: "c" });
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.state().status).toBe("error");
    fail = false;
    await t.retry();
    expect(save2).toHaveBeenLastCalledWith(5, { title: "c" });
    expect(t.state()).toMatchObject({ status: "saved", rev: 6 });
  });

  it("flush saves at once; adoptRev follows a newer rev only when idle", async () => {
    const save = vi.fn(async (rev: number) => rev + 1);
    const s = createAutosaver<{ title: string }>({ rev: 1, save });
    s.queue({ title: "now" });
    await s.flush();
    expect(save).toHaveBeenCalledWith(1, { title: "now" });
    s.adoptRev(7);
    expect(s.state().rev).toBe(7);
    s.adoptRev(3);
    expect(s.state().rev).toBe(7);
    s.dispose();
    s.queue({ title: "after" });
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("conflictRev reads only DS_VERSION_CONFLICT 409s", () => {
    expect(conflictRev(conflict(4))).toBe(4);
    expect(conflictRev({ response: { status: 409, data: { code: "DS_FINAL_IMMUTABLE" } } })).toBeNull();
    expect(conflictRev({ response: { status: 409, data: { code: "DS_VERSION_CONFLICT" } } })).toBe(-1);
    expect(conflictRev(new Error("x"))).toBeNull();
  });
});
