// DS-6 · keyboard shortcuts (RS S3 + 05-ux): a pure key → command map
// (tested) and the runner that applies a command to the editor. Typing in a
// field, a menu or a dialog never triggers a shortcut.
import type { Element } from "../../../lib/studio/contracts";
import {
  copyStyle,
  duplicateElements,
  expandSelection,
  groupElements,
  moveElements,
  pasteElements,
  pasteStyle,
  removeElements,
  reorderZ,
  setLocked,
  ungroupElements,
} from "../../../lib/studio/docOps";
import type { EditorApi } from "./EditorContext";
import { clampZoom } from "./state";
import { openFindReplace } from "../find/store"; // PE-2

export type Command =
  | { id: "undo" | "redo" | "copy" | "cut" | "paste" | "duplicate" | "group" | "ungroup" | "lock" | "delete" | "forward" | "backward" | "front" | "back" }
  | { id: "zoomIn" | "zoomOut" | "zoom100" | "zoomFit" | "help" | "escape" | "selectAll" | "copyStyle" | "pasteStyle" }
  | { id: "view"; view: "scroll" | "strip" | "grid" }
  | { id: "nudge"; dx: number; dy: number }
  | { id: "add"; what: "text" | "rect" | "line" }
  | { id: "comment" }
  | { id: "find" }; // PE-2

export interface KeyLike {
  key: string;
  code?: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

/** Nudge steps in mm (RS S3). */
export const NUDGE = 0.5;
export const NUDGE_BIG = 5;

/** The command for a key press, or null. */
export function commandFor(e: KeyLike): Command | null {
  const mod = !!(e.metaKey || e.ctrlKey);
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const digit = e.code?.startsWith("Digit") ? e.code.slice(5) : /^[0-9]$/.test(e.key) ? e.key : null;
  if (mod && e.altKey) {
    if (digit === "1") return { id: "view", view: "scroll" };
    if (digit === "2") return { id: "view", view: "strip" };
    if (digit === "3") return { id: "view", view: "grid" };
    if (e.code === "KeyC" || k === "c" || k === "ç") return { id: "copyStyle" };
    if (e.code === "KeyV" || k === "v" || k === "√") return { id: "pasteStyle" };
    return null;
  }
  if (mod) {
    switch (k) {
      case "z":
        return e.shiftKey ? { id: "redo" } : { id: "undo" };
      case "y":
        return { id: "redo" };
      case "c":
        return { id: "copy" };
      case "x":
        return { id: "cut" };
      case "v":
        return { id: "paste" };
      case "d":
        return { id: "duplicate" };
      case "g":
        return e.shiftKey ? { id: "ungroup" } : { id: "group" };
      case "l":
        return { id: "lock" };
      case "a":
        return { id: "selectAll" };
      case "=":
      case "+":
        return { id: "zoomIn" };
      case "-":
        return { id: "zoomOut" };
      case "0":
        return { id: "zoom100" };
      case "/":
        return { id: "help" };
      case "f":
        return e.shiftKey ? { id: "find" } : null; // PE-2: ⌘⇧F
      default:
        return null;
    }
  }
  if (e.altKey) return null;
  const step = e.shiftKey ? NUDGE_BIG : NUDGE;
  switch (k) {
    case "ArrowLeft":
      return { id: "nudge", dx: -step, dy: 0 };
    case "ArrowRight":
      return { id: "nudge", dx: step, dy: 0 };
    case "ArrowUp":
      return { id: "nudge", dx: 0, dy: -step };
    case "ArrowDown":
      return { id: "nudge", dx: 0, dy: step };
    case "Delete":
    case "Backspace":
      return { id: "delete" };
    case "Escape":
      return { id: "escape" };
    case "]":
      return e.shiftKey ? { id: "front" } : { id: "forward" };
    case "}":
      return { id: "front" };
    case "[":
      return e.shiftKey ? { id: "back" } : { id: "backward" };
    case "{":
      return { id: "back" };
    case "?":
      return { id: "help" };
    case "t":
      return e.shiftKey ? null : { id: "add", what: "text" };
    case "r":
      return e.shiftKey ? null : { id: "add", what: "rect" };
    case "l":
      return e.shiftKey ? null : { id: "add", what: "line" };
    case "c":
      return e.shiftKey ? null : { id: "comment" };
    default:
      return null;
  }
}

/** True when the key press belongs to a field, menu or dialog (never a shortcut). */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return !!el.closest('[role="dialog"],[role="menu"],[role="listbox"],[contenteditable="true"]');
}

/** Shortcut list for the ⌘/ sheet. */
export const SHORTCUT_HELP: { keys: string; what: string }[] = [
  { keys: "⌘Z / ⇧⌘Z", what: "Undo / redo" },
  { keys: "⌘C / ⌘X / ⌘V", what: "Copy / cut / paste elements" },
  { keys: "⌘D", what: "Duplicate" },
  { keys: "⌥⌘C / ⌥⌘V", what: "Copy style / paste style" },
  { keys: "⌘G / ⇧⌘G", what: "Group / ungroup" },
  { keys: "⌘L", what: "Lock or unlock" },
  { keys: "Delete", what: "Delete the selection" },
  { keys: "] / [", what: "Bring forward / send backward (⇧ to front / back)" },
  { keys: "Arrows", what: "Nudge 0.5 mm (⇧ 5 mm)" },
  { keys: "⌘A", what: "Select everything on the page" },
  { keys: "T / R / L", what: "Add text, a rectangle, a line" },
  { keys: "C", what: "Click to drop a comment" },
  { keys: "⌘⇧F", what: "Find and replace" },
  { keys: "⌘+ / ⌘− / ⌘0", what: "Zoom in / out / 100 %" },
  { keys: "⌥⌘1 / 2 / 3", what: "Scroll view / page strip / grid view" },
  { keys: "Alt while dragging", what: "No snapping" },
  { keys: "Esc", what: "Leave a group, the crop or the selection" },
  { keys: "⌘/", what: "These shortcuts" },
];

