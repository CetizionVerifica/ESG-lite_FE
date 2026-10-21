import { describe, expect, it } from "vitest";
import { commandFor, isTypingTarget, NUDGE, NUDGE_BIG } from "./shortcuts";

describe("shortcuts", () => {
  it("maps RS S3 and 05-ux keys", () => {
    expect(commandFor({ key: "z", metaKey: true })).toEqual({ id: "undo" });
    expect(commandFor({ key: "Z", metaKey: true, shiftKey: true })).toEqual({ id: "redo" });
    expect(commandFor({ key: "d", ctrlKey: true })).toEqual({ id: "duplicate" });
    expect(commandFor({ key: "g", metaKey: true, shiftKey: true })).toEqual({ id: "ungroup" });
    expect(commandFor({ key: "l", metaKey: true })).toEqual({ id: "lock" });
    expect(commandFor({ key: "Delete" })).toEqual({ id: "delete" });
    expect(commandFor({ key: "]" })).toEqual({ id: "forward" });
    expect(commandFor({ key: "[" })).toEqual({ id: "backward" });
    expect(commandFor({ key: "0", metaKey: true })).toEqual({ id: "zoom100" });
    expect(commandFor({ key: "/", metaKey: true })).toEqual({ id: "help" });
    expect(commandFor({ key: "t" })).toEqual({ id: "add", what: "text" });
    expect(commandFor({ key: "r" })).toEqual({ id: "add", what: "rect" });
    expect(commandFor({ key: "l" })).toEqual({ id: "add", what: "line" });
    expect(commandFor({ key: "c" })).toEqual({ id: "comment" });
    expect(commandFor({ key: "q" })).toBeNull();
    // PE-2: ⌘⇧F / Ctrl+Shift+F find and replace; ⌘F stays the browser's.
    expect(commandFor({ key: "F", metaKey: true, shiftKey: true })).toEqual({ id: "find" });
    expect(commandFor({ key: "f", ctrlKey: true, shiftKey: true })).toEqual({ id: "find" });
    expect(commandFor({ key: "f", metaKey: true })).toBeNull();
  });

  it("nudges 0.5 mm, 5 mm with Shift", () => {
    expect(commandFor({ key: "ArrowLeft" })).toEqual({ id: "nudge", dx: -NUDGE, dy: 0 });
    expect(commandFor({ key: "ArrowDown", shiftKey: true })).toEqual({ id: "nudge", dx: 0, dy: NUDGE_BIG });
  });

  it("Alt+⌘+1/2/3 switch views by key code (Alt changes the character on a Mac)", () => {
    expect(commandFor({ key: "¡", code: "Digit1", metaKey: true, altKey: true })).toEqual({ id: "view", view: "scroll" });
    expect(commandFor({ key: "™", code: "Digit2", metaKey: true, altKey: true })).toEqual({ id: "view", view: "strip" });
    expect(commandFor({ key: "3", code: "Digit3", ctrlKey: true, altKey: true })).toEqual({ id: "view", view: "grid" });
  });

  it("⌥⌘C / ⌥⌘V copy and paste style", () => {
    expect(commandFor({ key: "ç", code: "KeyC", metaKey: true, altKey: true })).toEqual({ id: "copyStyle" });
    expect(commandFor({ key: "√", code: "KeyV", metaKey: true, altKey: true })).toEqual({ id: "pasteStyle" });
  });

  it("never fires inside fields, menus or dialogs", () => {
    const input = { tagName: "INPUT", isContentEditable: false, closest: () => null } as unknown as EventTarget;
    const inMenu = { tagName: "BUTTON", isContentEditable: false, closest: (s: string) => (s.includes("menu") ? {} : null) } as unknown as EventTarget;
    const plain = { tagName: "DIV", isContentEditable: false, closest: () => null } as unknown as EventTarget;
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(inMenu)).toBe(true);
    expect(isTypingTarget(plain)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
