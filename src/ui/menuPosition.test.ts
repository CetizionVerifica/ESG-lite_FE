import { describe, expect, it } from "vitest";
import { menuPosition } from "./menuPosition";

const viewport = { width: 1280, height: 800 };
const panel = { width: 180, height: 80 };

describe("menuPosition", () => {
  it("opens below the trigger, aligned to its end edge", () => {
    const trigger = { top: 100, bottom: 130, left: 1000, right: 1030 };
    expect(menuPosition(trigger, panel, viewport, "end")).toEqual({ top: 134, left: 850 });
  });

  it("aligns to the start edge", () => {
    const trigger = { top: 100, bottom: 130, left: 40, right: 70 };
    expect(menuPosition(trigger, panel, viewport, "start")).toEqual({ top: 134, left: 40 });
  });

  it("flips above when it doesn't fit below", () => {
    const trigger = { top: 740, bottom: 770, left: 1000, right: 1030 };
    expect(menuPosition(trigger, panel, viewport, "end")).toEqual({ top: 656, left: 850 });
  });

  it("stays below when neither side fits better", () => {
    const tall = { width: 180, height: 700 };
    const trigger = { top: 300, bottom: 330, left: 1000, right: 1030 };
    expect(menuPosition(trigger, tall, viewport, "end").top).toBe(334);
  });

  it("keeps the panel inside the viewport horizontally", () => {
    expect(menuPosition({ top: 0, bottom: 30, left: 5, right: 35 }, panel, viewport, "end").left).toBe(8);
    expect(menuPosition({ top: 0, bottom: 30, left: 1250, right: 1280 }, panel, viewport, "start").left).toBe(1092);
  });
});
