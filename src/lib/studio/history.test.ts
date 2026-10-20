import { describe, expect, it } from "vitest";
import { HISTORY_LIMIT, canRedo, canUndo, commit, createHistory, loadHistory, redo, redoLabel, reset, saveHistory, undo, undoLabel } from "./history";

describe("history", () => {
  it("undo and redo walk the stack with labels", () => {
    let h = createHistory(0);
    h = commit(h, 1, "One", { now: 0 });
    h = commit(h, 2, "Two", { now: 5000 });
    expect(undoLabel(h)).toBe("Two");
    h = undo(h);
    expect(h.present).toBe(1);
    expect(redoLabel(h)).toBe("Two");
    h = undo(h);
    expect(h.present).toBe(0);
    expect(canUndo(h)).toBe(false);
    h = redo(redo(h));
    expect(h.present).toBe(2);
    expect(canRedo(h)).toBe(false);
  });

  it("a new commit clears redo; a no-op commit is ignored", () => {
    let h = commit(createHistory("a"), "b", "B");
    h = undo(h);
    h = commit(h, "c", "C");
    expect(canRedo(h)).toBe(false);
    expect(commit(h, "c", "again")).toBe(h);
  });

  it("merges a continuous drag into one step", () => {
    let h = createHistory(0);
    h = commit(h, 1, "Move", { mergeKey: "move:a", now: 1000 });
    h = commit(h, 2, "Move", { mergeKey: "move:a", now: 1400 });
    h = commit(h, 3, "Move", { mergeKey: "move:a", now: 1900 });
    expect(h.past).toHaveLength(1);
    expect(undo(h).present).toBe(0);
    // Outside the window or another key: a new step.
    h = commit(h, 4, "Move", { mergeKey: "move:a", now: 5000 });
    h = commit(h, 5, "Move", { mergeKey: "move:b", now: 5100 });
    expect(h.past).toHaveLength(3);
  });

  it("merging never swallows the first step after an undo", () => {
    let h = commit(createHistory(0), 1, "Nudge", { mergeKey: "nudge", now: 0 });
    h = undo(h);
    h = commit(h, 2, "Nudge", { mergeKey: "nudge", now: 100 });
    expect(h.past).toHaveLength(1);
    expect(undo(h).present).toBe(0);
  });

  it("keeps at most 100 steps across page ops", () => {
    let h = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 20; i++) h = commit(h, i, `Step ${i}`, { now: i * 5000 });
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0].value).toBe(20);
  });

  it("survives a reload at the same rev only", () => {
    const store = new Map<string, string>();
    const s = { setItem: (k: string, v: string) => store.set(k, v), getItem: (k: string) => store.get(k) ?? null };
    const h = commit(commit(createHistory({ a: 1 }), { a: 2 }, "A"), { a: 3 }, "B");
    saveHistory(7, 4, h, s);
    const back = loadHistory<{ a: number }>(7, 4, s);
    expect(back?.present).toEqual({ a: 3 });
    expect(back && undo(back).present).toEqual({ a: 2 });
    expect(loadHistory(7, 5, s)).toBeNull();
    expect(loadHistory(8, 4, s)).toBeNull();
  });

  it("reset replaces the present without a step", () => {
    const h = reset(commit(createHistory(1), 2, "x"), 9);
    expect(h.present).toBe(9);
    expect(canUndo(h)).toBe(false);
  });
});