/** Elements copied with ⌘C (within the session). */
let clipboard: Element[] = [];
export const clipboardSize = () => clipboard.length;

const TEMPLATES: Record<"text" | "rect" | "line", Element> = {
  text: {
    id: "t",
    type: "text",
    frame: { x: 0, y: 0, w: 120, h: 14, rotation: 0 },
    z: 0,
    source: "user",
    props: { doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Add a heading" }] }] }, style: "heading", align: "left" },
  },
  rect: { id: "r", type: "shape", frame: { x: 0, y: 0, w: 50, h: 35, rotation: 0 }, z: 0, source: "user", props: { shape: "rect" } },
  line: { id: "l", type: "line", frame: { x: 0, y: 0, w: 60, h: 2, rotation: 0 }, z: 0, source: "user", props: { x1: 0, y1: 1, x2: 60, y2: 1, strokeWidth: 0.5, dash: "solid" } },
};

/** Applies a command. Returns true when it did something (the key event is then swallowed). */
export function runCommand(cmd: Command, ed: EditorApi, ui: { openHelp: () => void }): boolean {
  const page = ed.page;
  const sel = ed.selected;
  const ids = sel.map((e) => e.id);
  const pageId = page?.id ?? "";
  const ro = ed.readOnly;
  switch (cmd.id) {
    case "undo":
      ed.undo();
      return true;
    case "redo":
      ed.redo();
      return true;
    case "zoomIn":
      ed.setZoom(clampZoom(ed.ui.zoom * 1.25));
      return true;
    case "zoomOut":
      ed.setZoom(clampZoom(ed.ui.zoom / 1.25));
      return true;
    case "zoom100":
      ed.setZoom(1);
      return true;
    case "zoomFit":
      ed.setZoom(ed.ui.zoom, true);
      return true;
    case "view":
      ed.setView(cmd.view);
      return true;
    case "help":
      ui.openHelp();
      return true;
    case "comment":
      ed.setCommentMode(!ed.ui.commentMode);
      return true;
    case "find":
      openFindReplace();
      return true;
    case "escape":
      if (ed.ui.commentMode) ed.setCommentMode(false);
      else if (ed.ui.crop) ed.startCrop(null);
      else if (ed.ui.enteredGroup) {
        const g = ed.ui.enteredGroup;
        ed.enterGroup(null);
        if (page) ed.select(page.elements.filter((e) => e.groupId === g).map((e) => e.id));
      } else if (ed.ui.position) ed.openPosition(null);
      else if (ids.length) ed.select([]);
      else return false;
      return true;
    case "selectAll":
      if (!page) return false;
      ed.select(expandSelection(page, page.elements.filter((e) => !e.hidden).map((e) => e.id)));
      return true;
    case "copy":
    case "cut":
      if (!sel.length) return false;
      clipboard = JSON.parse(JSON.stringify(sel)) as Element[];
      if (cmd.id === "cut" && !ro) ed.commit(removeElements(ed.doc, pageId, ids), "Cut", { select: [] });
      return true;
    case "paste": {
      if (ro || !page || !clipboard.length) return false;
      const sameSpot = clipboard.every((c) => page.elements.some((e) => e.id === c.id));
      const r = pasteElements(ed.doc, pageId, clipboard, { newId: ed.newId, offset: sameSpot ? 5 : 0 });
      ed.commit(r.doc, "Paste", { select: r.ids });
      return true;
    }
    case "copyStyle":
      if (sel.length !== 1) return false;
      ed.setClip(copyStyle(sel[0]));
      return true;
    case "pasteStyle":
      if (ro || !ed.ui.clip || !sel.length) return false;
      ed.commit(pasteStyle(ed.doc, pageId, ids, ed.ui.clip), "Paste style");
      return true;
    case "add": {
      if (ro || !page) return false;
      ed.insertElement(TEMPLATES[cmd.what], { label: cmd.what === "text" ? "Add text" : cmd.what === "rect" ? "Add rectangle" : "Add line" });
      return true;
    }
  }
  if (ro || !page || !sel.length) return false;
  switch (cmd.id) {
    case "nudge":
      ed.commit(moveElements(ed.doc, pageId, ids, cmd.dx, cmd.dy), "Nudge", { mergeKey: `nudge:${ids.join(",")}` });
      return true;
    case "duplicate": {
      const r = duplicateElements(ed.doc, pageId, ids, { newId: ed.newId });
      ed.commit(r.doc, "Duplicate", { select: r.ids });
      return true;
    }
    case "group": {
      const r = groupElements(ed.doc, pageId, ids, { newId: ed.newId });
      ed.commit(r.doc, "Group");
      return true;
    }
    case "ungroup":
      ed.commit(ungroupElements(ed.doc, pageId, ids), "Ungroup");
      return true;
    case "lock": {
      const locked = sel.every((e) => e.locked);
      ed.commit(setLocked(ed.doc, pageId, ids, !locked), locked ? "Unlock" : "Lock");
      return true;
    }
    case "delete":
      ed.commit(removeElements(ed.doc, pageId, ids), "Delete", { select: [] });
      return true;
    case "forward":
    case "backward":
    case "front":
    case "back":
      ed.commit(reorderZ(ed.doc, pageId, ids, cmd.id), cmd.id === "forward" ? "Bring forward" : cmd.id === "backward" ? "Send backward" : cmd.id === "front" ? "Bring to front" : "Send to back");
      return true;
    default:
      return false;
  }
}
